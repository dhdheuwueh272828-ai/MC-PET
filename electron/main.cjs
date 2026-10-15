// Windows 데스크톱 펫: 투명·프레임 없는·항상 위 창
const { app, BrowserWindow, Menu, ipcMain, dialog, screen, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const SIZES = { small: [220, 240], medium: [300, 330], large: [420, 460] };
const configPath = () => path.join(app.getPath('userData'), 'pet-config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}
const config = { size: 'medium', alwaysOnTop: true, ...loadConfig() };
const saveConfig = () => fs.writeFileSync(configPath(), JSON.stringify(config));

let win = null;
let drag = null;
let cursorTimer = null;

function createWindow() {
  const [w, h] = SIZES[config.size] ?? SIZES.medium;
  const area = screen.getPrimaryDisplay().workArea;
  const x = config.x ?? area.x + area.width - w - 24;
  const y = config.y ?? area.y + area.height - h;

  win = new BrowserWindow({
    width: w,
    height: h,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: config.alwaysOnTop,
    backgroundColor: '#00000000',
    title: 'Minecraft Work Pet',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(config.alwaysOnTop, 'floating');
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // 키 발급 페이지 같은 링크는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('moved', () => {
    if (compactBounds) return;
    const [nx, ny] = win.getPosition();
    Object.assign(config, { x: nx, y: ny });
    saveConfig();
  });

  // 창 밖의 커서 위치를 보내 펫이 커서를 쳐다보게
  let last = '';
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const key = `${p.x},${p.y}`;
    if (key === last) return;
    last = key;
    win.webContents.send('pet:cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 120);

  win.on('closed', () => {
    clearInterval(cursorTimer);
    win = null;
  });
}

const send = (type, value) => win?.webContents.send('pet:menu-action', { type, value });

async function chooseSkin() {
  const res = await dialog.showOpenDialog(win, {
    title: '마인크래프트 스킨 선택 (64x32 / 64x64 / 128x128 PNG)',
    filters: [{ name: 'PNG 스킨', extensions: ['png'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return;
  const data = fs.readFileSync(res.filePaths[0]);
  send('skin', 'data:image/png;base64,' + data.toString('base64'));
}

function setSize(size) {
  config.size = size;
  saveConfig();
  const [w, h] = SIZES[size];
  const b = win.getBounds();
  // 아래쪽 가운데를 기준으로 크기 변경
  win.setBounds({ x: Math.round(b.x + (b.width - w) / 2), y: b.y + b.height - h, width: w, height: h });
}

ipcMain.on('pet:menu', (_e, state) => {
  const radio = (label, checked, click) => ({ label, type: 'radio', checked, click });
  const modes = [
    ['auto', '🔁 자동 (랜덤 행동)'],
    ['work', '⌨️ 작업'],
    ['think', '🤔 고민'],
    ['stretch', '🙆 스트레칭'],
    ['sip', '☕ 커피'],
    ['sleep', '💤 낮잠'],
  ];
  const menu = Menu.buildFromTemplate([
    { label: '스킨 불러오기...', click: chooseSkin },
    { label: '기본 스킨으로', click: () => send('reset-skin') },
    {
      label: '팔 모델',
      submenu: [
        radio('자동 감지', state.arms === 'auto', () => send('arms', 'auto')),
        radio('클래식 (4px, Steve)', state.arms === 'classic', () => send('arms', 'classic')),
        radio('슬림 (3px, Alex)', state.arms === 'slim', () => send('arms', 'slim')),
      ],
    },
    { label: '행동', submenu: modes.map(([k, l]) => radio(l, state.mode === k, () => send('mode', k))) },
    { type: 'separator' },
    {
      label: '배경',
      submenu: state.themes.map(([id, label]) => radio(label, state.deco.theme === id, () => send('deco', { theme: id }))),
    },
    {
      label: '작업 도구',
      submenu: [
        radio('💻 노트북', state.deco.setup === 'laptop', () => send('deco', { setup: 'laptop' })),
        radio('⌨️ 키보드 + 마우스', state.deco.setup === 'desktop', () => send('deco', { setup: 'desktop' })),
      ],
    },
    {
      label: '책상 색',
      submenu: state.desks.map(([hex, label]) => radio(label, state.deco.desk.toLowerCase() === hex, () => send('deco', { desk: hex }))),
    },
    {
      label: '프리셋',
      submenu: [
        ...(state.presets.length
          ? state.presets.map((name) => ({ label: name, click: () => send('preset', name) }))
          : [{ label: '(저장된 프리셋 없음)', enabled: false }]),
        { type: 'separator' },
        { label: '프리셋 저장·관리...', click: () => send('open-panel', 'preset') },
      ],
    },
    { label: '꾸미기 창 열기 (색 직접 고르기)...', click: () => send('open-panel', 'deco') },
    {
      label: '크기',
      submenu: [
        radio('작게', config.size === 'small', () => setSize('small')),
        radio('보통', config.size === 'medium', () => setSize('medium')),
        radio('크게', config.size === 'large', () => setSize('large')),
      ],
    },
    { type: 'separator' },
    {
      label: '항상 위에 표시',
      type: 'checkbox',
      checked: config.alwaysOnTop,
      click: (item) => {
        config.alwaysOnTop = item.checked;
        saveConfig();
        win.setAlwaysOnTop(item.checked, 'floating');
      },
    },
    {
      label: 'Windows 시작 시 실행',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

ipcMain.on('pet:drag-start', () => {
  drag = { cursor: screen.getCursorScreenPoint(), pos: win.getPosition() };
});
ipcMain.on('pet:drag-move', () => {
  if (!drag) return;
  const p = screen.getCursorScreenPoint();
  win.setPosition(drag.pos[0] + p.x - drag.cursor.x, drag.pos[1] + p.y - drag.cursor.y);
});
ipcMain.on('pet:drag-end', () => {
  drag = null;
});
// 꾸미기·프리셋 창: 잠시 창을 키워 패널을 보여 준다
let compactBounds = null;
ipcMain.on('pet:panel-mode', (_e, open) => {
  if (!win) return;
  if (open && !compactBounds) {
    compactBounds = win.getBounds();
    const area = screen.getDisplayMatching(compactBounds).workArea;
    const w = 460;
    const h = Math.min(760, area.height);
    const x = Math.min(Math.max(area.x, compactBounds.x + compactBounds.width - w), area.x + area.width - w);
    const y = Math.min(Math.max(area.y, compactBounds.y + compactBounds.height - h), area.y + area.height - h);
    win.setBounds({ x, y, width: w, height: h });
  } else if (!open && compactBounds) {
    win.setBounds(compactBounds);
    compactBounds = null;
  }
});

ipcMain.on('pet:ignore-mouse', (_e, ignore) => {
  win?.setIgnoreMouseEvents(ignore, { forward: true });
});

// 🎵 유튜브 배경음: file:// 로 연 페이지는 Referer 가 없어 유튜브 플레이어가 오류(153)를 낸다.
// 같은 앱의 웹 버전 주소를 Referer 로 알려 준다 (유튜브 요청에만)
function allowYouTubeEmbeds() {
  const filter = { urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = details.requestHeaders;
    if (!headers.Referer) headers.Referer = 'https://sunsaai.github.io/MC-PET/';
    callback({ requestHeaders: headers });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => win?.show());
  app.whenReady().then(() => {
    allowYouTubeEmbeds();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
