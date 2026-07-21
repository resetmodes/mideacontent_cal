# 채널 스크린샷 → 아이폰 목업 합성 (재사용 스크립트)
# 사용: python iphone-mock.py <screenshot.png> <out.png>
from PIL import Image, ImageDraw
import sys

def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return m

def make(shot_path, out_path, scale=3):
    # 아이폰 15 Pro 비율 계열 (스크린 9:19.5). 스크린 목표 폭 기준으로 프레임 산출
    SW = 420 * scale          # screen width
    SH = int(SW * 19.5 / 9)   # screen height
    bezel = int(16 * scale)   # 베젤 두께
    corner = int(52 * scale)  # 본체 라운드
    scorner = int(40 * scale) # 스크린 라운드
    FW = SW + bezel * 2
    FH = SH + bezel * 2

    canvas = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))

    # 본체 (검정, 라운드)
    body = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle([0, 0, FW-1, FH-1], radius=corner, fill=(26, 26, 28, 255))
    canvas.alpha_composite(body)

    # 스크린샷 — 스크린 영역에 커버 맞춤 (비율 유지, 중앙 크롭)
    shot = Image.open(shot_path).convert('RGB')
    sw, sh = shot.size
    target = SW / SH
    if sw / sh > target:
        nw = int(sh * target); shot = shot.crop(((sw-nw)//2, 0, (sw-nw)//2+nw, sh))
    else:
        nh = int(sw / target); shot = shot.crop((0, (sh-nh)//2, sw, (sh-nh)//2+nh))
    shot = shot.resize((SW, SH), Image.LANCZOS).convert('RGBA')
    shot.putalpha(rounded_mask((SW, SH), scorner))
    canvas.alpha_composite(shot, (bezel, bezel))

    # 다이나믹 아일랜드
    iw, ih = int(112*scale), int(34*scale)
    ix = (FW - iw)//2; iy = bezel + int(12*scale)
    isl = Image.new('RGBA', (iw, ih), (0, 0, 0, 0))
    ImageDraw.Draw(isl).rounded_rectangle([0, 0, iw-1, ih-1], radius=ih//2, fill=(10, 10, 12, 255))
    canvas.alpha_composite(isl, (ix, iy))

    # 다운스케일 (안티에일리어싱)
    out = canvas.resize((FW//scale, FH//scale), Image.LANCZOS)
    # 흰 배경 위에 합성해 JPG 저장 (투명이면 PNG로)
    if out_path.endswith('.png'):
        out.save(out_path)
    else:
        bg = Image.new('RGB', out.size, (255, 255, 255)); bg.paste(out, mask=out.split()[3]); bg.save(out_path, quality=88)
    print('saved', out_path, out.size)

make(sys.argv[1], sys.argv[2])
