import * as THREE from 'three';
import { loadImage, normalizeSkin, readFileAsDataURL, createDefaultSkin } from './skin.js';
import { PlayerModel } from './model.js';
import { buildWorkspace } from './scene.js';
import { PetController, STATES } from './pet.js';
import { createPip } from './pip.js';

// Electron preload 가 노출하는 브리지 (Windows 데스크톱 펫 모드)
const bridge = window.petBridge ?? null;
const desktop = !!bridge;
if (desktop) document.documentElement.classList.add('desktop');

const $ = (id) => document.getElementById(id);
const canvas = $('pet-canvas');
const bubble = $('bubble');
const particles = $('particles');

// ── 설정 (기기별로 저장되는 편의 설정) ──
const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem('mcpet.' + key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem('mcpet.' + key);
      else localStorage.setItem('mcpet.' + key, value);
    } catch {
      /* 저장 불가 환경 무시 */
    }
  },
};

// ── 렌더러 / 씬 ──
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: desktop, // 데스크톱: 픽셀 투명도로 클릭 통과 판정
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 500);
const LOOK_AT = new THREE.Vector3(0.5, 17, 7);
const CAM_DIR = new THREE.Vector3(0.62, 0.42, 0.66).normalize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(25, 60, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 150 });
scene.add(sun);
// 노트북 화면 빛
const screenLight = new THREE.PointLight(0x7fd4ff, 60, 26, 1.6);
screenLight.position.set(0, 22, 12);
scene.add(screenLight);

const workspace = buildWorkspace();
scene.add(workspace.group);

const model = new PlayerModel(createDefaultSkin());
scene.add(model.root);

let currentSkin = null;
let pip = null;
let armsMode = store.get('arms', 'auto');

const pet = new PetController(model, workspace, { onSay: say });

function applySkin(skin) {
  currentSkin = skin;
  pip?.invalidate();
  syncPipButton();
  const slim = armsMode === 'auto' ? skin.slim : armsMode === 'slim';
  // 컵을 들고 있는 도중이면 팔을 다시 만들기 전에 책상에 내려놓는다
  pet.attachMug(false);
  model.setSkin(skin, slim);
  $('skin-info').textContent = `${skin.width}×${skin.height}${skin.legacy ? ' (구버전)' : ''} · ${slim ? '슬림' : '클래식'}`;
}

async function loadSkinFromURL(url, { save = true } = {}) {
  const img = await loadImage(url);
  const skin = normalizeSkin(img);
  applySkin(skin);
  if (save && url.startsWith('data:')) store.set('skin', url);
  return skin;
}

async function loadSkinFromFile(file) {
  try {
    const dataUrl = await readFileAsDataURL(file);
    const skin = await loadSkinFromURL(dataUrl);
    toast(`스킨 적용 완료 (${skin.width}×${skin.height})`);
  } catch (e) {
    toast(e.message);
  }
}

async function loadSkinByName(name) {
  name = name.trim();
  if (!/^[A-Za-z0-9_]{2,16}$/.test(name)) return toast('마인크래프트 닉네임 형식이 아니에요.');
  try {
    const img = await loadImage(`https://mc-heads.net/skin/${encodeURIComponent(name)}`);
    // 저장을 위해 data URL 로 변환
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    await loadSkinFromURL(c.toDataURL('image/png'));
    toast(`${name} 스킨 적용 완료`);
  } catch {
    toast('스킨을 가져오지 못했어요. 네트워크 또는 닉네임을 확인해 주세요.');
  }
}

function resetSkin() {
  store.set('skin', null);
  applySkin(createDefaultSkin());
  toast('기본 스킨으로 돌아왔어요');
}

function setArms(mode) {
  armsMode = mode;
  store.set('arms', mode);
  if (currentSkin) applySkin(currentSkin);
  syncPanel();
}

function setMode(mode) {
  store.set('mode', mode);
  if (mode === 'auto') {
    pet.setAuto(true);
    pet.setState('work');
  } else {
    pet.setState(mode, { manual: true });
  }
  syncPanel();
}

// ── 말풍선 / 파티클 / 토스트 ──
let bubbleTimer = 0;
function say(text) {
  bubble.textContent = text;
  bubble.hidden = false;
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.hidden = true), pet.state === 'sleep' ? 6000 : 2600);
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

const GLYPHS = ['{ }', '</>', ';', '01', '=>', '()', '#', '++', '[ ]', '&&'];
function spawnGlyph(screen) {
  const el = document.createElement('span');
  el.className = 'glyph';
  el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  el.style.left = `${screen.x + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${screen.y}px`;
  el.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}px`);
  particles.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ── 화면 크기 ──
// 아이패드 분할 화면 / 창 모드처럼 창이 작으면 "미니 모드": 패널을 숨기고 펫만 크게 보여 준다
let viewW = 1;
let viewH = 1;
let compact = null;
let panelOpen = true;
// 크기·렌더 루프의 기준 창 (PiP 창으로 옮기면 바뀐다)
let viewWin = window;
const isCompact = () => viewWin.innerWidth < 520 || viewWin.innerHeight < 560;

function setPanelOpen(open) {
  panelOpen = open;
  document.body.classList.toggle('panel-hidden', !open);
  updateCamera();
}

function updateCamera() {
  const portrait = camera.aspect < 1;
  const showPanel = !desktop && panelOpen;
  let dist;
  if (desktop) dist = 108;
  // 세로 화면: 책상 전체(가로 약 55칸)가 들어오도록 화면 비율에 맞춰 거리를 늘린다
  else if (portrait) dist = (showPanel ? 105 : 95) / camera.aspect;
  else dist = showPanel ? 120 : 112;
  const target = LOOK_AT.clone();
  // 패널이 보이면 그만큼 시점을 내리고, 숨기면 말풍선 공간만 조금 남긴다
  if (showPanel) target.y -= portrait ? 9 : 6;
  else if (!desktop) target.y -= portrait ? 3 : 4;
  camera.position.copy(target).addScaledVector(CAM_DIR, dist);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function resize() {
  viewW = viewWin.innerWidth;
  viewH = viewWin.innerHeight;
  renderer.setSize(viewW, viewH, false);
  camera.aspect = viewW / viewH;
  const nowCompact = isCompact();
  if (!desktop && nowCompact !== compact) {
    compact = nowCompact;
    document.documentElement.classList.toggle('compact', compact);
    setPanelOpen(!compact);
  } else {
    updateCamera();
  }
}
window.addEventListener('resize', resize);
resize();

const tmp = new THREE.Vector3();
function toScreen(v) {
  tmp.copy(v).project(camera);
  return { x: (tmp.x * 0.5 + 0.5) * viewW, y: (-tmp.y * 0.5 + 0.5) * viewH };
}

// ── 입력: 탭/클릭 = 인사, 드래그 = (데스크톱) 창 이동, 우클릭 = 메뉴 ──
let press = null;
let longPressTimer = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY, moved: false, long: false };
  // 모바일: 길게 누르면 메뉴(패널) 열기/닫기
  if (!desktop) {
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (!press || press.moved) return;
      press.long = true;
      setPanelOpen(!panelOpen);
    }, 550);
  }
  canvas.setPointerCapture(e.pointerId);
  if (desktop) bridge.dragStart();
});
canvas.addEventListener('pointermove', (e) => {
  pet.look((e.clientX / viewW) * 2 - 1, -(e.clientY / viewH) * 2 + 1);
  if (desktop) updateClickThrough(e.clientX, e.clientY);
  if (!press) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4) press.moved = true;
  if (desktop && press.moved) bridge.dragMove();
});
canvas.addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(longPressTimer);
  if (desktop) bridge.dragEnd();
  if (!press.moved && !press.long) pet.poke();
  press = null;
});
canvas.addEventListener('pointercancel', () => {
  clearTimeout(longPressTimer);
  press = null;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (desktop) bridge.showMenu({ arms: armsMode, mode: store.get('mode', 'auto') });
});

// 데스크톱: 투명한 픽셀 위에서는 클릭이 뒤의 창으로 통과되게
let ignoring = false;
function updateClickThrough(x, y) {
  if (press) return;
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const dpr = renderer.getPixelRatio();
  gl.readPixels(Math.floor(x * dpr), Math.floor((viewH - y) * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const transparent = px[3] < 16;
  if (transparent !== ignoring) {
    ignoring = transparent;
    bridge.setIgnoreMouse(transparent);
  }
}

if (desktop) {
  bridge.onMenuAction(({ type, value }) => {
    if (type === 'skin') loadSkinFromURL(value).then((s) => toast(`스킨 적용 (${s.width}×${s.height})`), (e) => toast(e.message));
    else if (type === 'reset-skin') resetSkin();
    else if (type === 'arms') setArms(value);
    else if (type === 'mode') setMode(value);
  });
  // 커서가 창 밖에 있어도 고개를 돌려 쳐다보기
  bridge.onCursor?.(({ x, y }) => pet.look((x / viewW) * 2 - 1, -(y / viewH) * 2 + 1));
}

// ── 모바일/웹 패널 ──
const fileInput = $('skin-file');
$('btn-skin').onclick = () => fileInput.click();
fileInput.onchange = () => {
  if (fileInput.files[0]) loadSkinFromFile(fileInput.files[0]);
  fileInput.value = '';
};
$('btn-name').onclick = () => {
  const name = prompt('마인크래프트 Java 닉네임을 입력하세요');
  if (name) loadSkinByName(name);
};
$('btn-reset').onclick = resetSkin;
$('btn-menu').onclick = () => setPanelOpen(!panelOpen);
$('btn-pip').onclick = async () => {
  const btn = $('btn-pip');
  if (pip.isRecording()) return;
  btn.disabled = true;
  try {
    const r = await pip.toggle();
    if (r === 'ready') toast('준비 완료! 📺 버튼을 한 번 더 누르면 PiP 로 떠요');
  } catch (e) {
    toast(e?.message || 'PiP 를 열지 못했어요.');
  } finally {
    btn.disabled = false;
    syncPipButton();
  }
};

function syncPipButton() {
  const btn = $('btn-pip');
  if (!pip) return;
  btn.hidden = desktop || !pip.support.any;
  btn.textContent = !pip.support.doc && pip.hasClip() ? '📺 PiP 시작' : '📺 PiP';
}
for (const b of $('arms').querySelectorAll('button')) b.onclick = () => setArms(b.dataset.v);

const modes = $('modes');
for (const [key, label] of [['auto', '🔁 자동'], ...Object.entries(STATES).filter(([k]) => k !== 'wave').map(([k, s]) => [k, s.label])]) {
  const b = document.createElement('button');
  b.dataset.v = key;
  b.textContent = label;
  b.onclick = () => setMode(key);
  modes.appendChild(b);
}

function syncPanel() {
  for (const b of $('arms').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === armsMode);
  const mode = store.get('mode', 'auto');
  for (const b of modes.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === mode);
}

// 드래그&드롭으로 스킨 적용 (PC 브라우저 / Windows)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) loadSkinFromFile(file);
});

// ── 시작 ──
const saved = store.get('skin', null);
if (saved) loadSkinFromURL(saved, { save: false }).catch(() => applySkin(createDefaultSkin()));
else applySkin(createDefaultSkin());
const savedMode = store.get('mode', 'auto');
if (savedMode !== 'auto' && STATES[savedMode]) pet.setState(savedMode, { manual: true });
syncPanel();

const clock = new THREE.Clock();
const headWorld = new THREE.Vector3();
const laptopPoint = new THREE.Vector3(0, 22, 13);
let glyphAcc = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const typing = pet.update(dt);

  workspace.screenTexture.userData.tick(typing * dt * 40);
  screenLight.intensity = 55 + Math.sin(clock.elapsedTime * 7) * 4 * typing;

  glyphAcc += dt * typing;
  if (glyphAcc > 0.45) {
    glyphAcc = 0;
    spawnGlyph(toScreen(laptopPoint));
  }

  renderer.render(scene, camera);
  pip.onFrame();

  if (!bubble.hidden) {
    model.head.getWorldPosition(headWorld);
    headWorld.y += 12;
    const p = toScreen(headWorld);
    bubble.style.left = `${p.x}px`;
    bubble.style.top = `${p.y}px`;
  }
}

// requestAnimationFrame 루프: PiP 창으로 옮기면 그 창의 rAF 를 써야 메인 탭이 가려져도 계속 움직인다
let loopWin = null;
let rafId = 0;
function startLoop(win) {
  if (loopWin) loopWin.cancelAnimationFrame(rafId);
  loopWin = win;
  const step = () => {
    frame();
    rafId = win.requestAnimationFrame(step);
  };
  rafId = win.requestAnimationFrame(step);
}

// ── PiP ──
const cropCorners = [];
for (const x of [-18, 18]) for (const y of [0, 36]) for (const z of [-6, 22]) cropCorners.push(new THREE.Vector3(x, y, z));
pip = createPip({
  stage: $('stage'),
  glCanvas: canvas,
  getCrop() {
    // 책상+캐릭터가 보이는 영역을 4:3 으로 잘라낸다 (캔버스 픽셀 좌표)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of cropCorners) {
      const p = toScreen(v);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    let w = x1 - x0;
    let h = y1 - y0;
    if (w / h > 4 / 3) h = (w * 3) / 4;
    else w = (h * 4) / 3;
    const dpr = renderer.getPixelRatio();
    return { x: ((x0 + x1) / 2 - w / 2) * dpr, y: ((y0 + y1) / 2 - h / 2) * dpr, w: w * dpr, h: h * dpr };
  },
  getBubble: () => (bubble.hidden ? null : { text: bubble.textContent, x: parseFloat(bubble.style.left), y: parseFloat(bubble.style.top) }),
  setViewWindow(win) {
    viewWin = win;
    if (win !== window) win.addEventListener('resize', resize);
    compact = null;
    resize();
    startLoop(win);
  },
  toast,
  beginClip() {
    const prev = store.get('mode', 'auto');
    pet.setState('work', { manual: true });
    return () => setMode(prev);
  },
});
syncPipButton();
startLoop(window);

// ── 웹 앱(PWA): 오프라인 캐시 ──
const nativeShell = desktop || window.Capacitor?.isNativePlatform?.();
if (!nativeShell && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
