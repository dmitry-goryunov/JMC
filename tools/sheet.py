from PIL import Image, ImageDraw
import sys, os
year, kind = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'q')
colw, cols = 560, 2
tiles = []
for n in range(1, 26):
    p = 'docs/assets/%s/%s/%02d.webp' % (kind, year, n)
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGB')
    im = im.resize((colw, max(12, int(im.height * colw / im.width))))
    t = Image.new('RGB', (colw + 10, im.height + 20), 'white')
    t.paste(im, (5, 16))
    ImageDraw.Draw(t).text((4, 3), '%s %s%d' % (year, kind.upper(), n), fill=(190, 0, 0))
    tiles.append(t)
colh = [0] * cols
assign = []
for t in tiles:
    c = colh.index(min(colh)); assign.append((c, colh[c])); colh[c] += t.height + 6
img = Image.new('RGB', ((colw + 16) * cols, max(colh)), (235, 235, 235))
for t, (c, y) in zip(tiles, assign):
    img.paste(t, (c * (colw + 16), y))
out = 'tools/_sheet_%s_%s.png' % (year, kind)
img.save(out); print(out, img.size)
