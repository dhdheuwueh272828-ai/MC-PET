// PiP(화면 속 화면) 모드
// 1) Document PiP (Windows/Mac 의 Chrome·Edge): 펫 화면 자체를 작은 창으로 옮겨 실시간으로 움직이고 클릭도 된다.
// 2) 영상 PiP (아이패드/아이폰 Safari 등): 펫이 일하는 모습을 몇 초 녹화해 반복 재생 영상으로 띄운다.
//    iOS 는 Safari 가 뒤로 가면 페이지가 멈추기 때문에, 실시간 화면 대신 녹화된 영상이어야 다른 앱 위에서도 계속 움직인다.

const CLIP_SECONDS = 8;
const OUT_W = 480;
const OUT_H = 360;

export function pipSupport() {
  const doc = 'documentPictureInPicture' in window;
  const video =
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    (document.pictureInPictureEnabled || 'webkitSetPresentationMode' in HTMLVideoElement.prototype);
  return { doc, video, any: doc || video };
}

function pickMime() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

/**
 * @param {object} o
 * @param {HTMLElement} o.stage      펫 화면(canvas + 말풍선)을 담은 요소
 * @param {HTMLCanvasElement} o.glCanvas
 * @param {() => {x:number,y:number,w:number,h:number}} o.getCrop  펫이 보이는 영역 (캔버스 픽셀 좌표)
 * @param {() => {text:string,x:number,y:number}|null} o.getBubble  말풍선 (CSS 픽셀 좌표)
 * @param {(win: Window) => void} o.setViewWindow  렌더 루프/크기 기준 창 변경
 * @param {(msg: string) => void} o.toast
 * @param {() => () => void} o.beginClip  녹화 시작 시 호출 (작업 모드 고정), 반환 함수로 원복
 */
export function createPip(o) {
  const support = pipSupport();
  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = OUT_H;
  const ctx = out.getContext('2d');

  let recording = false;
  let clipUrl = null;
  let video = null;
  let docWin = null;

  // 렌더 직후 매 프레임 호출: 녹화 중이면 합성 캔버스에 그린다
  function onFrame() {
    if (!recording) return;
    const g = ctx.createLinearGradient(0, 0, 0, OUT_H);
    g.addColorStop(0, '#cfe6ff');
    g.addColorStop(1, '#f6e7ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.fillStyle = '#e5d6c4';
    ctx.fillRect(0, OUT_H * 0.8, OUT_W, OUT_H * 0.2);

    const c = o.getCrop();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(o.glCanvas, c.x, c.y, c.w, c.h, 0, 0, OUT_W, OUT_H);

    const b = o.getBubble();
    if (b) {
      const k = OUT_W / c.w;
      const dpr = o.glCanvas.width / o.glCanvas.clientWidth || 1;
      const x = (b.x * dpr - c.x) * k;
      const y = (b.y * dpr - c.y) * k;
      ctx.font = '700 15px system-ui, sans-serif';
      const w = ctx.measureText(b.text).width + 20;
      const top = Math.max(4, y - 34);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top, w, 28, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, x, top + 14);
    }
  }

  async function recordClip() {
    const mime = pickMime();
    const stream = out.captureStream(30);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    const restore = o.beginClip();
    recording = true;
    rec.start();
    await new Promise((r) => setTimeout(r, CLIP_SECONDS * 1000));
    rec.stop();
    await done;
    recording = false;
    restore();
    stream.getTracks().forEach((t) => t.stop());
    clipUrl = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }));
    return clipUrl;
  }

  function ensureVideo() {
    if (video) return video;
    video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    // Safari 는 화면에 붙어 있는 video 만 PiP 로 띄울 수 있어 아주 작게 붙여 둔다
    Object.assign(video.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none' });
    document.body.appendChild(video);
    return video;
  }

  async function prepareVideo() {
    o.toast(`PiP 영상 만드는 중... (${CLIP_SECONDS}초)`);
    const url = await recordClip();
    const v = ensureVideo();
    v.src = url;
    await v.play().catch(() => {});
    return v;
  }

  function enterVideoPip(v) {
    v.play().catch(() => {});
    if (v.requestPictureInPicture && document.pictureInPictureEnabled) return v.requestPictureInPicture();
    v.webkitSetPresentationMode('picture-in-picture');
    return Promise.resolve();
  }

  async function openDocPip() {
    docWin = await window.documentPictureInPicture.requestWindow({ width: 320, height: 300 });
    // 스타일 복사
    for (const sheet of document.styleSheets) {
      try {
        const style = docWin.document.createElement('style');
        style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
        docWin.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = docWin.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          docWin.document.head.appendChild(link);
        }
      }
    }
    docWin.document.documentElement.className = document.documentElement.className;
    docWin.document.body.classList.add('panel-hidden', 'in-pip');
    const home = o.stage.parentNode;
    const next = o.stage.nextSibling;
    docWin.document.body.appendChild(o.stage);
    o.setViewWindow(docWin);
    docWin.addEventListener('pagehide', () => {
      home.insertBefore(o.stage, next);
      o.setViewWindow(window);
      docWin = null;
    });
  }

  /**
   * 버튼을 눌렀을 때 호출 (사용자 동작 안에서 실행되어야 함).
   * 영상 PiP 는 처음 누르면 영상을 만들고, 다시 누르면 PiP 를 띄운다.
   * @returns {Promise<'opened'|'ready'|'closed'>}
   */
  async function toggle() {
    if (docWin) {
      docWin.close();
      return 'closed';
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return 'closed';
    }
    if (support.doc) {
      await openDocPip();
      return 'opened';
    }
    if (!support.video) throw new Error('이 브라우저는 PiP 를 지원하지 않아요.');
    if (!clipUrl) {
      await prepareVideo();
      return 'ready';
    }
    await enterVideoPip(ensureVideo());
    return 'opened';
  }

  // 스킨이 바뀌면 영상을 다시 만들어야 한다
  function invalidate() {
    // PiP 로 재생 중인 영상은 그대로 두고, 다음에 누를 때 새로 만든다
    if (clipUrl && document.pictureInPictureElement !== video) URL.revokeObjectURL(clipUrl);
    clipUrl = null;
  }

  return { support, onFrame, toggle, invalidate, isRecording: () => recording, hasClip: () => !!clipUrl, canvas: out };
}
