# Council brief — Discover Canada study app, accuracy and UX audit

## Who is asking and why
Michael (the Conductor), in his words: "I want to take the discover canada booklet and turn it into an interactive/flash card based learning index instead. My girl has ADHD but she is really smart, taught herself english, speaks 4 languages, what I want to do is break this book down into actual learning data, the book itself should be referencable at any moment … A reading mode with some focus points or check marks as needed, but also a flash card mode and we can take the practice questions and ask them at the end of certain batches or sections, to make sure the right information is being retained … Interactive, beautiful easy to read UX, work on phones, tablets or laptops/PCs."

The concierge (Claude Mythos 5.1) extracted the booklet, had the chapter data written by content agents under `work/CONTENT_BRIEF.md`, and built the app. You are the independent check before it is published. The test is based only on the booklet, so a wrong card teaches a wrong fact.

## What to read
- `work/chapters/*.md` — the booklet text, per chapter, with `<!-- page N -->` markers. This is the ground truth.
- `site/data/*.json` — the learning data (sections/blocks, focus, cards, quiz). `site/data/official-questions.json` — the booklet's own study questions with model answers.
- `site/index.html`, `site/css/app.css`, `site/js/app.js` — the app (vanilla JS, hash router, localStorage).
- `work/CONTENT_BRIEF.md` — the rules the data was written to.
- `README.md`.

## Questions
Q1 (≤ 400 words) **Card and quiz accuracy.** Sample at least 40 cards and 30 quiz items across at least six chapters (include `history`, `regions`, `rights`, `govern`). For each sampled item, check the answer against the booklet text on the cited page. Report every item that is wrong, not supported by the booklet, ambiguous (two choices defensible), or where the cited `page` is wrong. Quote the item id and the booklet line. Count: sampled / wrong / unsupported / page-wrong.

Q2 (≤ 250 words) **Transcription fidelity.** For two chapters of your choice, compare `sections[].blocks` with the chapter text. Report dropped paragraphs, altered numbers or names, and sentences that are paraphrased rather than transcribed. Note the Queen → King convention (blocks keep the booklet's wording; cards and quiz say "the Sovereign (King or Queen)") and flag any card or quiz item that still asks who the Queen is.

Q3 (≤ 250 words) **Quiz quality.** Are distractors plausible? Any item where the correct answer is guessable from length or wording? Any "all of the above" / "NOT" overuse? Any question that tests trivia the booklet itself marks as not required (e.g. the Memorable Quotes page says those need not be learned)?

Q4 (≤ 300 words) **UX for an ADHD learner on a phone.** Read `app.js` and `app.css`. Judge: one thing at a time, clutter, session length, feedback, recovery from mistakes, progress visibility, text legibility, tap targets, dark mode, keyboard access. Name the three changes that would most help, and anything that would hurt.

Q5 (≤ 200 words) **Code defects.** Bugs you can see in `app.js` (routing, state, spaced-repetition logic, timer, localStorage import/export, service worker caching, XSS via data strings). Cite line numbers.

Q6 (≤ 100 words) **Ship?** `SHIP | SHIP_WITH_FIXES | HOLD`, with the fixes that gate shipping.

Ground every claim in the files. Read-only; do not modify anything. Begin with the model you are running as.
