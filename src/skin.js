// 마인크래프트 스킨 로딩/정규화
// 지원: 64x32(구버전), 64x64(1.8+), 128x128(HD) — 폭이 64의 배수이고 높이가 폭 또는 폭/2 이면 모두 지원
// 모든 스킨은 "64x64 레이아웃 × scale" 정사각형 캔버스로 정규화된다.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
    img.src = src;
  });
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * @returns {{ canvas: HTMLCanvasElement, scale: number, slim: boolean, legacy: boolean, width: number, height: number }}
 */
export function normalizeSkin(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w % 64 !== 0 || (h !== w && h !== w / 2)) {
    throw new Error(`지원하지 않는 스킨 크기예요: ${w}x${h} (64x32, 64x64, 128x128 지원)`);
  }
  const legacy = h === w / 2;
  const scale = w / 64;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = w;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);

  if (legacy) {
    clearOpaqueHat(ctx, scale);
    convertLegacyTo64x64(ctx, scale);
  }

  const slim = !legacy && detectSlim(ctx, scale);
  return { canvas, scale, slim, legacy, width: w, height: h };
}

// 구버전 스킨 중 모자 영역이 완전히 불투명(배경색으로 채워짐)한 경우 지운다.
function clearOpaqueHat(ctx, s) {
  const data = ctx.getImageData(32 * s, 0, 32 * s, 16 * s).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return;
  }
  ctx.clearRect(32 * s, 0, 32 * s, 16 * s);
}

function copyRegion(ctx, s, sx, sy, w, h, dx, dy, flip) {
  const img = ctx.getImageData(sx * s, sy * s, w * s, h * s);
  if (flip) {
    const W = w * s;
    const H = h * s;
    const src = new Uint32Array(img.data.buffer.slice(0));
    const dst = new Uint32Array(img.data.buffer);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) dst[y * W + x] = src[y * W + (W - 1 - x)];
    }
  }
  ctx.putImageData(img, dx * s, dy * s);
}

// 64x32 → 64x64: 왼팔/왼다리를 오른쪽 것을 좌우 반전해 만든다 (1.8 클라이언트와 동일한 방식)
function convertLegacyTo64x64(ctx, s) {
  const c = (sx, sy, w, h, dx, dy) => copyRegion(ctx, s, sx, sy, w, h, dx, dy, true);
  c(4, 16, 4, 4, 20, 48); // 다리 윗면
  c(8, 16, 4, 4, 24, 48); // 다리 아랫면
  c(0, 20, 4, 12, 24, 52); // 다리 바깥
  c(4, 20, 4, 12, 20, 52); // 다리 앞
  c(8, 20, 4, 12, 16, 52); // 다리 안쪽
  c(12, 20, 4, 12, 28, 52); // 다리 뒤
  c(44, 16, 4, 4, 36, 48); // 팔 윗면
  c(48, 16, 4, 4, 40, 48); // 팔 아랫면
  c(40, 20, 4, 12, 40, 52); // 팔 바깥
  c(44, 20, 4, 12, 36, 52); // 팔 앞
  c(48, 20, 4, 12, 32, 52); // 팔 안쪽
  c(52, 20, 4, 12, 44, 52); // 팔 뒤
}

// 슬림(Alex) 팔은 3px 폭이라 오른팔 텍스처의 x=54~55, y=20~31 영역이 비어 있다.
function detectSlim(ctx, s) {
  const data = ctx.getImageData(54 * s, 20 * s, 2 * s, 12 * s).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

// ── 기본 스킨: 저작권 문제 없는 자체 제작 "개발자" 캐릭터 (64x64) ──
export function createDefaultSkin() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const fill = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // 박스 전개도 전체를 한 색으로 칠하기
  const box = (u, v, w, h, d, color) => {
    fill(u + d, v, w * 2, d, color);
    fill(u, v + d, (w + d) * 2, h, color);
  };

  const skin = '#f2c8a0';
  const skinShade = '#e0b088';
  const hair = '#4a2f1d';
  const hoodie = '#3b7dd8';
  const hoodieDark = '#2c5fa8';
  const jeans = '#2d3550';
  const shoe = '#e8e8e8';

  // 머리 (0,0) 8x8x8
  box(0, 0, 8, 8, 8, skin);
  fill(8, 0, 8, 8, hair); // 정수리
  fill(0, 8, 32, 2, hair); // 앞머리 둘레
  fill(24, 8, 8, 8, hair); // 뒷머리
  fill(0, 10, 3, 3, hair); // 옆머리
  fill(21, 10, 3, 3, hair);
  fill(8, 10, 1, 1, hair);
  fill(15, 10, 1, 1, hair);
  // 얼굴
  fill(9, 12, 2, 1, '#ffffff');
  fill(13, 12, 2, 1, '#ffffff');
  fill(10, 12, 1, 1, '#2b4a8a');
  fill(13, 12, 1, 1, '#2b4a8a');
  fill(9, 11, 2, 1, hair); // 눈썹
  fill(13, 11, 2, 1, hair);
  fill(11, 14, 2, 1, skinShade); // 코
  fill(10, 15, 4, 1, '#b5644f'); // 입
  // 볼터치
  fill(8, 14, 1, 1, '#f0a0a0');
  fill(15, 14, 1, 1, '#f0a0a0');

  // 모자 레이어 (32,0): 헤드폰
  const hp = '#222833';
  fill(40, 3, 8, 2, hp); // 정수리 밴드 (윗면)
  fill(35, 8, 2, 3, hp); // 오른쪽 옆면 밴드 + 이어컵
  fill(34, 11, 4, 4, hp);
  fill(35, 12, 2, 2, '#ff5c8a');
  fill(51, 8, 2, 3, hp); // 왼쪽 옆면 밴드 + 이어컵
  fill(50, 11, 4, 4, hp);
  fill(51, 12, 2, 2, '#ff5c8a');

  // 몸통 (16,16) 8x12x4 — 후드티
  box(16, 16, 8, 12, 4, hoodie);
  fill(20 + 2, 20, 4, 2, hoodieDark); // 목 부분
  fill(23, 22, 1, 4, '#ffffff'); // 후드 끈
  fill(24, 22, 1, 4, '#ffffff');
  fill(21, 28, 6, 3, hoodieDark); // 캥거루 주머니
  fill(16, 30, 24, 2, hoodieDark); // 밑단

  // 오른팔 (40,16) 4x12x4
  box(40, 16, 4, 12, 4, hoodie);
  fill(40, 29, 16, 3, skin); // 손
  fill(40, 28, 16, 1, hoodieDark); // 소매
  fill(48, 16, 4, 4, skin); // 손바닥(아랫면)
  // 왼팔 (32,48)
  box(32, 48, 4, 12, 4, hoodie);
  fill(32, 61, 16, 3, skin);
  fill(32, 60, 16, 1, hoodieDark);
  fill(40, 48, 4, 4, skin);

  // 오른다리 (0,16), 왼다리 (16,48)
  box(0, 16, 4, 12, 4, jeans);
  fill(0, 29, 16, 3, shoe);
  fill(8, 16, 4, 4, shoe);
  box(16, 48, 4, 12, 4, jeans);
  fill(16, 61, 16, 3, shoe);
  fill(24, 48, 4, 4, shoe);

  return { canvas, scale: 1, slim: false, legacy: false, width: 64, height: 64 };
}
