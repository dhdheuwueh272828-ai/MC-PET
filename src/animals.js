import * as THREE from 'three';
import { pixelTexture, rng, shade } from './textures.js';

// 🐺🐈 책상 옆 동물 친구 — 마크풍 복셀 모델 + 가벼운 대기 동작
// 좌표: 1 = 1픽셀, 발바닥 y=0, +z 를 바라본다. 재질은 동물마다 공유한다.

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

function noiseTex(base, w, h, seed, spread = 0.06) {
  return pixelTexture((ctx) => {
    const r = rng(seed);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = shade(base, (r() - 0.5) * spread * 2);
        ctx.fillRect(x, y, 1, 1);
      }
  }, w, h);
}

function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const SPECS = {
  wolf: {
    body: [6, 6, 9],
    legH: 8,
    legW: 2,
    head: [6, 6, 4],
    tail: [2, 8],
    tailUp: 0.55,
    sitPitch: 0.75,
    fur: '#ecebe6',
    eye: '#1d1d1d',
  },
  cat: {
    body: [4, 4, 10],
    legH: 5,
    legW: 1.6,
    head: [5, 4, 5],
    tail: [1.2, 8],
    tailUp: 0.3,
    sitPitch: 0.9,
    fur: '#1e1e24',
    eye: '#c8e04a',
  },
};

// 얼굴(앞면) 텍스처: 눈을 뜬 것 / 감은 것
function faceTex(kind, closed) {
  const s = SPECS[kind];
  const [w, h] = kind === 'wolf' ? [6, 6] : [5, 4];
  return pixelTexture((ctx) => {
    const r = rng(kind === 'wolf' ? 41 : 43);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = shade(s.fur, (r() - 0.5) * 0.12);
        ctx.fillRect(x, y, 1, 1);
      }
    const ey = kind === 'wolf' ? 2 : 1;
    const ex = kind === 'wolf' ? [1, 4] : [1, 3];
    for (const x of ex) {
      if (closed) {
        ctx.fillStyle = kind === 'wolf' ? '#8a8780' : '#55555f';
        ctx.fillRect(x, ey + 1, 1, 1);
      } else {
        ctx.fillStyle = kind === 'wolf' ? '#ffffff' : s.eye;
        ctx.fillRect(x, ey, 1, 1);
        ctx.fillStyle = kind === 'wolf' ? s.eye : '#111111';
        ctx.fillRect(x, ey + (kind === 'wolf' ? 0 : 1), kind === 'wolf' ? 1 : 1, 1);
        if (kind === 'wolf') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + (x === 1 ? -1 : 1), ey, 1, 1);
        }
      }
    }
  }, w, h);
}

/** 동물 하나 만들기 → { root, update(dt, ctx), pat(), anchor } */
export function createAnimal(kind) {
  const s = SPECS[kind];
  const [bw, bh, bl] = s.body;
  const fur = lambert({ map: noiseTex(s.fur, 8, 8, kind === 'wolf' ? 11 : 13) });
  const dark = lambert({ color: shade(s.fur, kind === 'wolf' ? -0.12 : 0.12) });
  const faceOpen = lambert({ map: faceTex(kind, false) });
  const faceClosed = lambert({ map: faceTex(kind, true) });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(boxMesh(bw, bh, bl, fur));
  if (kind === 'wolf') {
    // 목 갈기 + 빨간 목줄
    body.add(boxMesh(bw + 2, bh + 1, 5, fur, 0, 0.5, bl / 2 - 2));
    body.add(boxMesh(bw + 2.4, 1.2, 1.2, lambert({ color: '#c62f3a' }), 0, 0.8, bl / 2 + 0.6));
  }

  // 머리 (앞면은 얼굴)
  const head = new THREE.Group();
  head.position.set(0, bh * 0.3, bl / 2 + (kind === 'wolf' ? 0.8 : 0));
  const [hw, hh, hd] = s.head;
  const headMats = [fur, fur, fur, fur, faceOpen, fur];
  const headMesh = boxMesh(hw, hh, hd, headMats, 0, hh * 0.3, hd / 2);
  head.add(headMesh);
  if (kind === 'wolf') {
    head.add(boxMesh(3, 3, 4, fur, 0, -0.2, hd + 2)); // 주둥이
    head.add(boxMesh(1.2, 1, 0.6, lambert({ color: '#1d1d1d' }), 0, 1.1, hd + 4.1)); // 코
    for (const x of [-2, 2]) head.add(boxMesh(2, 2, 1, fur, x, hh * 0.3 + hh / 2 + 1, 1));
  } else {
    head.add(boxMesh(3, 1.6, 1, dark, 0, -0.2, hd + 0.5)); // 주둥이
    head.add(boxMesh(0.8, 0.5, 0.3, lambert({ color: '#e88aa0' }), 0, 0.4, hd + 1.05)); // 분홍 코
    for (const x of [-1.6, 1.6]) head.add(boxMesh(1, 1.2, 2, fur, x, hh * 0.3 + hh / 2 + 0.6, 1.2));
  }
  body.add(head);

  // 꼬리
  const tail = new THREE.Group();
  tail.position.set(0, bh * 0.3, -bl / 2);
  const [tw, tl] = s.tail;
  tail.add(boxMesh(tw, tw, tl, kind === 'wolf' ? fur : dark, 0, 0, -tl / 2));
  body.add(tail);

  // 다리 4개 (몸통 아래 모서리에 관절)
  const legs = [];
  for (const sz of [1, -1])
    for (const sx of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(sx * (bw / 2 - s.legW / 2), -bh / 2, sz * (bl / 2 - s.legW / 2 - 0.4));
      p.add(boxMesh(s.legW, s.legH, s.legW, fur, 0, -s.legH / 2, 0));
      p.userData.front = sz > 0;
      body.add(p);
      legs.push(p);
    }

  // 자세: 몸 높이·기울기, 앞/뒷다리 각도, 고개
  const sp = s.sitPitch;
  const sinP = Math.sin(sp);
  const cosP = Math.cos(sp);
  const POSES = {
    stand: { y: s.legH + bh / 2, pitch: 0, front: 0, hind: 0, hp: 0 },
    sit: { y: s.legW / 2 + (bl / 2) * sinP + (bh / 2) * cosP, pitch: -sp, front: sp, hind: -(Math.PI / 2 - sp), hp: sp * 0.8 },
    lie: { y: bh / 2 + s.legW / 2, pitch: 0, front: -Math.PI / 2, hind: Math.PI / 2, hp: 0 },
    sleep: { y: bh / 2 + s.legW / 2, pitch: 0, front: -Math.PI / 2, hind: Math.PI / 2, hp: 0.45 },
    stretch: { y: s.legH * 0.7 + bh / 2, pitch: 0.35, front: -1.1, hind: 0, hp: -0.2 },
  };
  const cur = { ...POSES.lie };

  const r = rng(kind === 'wolf' ? 5 : 7);
  let t = r() * 10;
  let mode = kind === 'cat' ? 'lie' : 'sit';
  let modeUntil = 4 + r() * 4;
  let happyUntil = 0;
  let lookYaw = 0;
  let nextLook = 2;
  const anchor = new THREE.Vector3();

  // 대기 동작 고르기 (고양이는 가끔 그루밍·기지개)
  function nextMode() {
    const choices = kind === 'cat' ? ['lie', 'lie', 'sit', 'sit', 'groom', 'stretch', 'stand'] : ['sit', 'sit', 'lie', 'lie', 'stand'];
    mode = choices[Math.floor(r() * choices.length)];
    modeUntil = t + (mode === 'stretch' ? 2.2 : mode === 'groom' ? 4 : 6 + r() * 8);
  }

  return {
    kind,
    root,
    anchor,
    /** 쓰다듬기: 꼬리 붕붕 + 깡충 */
    pat() {
      happyUntil = t + 2.2;
      if (mode === 'stretch' || mode === 'groom') mode = 'sit';
    },
    update(dt, { sleeping = false } = {}) {
      t += dt;
      if (t > modeUntil) nextMode();
      const happy = t < happyUntil;
      const m = sleeping ? 'sleep' : happy && mode === 'lie' ? 'sit' : mode === 'groom' ? 'sit' : mode;
      const target = POSES[m];
      const k = Math.min(1, dt * 5);
      for (const key of Object.keys(cur)) cur[key] += (target[key] - cur[key]) * k;

      // 숨쉬기 + 신나면 깡충
      const hop = happy ? Math.abs(Math.sin(t * 9)) * 1.2 : 0;
      body.position.y = cur.y + Math.sin(t * (sleeping ? 1.4 : 2.2)) * 0.12 + hop;
      body.rotation.x = cur.pitch;
      for (const l of legs) l.rotation.x = l.userData.front ? cur.front : cur.hind;

      // 그루밍: 앞발 하나 들고 고개를 옆으로 까딱
      const grooming = !sleeping && mode === 'groom';
      legs[0].rotation.x += grooming ? -1.3 : 0;

      // 가끔 두리번
      if (t > nextLook) {
        lookYaw = r() < 0.4 ? 0 : (r() - 0.5) * 1.4;
        nextLook = t + 2 + r() * 4;
      }
      const yaw = sleeping ? 0.5 : grooming ? 0.9 : happy ? 0 : lookYaw;
      head.rotation.y += (yaw - head.rotation.y) * k;
      head.rotation.x = cur.hp + (grooming ? 0.45 + Math.sin(t * 8) * 0.12 : 0) + (happy ? -0.2 : 0);
      head.rotation.z = happy ? Math.sin(t * 6) * 0.12 : 0;
      headMats[4] = sleeping ? faceClosed : faceOpen;
      headMesh.material = headMats;

      // 꼬리: 평소엔 살랑, 신나면 붕붕, 자면 축 늘어뜨림
      tail.rotation.x = sleeping ? -0.2 : s.tailUp + (happy ? 0.35 : 0);
      tail.rotation.y = sleeping ? 0.9 : Math.sin(t * (happy ? 16 : 2.5)) * (happy ? 0.7 : 0.35);

      // 하트가 뜰 자리 (머리 위)
      head.getWorldPosition(anchor);
      anchor.y += s.head[1] + 4;
    },
  };
}
