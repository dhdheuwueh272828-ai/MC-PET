// 🎵 유튜브 배경음 — 링크 해석 + YouTube IFrame Player API 미니 플레이어 카드
// 플레이어는 숨기지 않고(유튜브 약관) 화면 구석에 최소 200×200 으로 보여 준다.

const VIDEO_RE = /^[\w-]{11}$/;
const LIST_RE = /^[\w-]{10,64}$/;

/** 유튜브 링크 → { video, list } (둘 중 하나는 있음), 아니면 null */
export function parseYouTube(text) {
  let url;
  try {
    url = new URL(String(text ?? '').trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let video = null;
  if (host === 'youtu.be') video = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    video = m ? m[1] : url.searchParams.get('v');
  } else return null;
  const list = url.searchParams.get('list');
  const out = { video: VIDEO_RE.test(video ?? '') ? video : null, list: LIST_RE.test(list ?? '') ? list : null };
  return out.video || out.list ? out : null;
}

// IFrame API 스크립트는 처음 재생할 때 한 번만 불러온다
let apiPromise = null;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      apiPromise = null;
      s.remove();
      reject(new Error('유튜브에 연결하지 못했어요 (인터넷 연결 확인)'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ERRORS = {
  2: '링크가 올바르지 않아요',
  5: '이 기기에서 재생할 수 없는 영상이에요',
  100: '영상을 찾을 수 없어요 (삭제·비공개)',
  101: '영상 주인이 다른 곳에서 재생을 막아 뒀어요',
  150: '영상 주인이 다른 곳에서 재생을 막아 뒀어요',
  153: '유튜브 플레이어를 불러오지 못했어요',
};

/**
 * 미니 플레이어 카드 제어
 * @param {{ card: HTMLElement, bar: HTMLElement, slot: HTMLElement, toast: (m: string) => void,
 *   onChange: (s: { active: boolean, playing: boolean }) => void, getPos: () => any, savePos: (p: any) => void }} o
 */
export function createMusic({ card, bar, slot, toast, onChange, getPos, savePos }) {
  let player = null;
  let link = null; // 지금 플레이어에 올라간 { video, list }
  let volume = 60;
  let playing = false;
  let startCheck = 0;

  const emit = () => onChange({ active: !!player, playing });
  const setPlaying = (v) => {
    if (v === playing) return;
    playing = v;
    emit();
  };

  // ── 카드 위치: 윗줄을 끌어서 옮긴다 (화면 밖으로 못 나가게) ──
  function place(x, y) {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    x = Math.min(Math.max(4, x), Math.max(4, window.innerWidth - w - 4));
    y = Math.min(Math.max(4, y), Math.max(4, window.innerHeight - h - 4));
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    return { x, y };
  }
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input')) return;
    const r = card.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
  });
  bar.addEventListener('pointermove', (e) => {
    if (drag?.id === e.pointerId) place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const endDrag = (e) => {
    if (drag?.id !== e.pointerId) return;
    drag = null;
    savePos(place(card.offsetLeft, card.offsetTop));
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => {
    if (!card.hidden) place(card.offsetLeft, card.offsetTop);
  });

  function showCard() {
    card.hidden = false;
    const p = getPos();
    place(p?.x ?? 12, p?.y ?? 64);
  }

  // 아이패드·아이폰은 자동 재생이 막혀 있어서, 시작이 안 되면 플레이어를 직접 눌러 달라고 안내
  function checkStarted() {
    clearTimeout(startCheck);
    startCheck = setTimeout(() => {
      if (player && !playing) toast('▶ 작은 플레이어 화면을 한 번 눌러 재생해 주세요');
    }, 3000);
  }

  async function create(l) {
    let YT;
    try {
      YT = await loadApi();
    } catch (e) {
      toast(e.message);
      return;
    }
    destroy();
    link = l;
    showCard();
    const el = document.createElement('div');
    slot.replaceChildren(el);
    const vars = { playsinline: 1, rel: 0, autoplay: 1, loop: 1 };
    if (l.list) Object.assign(vars, { listType: 'playlist', list: l.list });
    else vars.playlist = l.video; // 영상 하나를 반복하려면 playlist 에 같은 영상을 넣어야 한다
    if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
    player = new YT.Player(el, {
      width: '100%',
      height: '100%',
      host: 'https://www.youtube-nocookie.com',
      ...(l.video ? { videoId: l.video } : {}),
      playerVars: vars,
      events: {
        onReady: (e) => {
          e.target.setVolume(volume);
          if (l.list) e.target.setLoop(true);
          e.target.playVideo();
        },
        onStateChange: (e) => {
          const s = e.data;
          if (s === YT.PlayerState.PLAYING || s === YT.PlayerState.BUFFERING) setPlaying(true);
          else if (s === YT.PlayerState.ENDED) {
            // 반복 재생이 안 먹는 경우를 대비해 처음부터 다시
            if (!l.list) {
              e.target.seekTo(0);
              e.target.playVideo();
            } else setPlaying(false);
          } else if (s === YT.PlayerState.PAUSED) setPlaying(false);
        },
        onError: (e) => toast(`🎵 ${ERRORS[e.data] ?? '재생할 수 없는 영상이에요'}`),
      },
    });
    emit();
    checkStarted();
  }

  function destroy() {
    clearTimeout(startCheck);
    try {
      player?.destroy();
    } catch {}
    player = null;
    link = null;
    slot.replaceChildren();
    card.hidden = true;
    setPlaying(false);
    emit();
  }

  const same = (a, b) => a && b && a.video === b.video && a.list === b.list;

  return {
    get active() {
      return !!player;
    },
    get playing() {
      return playing;
    },
    /** 재생 (같은 링크면 이어서, 다른 링크면 새로 불러오기) — 사용자 탭 안에서 불러야 아이패드에서 소리가 난다 */
    play(l) {
      if (player && same(l, link)) {
        player.playVideo?.();
        checkStarted();
      } else create(l);
    },
    pause() {
      player?.pauseVideo?.();
    },
    stop: destroy,
    setVolume(v) {
      volume = Math.min(100, Math.max(0, Math.round(v)));
      player?.setVolume?.(volume);
    },
  };
}
