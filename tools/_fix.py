import pathlib
p = pathlib.Path('tools/extract.py'); s = p.read_text(encoding='utf-8')

s = s.replace("    2013: ('jmc-2013-extended.pdf', None),",
              "    2013: ('jmc-2013-extended.pdf', None),\n    2014: ('jmc-2014-extended.pdf', None),")
s = s.replace("EXTENDED = {2011, 2012, 2013}", "EXTENDED = {2011, 2012, 2013, 2014}")

old = """def answers_marking_guide(doc):
    txt = doc[0].get_text()
    m = re.search(r'Quick Marking Guide(.{0,1200})', txt, re.S)
    seq = re.findall(r'\b([A-E])\b', m.group(1) if m else txt)
    return {i + 1: c for i, c in enumerate(seq[:25])}"""
new = """def answers_marking_guide(doc):
    txt = doc[0].get_text()
    m = re.search(r'Quick Marking Guide(.{0,1200})', txt, re.S)
    if not m:
        return {}
    seq = re.findall(r'\b([A-E])\b', m.group(1))
    return {i + 1: c for i, c in enumerate(seq[:25])}


def answers_from_solution_lines(ls, mk):
    \"\"\"Where an extended paper has no marking guide, the answer opens its
    worked solution: either 'Solution: D' or a 'D ...' line just below it.\"\"\"
    ans = {}
    for n, m in mk.items():
        i = m[6]
        for j in range(i + 1, len(ls)):
            t = ls[j][5]
            if j > i + 1 and re.match(r'^\d{1,2}[.)](?!\d)', t):
                break                      # ran on into the next question
            sol = re.match(r'^solution\b[:\s]*(.*)$', t, re.I)
            if not sol:
                continue
            inline = re.match(r'^([A-E])(\s|$)', sol.group(1).strip())
            if inline:
                ans[n] = inline.group(1)
            else:
                for k in range(j + 1, min(j + 3, len(ls))):
                    after = re.match(r'^([A-E])(\s|$)', ls[k][5])
                    if after:
                        ans[n] = after.group(1)
                        break
            break
    return ans"""
assert old in s; s = s.replace(old, new)

old = """    if year in EXTENDED:
        ans = answers_marking_guide(qdoc)"""
new = """    if year in EXTENDED:
        ans = answers_marking_guide(qdoc)
        if len(ans) < 25:
            ans = answers_from_solution_lines(qls, qmk)"""
assert old in s; s = s.replace(old, new)
p.write_text(s, encoding='utf-8')
print('ok')
