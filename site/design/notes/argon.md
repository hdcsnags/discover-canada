# Discover Canada — Civic Study UI/UX Proposal (`gemini` / Gemini 4 Argon)

## (a) Critique of the Current Design (5 Bullets)

- **Monolithic "wall of bullets" in `.focusbox` (`screenshots/chapter-step-phone.png`, `site/data/rights.json:63-75`)**: Sections with 10–11 focus points render as an unbroken beige block filling the 390 px phone viewport before prose begins. Tight `6px` spacing blends facts together, triggering working-memory overload for an ADHD/multilingual reader.
- **Semantic overload of crimson red (`site/css/app.css:10-15,139,154,203,253,286`)**: `--red` (`#c8102e` / `#ef4d5f`) is used simultaneously for brand identity, active navigation, primary CTAs, default `.progress > span` bars, `.toc a.current`, wrong answers, low timers, and destructive reset—conflating study progress with error states.
- **WCAG AA contrast failures and invisible 0% tracks (`site/css/app.css:3-21`, `screenshots/card-flipped.png`)**: In light mode, `--amber` (`#b4690e`) on `--amber-soft` (`#fcefd9`) is **3.88:1** (failing AA 4.5:1 in `.pill.amber` and `.focusbox h4`), `--btn-warn` (`#b4690e`) with `#fff` text on "Again" is **4.02:1**, and `--ink-3` (`#6e665e`) on `--bg-2` (`#f3ece2`) is **4.43:1**. Meanwhile, `--bg-2` on `--bg` is **1.08:1**, making empty `.progress` tracks nearly invisible.
- **Mobile overlay truncation, undersized tap targets, and SVG bugs (`screenshots/fix-overlay.png`, `site/css/app.css:235,239-242,346-352`)**: At 390 px, `.overlay-bar` crushes `.overlay-title` to `"Page ..."`, hiding the page number and chapter title. Additionally, `.pagelink` (`36px`) and `.btn.small` (`40px`) violate the ≥ 44 px tap-target floor, `.done-toggle .box` lacks an `svg` stroke rule for `icon.check`, and `:focus-visible` forces `border-radius: 6px` onto rounded buttons (`screenshots/card-flipped.png`).
- **Weak flashcard front/back contrast and XL crowding (`screenshots/fix-card-xl-dark.png`, `site/css/app.css:262-274`)**: In dark mode, `.face.back` looks nearly identical to `.face.front`, and at `data-size="xl"` on 390 px viewports, `.rate` button sublabels wrap awkwardly across three lines.

## (b) Palette Token Table & Rationale

Light mode pairs warm parchment (`#FAF7F2` / `#EFE9DF`) and `#FFFFFF` cards with deep charcoal ink (`#181615`), cutting glare while keeping card boundaries crisp. Dark mode uses cool slate-charcoal (`#121316` / `#21242B`) so elevated surfaces separate cleanly. Every foreground/surface pair passes WCAG AA (≥ 5.42:1):

| Token | Light | Dark | Role & Contrast |
| :--- | :--- | :--- | :--- |
| `--bg` | `#FAF7F2` | `#121316` | Canvas (`--ink` on `--bg`: **16.88:1** / **16.47:1**) |
| `--bg-2` | `#EFE9DF` | `#1B1D22` | Secondary surface (`--ink-3` on `--bg-2`: **6.03:1** / **6.19:1**) |
| `--card` | `#FFFFFF` | `#21242B` | Card surface (`--ink` on `--card`: **18.03:1** / **13.77:1**) |
| `--ink` | `#181615` | `#F4F1EA` | Primary text |
| `--ink-2` | `#4A433E` | `#C9C3B8` | Secondary text (**9.71:1** / **8.86:1** on `--card`) |
| `--ink-3` | `#5E554E` | `#A39C90` | Muted metadata (**7.28:1** / **5.71:1** on `--card`) |
| `--line` | `#DDD4C7` | `#343842` | Borders & hairlines |
| `--btn-primary` | `#B81D33` | `#C81E37` | Maple Red CTA (`#FFF`: **6.44:1** / **5.68:1**) |
| `--btn-good` | `#156D43` | `#18794B` | "Good" CTA (`#FFF`: **6.36:1** / **5.42:1**) |
| `--btn-warn` | `#995308` | `#9E5608` | "Again" CTA (`#FFF`: **5.84:1** / **5.54:1**) |
| `--red` / `--red-soft` | `#B0182D` / `#FCE8EB` | `#FF7585` / `#3B1A21` | Active nav, due pill, wrong state (**5.93:1** / **6.00:1**) |
| `--green` / `--green-soft` | `#146940` / `#E2F4EA` | `#5AD694` / `#163325` | Done state, correct answer, card back (**5.88:1** / **7.48:1**) |
| `--amber` / `--amber-soft` | `#8C4B06` / `#FDF0D5` | `#F7BC64` / `#382912` | Focus box & review badges (**5.95:1** / **8.25:1**) |
| `--blue` / `--blue-soft` | `#1B4F9C` / `#E5EFFB` | `#82B1FF` / `#1A2942` | Links, progress, active TOC, card front (**6.83:1** / **6.72:1**) |
| `--focus` | `#1B4F9C` | `#82B1FF` | `:focus-visible` ring |

## (c) Typography

Retains **Atkinson Hyperlegible** (`--font`) as default for disambiguated glyphs (crucial for reading constitutional terms in a fourth language) and **Source Serif 4** (`--font-serif`) for `blockquote` and serif mode. Uses fluid `clamp()` headings, `--measure: 62ch`, `1.68` line-height in `.reader p` (`1.15em` paragraph spacing), and `tabular-nums` on timers, counters, rings, and scores.

## (d) Layout and Spacing System

`main` centers at `760px` (`1100px` for `.wide`) with `minmax(0, 1fr)` grid tracks and `overflow-x: hidden` on `html, body` so 390 px viewports never scroll horizontally, even at `data-size="xl"`. Below `520px`, `.overlay-bar` promotes `.overlay-title` to a full-width top row (`order: -1; flex: 1 0 100%`) above the action buttons, restoring full page/chapter titles while keeping all tap targets `≥ 44px`. `.book .controls` receives a frosted toolbar card.

## (e) ADHD & Multilingual Learner Adaptations

1. **Micro-card chunking in `.focusbox`**: Cognitive-load research shows dense bullet lists cause visual crowding and skipping. Styling each `.focusbox li` as a bordered micro-card (`padding: 10px 12px 10px 28px`, `8px` gap) isolates each testable fact.
2. **Decoupling progress from error-red**: Default `.progress > span`, `.chapter-item .num`, and `.toc a.current` shift from `--red` to calm civic `--blue` (`--green` for mastery), reserving red for primary CTAs and wrong answers.
3. **Pre-attentive card-flip cues**: `.face.front` uses a `5px` top `--blue` stripe and blue `QUESTION` pill; `.face.back` uses a `5px` top `--green` stripe, green `ANSWER` pill, and sage-tinted surface.

## (f) Three Markup / Interaction Changes Beyond CSS

1. **Tappable checklist items in `.focusbox li`**: Toggle local checkmarks (`aria-checked`) on individual focus facts while reading.
2. **Inline civic glossary popovers**: Wrap terms like *royal assent* and *habeas corpus* in `<button class="term">` popovers.
3. **Milestone ticks on `.progress`**: Render discrete step markers (`1..N`) inside progress bars for time-blind learners.
