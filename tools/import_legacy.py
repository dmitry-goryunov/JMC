"""Import the 2004-2010 Junior Mathematical Challenge papers.

UKMT publishes these years not as PDFs but as one GIF per question and one per
worked solution, on a page per year. The images appear in the page source in
reading order - question, solution, question, solution - so pairing them by
position recovers Q1 to Q25. The question number is printed inside each image
rather than in any markup, so the order is the only mapping there is; it is
checked afterwards by rendering contact sheets.
"""
import io, json, os, re, subprocess, sys, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.chdir(ROOT)

from PIL import Image

YEARS = range(2004, 2011)
PAGE = 'https://ukmt.org.uk/free-past-papers/junior-mathematical-challenge-%d'
CACHE = os.path.join('source_legacy')
UA = 'Mozilla/5.0 (compatible; jmc-practice-import/1.0)'

# Answer letters read from the letter printed at the head of each official
# worked solution. 2004 Q3 is the one exception: UKMT's page carries no
# solution for it, and the answer below is derived from the question itself -
# between 2005 and 2999 the thousands digit is 2, so the units digit must be 4,
# making 2014 the next such year, ten years on.
ANSWERS = {
    2004: 'BEADCECECBDBACDCDBBAEDEAD',
    2005: 'CBCEBDCAEDAEADADEAEBDCBCB',
    2006: 'BACCBDAEEDBCACDCDADEABBCB',
    2007: 'CDBEEADDCDAADECBCBAEBDECB',
    2008: 'DEBCEDCAEBECCDBABBDAADBED',
    2009: 'BBDEDBCEABCADEEDABADEDCCB',
    2010: 'BEADDCADAECCBDCEDDCBCEEBA',
}
DERIVED = {(2004, 3)}          # answer worked out here, not printed by UKMT



def fetch(url, path):
    """Cache each download; the site refuses urllib's default agent, so curl
    does the fetching."""
    if os.path.exists(path) and os.path.getsize(path):
        return open(path, 'rb').read()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        rc = subprocess.call(['curl', '-sSfL', '-A', UA, '-o', path, url])
        if rc == 0 and os.path.exists(path) and os.path.getsize(path):
            time.sleep(0.15)          # a few hundred images: go gently
            return open(path, 'rb').read()
        time.sleep(2 + 3 * attempt)   # the host throttles a fast run
    raise RuntimeError('could not fetch %s' % url)


def page_images(year):
    """The problem GIFs for a year, in the order the page presents them."""
    html = fetch(PAGE % year, os.path.join(CACHE, str(year), 'page.html')).decode('utf-8', 'replace')
    seen, out = set(), []
    for m in re.finditer(r'https://ukmt\.org\.uk/wp-content/uploads/individual-problems/'
                         r'jmc/%d/([A-Za-z0-9_-]+\.gif)' % year, html):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append((m.group(1), m.group(0)))
    return out


def ink_bands(img, gap=14, thresh=244):
    """Rows of ink, grouped into bands separated by blank gaps."""
    g = img.convert('L').point(lambda v: 0 if v > thresh else 255)
    w, h = g.size
    px = g.tobytes()
    rows = [any(px[y * w:(y + 1) * w]) for y in range(h)]
    bands, start = [], None
    blank = 0
    for y, on in enumerate(rows):
        if on:
            if start is None:
                start = y
            blank = 0
        elif start is not None:
            blank += 1
            if blank >= gap:
                bands.append((start, y - blank + 1))
                start = None
    if start is not None:
        bands.append((start, h))
    return bands


def has_logos(img):
    """A question page carries a UKMT logo in each top corner with a clear gap
    between them. A solution opens with text at the left, so this separates the
    two reliably - size does not, since a long solution can be page-tall."""
    g = img.convert('L').point(lambda v: 0 if v > 240 else 255)
    w, h = g.size
    band = g.crop((0, 0, w, min(60, h)))
    px, bw, bh = band.tobytes(), band.width, band.height

    def ink(x0, x1):
        return any(any(px[y * bw + x0:y * bw + x1]) for y in range(bh))

    return ink(0, int(bw * 0.14)) and ink(int(bw * 0.86), bw)         and not ink(int(bw * 0.30), int(bw * 0.70))


def crop_question(img):
    """Drop the logo strip at the top and the footer strip at the bottom, which
    every question page carries, and keep the question itself."""
    h = img.height
    bands = ink_bands(img)
    if len(bands) >= 2 and bands[0][1] < h * 0.25:
        bands = bands[1:]
    if len(bands) >= 2 and bands[-1][0] > h * 0.70:
        bands = bands[:-1]
    if not bands:
        return img
    return img.crop((0, max(0, bands[0][0] - 8), img.width, min(h, bands[-1][1] + 8)))


def tidy(img, pad=6):
    """Trim surrounding whitespace."""
    g = img.convert('L').point(lambda v: 0 if v > 244 else 255)
    bb = g.getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def pair_up(kinds):
    """Walk the page in order, expecting question then solution, and return a
    slot per question number. Two questions running means that question has no
    published solution; two solutions running means the question image itself is
    missing. Both happen once each in this run of years."""
    slots, n, i = {}, 1, 0
    while i < len(kinds) and n <= 25:
        slot = slots.setdefault(n, {'q': None, 's': None})
        if kinds[i] == 'Q':
            slot['q'] = i
            if i + 1 < len(kinds) and kinds[i + 1] == 's':
                slot['s'] = i + 1
                i += 2
            else:
                i += 1
        else:
            slot['s'] = i          # its question image was not published
            i += 1
        n += 1
    return slots


def build(year, scale=2):
    names = page_images(year)
    imgs = [Image.open(os.path.join(CACHE, str(year), n)).convert('RGB')
            for (n, url) in names]
    for (n, url) in names:
        fetch(url, os.path.join(CACHE, str(year), n))
    kinds = ['Q' if has_logos(im) else 's' for im in imgs]
    slots = pair_up(kinds)

    made = []
    for n in range(1, 26):
        slot = slots.get(n) or {}
        for kind, key in (('q', 'q'), ('s', 's')):
            idx = slot.get(key)
            if idx is None:
                continue
            img = imgs[idx]
            img = crop_question(img) if kind == 'q' else img
            img = tidy(img)
            # the source GIFs are only ~700px wide; doubling helps them sit
            # alongside the 200 dpi crops without inventing detail
            img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
            out = 'docs/assets/%s/%d/%02d.webp' % (kind, year, n)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            img.save(out, 'WEBP', quality=92, method=6)
        made.append({'n': n,
                     'q': names[slot['q']][0] if slot.get('q') is not None else None,
                     's': names[slot['s']][0] if slot.get('s') is not None else None})
    return names, kinds, made


def catalogue_entries(year, made):
    """Rows for docs/data/questions.json, matching the PDF-derived ones."""
    key = ANSWERS[year]
    items = []
    for m in made:
        n = m['n']
        if not m['q']:
            continue                      # no question image published
        q = Image.open('docs/assets/q/%d/%02d.webp' % (year, n))
        entry = {'n': n, 'answer': key[n - 1],
                 'q': 'assets/q/%d/%02d.webp' % (year, n), 'qw': q.width, 'qh': q.height,
                 's': None, 'sw': None, 'sh': None}
        if m['s']:
            sol = Image.open('docs/assets/s/%d/%02d.webp' % (year, n))
            entry.update(s='assets/s/%d/%02d.webp' % (year, n),
                         sw=sol.width, sh=sol.height)
        items.append(entry)
    return items


def main():
    only = [int(a) for a in sys.argv[1:]] or list(YEARS)
    path = 'tools/legacy_manifest.json'
    book = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}

    cat_path = 'docs/data/questions.json'
    cat = json.load(open(cat_path, encoding='utf-8'))

    for year in only:
        names, kinds, made = build(year)
        book[str(year)] = made
        items = catalogue_entries(year, made)
        cat['papers'][str(year)] = {
            'year': year, 'source': 'ukmt.org.uk individual problems',
            'extended': False, 'legacy': True,
            'paperUrl': PAGE % year,
            'questions': items,
        }
        noq = [m['n'] for m in made if not m['q']]
        nos = [m['n'] for m in made if not m['s']]
        print('%d: %2d questions, %2d with solutions%s%s'
              % (year, len(items), sum(1 for i in items if i['s']),
                 '   no question image for Q%s' % noq if noq else '',
                 '   no solution for Q%s' % nos if nos else ''))

    cat['papers'] = {k: cat['papers'][k] for k in sorted(cat['papers'], key=int, reverse=True)}
    with open(cat_path, 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, separators=(',', ':'))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(book, f, indent=1, sort_keys=True)
    total = sum(len(v['questions']) for v in cat['papers'].values())
    print('\nTOTAL %d questions across %d papers' % (total, len(cat['papers'])))


if __name__ == '__main__':
    main()
