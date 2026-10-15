import * as THREE from 'three';

// 16x16 같은 작은 캔버스로 블록 느낌 텍스처를 만든다
export function pixelTexture(draw, w = 16, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 결정적 난수 (텍스처가 매번 같게 나오도록)
export function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** '#rrggbb' 를 amt(-1~1) 만큼 어둡게/밝게 */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(Math.min(255, Math.max(0, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** 반복(타일) 텍스처: 큰 면에 블록 무늬를 깔 때 */
export function tiled(tex, rx, ry) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}

function noise(ctx, n, colors, seed) {
  const r = rng(seed);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.fillRect(x, y, 1, 1);
    }
}

// 나무 판자 (색 지정 가능)
export const planks = (base, seed = 7) =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, [base, shade(base, -0.08), shade(base, -0.15), shade(base, 0.06)], seed);
    ctx.fillStyle = shade(base, -0.38);
    for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, n, 1);
    for (const [x, y] of [[4, 0], [12, 4], [2, 8], [9, 12]]) ctx.fillRect(x, y, 1, 3);
  });

// 통나무 껍질 (세로 줄무늬)
export const log = (base) =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, [base, shade(base, -0.12), shade(base, -0.22)], 5);
    ctx.fillStyle = shade(base, -0.4);
    for (const x of [1, 5, 9, 13]) ctx.fillRect(x, 0, 1, n);
  });

export const stoneBricks = () =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, ['#8a8a8a', '#7f7f7f', '#929292', '#868686'], 3);
    ctx.fillStyle = '#5e5e5e';
    for (const y of [7, 15]) ctx.fillRect(0, y, n, 1);
    ctx.fillRect(7, 0, 1, 7);
    ctx.fillRect(15, 0, 1, 7);
    ctx.fillRect(3, 8, 1, 7);
    ctx.fillRect(11, 8, 1, 7);
  });

export const cobblestone = () =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, ['#7a7a7a', '#8f8f8f', '#6a6a6a', '#9c9c9c'], 9);
    ctx.fillStyle = '#4f4f4f';
    for (const [x, y, w, h] of [[0, 4, 6, 1], [5, 0, 1, 4], [9, 3, 7, 1], [3, 9, 8, 1], [11, 6, 1, 6], [0, 13, 5, 1], [7, 12, 1, 4], [13, 12, 3, 1]])
      ctx.fillRect(x, y, w, h);
  });

export const bricks = () =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, ['#9b4f3d', '#a85a46', '#8f4636'], 4);
    ctx.fillStyle = '#c9b8a6';
    for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, n, 1);
    for (const [x, y] of [[3, 0], [11, 0], [7, 4], [15, 4], [3, 8], [11, 8], [7, 12], [15, 12]]) ctx.fillRect(x, y, 1, 3);
  });

export const plain = (base, seed = 2, spread = 0.04) =>
  pixelTexture((ctx, n) => noise(ctx, n, [base, shade(base, -spread), shade(base, spread)], seed));

export const wool = (base) =>
  pixelTexture((ctx, n) => {
    noise(ctx, n, [base, shade(base, -0.06), shade(base, 0.05)], 13);
  });

export const glass = (sky = '#9fd6ff') =>
  pixelTexture((ctx, n) => {
    const g = ctx.createLinearGradient(0, 0, 0, n);
    g.addColorStop(0, sky);
    g.addColorStop(1, shade(sky, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [x, y] of [[3, 3], [4, 4], [5, 5], [10, 2], [11, 3]]) ctx.fillRect(x, y, 1, 1);
  });

export const bookshelf = () =>
  pixelTexture((ctx, n) => {
    ctx.fillStyle = '#b8945f';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#7a5a32';
    ctx.fillRect(0, 0, n, 1);
    ctx.fillRect(0, 7, n, 2);
    ctx.fillRect(0, 15, n, 1);
    const r = rng(21);
    const books = ['#a83232', '#3a5fb0', '#3f8f3f', '#c9a227', '#7b3fa0', '#d06a2c'];
    for (const y0 of [1, 9])
      for (let x = 1; x < 15; x += 2) {
        ctx.fillStyle = books[Math.floor(r() * books.length)];
        const h = 5 + Math.floor(r() * 2);
        ctx.fillRect(x, y0 + 6 - h, 2, h);
      }
  });

// 불꽃 애니메이션 프레임들 (CanvasTexture 하나를 매 프레임 다시 그린다)
export function fireTexture() {
  const tex = pixelTexture(() => {}, 16, 16);
  const ctx = tex.image.getContext('2d');
  const colors = ['#fff3a0', '#ffd23f', '#ff9a1f', '#f2541b'];
  let t = 0;
  tex.userData.tick = (dt) => {
    t += dt;
    if (Math.floor(t * 10) === tex.userData.frame) return;
    tex.userData.frame = Math.floor(t * 10);
    const r = rng(1 + tex.userData.frame);
    ctx.clearRect(0, 0, 16, 16);
    for (let x = 0; x < 16; x++) {
      const h = 4 + Math.floor(r() * 9 + 3 * Math.sin(x * 0.8 + t * 6));
      for (let y = 0; y < h; y++) {
        const k = y / h;
        ctx.fillStyle = colors[Math.min(3, Math.floor(k * 2.4 + r() * 1.4))];
        ctx.fillRect(x, 15 - y, 1, 1);
      }
    }
    tex.needsUpdate = true;
  };
  tex.userData.tick(0);
  return tex;
}
