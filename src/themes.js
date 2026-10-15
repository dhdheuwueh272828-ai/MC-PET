import * as THREE from 'three';
import {
  pixelTexture, rng, shade, tiled, planks, log, cobblestone, bricks, plain, wool, glass, bookshelf, fireTexture,
} from './textures.js';

// 작업 배경 (마인크래프트풍 방). 1블록 = 16칸 = 캐릭터 키의 절반.
// 카메라가 +x,+z 쪽(오른쪽 앞)에서 보므로 뒤쪽 벽(z-)과 왼쪽 벽(x-)만 세운다.
export const THEMES = [
  ['none', '기본'],
  ['classroom', '🏫 교실'],
  ['winter', '🔥 겨울 난로'],
  ['cafe', '☕ 카페'],
];

const BACK_Z = -17;
const LEFT_X = -37;
const WALL_H = 90;

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 블록 텍스처를 면 크기에 맞춰 반복시킨 재질 */
function tiledMat(makeTex, w, h, extra = {}) {
  return lambert({ map: tiled(makeTex(), w / 16, h / 16), ...extra });
}

// 바닥 + 뒤쪽 벽 + 왼쪽 벽 (아래 몰딩/위 벽 재질 분리)
function room(g, { floor, lower, upper, lowerH = 14 }) {
  const FW = 140;
  const FD = 120;
  g.add(box(FW, 1, FD, tiledMat(floor, FW, FD), LEFT_X + FW / 2, -0.5, BACK_Z + FD / 2));
  const BW = 120;
  const LD = 110;
  g.add(box(BW, lowerH, 2, tiledMat(lower, BW, lowerH), LEFT_X + BW / 2, lowerH / 2, BACK_Z - 1));
  g.add(box(BW, WALL_H - lowerH, 2, tiledMat(upper, BW, WALL_H - lowerH), LEFT_X + BW / 2, lowerH + (WALL_H - lowerH) / 2, BACK_Z - 1));
  g.add(box(2, lowerH, LD, tiledMat(lower, LD, lowerH), LEFT_X - 1, lowerH / 2, BACK_Z + LD / 2));
  g.add(box(2, WALL_H - lowerH, LD, tiledMat(upper, LD, WALL_H - lowerH), LEFT_X - 1, lowerH + (WALL_H - lowerH) / 2, BACK_Z + LD / 2));
}

// 왼쪽 벽 창문 (z 범위, y 범위), 창살 포함
function leftWindow(g, { z0, z1, y0, y1, frameColor, pane }) {
  const frame = lambert({ map: planks(frameColor) });
  const w = z1 - z0;
  const h = y1 - y0;
  const zc = (z0 + z1) / 2;
  const yc = (y0 + y1) / 2;
  const x = LEFT_X + 0.2;
  const paneMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pane);
  paneMesh.rotation.y = Math.PI / 2;
  paneMesh.position.set(x, yc, zc);
  g.add(paneMesh);
  g.add(box(1.6, 2, w + 3.2, frame, x + 0.4, y0 - 1, zc));
  g.add(box(1.6, 2, w + 3.2, frame, x + 0.4, y1 + 1, zc));
  g.add(box(1.6, h, 1.6, frame, x + 0.4, yc, z0 - 0.8));
  g.add(box(1.6, h, 1.6, frame, x + 0.4, yc, z1 + 0.8));
  g.add(box(1, h, 1, frame, x + 0.4, yc, zc)); // 창살
  g.add(box(1, 1, w, frame, x + 0.4, yc, zc));
  g.add(box(3, 1, w + 3.2, frame, x + 1.4, y0 - 2.4, zc)); // 창턱
}

// 뒤쪽 벽에 붙이는 평면 (칠판·메뉴판 등)
function backPanel(g, tex, w, h, x, y, frameColor) {
  if (frameColor) g.add(box(w + 2, h + 2, 0.6, lambert({ map: planks(frameColor) }), x, y, BACK_Z + 0.3));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({ map: tex }));
  m.position.set(x, y, BACK_Z + 0.65);
  g.add(m);
  return m;
}

function canvasTex(w, h, draw) {
  return pixelTexture((ctx) => draw(ctx, w, h), w, h);
}

// ───────────────── 교실 ─────────────────
function classroom() {
  const g = new THREE.Group();
  room(g, {
    floor: () => planks('#b8945f', 17),
    lower: () => planks('#6b4a2b', 23),
    upper: () => plain('#ece6d6', 5, 0.03),
  });

  // 칠판
  const board = canvasTex(80, 36, (ctx, w, h) => {
    ctx.fillStyle = '#2f5a3f';
    ctx.fillRect(0, 0, w, h);
    const r = rng(8);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 1);
    }
    ctx.fillStyle = '#f2f2e8';
    // "1+1=2" 같은 낙서
    const glyphs = {
      1: ['010', '110', '010', '010', '111'], '+': ['000', '010', '111', '010', '000'], '=': ['000', '111', '000', '111', '000'],
      2: ['111', '001', '111', '100', '111'], x: ['000', '101', '010', '101', '000'], 3: ['111', '001', '111', '001', '111'],
    };
    const write = (str, x0, y0) =>
      [...str].forEach((ch, i) => glyphs[ch]?.forEach((row, y) => [...row].forEach((v, x) => v === '1' && ctx.fillRect(x0 + i * 4 + x, y0 + y, 1, 1))));
    write('1+1=2', 6, 5);
    write('3x3=', 6, 13);
    ctx.fillRect(6, 22, 26, 1);
    ctx.fillRect(6, 26, 18, 1);
    // 크리퍼 얼굴
    ctx.fillStyle = '#9fe08a';
    ctx.fillRect(52, 6, 16, 16);
    ctx.fillStyle = '#2f5a3f';
    ctx.fillRect(54, 9, 4, 4);
    ctx.fillRect(62, 9, 4, 4);
    ctx.fillRect(58, 13, 4, 4);
    ctx.fillRect(56, 15, 8, 4);
    ctx.fillRect(58, 19, 4, 1);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(42, 26, 30, 1); // 노란 분필 밑줄
  });
  backPanel(g, board, 48, 22, 12, 36, '#7a5a32');
  // 분필 받침
  g.add(box(48, 1, 2, lambert({ color: '#7a5a32' }), 12, 24.5, BACK_Z + 1));
  g.add(box(3, 0.6, 0.6, lambert({ color: '#ffffff' }), 4, 25.3, BACK_Z + 1));

  // 시계
  const clockTex = canvasTex(16, 16, (ctx) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#f7f3e3';
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = '#222';
    ctx.fillRect(7, 3, 1, 5);
    ctx.fillRect(7, 7, 4, 1);
    for (const [x, y] of [[7, 1], [14, 7], [7, 14], [1, 7]]) ctx.fillRect(x, y, 1, 1);
  });
  backPanel(g, clockTex, 7, 7, 44, 44);

  // 창문 (맑은 하늘)
  leftWindow(g, { z0: 0, z1: 30, y0: 22, y1: 44, frameColor: '#d7cb8d', pane: lambert({ map: glass('#8fcfff'), emissive: 0x335577 }) });

  // 책장 + 화분
  const shelf = lambert({ map: bookshelf() });
  for (let i = 0; i < 2; i++) g.add(box(8, 16, 16, shelf, LEFT_X + 4, 8 + i * 16, BACK_Z + 8));
  g.add(box(4, 4, 4, lambert({ color: '#b5603c' }), LEFT_X + 4, 34, BACK_Z + 8));
  g.add(box(3, 4, 3, lambert({ color: '#4caf50' }), LEFT_X + 4, 38, BACK_Z + 8));

  return { group: g, clear: '#f3efe2', hemi: ['#ffffff', '#9a8a7a', 1.6], sun: 1.3 };
}

// ───────────────── 겨울 난로 ─────────────────
function winter() {
  const g = new THREE.Group();
  room(g, {
    floor: () => planks('#7a5a3a', 31),
    lower: () => planks('#5a3d24', 33),
    upper: () => {
      const t = log('#6b4a30');
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2; // 가로로 쌓은 통나무
      return t;
    },
  });

  // 러그
  const rug = canvasTex(32, 24, (ctx, w, h) => {
    ctx.fillStyle = '#b8323a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4efe2';
    ctx.strokeStyle = '#f4efe2';
    ctx.fillRect(2, 2, w - 4, 1);
    ctx.fillRect(2, h - 3, w - 4, 1);
    ctx.fillRect(2, 2, 1, h - 4);
    ctx.fillRect(w - 3, 2, 1, h - 4);
    for (let x = 6; x < w - 6; x += 4) ctx.fillRect(x, h / 2 - 1, 2, 2);
  });
  const rugMesh = box(40, 0.3, 30, lambert({ map: rug }), 2, 0.15, 6);
  rugMesh.castShadow = false;
  g.add(rugMesh);

  // 벽난로 (뒤쪽 벽 왼편)
  const cobble = lambert({ map: tiled(cobblestone(), 2, 2) });
  const brickMat = lambert({ map: tiled(bricks(), 2, 2) });
  const fx = 18;
  const fz = BACK_Z + 4;
  g.add(box(30, 30, 8, cobble, fx, 15, fz)); // 몸체
  g.add(box(16, 14, 1, lambert({ color: '#1a1412' }), fx, 9, fz + 3.6)); // 안쪽 어둠
  g.add(box(34, 2, 10, lambert({ map: planks('#4f3218') }), fx, 31, fz + 0.5)); // 선반
  g.add(box(18, WALL_H - 32, 6, brickMat, fx, 32 + (WALL_H - 32) / 2, BACK_Z + 3)); // 굴뚝
  // 장작
  const logMat = lambert({ map: log('#6b4a30') });
  for (const [dx, rz] of [[-3, 0.2], [3, -0.2]]) {
    const l = box(9, 2, 2, logMat, fx + dx, 3, fz + 2.6);
    l.rotation.z = rz;
    g.add(l);
  }
  // 불꽃 (애니메이션 텍스처 3장 교차)
  const fireTex = fireTexture();
  const fireMat = new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
  for (const [dx, ry] of [[0, 0], [-2, 0.6], [2, -0.6]]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), fireMat);
    f.position.set(fx + dx, 8, fz + 2.8);
    f.rotation.y = ry;
    g.add(f);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 900, 90, 1.6);
  fireLight.position.set(fx, 10, fz + 8);
  g.add(fireLight);

  // 선반 위 랜턴 + 양말
  const lantern = new THREE.Group();
  lantern.add(box(3, 3.5, 3, lambert({ color: '#3a3a3a' }), 0, 1.75, 0));
  lantern.add(box(2, 2.4, 2, new THREE.MeshBasicMaterial({ color: '#ffcf5a' }), 0, 1.75, 0));
  lantern.position.set(fx - 10, 32, fz + 1);
  g.add(lantern);
  for (const [dx, color] of [[-4, '#c62f3a'], [4, '#2f8f4f']]) {
    g.add(box(3, 6, 1, lambert({ color }), fx + dx, 27, fz + 5.2));
    g.add(box(3, 1.4, 1.2, lambert({ color: '#f4efe2' }), fx + dx, 29.6, fz + 5.2));
  }

  // 밤하늘 창문 + 눈
  const night = lambert({ map: glass('#1d2a55'), emissive: 0x0b1230 });
  leftWindow(g, { z0: 10, z1: 38, y0: 22, y1: 46, frameColor: '#7a5a3a', pane: night });
  const snowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const flakes = [];
  const r = rng(42);
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.7), snowMat);
    s.position.set(LEFT_X + 0.3, 22 + r() * 24, 10 + r() * 28);
    s.userData.v = 3 + r() * 4;
    s.userData.ph = r() * 6;
    flakes.push(s);
    g.add(s);
  }
  // 창턱에 쌓인 눈
  g.add(box(3, 1, 30, lambert({ color: '#f4f8ff' }), LEFT_X + 1.4, 20.1, 24));

  let t = 0;
  return {
    group: g,
    clear: '#241c2c',
    hemi: ['#ffd9b0', '#3a2a30', 0.85],
    sun: 0.45,
    update(dt) {
      t += dt;
      fireTex.userData.tick(dt);
      fireLight.intensity = 820 + Math.sin(t * 13) * 90 + Math.sin(t * 7.3) * 70;
      for (const s of flakes) {
        s.position.y -= s.userData.v * dt;
        s.position.z += Math.sin(t * 1.5 + s.userData.ph) * dt * 0.8;
        if (s.position.y < 22) s.position.y = 46;
      }
    },
  };
}

// ───────────────── 카페 ─────────────────
function cafe() {
  const g = new THREE.Group();
  room(g, {
    floor: () =>
      pixelTexture((ctx) => {
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            ctx.fillStyle = (x + y) % 2 ? '#3b2a22' : '#d9c7a7';
            ctx.fillRect(x * 8, y * 8, 8, 8);
          }
      }),
    lower: () => planks('#4f3218', 41),
    upper: () => bricks(),
    lowerH: 16,
  });

  // 메뉴판
  const menu = canvasTex(48, 32, (ctx, w, h) => {
    ctx.fillStyle = '#1f1f1f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd166';
    // "MENU" 픽셀 글자
    const M = ['10001', '11011', '10101', '10001', '10001'];
    const E = ['111', '100', '110', '100', '111'];
    const N = ['1001', '1101', '1011', '1001', '1001'];
    const U = ['101', '101', '101', '101', '111'];
    let x0 = 9;
    for (const L of [M, E, N, U]) {
      L.forEach((row, y) => [...row].forEach((v, x) => v === '1' && ctx.fillRect(x0 + x, 3 + y, 1, 1)));
      x0 += L[0].length + 2;
    }
    const items = ['#f2f2e8', '#ff9fb2', '#9fe0ff', '#c3e88d'];
    items.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(4, 12 + i * 5, 3, 3); // 컵 아이콘
      ctx.fillRect(10, 13 + i * 5, 18 + ((i * 7) % 9), 1);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(38, 13 + i * 5, 6, 1);
    });
  });
  backPanel(g, menu, 30, 20, 24, 38, '#4f3218');

  // 카운터 + 커피머신
  const counterMat = lambert({ map: planks('#4f3218', 9) });
  const topMat = lambert({ map: planks('#d7cb8d', 12) });
  g.add(box(28, 14, 9, counterMat, -20, 7, BACK_Z + 5));
  g.add(box(30, 1.2, 11, topMat, -20, 14.6, BACK_Z + 5));
  const metal = lambert({ color: '#9aa3ad' });
  g.add(box(9, 10, 6, metal, -26, 20.2, BACK_Z + 4));
  g.add(box(9, 1.5, 3, lambert({ color: '#30343f' }), -26, 24.5, BACK_Z + 6.5));
  g.add(box(1, 1, 0.4, new THREE.MeshBasicMaterial({ color: '#ff4d4d' }), -23, 22, BACK_Z + 7.2));
  g.add(box(2, 2.5, 2, lambert({ color: '#f4f1ea' }), -26, 16.5, BACK_Z + 6.5));
  // 컵 진열 선반
  g.add(box(26, 1, 5, counterMat, -6, 30, BACK_Z + 2.5));
  const cupColors = ['#f4f1ea', '#ff9fb2', '#9fe0ff', '#ffd166', '#c3e88d', '#f4f1ea'];
  cupColors.forEach((c, i) => g.add(box(2.4, 3, 2.4, lambert({ color: c }), -16 + i * 4, 32, BACK_Z + 2.5)));

  // 큰 창문 (따뜻한 오후)
  leftWindow(g, { z0: 4, z1: 40, y0: 20, y1: 50, frameColor: '#2a2a2e', pane: lambert({ map: glass('#ffd9a8'), emissive: 0x553311 }) });

  // 매달린 등 2개
  const chain = lambert({ color: '#3a3a3a' });
  const lamps = [];
  for (const [x, z] of [[-6, -6], [16, -8]]) {
    g.add(box(0.5, 30, 0.5, chain, x, 75, z));
    g.add(box(5, 3, 5, lambert({ color: '#2a2a2e' }), x, 59, z));
    const bulb = box(3, 2, 3, new THREE.MeshBasicMaterial({ color: '#ffe0a0' }), x, 57, z);
    bulb.castShadow = false;
    g.add(bulb);
    const light = new THREE.PointLight(0xffc98a, 400, 70, 1.6);
    light.position.set(x, 54, z);
    g.add(light);
    lamps.push(light);
  }

  // 화분 (몬스테라 느낌)
  g.add(box(6, 7, 6, lambert({ color: '#c9b8a6' }), LEFT_X + 6, 3.5, 44));
  const leaf = lambert({ color: '#3f9f4f' });
  for (const [dx, dy, dz] of [[0, 9, 0], [-2, 12, 1], [2, 11, -1], [0, 15, 0]]) g.add(box(4, 1, 4, leaf, LEFT_X + 6 + dx, dy, 44 + dz));
  g.add(box(1, 9, 1, lambert({ color: '#2e7d32' }), LEFT_X + 6, 10, 44));

  return { group: g, clear: '#2b211c', hemi: ['#ffe8cc', '#4a3a30', 1.2], sun: 0.9 };
}

const BUILDERS = { classroom, winter, cafe };

export function buildTheme(name) {
  const b = BUILDERS[name];
  if (!b) return null;
  return b();
}

export function disposeTheme(theme) {
  theme?.group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}

export { shade };
