import * as THREE from 'three';
import { rng, shade } from './textures.js';

// 🐺🐈 책상 옆 동물 친구 — 마크풍이지만 촘촘한 털 텍스처(1칸 = 4픽셀)로 다듬은 복셀 모델
// 좌표: 1 = 스킨 1픽셀, 발바닥 y=0, +z 를 바라본다.

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
const TEXEL = 4; // 모델 1칸에 텍스처 4픽셀 → 마크 블록 느낌은 살리고 결은 곱게

// 털 텍스처: 결(세로 줄무늬) + 위는 밝고 아래는 어둡게 + 필요하면 그림 덧칠
function furTexture(w, h, { base, light, dark, seed = 1, grain = 0.07, paint }) {
  const W = Math.max(2, Math.min(64, Math.round(w * TEXEL)));
  const H = Math.max(2, Math.min(64, Math.round(h * TEXEL)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const r = rng(seed * 97 + W * 7 + H);
  const strand = Array.from({ length: W }, () => (r() - 0.5) * grain);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = y / Math.max(1, H - 1);
      let col = v < 0.25 && light ? light : v > 0.8 && dark ? dark : base;
      if (r() < 0.05) col = r() < 0.5 && light ? light : dark ?? base; // 드문드문 털 한 가닥
      ctx.fillStyle = shade(col, strand[x] + (r() - 0.5) * grain + (0.5 - v) * 0.08);
      ctx.fillRect(x, y, 1, 1);
    }
  paint?.(ctx, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 면마다 털 텍스처를 붙인 상자. faces 로 특정 면(px, nx, py, ny, pz, nz)만 다르게 칠할 수 있다.
 * BoxGeometry 면 순서: +x, -x, +y(위), -y(아래), +z(앞), -z(뒤)
 */
function furBox(w, h, d, fur, { faces = {}, x = 0, y = 0, z = 0, seed = 1 } = {}) {
  const dims = { px: [d, h], nx: [d, h], py: [w, d], ny: [w, d], pz: [w, h], nz: [w, h] };
  const mats = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((k, i) => {
    const spec = { ...fur, ...(k === 'py' ? { light: fur.light, dark: fur.light ?? fur.base } : {}), ...(k === 'ny' ? { base: fur.belly ?? fur.dark ?? fur.base } : {}), ...faces[k] };
    return lambert({ map: furTexture(...dims[k], { ...spec, seed: seed * 6 + i }) });
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const solid = (color, w, h, d, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

// 뾰족한 귀: 아래가 넓고 위로 갈수록 좁아지는 계단 (안쪽은 분홍)
function pointyEar(fur, inner, { w, h, d, side }) {
  const g = new THREE.Group();
  const steps = [
    [1, 0.4],
    [0.64, 0.32],
    [0.3, 0.28],
  ];
  let y = 0;
  steps.forEach(([k, hk], i) => {
    const sh = h * hk;
    g.add(furBox(w * k, sh, d, fur, { y: y + sh / 2, x: side * (w * (1 - k)) * 0.25, seed: 40 + i }));
    if (i < 2) g.add(solid(inner, w * k * 0.5, sh * 0.9, 0.12, side * (w * (1 - k)) * 0.25, y + sh / 2, d / 2 + 0.05));
    y += sh;
  });
  g.rotation.z = -side * 0.12; // 살짝 바깥으로
  return g;
}

const SPECS = {
  wolf: {
    body: [6, 6, 9],
    legH: 8,
    legW: 2,
    head: [6, 6, 4],
    tail: [2.4, 8],
    tailUp: 0.55,
    sitPitch: 0.75,
    fur: { base: '#ecebe6', light: '#fbfaf6', dark: '#dad7cf', belly: '#dedbd3', grain: 0.045 },
  },
  cat: {
    body: [4, 4, 10],
    legH: 5,
    legW: 1.6,
    head: [5, 4, 5],
    tail: [1.2, 8],
    tailUp: 0.12,
    sitPitch: 0.9,
    fur: { base: '#1f1f26', light: '#34343f', dark: '#141418', belly: '#2a2a32', grain: 0.12 },
  },
};

// 얼굴(앞면) 그림: 눈(흰자·눈동자·반짝임), 눈썹 그늘, 감은 눈
function paintFace(kind, closed) {
  return (ctx, W, H) => {
    const px = (x, y, c, w = 1, h = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    if (kind === 'wolf') {
      // 24x24: 눈은 가운데보다 조금 위, 양옆으로
      for (const ex of [4, 15]) {
        px(ex - 1, 9, '#bdb9b0', 7, 1); // 눈썹 그늘
        if (closed) px(ex, 12, '#6f6b63', 5, 1);
        else {
          px(ex, 10, '#ffffff', 5, 4);
          px(ex + (ex < 12 ? 2 : 1), 10, '#2a2420', 2, 4);
          px(ex + (ex < 12 ? 2 : 1), 10, '#5a4a3a', 2, 1);
          px(ex + (ex < 12 ? 3 : 1), 11, '#ffffff', 1, 1);
        }
      }
      px(9, 16, '#d8d4cb', 6, 8); // 주둥이 쪽 밝은 털
    } else {
      // 20x16 고양이: 크고 둥근 노랑초록 눈 + 세로 동공
      for (const ex of [3, 12]) {
        if (closed) {
          px(ex, 8, '#4a4a55', 5, 1);
          px(ex + 1, 9, '#4a4a55', 3, 1);
        } else {
          px(ex, 5, '#9fcf3a', 5, 5);
          px(ex + 1, 4, '#c8e04a', 3, 1);
          px(ex, 6, '#c8e04a', 5, 2);
          px(ex + 2, 5, '#0c0c0c', 1, 5);
          px(ex + 1, 5, '#ffffff', 1, 1);
        }
      }
    }
  };
}

/** 동물 하나 만들기 → { root, update(dt, ctx), pat(), anchor } */
export function createAnimal(kind) {
  const s = SPECS[kind];
  const F = s.fur;
  const [bw, bh, bl] = s.body;
  const [hw, hh, hd] = s.head;
  const pink = kind === 'wolf' ? '#e6a7a8' : '#e88aa0';

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(furBox(bw, bh, bl, F, { seed: 2 }));
  if (kind === 'wolf') {
    // 목 갈기 (두 겹으로 풍성하게) + 빨간 목줄과 금색 이름표
    body.add(furBox(bw + 2, bh + 1, 5, { ...F, base: '#f4f3ef' }, { y: 0.5, z: bl / 2 - 2, seed: 3 }));
    body.add(furBox(bw + 1.2, bh + 1.8, 3, { ...F, base: '#f7f6f2' }, { y: 0.3, z: bl / 2 - 1.2, seed: 4 }));
    body.add(solid('#c62f3a', bw + 2.4, 1.2, 1.4, 0, 1.2, bl / 2 + 0.6));
    body.add(solid('#e8c34a', 1, 1.2, 0.4, 0, 0.1, bl / 2 + 1.35));
    body.add(furBox(bw - 1, 1, bl - 2, { ...F, base: '#d9d6ce' }, { y: bh / 2 + 0.2, z: -1, seed: 5 })); // 등 털결
  } else {
    body.add(furBox(bw - 0.6, 0.6, bl - 3, { ...F, base: '#2b2b35', light: '#3c3c4a' }, { y: bh / 2 + 0.2, seed: 5 })); // 등의 윤기
  }

  // 머리 (앞면은 얼굴, 눈 뜬 것/감은 것 두 장)
  const head = new THREE.Group();
  head.position.set(0, bh * 0.3, bl / 2 + (kind === 'wolf' ? 0.8 : 0));
  const headMesh = furBox(hw, hh, hd, F, { y: hh * 0.3, z: hd / 2, seed: 6, faces: { pz: { paint: paintFace(kind, false) } } });
  const headMats = headMesh.material;
  const faceOpen = headMats[4];
  const faceClosed = lambert({ map: furTexture(hw, hh, { ...F, seed: 6 * 6 + 4, paint: paintFace(kind, true) }) });
  head.add(headMesh);
  const ear = { w: kind === 'wolf' ? 2.8 : 1.8, h: kind === 'wolf' ? 2.9 : 2.2, d: kind === 'wolf' ? 1 : 0.9 };
  const earY = hh * 0.3 + hh / 2;
  for (const side of [-1, 1]) {
    const e = pointyEar(F, pink, { ...ear, side });
    e.position.set(side * (hw / 2 - ear.w / 2), earY, kind === 'wolf' ? 1 : 1.4);
    head.add(e);
  }
  if (kind === 'wolf') {
    // 주둥이: 위는 흰 털, 끝에 반짝이는 검은 코, 아래 입선
    head.add(furBox(3.2, 3, 4, { ...F, base: '#f2f1ec' }, { y: -0.3, z: hd + 2, seed: 7 }));
    head.add(solid('#1d1d1d', 1.6, 1, 0.8, 0, 1, hd + 4.2));
    head.add(solid('#5a5a5a', 0.5, 0.3, 0.2, -0.3, 1.35, hd + 4.62));
    head.add(solid('#8a8680', 2.4, 0.25, 0.2, 0, -1.2, hd + 4.02));
    for (const side of [-1, 1]) head.add(furBox(1, 2, 2.4, { ...F, base: '#f7f6f2' }, { x: side * (hw / 2 + 0.3), y: 0, z: 1.8, seed: 8 })); // 볼 털
  } else {
    // 동그란 볼 + 작은 주둥이 + 분홍 코 + 흰 수염
    for (const side of [-1, 1]) head.add(furBox(1.2, 2.2, 3.4, F, { x: side * (hw / 2 + 0.4), y: 0.2, z: 2.6, seed: 9 }));
    head.add(furBox(3, 1.8, 1.2, { ...F, base: '#2a2a33' }, { y: -0.3, z: hd + 0.5, seed: 10 }));
    head.add(solid(pink, 0.9, 0.6, 0.3, 0, 0.5, hd + 1.15));
    for (const side of [-1, 1])
      for (const k of [0, 1]) {
        const wsk = solid('#d9d9e0', 2.6, 0.15, 0.15, side * 2.4, -0.1 - k * 0.5, hd + 0.9);
        wsk.rotation.z = side * (k ? -0.15 : 0.12);
        wsk.castShadow = false;
        head.add(wsk);
      }
  }
  body.add(head);

  // 꼬리 (두 마디: 고양이는 끝이 살짝 말려 올라가고, 늑대는 끝이 더 밝은 복슬 꼬리)
  const tail = new THREE.Group();
  tail.position.set(0, bh * 0.3, -bl / 2);
  const [tw, tl] = s.tail;
  tail.add(furBox(tw, tw, tl * 0.6, F, { z: -tl * 0.3, seed: 11 }));
  const tip = new THREE.Group();
  tip.position.z = -tl * 0.6;
  tip.rotation.x = kind === 'cat' ? 0.9 : 0.15;
  tip.add(furBox(tw * (kind === 'wolf' ? 1.1 : 1), tw * (kind === 'wolf' ? 1.1 : 1), tl * 0.42, kind === 'wolf' ? { ...F, base: '#fbfaf7' } : F, { z: -tl * 0.21, seed: 12 }));
  tail.add(tip);
  body.add(tail);

  // 다리 4개: 털 다리 + 살짝 넓은 발 (발가락 줄)
  const legs = [];
  for (const sz of [1, -1])
    for (const sx of [1, -1]) {
      const p = new THREE.Group();
      p.position.set(sx * (bw / 2 - s.legW / 2), -bh / 2, sz * (bl / 2 - s.legW / 2 - 0.4));
      p.add(furBox(s.legW, s.legH - 1, s.legW, F, { y: -(s.legH - 1) / 2, seed: 13 + legs.length }));
      const paw = furBox(s.legW + 0.3, 1, s.legW + 0.5, { ...F, base: kind === 'wolf' ? '#e2dfd8' : '#24242c' }, {
        y: -s.legH + 0.5,
        z: 0.2,
        seed: 20 + legs.length,
        faces: { pz: { paint: (ctx, W, H) => { ctx.fillStyle = kind === 'wolf' ? '#b8b4ab' : '#0e0e12'; for (let x = 2; x < W - 1; x += 3) ctx.fillRect(x, 1, 1, H - 1); } } },
      });
      p.add(paw);
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
