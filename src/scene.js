import * as THREE from 'three';

// 16x16 픽셀 텍스처를 절차적으로 생성 (블록 느낌)
function pixelTexture(draw, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 간단한 결정적 난수 (텍스처가 매번 같게 나오도록)
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const planks = () =>
  pixelTexture((ctx, n) => {
    const r = rng(7);
    const colors = ['#b8945f', '#a8834f', '#9c7746', '#c29d66'];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = colors[Math.floor(r() * colors.length)];
        ctx.fillRect(x, y, 1, 1);
      }
    ctx.fillStyle = '#7a5a32';
    for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, n, 1);
    for (const [x, y] of [[4, 0], [12, 4], [2, 8], [9, 12]]) ctx.fillRect(x, y, 1, 3);
  });

const darkWood = () =>
  pixelTexture((ctx, n) => {
    const r = rng(3);
    const colors = ['#5a3d24', '#4f351f', '#644429'];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = colors[Math.floor(r() * colors.length)];
        ctx.fillRect(x, y, 1, 1);
      }
  });

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

/** 책상, 의자, 노트북, 커피잔, 화분 */
export function buildWorkspace() {
  const g = new THREE.Group();
  const wood = lambert({ map: planks() });
  const dark = lambert({ map: darkWood() });

  // 책상 (상판 윗면 y=17)
  g.add(box(34, 1, 16, wood, 0, 16.5, 13));
  for (const [x, z] of [[-16, 6], [16, 6], [-16, 20], [16, 20]]) g.add(box(2, 16, 2, dark, x, 8, z));

  // 의자
  g.add(box(12, 1.5, 11, dark, 0, 9.25, 0.5));
  g.add(box(12, 13, 1.5, dark, 0, 16.5, -4.5));
  for (const [x, z] of [[-5, -4], [5, -4], [-5, 5], [5, 5]]) g.add(box(1.5, 8.5, 1.5, dark, x, 4.25, z));

  // 노트북 본체
  const shell = lambert({ color: '#c7ccd6' });
  const keys = lambert({ color: '#2b2f3a' });
  const laptop = new THREE.Group();
  laptop.add(box(14, 0.6, 8, shell, 0, 17.3, 11));
  laptop.add(box(12, 0.1, 4, keys, 0, 17.65, 11.6));
  laptop.add(box(4, 0.1, 2, lambert({ color: '#9aa1ad' }), 0, 17.65, 8.4)); // 터치패드

  // 노트북 화면 (힌지 기준으로 뒤로 젖힘)
  const lid = new THREE.Group();
  lid.position.set(0, 17.6, 14.8);
  lid.rotation.x = 0.22;
  lid.add(box(14, 9.5, 0.6, shell, 0, 4.75, 0));
  const screenMat = new THREE.MeshBasicMaterial({ map: createCodeScreen() });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 8.2), screenMat);
  screen.position.set(0, 4.85, -0.31);
  screen.rotation.y = Math.PI;
  lid.add(screen);
  // 뚜껑 뒷면 곡괭이 스티커
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshLambertMaterial({ map: pickaxeSticker(), transparent: true, alphaTest: 0.1 }),
  );
  sticker.position.set(0, 4.9, 0.31);
  lid.add(sticker);
  laptop.add(lid);
  g.add(laptop);

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

  // 바닥 그림자 받는 판
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  return { group: g, mug, mugHome: mug.position.clone(), screenTexture: screenMat.map, lid };
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

// 노트북 화면: 코드가 스크롤되는 애니메이션 텍스처
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
