import * as THREE from 'three';
import { loadImage, normalizeSkin, readFileAsDataURL, createDefaultSkin } from './skin.js';
import { PlayerModel } from './model.js';
import { buildWorkspace, buildProps, DESK_COLORS, GEAR_COLORS } from './scene.js';
import { THEMES, buildTheme, disposeTheme } from './themes.js';
import { PetController, STATES, sanitizeMotion } from './pet.js';
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
      return true;
    } catch {
      return false; // 저장 불가 환경(사생활 보호 모드, 용량 초과)
    }
  },
  json(key, fallback) {
    try {
      return JSON.parse(this.get(key, null)) ?? fallback;
    } catch {
      return fallback;
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

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.7);
scene.add(hemi);
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
const props = buildProps();
scene.add(props.book, props.bulb);

const model = new PlayerModel(createDefaultSkin());
scene.add(model.root);

// ── 꾸미기 (배경 · 책상 색 · 작업 도구 · 키보드/마우스 색) ──
const DEFAULT_DECO = { theme: 'none', desk: DESK_COLORS[0][2], setup: 'laptop', keyboard: GEAR_COLORS[0], mouse: GEAR_COLORS[0] };
let deco = { ...DEFAULT_DECO, ...store.json('deco', {}) };
let theme = null;

function applyDeco(next, { save = true } = {}) {
  const prev = deco;
  deco = { ...DEFAULT_DECO, ...next };
  if (!theme || prev.theme !== deco.theme) setTheme(deco.theme);
  workspace.setDeskColor(deco.desk);
  workspace.setSetup(deco.setup);
  workspace.setKeyboardColor(deco.keyboard);
  workspace.setMouseColor(deco.mouse);
  if (save) store.set('deco', JSON.stringify(deco));
  pip?.invalidate();
  syncPipButton();
  syncDeco();
}

function setTheme(name) {
  if (theme && !theme.none) {
    scene.remove(theme.group);
    disposeTheme(theme);
  }
  theme = buildTheme(name) ?? { none: true };
  const has = !theme.none;
  if (has) scene.add(theme.group);
  // 배경이 없으면 투명(바탕화면/CSS 배경이 보임), 있으면 방 색으로 채운다
  renderer.setClearColor(has ? theme.clear : 0x000000, has ? 1 : 0);
  workspace.floorShadow.visible = !has;
  const [sky, ground, k] = has ? theme.hemi : ['#ffffff', '#8a7a9a', 1.7];
  hemi.color.set(sky);
  hemi.groundColor.set(ground);
  hemi.intensity = k;
  sun.intensity = has ? theme.sun : 1.6;
  document.documentElement.classList.toggle('has-theme', has);
}

let currentSkin = null;
let pip = null;
let armsMode = store.get('arms', 'auto');

const pet = new PetController(model, workspace, { onSay: (line, state) => speak(line, state), onHearts: spawnHearts, props });

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
const recentLines = [];
function say(text) {
  recentLines.push(text);
  if (recentLines.length > 6) recentLines.shift();
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

// 쓰다듬을 때 머리 위로 하트
const headWorldTmp = new THREE.Vector3();
function spawnHearts() {
  model.head.getWorldPosition(headWorldTmp);
  headWorldTmp.y += 9;
  const p = toScreen(headWorldTmp);
  const el = document.createElement('span');
  el.className = 'glyph heart';
  el.textContent = Math.random() < 0.5 ? '❤' : '💕';
  el.style.left = `${p.x + (Math.random() - 0.5) * 40}px`;
  el.style.top = `${p.y}px`;
  el.style.setProperty('--dx', `${(Math.random() - 0.5) * 30}px`);
  particles.appendChild(el);
  setTimeout(() => el.remove(), 1500);
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

let desktopPanel = false; // Windows 펫에서 꾸미기 창을 연 상태

function updateCamera() {
  const portrait = camera.aspect < 1;
  const showPanel = desktop ? desktopPanel : panelOpen;
  let dist;
  if (desktop && !desktopPanel) dist = 108;
  // 세로 화면: 책상 전체(가로 약 55칸)가 들어오도록 화면 비율에 맞춰 거리를 늘린다
  else if (portrait) dist = (showPanel ? 105 : 95) / camera.aspect;
  else dist = showPanel ? 120 : 112;
  const target = LOOK_AT.clone();
  // 패널이 보이면 그만큼 시점을 내리고, 숨기면 말풍선 공간만 조금 남긴다
  if (showPanel) target.y -= portrait ? 9 : 6;
  else if (!desktop) target.y -= portrait ? 3 : 4;
  if (showPanel && desktop) target.y -= 8;
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
// 머리 위를 문지르면 쓰다듬기
const headProbe = new THREE.Vector3();
function headHit(x, y) {
  model.head.getWorldPosition(headProbe);
  headProbe.y += 4;
  const c = toScreen(headProbe);
  headProbe.y += 6;
  const r = Math.max(24, Math.abs(toScreen(headProbe).y - c.y) * 1.25);
  return Math.hypot(x - c.x, y - c.y) < r;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY, moved: false, long: false, onHead: headHit(e.clientX, e.clientY), rub: 0, lx: e.clientX, ly: e.clientY };
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
  // 머리를 잡으면 창을 옮기는 대신 쓰다듬기
  if (desktop && !press.onHead) bridge.dragStart();
});
canvas.addEventListener('pointermove', (e) => {
  pet.look((e.clientX / viewW) * 2 - 1, -(e.clientY / viewH) * 2 + 1);
  if (desktop) updateClickThrough(e.clientX, e.clientY);
  if (!press) return;
  if (Math.hypot(e.screenX - press.x, e.screenY - press.y) > 4) press.moved = true;
  if (press.onHead) {
    press.rub += Math.hypot(e.clientX - press.lx, e.clientY - press.ly);
    press.lx = e.clientX;
    press.ly = e.clientY;
    if (press.rub > 50) {
      press.rub = 0;
      const first = pet.state !== 'happy';
      pet.pet();
      if (first) onPetted();
    }
    return;
  }
  if (desktop && press.moved) bridge.dragMove();
});
canvas.addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(longPressTimer);
  if (desktop && !press.onHead) bridge.dragEnd();
  if (!press.moved && !press.long) pet.poke();
  press = null;
});
canvas.addEventListener('pointercancel', () => {
  clearTimeout(longPressTimer);
  press = null;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (desktop)
    bridge.showMenu({
      arms: armsMode,
      mode: store.get('mode', 'auto'),
      deco,
      themes: THEMES,
      desks: DESK_COLORS.map(([id, label, hex]) => [hex, label]),
      presets: loadPresets().map((p) => p.name),
    });
});

// 데스크톱: 투명한 픽셀 위에서는 클릭이 뒤의 창으로 통과되게
let ignoring = false;
function updateClickThrough(x, y) {
  if (press || desktopPanel) return;
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
    else if (type === 'deco') applyDeco({ ...deco, ...value });
    else if (type === 'preset') {
      const p = loadPresets().find((x) => x.name === value);
      if (p) applyPreset(p);
    } else if (type === 'open-panel') setDesktopPanel(true, value);
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
for (const [key, label] of [['auto', '🔁 자동'], ...Object.entries(STATES).filter(([k]) => !['wave', 'happy', 'custom'].includes(k)).map(([k, s]) => [k, s.label])]) {
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

// ── 패널 탭 ──
function showTab(name) {
  for (const b of $('tabs').querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === name);
  for (const sec of $('panel').querySelectorAll('section')) sec.hidden = sec.dataset.tab !== name;
  if (name === 'preset') renderPresets();
}
for (const b of $('tabs').querySelectorAll('[data-tab]')) b.onclick = () => showTab(b.dataset.tab);

function setDesktopPanel(open, tab) {
  desktopPanel = open;
  document.documentElement.classList.toggle('desktop-panel', open);
  if (open) {
    ignoring = false;
    bridge.setIgnoreMouse(false);
    showTab(tab || 'deco');
  }
  bridge.setPanelMode(open);
  updateCamera();
}
$('btn-panel-close').onclick = () => setDesktopPanel(false);

// ── 꾸미기 탭 ──
const themeBox = $('themes');
for (const [id, label] of THEMES) {
  const b = document.createElement('button');
  b.dataset.v = id;
  b.textContent = label;
  b.onclick = () => applyDeco({ ...deco, theme: id });
  themeBox.appendChild(b);
}
for (const b of $('setup').querySelectorAll('button')) b.onclick = () => applyDeco({ ...deco, setup: b.dataset.v });

function swatchRow(el, colors, key) {
  for (const [hex, label] of colors) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.title = label || hex;
    b.dataset.v = hex;
    b.onclick = () => applyDeco({ ...deco, [key]: hex });
    el.appendChild(b);
  }
  // 직접 고르기
  const input = document.createElement('input');
  input.type = 'color';
  input.title = '직접 고르기';
  input.oninput = () => applyDeco({ ...deco, [key]: input.value }, { save: false });
  input.onchange = () => applyDeco({ ...deco, [key]: input.value });
  el.appendChild(input);
}
swatchRow($('desk-colors'), DESK_COLORS.map(([, label, hex]) => [hex, label]), 'desk');
swatchRow($('kb-colors'), GEAR_COLORS.map((hex) => [hex]), 'keyboard');
swatchRow($('mouse-colors'), GEAR_COLORS.map((hex) => [hex]), 'mouse');

function syncDeco() {
  for (const b of themeBox.children) b.classList.toggle('on', b.dataset.v === deco.theme);
  for (const b of $('setup').children) b.classList.toggle('on', b.dataset.v === deco.setup);
  for (const [id, key] of [['desk-colors', 'desk'], ['kb-colors', 'keyboard'], ['mouse-colors', 'mouse']]) {
    for (const el of $(id).children) {
      if (el.tagName === 'INPUT') el.value = deco[key];
      else el.classList.toggle('on', el.dataset.v.toLowerCase() === deco[key].toLowerCase());
    }
  }
  $('mouse-row').classList.toggle('disabled', deco.setup !== 'desktop');
}

// ── 프리셋 (스킨 + 팔 + 꾸미기 저장/불러오기) ──
function loadPresets() {
  const list = store.json('presets', []);
  return Array.isArray(list) ? list : [];
}

function savePreset(name) {
  name = name.trim();
  if (!name) return toast('프리셋 이름을 입력해 주세요');
  const preset = { name, skin: store.get('skin', null), arms: armsMode, deco: { ...deco }, at: Date.now() };
  const list = loadPresets().filter((p) => p.name !== name);
  list.unshift(preset);
  if (!store.set('presets', JSON.stringify(list))) return toast('저장 공간이 부족하거나 저장할 수 없는 환경이에요');
  toast(`'${name}' 저장 완료`);
  renderPresets();
}

async function applyPreset(p) {
  if (p.skin) await loadSkinFromURL(p.skin).catch(() => toast('스킨을 불러오지 못했어요'));
  else {
    store.set('skin', null);
    applySkin(createDefaultSkin());
  }
  setArms(p.arms || 'auto');
  applyDeco(p.deco || DEFAULT_DECO);
  toast(`'${p.name}' 불러옴`);
}

function deletePreset(name) {
  store.set('presets', JSON.stringify(loadPresets().filter((p) => p.name !== name)));
  renderPresets();
}

const THEME_LABEL = Object.fromEntries(THEMES);
function renderPresets() {
  const box = $('preset-list');
  box.replaceChildren();
  const list = loadPresets();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '아직 저장된 프리셋이 없어요.';
    box.appendChild(p);
    return;
  }
  for (const p of list) {
    const row = document.createElement('div');
    row.className = 'preset';
    row.appendChild(faceThumb(p.skin));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name;
    const desc = document.createElement('div');
    desc.className = 'desc';
    const d = { ...DEFAULT_DECO, ...p.deco };
    desc.textContent = `${THEME_LABEL[d.theme] ?? '기본'} · ${d.setup === 'desktop' ? '키보드+마우스' : '노트북'}`;
    meta.append(name, desc);
    const load = document.createElement('button');
    load.textContent = '불러오기';
    load.onclick = () => applyPreset(p);
    const del = document.createElement('button');
    del.textContent = '🗑';
    del.title = '삭제';
    del.onclick = () => {
      if (confirm(`'${p.name}' 프리셋을 지울까요?`)) deletePreset(p.name);
    };
    row.append(meta, load, del);
    box.appendChild(row);
  }
}

// 프리셋 목록용 얼굴 썸네일 (스킨의 얼굴 8x8 + 모자 레이어)
function faceThumb(src) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const draw = (canvasOrImg) => {
    const s = (canvasOrImg.naturalWidth || canvasOrImg.width) / 64;
    ctx.drawImage(canvasOrImg, 8 * s, 8 * s, 8 * s, 8 * s, 0, 0, 8, 8);
    ctx.drawImage(canvasOrImg, 40 * s, 8 * s, 8 * s, 8 * s, 0, 0, 8, 8);
  };
  if (src) loadImage(src).then(draw, () => {});
  else draw(createDefaultSkin().canvas);
  return c;
}

// 이름 입력: 휴대폰·아이패드는 시스템 입력 창(prompt)이 가장 확실하게 키보드를 띄운다.
// Windows(Electron)는 prompt 를 지원하지 않아 패널의 입력칸을 쓴다.
$('btn-preset-save').onclick = () => {
  const field = $('preset-name');
  let name = field.value.trim();
  if (!name && !desktop) name = prompt('프리셋 이름을 입력하세요', `프리셋 ${loadPresets().length + 1}`) ?? '';
  if (!name.trim()) return desktop ? toast('프리셋 이름을 입력해 주세요') : undefined;
  savePreset(name);
  field.value = '';
};
$('preset-name').onkeydown = (e) => {
  if (e.key === 'Enter') $('btn-preset-save').click();
};

// 드래그&드롭으로 스킨 적용 (PC 브라우저 / Windows)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) loadSkinFromFile(file);
});

// ── AI: 실시간 대사 · 말 걸기 · 새 동작 만들기 ──
// 모드: 내장(무료, 키 없음) / Gemini(무료 등급, 본인 키) / Claude(유료, 본인 키)
// Gemini·Claude 를 못 쓰면(키 없음·한도 초과·오류) 자동으로 내장 AI 로 대신한다.
let ai = null;
const aiState = { lastLineAt: 0, lastPetLineAt: 0, busy: false, history: [], cooldownUntil: 0 };
const PROVIDERS = [
  ['offline', '🆓 내장'],
  ['gemini', '✨ Gemini 무료'],
  ['claude', 'Claude 유료'],
];
const CLAUDE_MODELS = [
  ['claude-opus-5-5', 'Opus 5.5'],
  ['claude-haiku-5-5', 'Haiku 5.5 (저렴)'],
];
const KEY_INFO = {
  gemini: { store: 'geminiKey', name: 'Gemini', url: 'https://aistudio.google.com/apikey', hint: 'Google AI Studio 에서 무료로 발급 (AIza 로 시작)' },
  claude: { store: 'aiKey', name: 'Claude', url: 'https://console.anthropic.com/settings/keys', hint: 'Claude Console 에서 발급 (sk-ant- 로 시작, 유료)' },
};
const aiProvider = () => store.get('aiProvider', 'gemini');
const keyOf = (p) => (KEY_INFO[p] ? store.get(KEY_INFO[p].store, '') : '');
const aiModel = () => store.get('aiModel', CLAUDE_MODELS[0][0]);
const aiLines = () => store.get('aiLines', 'rare');
// 지금 Gemini/Claude 를 쓸 수 있나 (아니면 내장 AI)
const aiOnline = () => aiProvider() !== 'offline' && !!keyOf(aiProvider()) && Date.now() > aiState.cooldownUntil;

let offline = null;
async function getOffline() {
  offline ??= await import('./offline.js');
  return offline;
}
async function getAI() {
  if (!ai) {
    // SDK 는 AI 를 쓸 때만 불러온다 (처음 로딩을 가볍게)
    const { createAI } = await import('./ai.js');
    ai = createAI({ getProvider: aiProvider, getKey: keyOf, getModel: aiModel });
  }
  return ai;
}

// 한도 초과면 10분 동안 내장 AI 로
function onAIError(e) {
  if (e?.quota) aiState.cooldownUntil = Date.now() + 10 * 60 * 1000;
  toast(e?.message || 'AI 를 쓰지 못해서 내장 AI 로 할게요');
}

const STATE_DESC = {
  work: '컴퓨터로 코딩하는 중', think: '골똘히 고민하는 중', aha: '방금 뭔가를 깨달음', read: '책을 읽는 중',
  stretch: '기지개를 켜는 중', sip: '커피를 마시는 중', sleep: '꾸벅꾸벅 조는 중', wave: '주인에게 손을 흔드는 중',
  happy: '주인이 머리를 쓰다듬어 줘서 기분이 좋음', custom: '특별한 동작을 하는 중',
};
function aiContext(event) {
  const now = new Date();
  return {
    state: STATE_DESC[pet.state] ?? pet.state,
    stateId: pet.state,
    place: THEMES.find(([id]) => id === deco.theme)?.[1].replace(/^\S+\s/, '') ?? '기본',
    themeId: deco.theme,
    setup: deco.setup === 'desktop' ? '모니터+키보드+마우스' : '노트북',
    time: `${now.getHours()}시 ${now.getMinutes()}분`,
    hour: now.getHours(),
    event,
    recent: recentLines.slice(-5),
  };
}

// 펫이 말하려 할 때: "AI 대사" 간격이 지났으면 AI(또는 내장 AI)가 상황에 맞는 한마디를 만든다
function speak(line, state) {
  const interval = { rare: 300, often: 60 }[aiLines()];
  const immediate = ['wave', 'happy', 'aha', 'sleep', 'custom'].includes(state);
  const now = performance.now() / 1000;
  if (!interval || immediate || aiState.busy || now - aiState.lastLineAt < interval) {
    say(line);
    return;
  }
  aiState.lastLineAt = now;
  if (!aiOnline()) {
    getOffline().then((o) => say(o.offlineLine(aiContext())));
    return;
  }
  aiState.busy = true;
  getAI()
    .then((a) => a.line(aiContext()))
    .then(
      (text) => pet.state === state && say(text),
      (e) => {
        if (e?.quota) aiState.cooldownUntil = Date.now() + 10 * 60 * 1000;
        getOffline().then((o) => say(o.offlineLine(aiContext())));
      },
    )
    .finally(() => (aiState.busy = false));
}

// 쓰다듬기 시작: 기본 반응을 바로 하고, AI 가 켜져 있으면 잠시 뒤 AI 의 대사
function onPetted() {
  if (!aiOnline() || aiLines() === 'off' || aiState.busy) return;
  const now = performance.now() / 1000;
  if (now - aiState.lastPetLineAt < 30) return;
  aiState.lastPetLineAt = now;
  aiState.busy = true;
  getAI()
    .then((a) => a.line(aiContext('주인이 머리를 쓰다듬어 줬어')))
    .then((text) => say(text), () => {})
    .finally(() => (aiState.busy = false));
}

// 팝업 입력 창 (Windows 는 prompt() 를 지원하지 않아 모든 기기에서 같은 창을 쓴다)
function openModal({ label, value = '', hint = '', link = null, paste = false, secret = false }) {
  return new Promise((resolve) => {
    const modal = $('modal');
    const input = $('modal-input');
    $('modal-label').textContent = label;
    $('modal-hint').textContent = hint;
    $('modal-link').hidden = !link;
    if (link) $('modal-link').href = link;
    $('modal-paste').hidden = !paste || !navigator.clipboard?.readText;
    input.type = secret ? 'password' : 'text';
    input.value = value;
    modal.hidden = false;
    if (desktop && ignoring) {
      ignoring = false;
      bridge.setIgnoreMouse(false);
    }
    setTimeout(() => input.focus(), 50);
    const done = (v) => {
      modal.hidden = true;
      $('modal-form').onsubmit = $('modal-cancel').onclick = $('modal-paste').onclick = null;
      resolve(v);
    };
    $('modal-form').onsubmit = (e) => {
      e.preventDefault();
      done(input.value);
    };
    $('modal-cancel').onclick = () => done(null);
    // 입력칸에 키보드가 안 떠도 복사한 키를 바로 넣을 수 있게
    $('modal-paste').onclick = async () => {
      try {
        input.value = (await navigator.clipboard.readText()).trim();
      } catch {
        toast('붙여넣기를 허용해 주세요');
      }
    };
  });
}

// 짧은 글 입력: 휴대폰·아이패드는 시스템 입력 창(가장 확실), Windows 는 팝업
function ask(label, value = '') {
  if (!desktop) return Promise.resolve(prompt(label, value));
  return openModal({ label, value });
}

// 커스텀 동작 — 이 기기에 저장
function loadMotions() {
  const list = store.json('customMotions', []);
  return Array.isArray(list) ? list : [];
}
function saveMotions(list) {
  if (!store.set('customMotions', JSON.stringify(list))) toast('저장 공간이 부족해요');
  pet.customMotions = list;
  renderMotions();
}

function renderMotions() {
  const box = $('motion-list');
  box.replaceChildren();
  const list = loadMotions();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '✨ 새 동작 만들기로 "춤추기", "만세 세 번 하고 박수" 처럼 설명하면 동작이 생겨요.';
    box.appendChild(p);
    return;
  }
  list.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'preset';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `✨ ${m.name}`;
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = `${m.duration.toFixed(1)}초${m.loop ? ' · 반복' : ''}${m.line ? ` · "${m.line}"` : ''}`;
    meta.append(name, desc);
    const play = document.createElement('button');
    play.textContent = '▶';
    play.title = '해 보기';
    play.onclick = () => pet.playCustom(m);
    const del = document.createElement('button');
    del.textContent = '🗑';
    del.title = '삭제';
    del.onclick = () => {
      if (confirm(`'${m.name}' 동작을 지울까요?`)) saveMotions(loadMotions().filter((_, j) => j !== i));
    };
    row.append(meta, play, del);
    box.appendChild(row);
  });
}

function syncAI() {
  const p = aiProvider();
  const info = KEY_INFO[p];
  for (const b of $('ai-provider').children) b.classList.toggle('on', b.dataset.v === p);
  $('ai-key-row').hidden = !info;
  $('ai-model-row').hidden = p !== 'claude';
  if (info) {
    const key = keyOf(p);
    $('ai-key-state').textContent = key ? `🔑 …${key.slice(-4)}` : '키 없음';
    $('btn-ai-key').textContent = key ? '🔑 키 바꾸기' : `🔑 ${info.name} 키 입력`;
    $('btn-ai-key-del').hidden = !key;
  }
  $('ai-mode-hint').textContent =
    p === 'offline'
      ? '🆓 키 없이 무료로 동작해요. 미리 만들어 둔 대사·키워드 대화·동작 조합을 써요.'
      : p === 'gemini'
        ? '✨ Google Gemini 무료 등급. 무료 한도에 걸리거나 키가 없으면 자동으로 내장 AI 로 바뀌어요.'
        : '💳 Claude 는 쓴 만큼 요금이 나가요. Haiku 5.5 를 고르면 훨씬 저렴해요.';
  for (const b of $('ai-model').children) b.classList.toggle('on', b.dataset.v === aiModel());
  for (const b of $('ai-lines').children) b.classList.toggle('on', b.dataset.v === aiLines());
}

function segButtons(el, items, onPick) {
  for (const [id, label] of items) {
    const b = document.createElement('button');
    b.dataset.v = id;
    b.textContent = label;
    b.onclick = () => {
      onPick(id);
      syncAI();
    };
    el.appendChild(b);
  }
}
segButtons($('ai-provider'), PROVIDERS, (id) => {
  store.set('aiProvider', id);
  aiState.cooldownUntil = 0;
});
segButtons($('ai-model'), CLAUDE_MODELS, (id) => store.set('aiModel', id));
for (const b of $('ai-lines').children)
  b.onclick = () => {
    store.set('aiLines', b.dataset.v);
    syncAI();
  };

$('btn-ai-key').onclick = async () => {
  const p = aiProvider();
  const info = KEY_INFO[p];
  if (!info) return;
  const key = (
    await openModal({ label: `${info.name} API 키`, hint: info.hint, link: info.url, paste: true, secret: true, value: '' })
  )?.trim();
  if (!key) return;
  if (p === 'claude' && !key.startsWith('sk-ant-')) return toast('Claude API 키는 sk-ant- 로 시작해요');
  store.set(info.store, key);
  aiState.cooldownUntil = 0;
  syncAI();
  toast(`${info.name} 키 저장 완료 🔑`);
};
$('btn-ai-key-del').onclick = () => {
  const info = KEY_INFO[aiProvider()];
  if (!info || !confirm(`이 기기에서 ${info.name} 키를 지울까요?`)) return;
  store.set(info.store, null);
  syncAI();
};

// 동작 이름(상태 또는 custom N, dance) 실행
async function playMotionId(id) {
  if (id === 'dance') {
    const o = await getOffline();
    pet.playCustom({ ...sanitizeMotion(o.offlineMotion('춤')), line: '' });
  } else if (id.startsWith('custom')) {
    const m = loadMotions()[Number(id.slice(6))];
    if (m) pet.playCustom({ ...m, line: '' });
  } else if (id === 'happy' || id === 'wave') {
    pet.interrupt(id);
  } else if (STATES[id]) {
    pet.setState(id, { manual: store.get('mode', 'auto') !== 'auto' });
  }
}

// 말 걸기: 대답 + 어울리는 동작
$('btn-chat').onclick = async () => {
  const msg = (await ask('펫에게 할 말'))?.trim();
  if (!msg) return;
  let out = null;
  if (aiOnline()) {
    const motions = [
      ...Object.entries(STATES)
        .filter(([k]) => k !== 'custom')
        .map(([k, s]) => [k, s.label]),
      ['dance', '춤추기'],
      ...loadMotions().map((m, i) => [`custom${i}`, `✨ ${m.name} (직접 만든 동작)`]),
    ];
    toast('💬 생각하는 중...');
    try {
      const a = await getAI();
      out = await a.chat(msg, aiContext(`주인이 "${msg}" 라고 말을 걸었어`), motions, aiState.history.slice(-4));
      $('toast').hidden = true;
    } catch (e) {
      onAIError(e);
    }
  }
  out ??= (await getOffline()).offlineChat(msg);
  aiState.history.push([msg, out.line]);
  await playMotionId(out.motion);
  pet.nextLineAt = pet.stateTime + 6; // 대답이 바로 다른 대사로 덮이지 않게
  say(out.line);
};

// 새 동작 만들기
$('btn-new-motion').onclick = async () => {
  const desc = (await ask('어떤 동작을 만들까요? (예: 신나게 춤추기, 만세 세 번 하고 박수)'))?.trim();
  if (!desc) return;
  let raw = null;
  if (aiOnline()) {
    toast('✨ AI 가 동작을 만드는 중... (10~30초)');
    try {
      raw = await (await getAI()).motion(desc);
    } catch (e) {
      onAIError(e);
    }
  }
  raw ??= (await getOffline()).offlineMotion(desc);
  try {
    const motion = sanitizeMotion(raw);
    saveMotions([...loadMotions(), motion]);
    pet.playCustom(motion);
    toast(`'${motion.name}' 동작이 생겼어요!`);
  } catch (e) {
    toast(e.message || '동작을 만들지 못했어요');
  }
};

pet.customMotions = loadMotions();
renderMotions();
syncAI();

// ── 시작 ──
const saved = store.get('skin', null);
if (saved) loadSkinFromURL(saved, { save: false }).catch(() => applySkin(createDefaultSkin()));
else applySkin(createDefaultSkin());
applyDeco(deco, { save: false });
const savedMode = store.get('mode', 'auto');
if (savedMode !== 'auto' && STATES[savedMode]) pet.setState(savedMode, { manual: true });
syncPanel();

const clock = new THREE.Clock();
const headWorld = new THREE.Vector3();
const laptopPoint = new THREE.Vector3(0, 22, 13);
const monitorPoint = new THREE.Vector3(-4, 30, 16);
let glyphAcc = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const typing = pet.update(dt);

  workspace.screenTexture.userData.tick(typing * dt * 40);
  theme?.update?.(dt);
  screenLight.intensity = 55 + Math.sin(clock.elapsedTime * 7) * 4 * typing;

  glyphAcc += dt * typing;
  if (glyphAcc > 0.45) {
    glyphAcc = 0;
    spawnGlyph(toScreen(workspace.setup === 'desktop' ? monitorPoint : laptopPoint));
  }

  renderer.render(scene, camera);
  pip.onFrame();

  if (!bubble.hidden) {
    model.head.getWorldPosition(headWorld);
    headWorld.y += pet.state === 'aha' ? 19 : 12; // 전구가 떠 있으면 말풍선을 더 위로
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

$('build-info').textContent = `버전 ${__BUILD__}`;

// ── 웹 앱(PWA): 오프라인 캐시 ──
const nativeShell = desktop || window.Capacitor?.isNativePlatform?.();
if (!nativeShell && 'serviceWorker' in navigator && location.protocol === 'https:') {
  // updateViaCache: 'none' — 서비스 워커 파일도 HTTP 캐시 없이 매번 새로 확인
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
