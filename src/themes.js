import * as THREE from 'three';
import {
  pixelTexture, rng, shade, tiled, planks, log, cobblestone, bricks, plain, wool, glass, bookshelf, fireTexture,
} from './textures.js';
import { OUTFITS, createExtra, walker, seated } from './extras.js';

// 작업 배경 (마인크래프트풍 방). 1블록 = 16칸 = 캐릭터 키의 절반.
// 카메라가 +x,+z 쪽(오른쪽 앞)에서 보므로 뒤쪽 벽(z-)과 왼쪽 벽(x-)만 세운다.
export const THEMES = [
  ['none', '기본'],
  ['classroom', '🏫 교실'],
  ['winter', '🔥 겨울 난로'],
  ['cafe', '☕ 카페'],
  ['office', '🏢 사무실'],
  ['library', '📚 도서관'],
  ['outdoor', '🌳 야외'],
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
function room(g, { floor, lower, upper, lowerH = 14, FW = 140, FD = 120, BW = 120, LD = 110 }) {
  g.add(box(FW, 1, FD, tiledMat(floor, FW, FD), LEFT_X + FW / 2, -0.5, BACK_Z + FD / 2));
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

// ───────────────── 엑스트라용 소품 ─────────────────
// 엑스트라가 펫 뒤쪽에 들어갈 수 있게 벽을 뒤로 민 넓은 방 (벽·벽 장식은 이 그룹 안 좌표로)
const BIG = { dx: -28, dz: -26 };
function bigRoom(g, opts) {
  const w = new THREE.Group();
  w.position.set(BIG.dx, 0, BIG.dz);
  g.add(w);
  room(w, { FW: 220, FD: 190, BW: 190, LD: 170, ...opts });
  return w;
}

// 사람 기준 (x, z) 에 의자, 앞쪽(+z)에 책상 (펫 책상과 같은 높이: 윗면 y=17)
function deskSet(g, x, z, { top, leg, chair, w = 18 }) {
  g.add(box(w, 1, 12, top, x, 16.5, z + 11));
  for (const [dx, dz] of [[-w / 2 + 1, 6], [w / 2 - 1, 6], [-w / 2 + 1, 16], [w / 2 - 1, 16]]) g.add(box(1.5, 16, 1.5, leg, x + dx, 8, z + dz));
  g.add(box(12, 1.5, 11, chair, x, 9.25, z + 0.5));
  g.add(box(12, 13, 1.5, chair, x, 16.5, z - 4.5));
  for (const [dx, dz] of [[-5, -4], [5, -4], [-5, 5], [5, 5]]) g.add(box(1.5, 8.5, 1.5, chair, x + dx, 4.25, z + dz));
}

// 엑스트라를 장면에 넣고 매 프레임 움직일 함수를 모아 둔다
function addExtra(g, updaters, outfit, x, z, make) {
  const e = createExtra(outfit);
  e.root.position.set(x, 0, z);
  g.add(e.root);
  updaters.push(make(e));
  return e;
}

function smallLaptop(g, x, z) {
  const shell = lambert({ color: '#c7ccd6' });
  g.add(box(10, 0.6, 6, shell, x, 17.3, z + 10));
  const lid = box(10, 7, 0.5, shell, x, 21, z + 13.2);
  lid.rotation.x = -0.2;
  g.add(lid);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 5.6), new THREE.MeshBasicMaterial({ color: '#2a3b55' }));
  scr.position.set(x, 21.1, z + 12.9);
  scr.rotation.set(-0.2, Math.PI, 0);
  g.add(scr);
}

function monitorSet(g, x, z, screenColor = '#1e2a3a') {
  const dark = lambert({ color: '#2a2d35' });
  g.add(box(14, 9, 1, dark, x, 24, z + 15));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 7.4), new THREE.MeshBasicMaterial({ color: screenColor }));
  scr.position.set(x, 24, z + 14.45);
  scr.rotation.y = Math.PI;
  g.add(scr);
  // 화면 속 코드 줄 몇 개
  const line = new THREE.MeshBasicMaterial({ color: '#7fd1b9' });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(3 + ((i * 5) % 7), 0.6), line);
    l.position.set(x + 3 - ((i * 5) % 7) / 2, 26.5 - i * 1.6, z + 14.4);
    l.rotation.y = Math.PI;
    g.add(l);
  }
  g.add(box(2, 3, 2, dark, x, 18.5, z + 15));
  g.add(box(12, 0.5, 4, dark, x, 17.25, z + 10)); // 키보드
}

// 펼친 책 (공부하는 엑스트라 앞) — flip() 하면 한 장이 넘어간다
function openBook(g, x, z, cover) {
  const page = lambert({
    map: pixelTexture((ctx) => {
      ctx.fillStyle = '#f6f0dc';
      ctx.fillRect(0, 0, 8, 10);
      ctx.fillStyle = '#9a927c';
      for (let y = 1; y < 10; y += 2) ctx.fillRect(1, y, 6 - (y % 3), 1);
    }, 8, 10),
  });
  const y = 17.15;
  const bz = z + 9;
  g.add(box(13, 0.3, 8, lambert({ color: cover }), x, y, bz));
  g.add(box(6, 0.3, 7, page, x - 3.1, y + 0.3, bz));
  g.add(box(6, 0.3, 7, page, x + 3.1, y + 0.3, bz));
  // 넘어가는 한 장: 책 가운데를 축으로 회전
  const hinge = new THREE.Group();
  hinge.position.set(x, y + 0.5, bz);
  const leaf = box(6, 0.1, 7, page, 3, 0, 0);
  leaf.castShadow = false;
  hinge.add(leaf);
  g.add(hinge);
  let t = 1;
  return {
    flip() {
      t = 0;
    },
    update(dt) {
      if (t >= 1) return;
      t = Math.min(1, t + dt * 1.6);
      hinge.rotation.z = Math.PI * t; // 오른쪽 → 왼쪽
    },
  };
}

function tableLamp(g, x, y, z) {
  g.add(box(3, 0.6, 3, lambert({ color: '#c9a227' }), x, y + 0.3, z));
  g.add(box(0.6, 5, 0.6, lambert({ color: '#c9a227' }), x, y + 3, z));
  g.add(box(5, 2, 3, lambert({ color: '#2f7d4f' }), x, y + 5.5, z + 0.6));
  const bulb = box(3.6, 0.3, 2, new THREE.MeshBasicMaterial({ color: '#fff3c4' }), x, y + 4.4, z + 0.6);
  bulb.castShadow = false;
  g.add(bulb);
}

function plant(g, x, z, h = 12) {
  g.add(box(6, 7, 6, lambert({ color: '#c9b8a6' }), x, 3.5, z));
  const leaf = lambert({ color: '#3f9f4f' });
  g.add(box(1, h, 1, lambert({ color: '#2e7d32' }), x, 7 + h / 2, z));
  for (const [dx, dy, dz] of [[0, h - 2, 0], [-2, h - 5, 1], [2, h - 4, -1], [0, h + 1, 0]]) g.add(box(4, 1, 4, leaf, x + dx, 7 + dy, z + dz));
}

// ───────────────── 사무실 ─────────────────
function office() {
  const g = new THREE.Group();
  const updaters = [];
  const w = bigRoom(g, {
    floor: () => plain('#7b8491', 3, 0.07), // 카펫 타일
    lower: () => plain('#5b6470', 4, 0.04),
    upper: () => plain('#eceff2', 5, 0.02),
    lowerH: 6,
  });

  // 큰 창문 (도시 풍경)
  const city = canvasTex(32, 24, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#7fc4ff');
    sky.addColorStop(1, '#d6eeff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const r = rng(77);
    for (let x = 0; x < w; ) {
      const bw = 3 + Math.floor(r() * 4);
      const bh = 8 + Math.floor(r() * 12);
      ctx.fillStyle = ['#7a8697', '#8f9aab', '#66727f'][Math.floor(r() * 3)];
      ctx.fillRect(x, h - bh, bw, bh);
      ctx.fillStyle = '#ffe9a8';
      for (let y = h - bh + 2; y < h - 1; y += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 2) if (r() < 0.5) ctx.fillRect(wx, y, 1, 1);
      x += bw + 1;
    }
  });
  leftWindow(w, { z0: 20, z1: 70, y0: 20, y1: 56, frameColor: '#d0d4da', pane: lambert({ map: city, emissive: 0x223344 }) });

  // 화이트보드 (그래프) + 시계
  const board = canvasTex(64, 32, (ctx, w, h) => {
    ctx.fillStyle = '#f7f8fa';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8ccd2';
    ctx.fillRect(4, 26, 30, 1);
    ctx.fillRect(4, 4, 1, 23);
    const bars = [6, 10, 8, 15, 19];
    bars.forEach((b, i) => {
      ctx.fillStyle = ['#5b8def', '#f2a541', '#5fbf77', '#e85d75', '#5b8def'][i];
      ctx.fillRect(7 + i * 5, 26 - b, 3, b);
    });
    ctx.fillStyle = '#e85d75';
    for (let i = 0; i < 18; i++) ctx.fillRect(40 + i, 22 - Math.floor(i * 0.9) - (i % 4 === 0 ? 1 : 0), 1, 1); // 오르는 선
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(40, 6, 14, 1);
    ctx.fillRect(40, 9, 10, 1);
  });
  backPanel(w, board, 44, 22, 30, 42, '#9aa3ad');
  w.add(box(44, 1, 2, lambert({ color: '#9aa3ad' }), 30, 30.5, BACK_Z + 1));

  // 정수기 + 화분
  const cooler = lambert({ color: '#e9edf2' });
  w.add(box(7, 16, 7, cooler, LEFT_X + 5, 8, BACK_Z + 5));
  w.add(box(6, 7, 6, lambert({ color: '#7fc8ff', transparent: true, opacity: 0.8 }), LEFT_X + 5, 19.5, BACK_Z + 5));
  plant(w, 90, BACK_Z + 5, 16);
  plant(w, LEFT_X + 6, 90, 12);

  // 동료 두 명 (키보드 두드리는 중)
  const top = lambert({ map: plain('#e9e3d6', 6, 0.03) });
  const leg = lambert({ color: '#4a4f58' });
  const chair = lambert({ map: wool('#34495e') });
  // 펫 뒤 왼쪽·오른쪽 자리
  deskSet(g, -40, -10, { top, leg, chair, w: 16 });
  smallLaptop(g, -40, -10);
  addExtra(g, updaters, OUTFITS[1], -40, -10, (e) => seated(e, { kind: 'type', seed: 3 }));
  deskSet(g, 10, -30, { top, leg, chair });
  monitorSet(g, 10, -30);
  addExtra(g, updaters, OUTFITS[0], 10, -30, (e) => seated(e, { kind: 'type', seed: 8 }));

  // 커피 들고 지나다니는 사람
  const passer = addExtra(g, updaters, OUTFITS[2], -56, -40, (e) =>
    walker(e, { waypoints: [{ x: -56, z: -40, wait: 2.5, act: 'look' }, { x: 90, z: -40, wait: 4 }], speed: 8, seed: 5 }),
  );
  passer.armR.add(box(2.4, 3, 2.4, lambert({ color: '#f4f1ea' }), 0, -11, 2));

  return { group: g, clear: '#dfe6ee', hemi: ['#ffffff', '#8a93a0', 1.55], sun: 1.15, update: (dt) => updaters.forEach((u) => u(dt)) };
}

// ───────────────── 도서관 ─────────────────
function library() {
  const g = new THREE.Group();
  const updaters = [];
  const w = bigRoom(g, {
    floor: () => planks('#8a6a45', 51),
    lower: () => planks('#4f3218', 53),
    upper: () => plain('#efe3c8', 5, 0.03),
  });

  // 벽을 따라 늘어선 책장 (높이 3칸)
  const shelf = lambert({ map: bookshelf() });
  const frame = lambert({ map: planks('#5a3d24', 57) });
  for (let x = LEFT_X + 8; x < LEFT_X + 190; x += 16) for (let k = 0; k < 3; k++) w.add(box(16, 16, 3, shelf, x, 8 + k * 16, BACK_Z + 1.5));
  w.add(box(190, 2, 4, frame, LEFT_X + 95, 49, BACK_Z + 2));
  for (let z = BACK_Z + 11; z < BACK_Z + 160; z += 16) for (let k = 0; k < 3; k++) {
    if (z > 34 && z < 66 && k > 0) continue; // 창문 자리
    w.add(box(3, 16, 16, shelf, LEFT_X + 1.5, 8 + k * 16, z));
  }
  leftWindow(w, { z0: 38, z1: 62, y0: 24, y1: 46, frameColor: '#5a3d24', pane: lambert({ map: glass('#a8d8ff'), emissive: 0x334455 }) });

  // 공부하는 학생 두 명 (책 + 스탠드)
  const top = lambert({ map: planks('#6b4a2b', 59) });
  const leg = lambert({ map: planks('#4f3218', 61) });
  const chair = lambert({ map: planks('#5a3d24', 63) });
  // 펫 뒤 왼쪽·오른쪽 자리
  for (const [x, z, outfit, cover, seed, dw] of [[-40, -10, OUTFITS[4], '#a83232', 4, 16], [10, -30, OUTFITS[3], '#3a5fb0', 9, 18]]) {
    deskSet(g, x, z, { top, leg, chair, w: dw });
    const book = openBook(g, x, z, cover);
    updaters.push((dt) => book.update(dt));
    tableLamp(g, x + dw / 2 - 3, 17, z + 14);
    g.add(box(5, 2, 7, lambert({ color: '#3f8f3f' }), x - dw / 2 + 3, 18, z + 12)); // 쌓아 둔 책
    g.add(box(5, 1.6, 7, lambert({ color: '#c9a227' }), x - dw / 2 + 3, 19.8, z + 12));
    addExtra(g, updaters, outfit, x, z, (e) => seated(e, { kind: 'study', seed, onFlip: book.flip }));
  }

  // 책장을 둘러보며 다니는 사람
  const browser = addExtra(g, updaters, OUTFITS[6], -54, -38, (e) =>
    walker(e, {
      waypoints: [
        { x: -54, z: -38, wait: 3, face: Math.PI, act: 'browse' },
        { x: -20, z: -38, wait: 2.5, face: Math.PI, act: 'browse' },
        { x: 34, z: -38, wait: 3, face: Math.PI, act: 'browse' },
        { x: 80, z: -38, wait: 2, act: 'look' },
      ],
      speed: 6,
      seed: 12,
    }),
  );
  browser.armL.add(box(3, 5, 6, lambert({ color: '#7b3fa0' }), 1, -10, 1.5)); // 옆구리에 낀 책

  return { group: g, clear: '#2b211c', hemi: ['#fff1d6', '#6a5040', 1.35], sun: 1.0, update: (dt) => updaters.forEach((u) => u(dt)) };
}

// ───────────────── 야외 ─────────────────
function outdoor() {
  const g = new THREE.Group();
  const updaters = [];
  const grass = lambert({ map: tiled(plain('#6aa84f', 7, 0.09), 26, 26) });
  g.add(box(420, 1, 420, grass, 30, -0.5, 60));
  // 자갈길 (사람들이 지나가는 길)
  const gravel = lambert({ map: tiled(plain('#a59d92', 9, 0.12), 26, 0.7) });
  const path = box(420, 0.4, 12, gravel, 30, 0.2, -14);
  path.castShadow = false;
  g.add(path);

  // 나무 울타리
  const fence = lambert({ map: planks('#a07a4a', 71) });
  for (let x = -80; x <= 140; x += 10) g.add(box(2, 12, 2, fence, x, 6, -21));
  for (const y of [5, 10]) g.add(box(220, 1.4, 1, fence, 30, y, -21));

  // 마크풍 참나무
  const logMat = lambert({ map: log('#6b4a30') });
  const leaves = lambert({ map: plain('#3f8f3a', 11, 0.14) });
  const tree = (x, z, h = 28) => {
    g.add(box(6, h, 6, logMat, x, h / 2, z));
    g.add(box(30, 12, 30, leaves, x, h + 2, z));
    g.add(box(20, 10, 20, leaves, x, h + 12, z));
  };
  tree(-46, -42);
  tree(18, -56, 34);
  tree(78, -40);
  tree(-62, 18, 30);
  tree(130, -60, 36);

  // 꽃 + 덤불
  const r = rng(31);
  const petals = ['#e8505b', '#ffd166', '#f4f1ea', '#9b7bd8'];
  for (let i = 0; i < 40; i++) {
    const x = -70 + r() * 190;
    const z = -60 + r() * 120;
    if (Math.abs(z + 14) < 9 || (Math.abs(x) < 26 && z > -8 && z < 30)) continue; // 길·책상 자리 비우기
    g.add(box(0.6, 3, 0.6, lambert({ color: '#2e7d32' }), x, 1.5, z));
    g.add(box(1.8, 1.8, 1.8, lambert({ color: petals[i % petals.length] }), x, 3.6, z));
  }
  for (const [x, z] of [[-30, -28], [44, -30], [-50, 40]]) g.add(box(10, 6, 8, leaves, x, 3, z));

  // 흘러가는 구름
  const cloudMat = lambert({ color: '#ffffff', emissive: 0x666666 });
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = box(30 + r() * 30, 5, 16 + r() * 10, cloudMat, -150 + i * 60, 90 + r() * 20, -110 - r() * 60);
    c.castShadow = false;
    clouds.push(c);
    g.add(c);
  }
  updaters.push((dt) => {
    for (const c of clouds) {
      c.position.x += dt * 2.5;
      if (c.position.x > 220) c.position.x = -180;
    }
  });

  // 지나가는 사람들 (서로 다른 속도·방향) + 울타리 너머 조깅하는 사람
  addExtra(g, updaters, OUTFITS[5], -110, -16.5, (e) => walker(e, { waypoints: [{ x: -110, z: -16.5, wait: 3 }, { x: 160, z: -16.5, wait: 2 }], speed: 8, seed: 21 }));
  addExtra(g, updaters, OUTFITS[2], 160, -11.5, (e) => walker(e, { waypoints: [{ x: 160, z: -11.5, wait: 6 }, { x: -110, z: -11.5, wait: 4 }], speed: 6.5, seed: 23 }));
  addExtra(g, updaters, OUTFITS[3], -120, -34, (e) => walker(e, { waypoints: [{ x: -120, z: -34, wait: 1 }, { x: 170, z: -34, wait: 1 }], speed: 15, seed: 25 }));

  return { group: g, clear: '#8fd3ff', hemi: ['#ffffff', '#6a8a50', 1.5], sun: 1.5, update: (dt) => updaters.forEach((u) => u(dt)) };
}

const BUILDERS = { classroom, winter, cafe, office, library, outdoor };

export function buildTheme(name) {
  const b = BUILDERS[name];
  if (!b) return null;
  return b();
}

export function disposeTheme(theme) {
  theme?.group.traverse((o) => {
    o.geometry?.dispose();
    // 엑스트라 머리처럼 면마다 재질이 다른 경우(배열)도 정리
    for (const m of [o.material].flat()) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
}

export { shade };
