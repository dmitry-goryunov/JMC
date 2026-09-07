"""Extract JMC questions/solutions from UKMT PDFs into cropped images + answer key.

Each question is rendered as an image cropped from the source PDF so that
diagrams and mathematical typography survive exactly as printed.
"""
import fitz, re, io, os, sys, json, collections
from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)

DPI = 200
OUT_IMG = os.path.join('docs', 'assets')
OUT_DATA = os.path.join('docs', 'data')

# year -> (paper pdf, solutions pdf); the 2011-2013 files combine both
PAPERS = {
    2011: ('jmc-2011-extended.pdf', None),
    2012: ('jmc-2012-extended.pdf', None),
    2013: ('jmc-2013-extended.pdf', None),
    2015: ('jmc-2015-q.pdf', 'jmc-2015-s.pdf'),
    2016: ('jmc-2016-q.pdf', 'jmc-2016-s.pdf'),
    2017: ('jmc-2017-q.pdf', 'jmc-2017-s.pdf'),
    2018: ('jmc-2018-q.pdf', 'jmc-2018-s.pdf'),
    2019: ('jmc-2019-q.pdf', 'jmc-2019-s.pdf'),
    2020: ('JMC-2020-q.pdf', 'JMC-2020-s.pdf'),
    2021: ('JMC-2021-paper.pdf', 'JMC-2021-Solutions.pdf'),
    2022: ('JMC_2022_Paper.pdf', 'JMC_2022_Solutions_0.pdf'),
    2023: ('JMC-2023_Paper.pdf', 'JMC-2023-Solutions.pdf'),
    2024: ('JMC-2024-Question-Paper-4.pdf', 'JMC-2024-Solutions-1.pdf'),
    2025: ('JMC-2025-Paper.pdf', 'JMC-2025-Solutions.pdf'),
    2026: ('JMC_Paper_2026.pdf', 'JMC_Solutions_2026.pdf'),
}
EXTENDED = {2011, 2012, 2013}

# The 2016 PDFs embed Type3 fonts with no unicode mapping, so extracted text is
# a substitution cipher (a different one per file). For the question paper the
# digits and option letters were recovered from the 1..25 numbering sequence;
# its solutions file is too fragmented to crop, so only its answer key is kept,
# read off the rendered page (see ANSWERS_2016).
CIPHER_2016 = {'\x02': '.', '\x04': ' ', '\x01': '0', '2': '1', '\x00': '2',
               '4': '3', '1': '4', '\x1b': '5', '\x1f': '6', ' ': '7',
               '\x1d': '8', '\x1c': '9', '\x03': 'A', '\x17': 'B', '5': 'C',
               '!': 'D', '6': 'E'}
ANSWERS_2016 = dict(enumerate('BAECACAAEDCBCDEBCDBEAEBDD', start=1))


def decode(text, year):
    if year != 2016:
        return text
    return ''.join(CIPHER_2016.get(c, '�') for c in text)




def get_lines(doc, year):
    """All text lines as (page, y0, x0, y1, x1, text, block_start, block_top)."""
    out = []
    for pno in range(doc.page_count):
        for b in doc[pno].get_text("dict")["blocks"]:
            if b.get("type") != 0:
                continue
            for li, l in enumerate(b["lines"]):
                raw = "".join(sp["text"] for sp in l["spans"])
                t = decode(raw, year).strip()
                if t:
                    x0, y0, x1, y1 = l["bbox"]
                    # Some Type3 fonts declare a glyph box far larger than the
                    # type they draw; fall back to the baseline in that case.
                    size = max(sp["size"] for sp in l["spans"])
                    bt = b["bbox"][1]
                    if size > 0 and (y1 - y0) > 2.2 * size:
                        base = max(sp["origin"][1] for sp in l["spans"])
                        y0, y1 = base - size * 1.10, base + size * 0.32
                        # The block box is inflated by the same glyphs, so it
                        # cannot be trusted to say where the paragraph starts.
                        bt = y0
                    out.append((pno, y0, x0, y1, x1, t, li == 0, bt))
    out.sort(key=lambda r: (r[0], round(r[1], 1), r[2]))
    return out


def content_bands(doc, ls):
    """Per page (top, bottom) of the body area, excluding repeated headers/footers."""
    h = doc[0].rect.height
    seen = collections.defaultdict(set)
    for (p, y0, x0, y1, x1, t, bs, bt) in ls:
        if y0 < h * 0.16 or y1 > h * 0.86:
            seen[(t, round(y0 / 12))].add(p)
    furniture = {k for k, v in seen.items() if len(v) >= 3}
    bands = {}
    for pno in range(doc.page_count):
        top, bot = h * 0.03, h * 0.97
        for (p, y0, x0, y1, x1, t, bs, bt) in ls:
            if p != pno or (t, round(y0 / 12)) not in furniture:
                continue
            if y0 < h * 0.16:
                top = max(top, y1 + 3)
            elif y1 > h * 0.86:
                bot = min(bot, y0 - 3)
        bands[pno] = (top, bot)
    return bands


def cover_pages(doc, ls, year):
    """Number of front-matter pages before the questions start."""
    if year == 2016:
        return 1
    pat = re.compile(r'do not open the paper|rules and guidelines|time allowed', re.I)
    last = -1
    for (p, y0, x0, y1, x1, t, bs, bt) in ls:
        if pat.search(t):
            last = max(last, p)
    return last + 1


def find_markers(ls, start_page, maxq=25):
    """Locate the '1.'..'25.' question labels. Numbers that merely occur inside
    prose are rejected by requiring the shared right-edge alignment."""
    cands = []
    for i, (p, y0, x0, y1, x1, t, bs, bt) in enumerate(ls):
        if p < start_page:
            continue
        m = re.match(r'^(\d{1,2})[.)](?!\d)', t)
        if m and 1 <= int(m.group(1)) <= maxq:
            # A display fraction on the same row can start above the number, so
            # the enclosing block's top is the real edge of the question.
            top = max(bt, y0 - 30)
            cands.append((int(m.group(1)), i, p, y0, x0, y1, x1, t, bs, top))

    def greedy(xmode=None, block_only=False, tol=8.0):
        found, n, last = {}, 1, (-1, -1e9)
        for (num, i, p, y0, x0, y1, x1, t, bs, top) in cands:
            if n > maxq:
                break
            if num != n or (p, y0) <= last:
                continue
            if block_only and not bs:
                continue
            if xmode is not None and abs(x0 - xmode) > tol:
                continue
            found[n] = (p, y0, x0, y1, x1, t, i, top)
            last, n = (p, y0 + 6), n + 1
        return found

    seed = greedy()
    if len(seed) < 5:
        return seed
    mode = collections.Counter(round(v[2]) for v in seed.values()).most_common(1)[0][0]
    for args in ((mode, True), (mode, False), (None, True), (None, False)):
        got = greedy(*args)
        if len(got) == maxq:
            return got
    return seed


def body_rect(doc, ls, bands, start_page):
    """Horizontal extent of the body content, including vector diagrams."""
    x0s, x1s = [], []
    for (p, y0, x0, y1, x1, t, bs, bt) in ls:
        if p >= start_page and bands[p][0] - 2 <= y0 and y1 <= bands[p][1] + 2:
            x0s.append(x0)
            x1s.append(x1)
    for pno in range(start_page, doc.page_count):
        top, bot = bands[pno]
        for d in doc[pno].get_drawings():
            r = d["rect"]
            if r.y1 >= top and r.y0 <= bot and r.width < doc[pno].rect.width * 0.98:
                x0s.append(r.x0)
                x1s.append(r.x1)
    return min(x0s) - 4, max(x1s) + 4


def trim(img, pad=6):
    """Crop surrounding whitespace, and drop a detached horizontal rule left
    behind at the foot of a crop that ran to the bottom of a page."""
    g = img.convert("L").point(lambda v: 0 if v > 244 else 255)
    bb = g.getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    px, w = g.tobytes(), g.width
    rows = [any(px[y * w + x0:y * w + x1]) for y in range(y0, y1)]
    end = len(rows)
    while end > 0:
        start = end
        while start > 0 and rows[start - 1]:
            start -= 1
        band = end - start
        blank = 0
        while start - blank > 0 and not rows[start - blank - 1]:
            blank += 1
        if band <= 10 and blank >= 12 and start > 0:
            end = start - blank  # a rule, not content
            continue
        break
    y1 = y0 + max(end, 1)
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def render(doc, spans, path, xl, xr):
    """Render one or more (page, y0, y1) bands stacked into a single image."""
    tiles = []
    for (pno, y0, y1) in spans:
        if y1 - y0 < 4:
            continue
        clip = fitz.Rect(xl, y0, xr, y1) & doc[pno].rect
        if clip.is_empty:
            continue
        pm = doc[pno].get_pixmap(clip=clip, dpi=DPI, colorspace=fitz.csRGB)
        tiles.append(Image.open(io.BytesIO(pm.tobytes("png"))).convert("RGB"))
    if not tiles:
        return None
    w = max(t.width for t in tiles)
    img = Image.new("RGB", (w, sum(t.height for t in tiles)), "white")
    y = 0
    for t in tiles:
        img.paste(t, (0, y))
        y += t.height
    img = trim(img)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", lossless=True, method=6)
    return img.size


def spans_between(doc, bands, a, b, tail, gap=3):
    """Vertical band(s) running from position a up to position b."""
    pa, ya = a
    top = ya - gap
    if b is None:
        return [(pa, top, min(bands[pa][1], tail))]
    pb, yb = b
    if pb == pa:
        return [(pa, top, yb - gap)]
    out = [(pa, top, bands[pa][1])]
    for p in range(pa + 1, pb):
        out.append((p, bands[p][0], bands[p][1]))
    if yb - gap > bands[pb][0] + 2:
        out.append((pb, bands[pb][0], yb - gap))
    return out


def lines_in(ls, spans):
    return [l for l in ls
            if any(l[0] == sp and sp0 - 1 <= l[1] and l[3] <= sp1 + 1
                   for (sp, sp0, sp1) in spans)]


def has_all_options(ls, spans, year):
    """True when the text inside a crop carries all five option labels, which is
    what catches a question that was cut short."""
    if year == 2016:
        # Only the option letters and digits of its cipher are known, so match
        # bare letters rather than whitespace-delimited tokens.
        text = ''.join(l[5] for l in lines_in(ls, spans))
        return set(c for c in text if c in 'ABCDE') >= set('ABCDE')
    seen = set()
    for (p, y0, x0, y1, x1, t, bs, bt) in ls:
        if any(p == sp and sp0 - 1 <= y0 and y1 <= sp1 + 1 for (sp, sp0, sp1) in spans):
            for m in re.finditer(r'(?:^|\s)([A-E])(?=\s|$)', t):
                seen.add(m.group(1))
    return seen >= set('ABCDE')


def bleeds_into_next(ls, spans, n):
    """True when a crop has run on into the following question."""
    return any(re.match(r'^%d[.)](?!\d)' % (n + 1), l[5]) for l in lines_in(ls, spans))


def question_boxes(doc):
    """Framed question panels, keyed by page (the 2013 paper uses these)."""
    boxes = {}
    for p in range(doc.page_count):
        boxes[p] = sorted((d["rect"] for d in doc[p].get_drawings()
                           if d["rect"].width > 300 and d["rect"].height > 18),
                          key=lambda r: r.y0)
    return boxes


def answers_from_markers(ls, mk):
    """Answer letter per question: inline on the marker line, or the standalone
    A-E that immediately follows it (often typeset on the same row)."""
    ans = {}
    for n, m in mk.items():
        inline = re.match(r'^\d{1,2}[.)]\s*([A-E])(\s|$)', m[5])
        if inline:
            ans[n] = inline.group(1)
            continue
        for j in (m[6] + 1, m[6] + 2):
            if j < len(ls) and re.fullmatch(r'[A-E]', ls[j][5]):
                ans[n] = ls[j][5]
                break
    return ans


def answers_marking_guide(doc):
    txt = doc[0].get_text()
    m = re.search(r'Quick Marking Guide(.{0,1200})', txt, re.S)
    seq = re.findall(r'\b([A-E])\b', m.group(1) if m else txt)
    return {i + 1: c for i, c in enumerate(seq[:25])}


def process(year, paper, sol):
    issues = []
    qdoc = fitz.open(paper)
    qls = get_lines(qdoc, year)
    qbands = content_bands(qdoc, qls)
    qstart = cover_pages(qdoc, qls, year)
    qmk = find_markers(qls, qstart)
    xl, xr = body_rect(qdoc, qls, qbands, qstart)

    if year in EXTENDED:
        ans = answers_marking_guide(qdoc)
        sdoc, sbands, smk = qdoc, qbands, qmk
        sxl, sxr = xl, xr
        boxes = question_boxes(qdoc)
        qtop, qbot = {}, {}
        for n, (p, y0, x0, y1, x1, t, i, top) in qmk.items():
            box = next((b for b in boxes[p] if b.y0 - 8 <= y0 <= b.y1), None)
            if box is not None:
                # A framed panel gives exact bounds, and is immune to the
                # invisible duplicate solution text some of these files carry.
                qtop[n], qbot[n] = (p, box.y0 - 2), (p, box.y1 + 4)
                continue
            qtop[n] = (p, top)
            for (p2, yy0, xx0, yy1, xx1, t2, bs2, bt2) in qls:
                if (p2, yy0) > (p, y0) and re.match(r'^solution\b', t2, re.I):
                    qbot[n] = (p2, yy0)
                    break
    else:
        sdoc = fitz.open(sol)
        sls = get_lines(sdoc, year)
        sbands = content_bands(sdoc, sls)
        sstart = 0 if year == 2016 else cover_pages(sdoc, sls, year)
        if year == 2016:
            # Its solutions file fragments text across mismatched Type3 encodings,
            # so per-question crops cannot be located; the app links the PDF instead.
            smk, ans = {}, dict(ANSWERS_2016)
        else:
            smk = find_markers(sls, sstart)
            ans = answers_from_markers(sls, smk)
        sxl, sxr = body_rect(sdoc, sls, sbands, sstart)
        solstart = None

    items = []
    for n in range(1, 26):
        if n not in qmk:
            issues.append('q%d marker missing' % n)
            continue
        qa = (qmk[n][0], qmk[n][7])
        if year in EXTENDED:
            qa, qb = qtop[n], qbot.get(n)
            qspans = spans_between(qdoc, qbands, qa, qb, qbands[qa[0]][1], gap=0)
            nb = qtop.get(n + 1)
            sspans = spans_between(qdoc, qbands, qb, nb, qbands[qb[0]][1], gap=0) if qb else []
        else:
            nb = (qmk[n + 1][0], qmk[n + 1][7]) if n + 1 in qmk else None
            qspans = spans_between(qdoc, qbands, qa, nb, qbands[qa[0]][1])
            sa = (smk[n][0], smk[n][7]) if n in smk else None
            snb = (smk[n + 1][0], smk[n + 1][7]) if n + 1 in smk else None
            sspans = spans_between(sdoc, sbands, sa, snb, sbands[sa[0]][1]) if sa else []

        qsize = render(qdoc, qspans, '%s/q/%d/%02d.webp' % (OUT_IMG, year, n), xl, xr)
        ssize = render(sdoc, sspans, '%s/s/%d/%02d.webp' % (OUT_IMG, year, n), sxl, sxr) if sspans else None
        if not qsize:
            issues.append('q%d empty render' % n)
            continue
        if n not in ans:
            issues.append('q%d answer missing' % n)
        if not has_all_options(qls, qspans, year):
            issues.append('q%d options incomplete' % n)
        if bleeds_into_next(qls, qspans, n):
            issues.append('q%d runs into q%d' % (n, n + 1))
        items.append({
            'n': n, 'answer': ans.get(n),
            'q': 'assets/q/%d/%02d.webp' % (year, n), 'qw': qsize[0], 'qh': qsize[1],
            's': 'assets/s/%d/%02d.webp' % (year, n) if ssize else None,
            'sw': ssize[0] if ssize else None, 'sh': ssize[1] if ssize else None,
        })
    return items, issues


def main():
    only = [int(a) for a in sys.argv[1:]] or sorted(PAPERS)
    path = '%s/questions.json' % OUT_DATA
    catalogue = {}
    if os.path.exists(path):
        catalogue = json.load(open(path, encoding='utf-8')).get('papers', {})
    for year in only:
        paper, sol = PAPERS[year]
        items, issues = process(year, paper, sol)
        catalogue[str(year)] = {'year': year, 'source': paper,
                                'extended': year in EXTENDED, 'questions': items}
        print('%d: %2d questions, %d without answer, issues=%s'
              % (year, len(items), sum(1 for i in items if not i['answer']),
                 issues if issues else 'none'))
    os.makedirs(OUT_DATA, exist_ok=True)
    ordered = {k: catalogue[k] for k in sorted(catalogue, key=int, reverse=True)}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'papers': ordered}, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(len(v['questions']) for v in ordered.values())
    print('\nTOTAL %d questions across %d papers' % (total, len(ordered)))


if __name__ == '__main__':
    main()
