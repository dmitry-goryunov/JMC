"""Stack the opening of every solution image for a year.

Each 2004-2010 solution begins "<number>.  <letter>", so this sheet shows both
the answer key and, because the numbers should run 1 to 25 in page order, proof
that the question and solution images have been paired correctly.
"""
import os, re, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)

year = sys.argv[1]
d = 'source_legacy/%s' % year
html = open(d + '/page.html', encoding='utf-8', errors='replace').read()

seen = []
for m in re.finditer(r'individual-problems/jmc/%s/([A-Za-z0-9_-]+\.gif)' % year, html):
    if m.group(1) not in seen:
        seen.append(m.group(1))


def is_question(size):
    w, h = size
    return 370 <= h <= 385 and 690 <= w <= 712


tiles = []
for i, name in enumerate(seen):
    im = Image.open(os.path.join(d, name)).convert('RGB')
    if is_question(im.size):
        continue
    crop = im.crop((0, 0, min(im.width, 330), min(im.height, 30)))
    crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
    t = Image.new('RGB', (crop.width + 190, crop.height + 6), 'white')
    t.paste(crop, (188, 3))
    ImageDraw.Draw(t).text((5, 8), 'idx%02d  %s' % (i, name.replace('.gif', '')),
                           fill=(190, 0, 0))
    tiles.append(t)

W = max(t.width for t in tiles)
H = sum(t.height + 3 for t in tiles)
out = Image.new('RGB', (W, H), (228, 228, 228))
y = 0
for t in tiles:
    out.paste(t, (0, y))
    y += t.height + 3
path = 'tools/_sol_%s.png' % year
out.save(path)
print(path, out.size, len(tiles), 'solution images')
