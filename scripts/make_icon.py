# 기본 스킨 얼굴로 앱 아이콘(build/icon.png, public/icon.png)을 만든다: python3 scripts/make_icon.py
from pathlib import Path
from PIL import Image, ImageDraw

S, H, E, P, M, B, HP, PK = '#f2c8a0', '#4a2f1d', '#2b4a8a', '#ffffff', '#b5644f', '#f0a0a0', '#222833', '#ff5c8a'
face = [
    [H, H, H, H, H, H, H, H],
    [H, H, H, H, H, H, H, H],
    [H, S, S, S, S, S, S, H],
    [S, H, H, S, S, H, H, S],
    [S, P, E, S, S, E, P, S],
    [S, S, S, S, S, S, S, S],
    [B, S, M, M, M, M, S, B],
    [S, S, S, S, S, S, S, S],
]
size, px, off = 512, 44, 80
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, size - 1, size - 1], radius=110, fill='#3b7dd8')
d.rounded_rectangle([off - 40, off - 30, size - off + 40, off + 30], radius=24, fill=HP)  # 헤드폰 밴드
for x0 in (off - 56, size - off + 10):
    d.rectangle([x0, off + px * 3, x0 + 46, off + px * 6], fill=HP)
    d.rectangle([x0 + 12, off + px * 4, x0 + 34, off + px * 5], fill=PK)
for y, row in enumerate(face):
    for x, c in enumerate(row):
        d.rectangle([off + x * px, off + y * px, off + (x + 1) * px - 1, off + (y + 1) * px - 1], fill=c)
root = Path(__file__).resolve().parent.parent
img.save(root / 'build' / 'icon.png')
img.resize((192, 192), Image.NEAREST).save(root / 'public' / 'icon.png')
img.save(root / 'public' / 'icon-512.png')
# iOS 홈 화면 아이콘은 투명 배경 대신 꽉 찬 사각형이어야 한다 (모서리는 iOS 가 둥글게 깎음)
full = Image.new('RGBA', (512, 512), '#3b7dd8')
full.alpha_composite(img)
full.convert('RGB').resize((180, 180), Image.LANCZOS).save(root / 'public' / 'apple-touch-icon.png')
print('icon written')
