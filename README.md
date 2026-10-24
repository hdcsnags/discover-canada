# Discover Canada — Study

An interactive study app for the Canadian citizenship test, built from the official
*Discover Canada: The Rights and Responsibilities of Citizenship* study guide.

Built for one learner first, shared for anyone preparing for the test. Works on phones,
tablets and laptops, installs as an app (PWA), and keeps working offline once opened.

## What it does

- **Learn** — the booklet, chapter by chapter, one short section at a time. Each section opens
  with "What to remember" (the facts a test question would target), keeps the booklet's own
  wording, and can be ticked off when known. Every section links to its booklet page.
- **Cards** — 450+ flash cards with spaced repetition (Again / Hard / Good; six levels).
  "Due today" collects cards across chapters; each chapter has its own deck.
- **Quiz** — a quiz per chapter with explanations and page links, a **mock test** that matches the
  real one (20 questions, 45 minutes, 15 to pass), and the booklet's own study questions
  (pages 52–53) with model answers.
- **Booklet** — all 68 pages as images, with chapter jumps, keyboard and swipe navigation, and
  the PDF one tap away. Every card and question points back to its page.
- **Settings** — light/dark, four text sizes, three fonts (Atkinson Hyperlegible by default),
  animations off, whole-chapter reading mode, and a progress code to move progress between devices.

## Data

`site/data/<chapter>.json` — one file per chapter: faithful transcription of the booklet prose
(`sections[].blocks`), focus points, flash cards and multiple-choice questions, each with the
booklet page it comes from. `site/data/official-questions.json` holds the booklet's own study
questions. `site/data/index.json` lists chapters and the official test facts (with the date they
were checked against canada.ca).

`work/` holds the extraction pipeline: `extract.py` (PyMuPDF: page text + page images),
`CONTENT_BRIEF.md` (the rules the content was written to), `validate.py` (schema checks, run in CI),
and headless-Chrome screenshot/interaction scripts.

The booklet is the 2021 print of the 2012 edition. One fact changed after printing: since
8 September 2022 the Sovereign is King Charles III. The app shows this once on the home page and
phrases questions about the role as "the Sovereign (King or Queen)".

## Run locally

Any static server works:

```
cd site
python -m http.server 8765
```

Then open http://127.0.0.1:8765/.

## Deploy

Pushes to `main` deploy `site/` to GitHub Pages through `.github/workflows/pages.yml`.

## Content and credit

*Discover Canada: The Rights and Responsibilities of Citizenship* is published by Immigration,
Refugees and Citizenship Canada. Text and page images are reproduced here for personal study.
The official guide, including the current online edition and audio version, is at
https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada.html.
