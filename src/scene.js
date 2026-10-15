import * as THREE from 'three';
import { pixelTexture, rng, planks, shade } from './textures.js';

// 마인크래프트 나무 색 + 그 외 책상 색
export const DESK_COLORS = [
  ['oak', '참나무', '#b8945f'],
  ['spruce', '가문비', '#7a5a3a'],
  ['birch', '자작', '#d7cb8d'],
  ['jungle', '정글', '#b1805c'],
  ['acacia', '아카시아', '#ad5d32'],
  ['darkoak', '짙은 참나무', '#4f3218'],
  ['cherry', '벚나무', '#e7b8b0'],
  ['mangrove', '맹그로브', '#7b3630'],
  ['crimson', '진홍', '#6a344b'],
  ['warped', '뒤틀린', '#2b6963'],
  ['white', '화이트', '#e9ecec'],
  ['black', '블랙', '#2a2a2e'],
];

export const GEAR_COLORS = ['#2b2f3a', '#f4f4f6', '#ff7eb6', '#7fc8ff', '#b6f09c', '#ffd166', '#c39bff', '#ff6b6b'];

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

/** 책상, 의자, 작업 도구(노트북 / 모니터+키보드+마우스), 커피잔, 화분 */
export function buildWorkspace() {
  const g = new THREE.Group();
  const deskTop = lambert();
  const deskLeg = lambert();
  const chairMat = lambert({ map: planks('#5a3d24', 3) });

  // 책상 (상판 윗면 y=17)
  g.add(box(34, 1, 16, deskTop, 0, 16.5, 13));
  for (const [x, z] of [[-16, 6], [16, 6], [-16, 20], [16, 20]]) g.add(box(2, 16, 2, deskLeg, x, 8, z));

  // 의자
  g.add(box(12, 1.5, 11, chairMat, 0, 9.25, 0.5));
  g.add(box(12, 13, 1.5, chairMat, 0, 16.5, -4.5));
  for (const [x, z] of [[-5, -4], [5, -4], [-5, 5], [5, 5]]) g.add(box(1.5, 8.5, 1.5, chairMat, x, 4.25, z));

  const screenTex = createCodeScreen();
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const keysMat = lambert();
  const keyboardMat = lambert();
  const mouseMat = lambert();

  // ── 노트북 ──
  const shell = lambert({ color: '#c7ccd6' });
  const laptop = new THREE.Group();
  laptop.add(box(14, 0.6, 8, shell, 0, 17.3, 11));
  laptop.add(box(12, 0.1, 4, keysMat, 0, 17.65, 11.6));
  laptop.add(box(4, 0.1, 2, lambert({ color: '#9aa1ad' }), 0, 17.65, 8.4)); // 터치패드
  const lid = new THREE.Group();
  lid.position.set(0, 17.6, 14.8);
  lid.rotation.x = 0.22;
  lid.add(box(14, 9.5, 0.6, shell, 0, 4.75, 0));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 8.2), screenMat);
  screen.position.set(0, 4.85, -0.31);
  screen.rotation.y = Math.PI;
  lid.add(screen);
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshLambertMaterial({ map: pickaxeSticker(), transparent: true, alphaTest: 0.1 }),
  );
  sticker.position.set(0, 4.9, 0.31);
  lid.add(sticker);
  laptop.add(lid);
  g.add(laptop);

  // ── 데스크톱: 모니터 + 키보드 + 마우스 ──
  const desk = new THREE.Group();
  const monitorMat = lambert({ color: '#30343f' });
  // 모니터는 캐릭터 오른쪽 앞(-x)에 두고 살짝 돌려, 오른쪽 위 카메라에서 얼굴이 가려지지 않게
  const monitor = new THREE.Group();
  monitor.position.set(-4, 17, 17);
  monitor.rotation.y = -0.23;
  monitor.add(box(5, 0.6, 3.5, monitorMat, 0, 0.3, 0)); // 받침
  monitor.add(box(1.4, 5, 1, monitorMat, 0, 3, 0.6)); // 목
  const panel = new THREE.Group();
  panel.position.set(0, 7.6, 0);
  panel.rotation.x = 0.08;
  panel.add(box(16, 9.5, 0.8, monitorMat, 0, 0, 0));
  const monScreen = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 8.4), screenMat);
  monScreen.position.set(0, 0, -0.41);
  monScreen.rotation.y = Math.PI;
  panel.add(monScreen);
  monitor.add(panel);
  desk.add(monitor);
  // 키보드: 몸체 + 키캡 (키캡 텍스처는 색에 따라 다시 그림)
  desk.add(box(14, 0.6, 4.6, keyboardMat, 0, 17.3, 10.6));
  const keycaps = box(13.2, 0.25, 3.8, keysMat, 0, 17.7, 10.6);
  desk.add(keycaps);
  // 마우스패드 + 마우스 (캐릭터 오른손 쪽 = -x)
  desk.add(box(6, 0.15, 6, lambert({ color: '#23262e' }), -11.5, 17.08, 10.5));
  const mouse = new THREE.Group();
  mouse.add(box(2, 0.9, 3, mouseMat, 0, 0.45, 0));
  mouse.add(box(0.3, 0.2, 0.8, lambert({ color: '#222' }), 0, 0.95, 0.7)); // 휠
  mouse.position.set(-11.5, 17.15, 10.5);
  desk.add(mouse);
  g.add(desk);

  // 커피잔
  const mug = new THREE.Group();
  const white = lambert({ color: '#f4f1ea' });
  mug.add(box(3, 3.5, 3, white, 0, 1.75, 0));
  mug.add(box(2.4, 0.1, 2.4, lambert({ color: '#4b2e1a' }), 0, 3.3, 0));
  mug.add(box(0.7, 2, 0.7, white, 1.8, 1.8, 0));
  mug.add(box(0.5, 0.6, 0.6, lambert({ color: '#e05a5a' }), 0, 1.75, 1.52));
  mug.position.set(11, 17, 9);
  g.add(mug);

  // 화분
  g.add(box(3.5, 3, 3.5, lambert({ color: '#b5603c' }), -12.5, 18.5, 17));
  g.add(box(2.8, 0.2, 2.8, lambert({ color: '#4a3020' }), -12.5, 20, 17));
  const leaf = lambert({ color: '#4caf50' });
  const leafDark = lambert({ color: '#2e7d32' });
  g.add(box(1, 4, 1, leafDark, -12.5, 22, 17));
  g.add(box(3, 1, 1, leaf, -13.5, 23, 17));
  g.add(box(1, 1, 3, leaf, -12.5, 22.5, 18));
  g.add(box(2, 1.5, 2, leaf, -12, 24.5, 16.8));

  // 배경이 없을 때만 보이는 바닥 그림자
  const floorShadow = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.receiveShadow = true;
  g.add(floorShadow);

  const replaceMap = (mat, tex) => {
    mat.map?.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
  };

  const ws = {
    group: g,
    mug,
    mugHome: mug.position.clone(),
    mouse,
    mouseHome: mouse.position.clone(),
    screenTexture: screenTex,
    floorShadow,
    setup: 'laptop',
    setDeskColor(hex) {
      replaceMap(deskTop, planks(hex));
      replaceMap(deskLeg, planks(shade(hex, -0.3), 4));
    },
    setSetup(kind) {
      ws.setup = kind === 'desktop' ? 'desktop' : 'laptop';
      laptop.visible = ws.setup === 'laptop';
      desk.visible = ws.setup === 'desktop';
    },
    setKeyboardColor(hex) {
      replaceMap(keysMat, keycapTexture(hex));
      keyboardMat.color.set(shade(hex, -0.25));
    },
    setMouseColor(hex) {
      mouseMat.color.set(hex);
    },
  };
  ws.setDeskColor(DESK_COLORS[0][2]);
  ws.setKeyboardColor(GEAR_COLORS[0]);
  ws.setMouseColor(GEAR_COLORS[0]);
  ws.setSetup('laptop');
  return ws;
}

// 키캡: 바탕색 위에 키 격자
function keycapTexture(hex) {
  return pixelTexture(
    (ctx, w, h) => {
      ctx.fillStyle = shade(hex, -0.3);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = hex;
      const rows = [14, 14, 13, 12];
      rows.forEach((n, row) => {
        const kw = Math.floor((w - 2) / n);
        for (let i = 0; i < n; i++) ctx.fillRect(1 + i * kw, 1 + row * 4, kw - 1, 3);
      });
      ctx.fillRect(10, 17, 28, 3); // 스페이스바
      ctx.fillStyle = shade(hex, 0.35);
      for (let i = 0; i < 6; i++) ctx.fillRect(4 + i * 7, 2, 1, 1);
    },
    48,
    21,
  );
}

function pickaxeSticker() {
  return pixelTexture((ctx) => {
    const P = [
      '....aaaa........',
      '..aaaaaaaa......',
      '.aa......aab....',
      'aa.......bab....',
      'a.......bb.a....',
      '.......bb..aa...',
      '......bb....a...',
      '.....bb.....a...',
      '....bb......a...',
      '...bb...........',
      '..bb............',
      '.bb.............',
      'bb..............',
    ];
    P.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = ch === 'a' ? '#5fe0d2' : '#8b5a2b';
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }),
    );
  });
}

// 화면: 코드가 스크롤되는 애니메이션 텍스처 (노트북·모니터 공용)
function createCodeScreen() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 42;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const ctx = c.getContext('2d');
  const palette = ['#7fd4ff', '#c792ea', '#c3e88d', '#ffcb6b', '#f78c6c', '#89ddff'];
  const r = rng(11);
  const lines = [];
  const newLine = () => {
    const indent = Math.floor(r() * 4) * 3;
    const segs = [];
    let x = 3 + indent;
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n && x < 60; i++) {
      const len = 3 + Math.floor(r() * 10);
      segs.push([x, Math.min(len, 61 - x), palette[Math.floor(r() * palette.length)]]);
      x += len + 2;
    }
    return segs;
  };
  for (let i = 0; i < 12; i++) lines.push(newLine());
  let typed = 0;
  tex.userData.tick = (speed) => {
    typed += speed;
    if (typed > 60) {
      typed = 0;
      lines.shift();
      lines.push(newLine());
    }
    ctx.fillStyle = '#1e2230';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#2a3045';
    ctx.fillRect(0, 0, c.width, 3);
    lines.forEach((segs, i) => {
      const y = 5 + i * 3;
      const last = i === lines.length - 1;
      for (const [x, len, color] of segs) {
        const visible = last ? Math.max(0, Math.min(len, typed - x)) : len;
        if (visible <= 0) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, visible, 1);
      }
    });
    tex.needsUpdate = true;
  };
  tex.userData.tick(0);
  return tex;
}

/** 동작용 소품: 펼친 책(독서), 전구(아하!) */
export function buildProps() {
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  // 펼친 책: 평평하게 만든 뒤 얼굴 쪽으로 기울인다 (책등은 z 방향)
  const book = new THREE.Group();
  const cover = lambert({ color: '#b03a2e' });
  const paper = lambert({ color: '#f7f1e1' });
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.z = -side * 0.18;
    const c = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 7), cover);
    c.position.x = side * 2.5;
    const p = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 6.4), paper);
    p.position.set(side * 2.4, 0.35, 0);
    // 글줄
    for (let i = 0; i < 5; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 0.3), lambert({ color: '#8a8070' }));
      line.position.set(side * 2.4, 0.62, -2.2 + i * 1.1);
      half.add(line);
    }
    half.add(c, p);
    book.add(half);
  }
  // 넘어가는 책장
  const leafPivot = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 6.2), paper);
  leaf.position.x = 2.3;
  leafPivot.position.y = 0.65;
  leafPivot.add(leaf);
  book.add(leafPivot);
  book.position.set(0, 20.6, 8.2);
  book.rotation.x = -0.85;
  book.visible = false;
  book.userData.tick = (dt, st) => {
    const u = (st % 4.5) / 4.5;
    leafPivot.rotation.z = u > 0.85 ? ((u - 0.85) / 0.15) * Math.PI : 0;
  };

  // 전구: 머리 위에 뿅
  const bulb = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: '#ffe066' });
  bulb.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 3), glow));
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2), lambert({ color: '#9aa1ad' }));
  base.position.y = -2.3;
  bulb.add(base);
  const ray = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), ray);
    r.position.set(Math.cos(a) * 3.2, 0.6 + Math.sin(a) * 3.2, 0);
    r.rotation.z = a - Math.PI / 2;
    bulb.add(r);
  }
  bulb.visible = false;
  return { book, bulb };
}
