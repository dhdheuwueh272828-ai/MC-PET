import * as THREE from 'three';
import { pixelTexture, rng, shade } from './textures.js';

// 배경 엑스트라 (사무실 동료·도서관 학생·지나가는 사람) — 마크풍 사람 모델 + 간단한 동작
// 좌표: 1 = 스킨 1픽셀, 발바닥 y=0, +z 를 바라본다 (펫 모델과 같은 비율)

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

// 옷차림 예시 (skin 피부, hair 머리, shirt 윗옷, pants 바지, shoes 신발, long 긴머리, glasses 안경, tie 넥타이)
export const OUTFITS = [
  { skin: '#e8b98f', hair: '#3b2a1e', shirt: '#f2f2f2', pants: '#2f3a4f', shoes: '#222222', tie: '#c0392b' },
  { skin: '#c68a5e', hair: '#16110d', shirt: '#4f7bd8', pants: '#3a3a3a', shoes: '#4a3020', glasses: true },
  { skin: '#f1c9a5', hair: '#a8642a', shirt: '#e07a9a', pants: '#2b2b44', shoes: '#ffffff', long: true },
  { skin: '#8d5a3b', hair: '#0f0b08', shirt: '#3fa66b', pants: '#5a4630', shoes: '#2a2a2a' },
  { skin: '#f0c8a0', hair: '#e2c46a', shirt: '#f2b134', pants: '#3f5f8f', shoes: '#7a3b2a', long: true, glasses: true },
  { skin: '#d9a47a', hair: '#5a3a24', shirt: '#7a5ac8', pants: '#222831', shoes: '#dddddd' },
  { skin: '#e3ae86', hair: '#2b2b2b', shirt: '#9aa3ad', pants: '#1f2a3a', shoes: '#111111', tie: '#2c4a8a' },
];

// 머리: 면마다 다른 8x8 텍스처 (앞면 = 얼굴)
function headMaterials(o) {
  const hairRows = o.long ? 6 : 2;
  const px = (ctx, x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const noise = (ctx, base, seed) => {
    const r = rng(seed);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(ctx, x, y, shade(base, (r() - 0.5) * 0.1));
  };
  const face = pixelTexture((ctx) => {
    noise(ctx, o.skin, 3);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) px(ctx, x, y, shade(o.hair, (x * 7 + y) % 3 === 0 ? -0.08 : 0));
    px(ctx, 0, 2, o.hair);
    px(ctx, 7, 2, o.hair);
    if (o.long) for (let y = 2; y < 7; y++) px(ctx, 0, y, o.hair), px(ctx, 7, y, o.hair);
    // 눈 (흰자 + 눈동자)
    px(ctx, 1, 4, '#ffffff');
    px(ctx, 2, 4, '#3a2a5a');
    px(ctx, 5, 4, '#3a2a5a');
    px(ctx, 6, 4, '#ffffff');
    if (o.glasses) {
      for (const x of [1, 2, 5, 6]) px(ctx, x, 3, '#222222');
      px(ctx, 3, 4, '#222222');
      px(ctx, 4, 4, '#222222');
    }
    px(ctx, 3, 6, shade(o.skin, -0.3));
    px(ctx, 4, 6, shade(o.skin, -0.3));
  }, 8, 8);
  const side = pixelTexture((ctx) => {
    noise(ctx, o.skin, 5);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (y < hairRows || (x > 4 && y < hairRows + 2)) px(ctx, x, y, o.hair);
  }, 8, 8);
  const back = pixelTexture((ctx) => noise(ctx, o.hair, 7), 8, 8);
  const top = pixelTexture((ctx) => noise(ctx, o.hair, 9), 8, 8);
  const bottom = pixelTexture((ctx) => noise(ctx, o.skin, 11), 8, 8);
  const m = (map) => lambert({ map });
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z(앞), -z(뒤)
  return [m(side), m(side), m(top), m(bottom), m(face), m(back)];
}

// 몸통 앞면: 옷깃 + 넥타이(있으면)
function bodyMaterials(o) {
  const plain = lambert({ map: pixelTexture((ctx) => noiseRect(ctx, o.shirt, 8, 12, 13), 8, 12) });
  const front = lambert({
    map: pixelTexture((ctx) => {
      noiseRect(ctx, o.shirt, 8, 12, 15);
      ctx.fillStyle = o.skin;
      ctx.fillRect(3, 0, 2, 1);
      ctx.fillStyle = shade(o.shirt, -0.2);
      ctx.fillRect(2, 0, 1, 2);
      ctx.fillRect(5, 0, 1, 2);
      if (o.tie) {
        ctx.fillStyle = o.tie;
        ctx.fillRect(3, 1, 2, 1);
        ctx.fillRect(3, 2, 2, 6);
      }
    }, 8, 12),
  });
  return [plain, plain, plain, plain, front, plain];
}

function noiseRect(ctx, base, w, h, seed) {
  const r = rng(seed);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = shade(base, (r() - 0.5) * 0.12);
      ctx.fillRect(x, y, 1, 1);
    }
}

function mesh(w, h, d, mat, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

/** 엑스트라 한 명: { root, head, body, armL, armR, legL, legR } — 관절은 어깨·엉덩이·목 기준 */
export function createExtra(o) {
  const root = new THREE.Group();
  const shirt = lambert({ map: pixelTexture((ctx) => noiseRect(ctx, o.shirt, 4, 8, 17), 4, 8) });
  const skin = lambert({ map: pixelTexture((ctx) => noiseRect(ctx, o.skin, 4, 4, 19), 4, 4) });
  const pants = lambert({ map: pixelTexture((ctx) => noiseRect(ctx, o.pants, 4, 10, 21), 4, 10) });
  const shoes = lambert({ color: o.shoes });

  const head = new THREE.Group();
  head.position.y = 24;
  head.add(mesh(8, 8, 8, headMaterials(o), 4));

  const body = mesh(8, 12, 4, bodyMaterials(o), 18);

  const arm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 22, 0);
    p.add(mesh(4, 8, 4, shirt, -2)); // 소매 (어깨 위 2칸 포함)
    p.add(mesh(4, 4, 4, skin, -8)); // 손
    return p;
  };
  const leg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 12, 0);
    p.add(mesh(4, 10, 4, pants, -5));
    p.add(mesh(4, 2, 4, shoes, -11));
    return p;
  };
  const armR = arm(-6);
  const armL = arm(6);
  const legR = leg(-2);
  const legL = leg(2);
  root.add(head, body, armR, armL, legR, legL);
  return { root, head, body, armL, armR, legL, legR };
}

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * 지나다니는 사람: 경로를 따라 걷다가 끝에서 잠깐 멈추고 되돌아간다.
 * waypoints: [{ x, z, wait?, face?, act?: 'browse' | 'look' }] — face 는 멈췄을 때 바라볼 방향(라디안)
 */
export function walker(e, { waypoints, speed = 9, seed = 1, startAt = 0 }) {
  const r = rng(seed);
  let i = startAt % waypoints.length;
  let dir = 1;
  let waiting = 0;
  let waitAct = null;
  let t = r() * 10;
  let phase = 0;
  const cur = waypoints[i];
  e.root.position.set(cur.x, 0, cur.z);
  return (dt) => {
    t += dt;
    const P = e;
    if (waiting > 0) {
      waiting -= dt;
      phase *= 0.8;
      const target = waypoints[i];
      if (target.face != null) P.root.rotation.y = lerpAngle(P.root.rotation.y, target.face, Math.min(1, dt * 6));
      // 멈춰 있는 동안: 책장 훑기(팔 뻗기) 또는 두리번
      const browsing = waitAct === 'browse';
      P.armR.rotation.x += ((browsing ? -2.4 + Math.sin(t * 2) * 0.15 : 0) - P.armR.rotation.x) * Math.min(1, dt * 6);
      P.armL.rotation.x += (0 - P.armL.rotation.x) * Math.min(1, dt * 6);
      P.head.rotation.x += ((browsing ? -0.25 : 0) - P.head.rotation.x) * Math.min(1, dt * 4);
      P.head.rotation.y = browsing ? Math.sin(t * 0.9) * 0.25 : Math.sin(t * 1.3) * 0.6;
      P.legL.rotation.x = P.legR.rotation.x = 0;
      P.root.position.y = 0;
      if (waiting <= 0) {
        // 다음 지점 (끝에 닿으면 반대로)
        if (i + dir < 0 || i + dir >= waypoints.length) dir = -dir;
        i += dir;
      }
      return;
    }
    const target = waypoints[i];
    const dx = target.x - P.root.position.x;
    const dz = target.z - P.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      waiting = target.wait ?? 0.01;
      waitAct = target.act ?? null;
      return;
    }
    const step = Math.min(dist, speed * dt);
    P.root.position.x += (dx / dist) * step;
    P.root.position.z += (dz / dist) * step;
    P.root.rotation.y = lerpAngle(P.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
    phase += dt * speed * 0.55;
    const s = Math.sin(phase);
    P.legR.rotation.x = s * 0.6;
    P.legL.rotation.x = -s * 0.6;
    P.armR.rotation.x = -s * 0.45;
    P.armL.rotation.x = s * 0.45;
    P.head.rotation.x *= 0.9;
    P.head.rotation.y *= 0.9;
    P.root.position.y = Math.abs(Math.cos(phase)) * 0.5;
  };
}

/**
 * 앉아서 일하는 사람: kind 'type' = 키보드 치기, 'study' = 책 읽고 가끔 필기
 * onFlip: 책장을 넘길 때 불림 (공부)
 */
export function seated(e, { kind = 'type', seed = 1, onFlip } = {}) {
  const r = rng(seed);
  let t = r() * 20;
  let nextLook = 4 + r() * 6;
  let lookUntil = 0;
  let lookDir = 1;
  let nextFlip = 3 + r() * 4;
  let writeUntil = 0;
  e.legL.rotation.x = e.legR.rotation.x = -Math.PI / 2;
  e.legR.rotation.z = 0.05;
  e.legL.rotation.z = -0.05;
  return (dt) => {
    t += dt;
    // 가끔 고개를 돌려 주변을 본다
    if (t > nextLook) {
      lookUntil = t + 1.2 + r() * 1.2;
      lookDir = r() < 0.5 ? -1 : 1;
      nextLook = t + 6 + r() * 8;
    }
    const looking = t < lookUntil;
    const yaw = looking ? lookDir * 0.7 : 0;
    e.head.rotation.y += (yaw - e.head.rotation.y) * Math.min(1, dt * 5);
    if (kind === 'type') {
      const tap = looking ? 0 : 1;
      e.armR.rotation.x = -1.25 + Math.sin(t * 17) * 0.06 * tap;
      e.armL.rotation.x = -1.25 + Math.sin(t * 15 + 1.7) * 0.06 * tap;
      e.armR.rotation.z = -0.12;
      e.armL.rotation.z = 0.12;
      e.head.rotation.x = 0.12 + (looking ? -0.1 : 0);
    } else {
      // 공부: 두 손으로 책 붙잡고 고개 숙이기, 가끔 오른손으로 필기
      if (t > nextFlip) {
        nextFlip = t + 4 + r() * 5;
        if (r() < 0.45) writeUntil = t + 2.5;
        else onFlip?.();
      }
      const writing = t < writeUntil;
      e.armL.rotation.x = -0.95;
      e.armL.rotation.z = 0.3;
      e.armR.rotation.x = writing ? -0.85 + Math.sin(t * 14) * 0.05 : -0.95;
      e.armR.rotation.z = writing ? -0.05 + Math.sin(t * 9) * 0.06 : -0.3;
      e.head.rotation.x = looking ? 0.1 : 0.4 + Math.sin(t * 0.8) * 0.04;
    }
    e.body.position.y = 18 + Math.sin(t * 1.6) * 0.08; // 숨쉬기
  };
}
