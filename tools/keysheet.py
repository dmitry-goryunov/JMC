"""Build a compact sheet of the answer letters printed in the solution images.

The 2004-2010 solutions each open with the question number and, in bold, the
correct option. Cropping just that opening and stacking the 25 of them makes a
sheet the key can be read off and checked against the paper.
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)

year = sys.argv[1]
frac = float(sys.argv[2]) if len(sys.argv) > 2 else 0.34   # how much of the width

tiles = []
for n in range(1, 26):
    p = 'docs/assets/s/%s/%02d.webp' % (year, n)
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGB')
    im = im.crop((0, 0, int(im.width * frac), min(im.height, int(im.width * 0.10))))
    scale = 520 / im.width
    im = im.resize((520, max(14, int(im.height * scale))), Image.LANCZOS)
    t = Image.new('RGB', (im.width + 54, im.height + 6), 'white')
    t.paste(im, (52, 3))
    ImageDraw.Draw(t).text((5, 5), 'Q%d' % n, fill=(190, 0, 0))
    tiles.append(t)

w = max(t.width for t in tiles)
h = sum(t.height + 3 for t in tiles)
out = Image.new('RGB', (w, h), (232, 232, 232))
y = 0
for t in tiles:
    out.paste(t, (0, y))
    y += t.height + 3
path = 'tools/_key_%s.png' % year
out.save(path)
print(path, out.size, len(tiles), 'solutions')
