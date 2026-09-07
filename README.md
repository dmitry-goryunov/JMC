# JMC Practice

An offline-capable practice app for the UK Mathematics Trust's **Junior Mathematical
Challenge**, built from the published past papers in this repository.

**Open it here → https://dmitry-goryunov.github.io/JMC/**

375 questions from 15 papers (2011–2013, 2015–2026), each with the official answer and,
for 14 of the 15 years, the official worked solution.

## Using it on Android

1. Open <https://dmitry-goryunov.github.io/JMC/> in Chrome.
2. Menu (⋮) → **Add to Home screen**. It installs as a standalone app with its own icon.
3. On the home screen tap **Save everything for offline** (about 13 MB) and the whole
   question bank works with no connection — on a train, in the car, in an exam hall car park.

It is an ordinary web page, so it works the same on iOS (Share → Add to Home Screen),
on a laptop, or on an interactive whiteboard.

## What it does

Every set is on the clock, at the paper's own pace — the real 60 minutes for 135 marks,
pro rata. A full paper gets 60 minutes, the first 15 questions get 33, the last 10 get 27.
When time runs out the set is marked as it stands.

Nothing is marked while you answer. You work through a set, changing answers and jumping
about as you like, then tap **Mark** and the whole chunk is graded at once — the way a real
paper works. Only then do the verdicts and worked solutions appear. Marks follow the current
scheme: 5 for each of Q1–15, 6 for each of Q16–25, no penalty for a wrong answer.

You do not have to finish in one sitting. An unfinished set is saved as you go — every
answer, the question you were on, and the time left on the clock, which pauses while you are
away. The card shows how far you got and the button turns into **Resume**. Even a randomly
drawn mix comes back as the same ten questions.

**Continue** picks up a half you marked part way through, and brings those earlier answers
back with it, so you can see what you already did and change your mind before marking again.
A question you leave alone is not counted twice. **Redo**, on a half that is complete, starts
clean instead.

- **Past papers** — each paper splits into **First 15** (Q1–15) and **Last 10** (Q16–25),
  each timed, marked and tracked on its own, so the harder half can be drilled separately.
  Once a half has been marked its card shows the score, how long it took and the date;
  **Review** walks back through it with the worked solutions, untimed. Each year has its
  own **Reset**.
- **Timed mock** — the full 25-question paper against the full 60-minute clock.
- **Quick mix** — 10 random questions from any year.
- **Hard mix** — 10 random questions drawn only from Q16–25.
- **Practise mistakes** — replays the questions you have previously got wrong.
- A strip of question numbers shows at a glance what is answered, and after marking, what
  was right. Every original PDF is one tap away from the paper list.
- **Rough working** — a squared whiteboard fills the page below each question. Draw with a
  finger or a stylus; pen, eraser, undo and clear. Working is kept per question, so it is
  still there when you come back to it, and it survives closing the app.

Progress lives in the browser's local storage on the device. Nothing is uploaded, and
there is no account or tracking.

## How the questions were made

Questions are not retyped — `tools/extract.py` crops each one straight out of the source
PDF and renders it as a lossless WebP image, so diagrams, fractions and geometric figures
appear exactly as printed. The script:

- locates the `1.`–`25.` labels, using the enclosing text block's bounds so that a display
  fraction sitting above the question number is not clipped, and rejecting stray numbers
  in prose by their left-margin alignment;
- detects repeated headers and footers geometrically and keeps them out of the crops;
- stitches a question that straddles a page break into one image;
- reads the answer letter from the official solutions (or, for 2011–2013, from the
  extended solutions' Quick Marking Guide);
- checks each crop afterwards: all five options present, and no bleed into the next question.

Three quirks in the source files are handled specially:

| Year(s) | Quirk | Handling |
|---|---|---|
| 2011–2013 | Extended solutions: question and worked solution in one file | Question ends at the `Solution:` line, or at the framed panel (2013) |
| 2013 | Invisible duplicate solution text sits underneath the question panels | Panel geometry is used instead of the text |
| 2016 | Type 3 fonts with no unicode mapping — extracted text is a substitution cipher | Cipher recovered from the 1–25 numbering; the solutions file is too fragmented to crop, so that year links the solutions PDF instead |

To rebuild after adding a paper, add it to `PAPERS` in `tools/extract.py` and run:

```bash
python tools/extract.py
```

It needs PyMuPDF and Pillow, and writes `docs/assets/` and `docs/data/questions.json`.

## Layout

```
docs/                 the site published by GitHub Pages
  index.html app.js styles.css sw.js manifest.webmanifest
  data/questions.json answer key and image index
  assets/q assets/s  cropped question and solution images
  papers/            the source PDFs, renamed by year
tools/extract.py     PDF -> images + answer key
*.pdf                original UKMT downloads
```

## Credit

Papers and solutions are © UK Mathematics Trust and are reproduced here for personal
revision. The originals, and much more, are at
[ukmt.org.uk](https://www.ukmt.org.uk/competition-papers). This is an unofficial revision
aid and is not affiliated with or endorsed by the UKMT.
