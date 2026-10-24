# Content brief — Discover Canada learning data

You are turning one or more chapters of the official *Discover Canada* citizenship study guide (2021 print of the 2012 edition) into structured learning data for a study app. The learner is an adult preparing for the Canadian citizenship test. The test is based ONLY on this booklet, so **every fact must come from the chapter text you are given**. Do not add outside knowledge. Do not invent dates, numbers or names.

## Input
Chapter text files under `C:\New folder\DiscoverCanada\work\chapters\<slug>.md`. Each file is the booklet text, one `<!-- page N -->` marker per booklet page. The text was extracted from the PDF, so photo captions, running headers ("Your Canadian Citizenship Study Guide", "Discover Canada"), and bare page numbers are interleaved with the prose. Reconstruct the prose in reading order; drop the running headers and bare page numbers; keep captions that carry facts as `caption` blocks.

Page images exist at `C:\New folder\DiscoverCanada\site\book\pNN.jpg` (booklet page N = pNN) if you need to check layout or reading order — the Read tool shows images.

## Output
One JSON file per chapter at `C:\New folder\DiscoverCanada\site\data\<slug>.json`, UTF-8, matching this schema exactly:

```json
{
  "id": "govern",
  "title": "How Canadians Govern Themselves",
  "order": 8,
  "pages": [28, 29],
  "summary": "One or two plain-English sentences saying what this chapter covers.",
  "sections": [
    {
      "id": "govern-federal-state",
      "title": "Federal state",
      "page": 28,
      "blocks": [
        {"type": "p", "text": "Paragraph text, booklet wording, as one paragraph."},
        {"type": "list", "items": ["item", "item"]},
        {"type": "quote", "text": "...", "who": "optional attribution"},
        {"type": "caption", "text": "Photo caption that carries a fact"},
        {"type": "table", "rows": [["Region", "Province", "Capital"], ["...", "...", "..."]]}
      ],
      "focus": [
        "Short key fact the test could ask, in booklet wording. 2 to 7 per section."
      ]
    }
  ],
  "cards": [
    {
      "id": "govern-c01",
      "section": "govern-federal-state",
      "front": "Question or prompt (one idea).",
      "back": "Answer in one or two short sentences, booklet wording.",
      "page": 28
    }
  ],
  "quiz": [
    {
      "id": "govern-q01",
      "section": "govern-federal-state",
      "q": "Multiple-choice question in the style of the official test.",
      "choices": ["A", "B", "C", "D"],
      "answer": 2,
      "why": "One sentence explaining the correct answer, quoting the booklet.",
      "page": 28
    }
  ]
}
```

Rules:
- `id` and `order`: use the values given in your assignment. Section ids are `<chapter-id>-<kebab-slug>`. Card ids `<chapter-id>-cNN`, quiz ids `<chapter-id>-qNN`, zero-padded, sequential.
- `blocks` must be a faithful transcription of the booklet prose in reading order. Fix hyphenation and line breaks from the PDF extraction; keep spelling, names and numbers exactly. Do not summarise, do not paraphrase, do not omit paragraphs. Keep the booklet's own sub-headings as section titles. If the chapter opens with text before any sub-heading, make a first section titled with the chapter name.
- `focus`: the facts a test question would target (dates, names, numbers, definitions, "first/largest/only" claims, lists like the three branches of government). Booklet wording, each ≤ 25 words.
- `cards`: cover every focus point at least once. Aim for one card per focus point, plus a card for any list the learner must reproduce (e.g. "Name four fundamental freedoms"). Front is a question; back is the answer. No "all of the above" style fronts.
- `quiz`: multiple choice with exactly 4 choices, exactly one correct, `answer` is the 0-based index of the correct choice. Distractors must be plausible and drawn from the same chapter where possible (other dates, other names). Vary which index is correct. Aim for roughly one question per two focus points, minimum 8 per chapter, 25+ for the history chapter.
- Monarch: the booklet text says "Queen Elizabeth II" / "Her Majesty". Transcribe it as written in `blocks`. In `focus`, `cards` and `quiz`, write "the Sovereign (King or Queen)" where the point is about the role, and never ask "who is the Queen of Canada". (The Sovereign has been King Charles III since 8 September 2022; the app shows this note once.)
- Numbers: use the booklet's figures even if dated (population "about 34 million", G8, NAFTA). The test follows the booklet.
- Plain, warm, direct English. No hype, no "as you can see". No markdown inside strings.
- Validate before you finish: run `python -X utf8 -c "import json;json.load(open(r'<path>',encoding='utf-8'))"` and fix any error. Check that every `section` referenced by a card or quiz item exists, and every `answer` index is in range.

## When done
Reply with: the files written, section count, card count, quiz count, and any passage you could not place or any fact that looked internally inconsistent in the booklet (do not fix the booklet; report it).
