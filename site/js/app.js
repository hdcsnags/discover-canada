/* Discover Canada — Study. Single-file app: router, data, learn / cards / quiz / book / settings. */
(function () {
  'use strict';

  // ---------- storage ----------
  const LS_PROGRESS = 'dc.progress.v1';
  const LS_SETTINGS = 'dc.settings';
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per Leitner box

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }

  const settings = Object.assign({ theme: 'auto', size: 'normal', font: 'default', motion: 'on', readMode: 'step' }, load(LS_SETTINGS, {}));
  const progress = Object.assign({ sections: {}, cards: {}, quiz: {}, mock: [], last: null }, load(LS_PROGRESS, {}));
  function saveProgress() { save(LS_PROGRESS, progress); }
  function saveSettings() { save(LS_SETTINGS, settings); applySettings(); }
  function applySettings() {
    const r = document.documentElement;
    settings.theme === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', settings.theme);
    settings.size === 'normal' ? r.removeAttribute('data-size') : r.setAttribute('data-size', settings.size);
    settings.font === 'default' ? r.removeAttribute('data-font') : r.setAttribute('data-font', settings.font);
    settings.motion === 'off' ? r.setAttribute('data-motion', 'off') : r.removeAttribute('data-motion');
  }

  // ---------- data ----------
  const data = { index: null, chapters: [], byId: {}, official: null, cards: [], quiz: [] };
  async function loadData() {
    if (data.index) return data;
    const idx = await (await fetch('data/index.json')).json();
    data.index = idx;
    const files = await Promise.all(idx.chapters.map((c) => fetch('data/' + c.file).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    data.chapters = files.filter(Boolean).sort((a, b) => a.order - b.order);
    data.chapters.forEach((ch) => {
      data.byId[ch.id] = ch;
      (ch.cards || []).forEach((c) => { c.chapter = ch.id; data.cards.push(c); });
      (ch.quiz || []).forEach((q) => { q.chapter = ch.id; data.quiz.push(q); });
    });
    try { data.official = await (await fetch('data/' + idx.official)).json(); } catch (e) { data.official = null; }
    return data;
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const icon = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
  };
  let toastTimer = null;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800);
  }
  function pageLink(page, label) {
    return `<a class="pagelink" href="#/book/${page}" title="Open booklet page ${page}">${icon.book} ${esc(label || 'Booklet p.' + page)}</a>`;
  }
  function sectionDone(sectionId) { return !!progress.sections[sectionId]; }
  function chapterStats(ch) {
    const total = ch.sections.length;
    const done = ch.sections.filter((s) => sectionDone(s.id)).length;
    const q = progress.quiz[ch.id];
    return { total, done, pct: pct(done, total), quizBest: q ? q.best : null, quizTotal: q ? q.total : null };
  }
  function cardState(id) { return progress.cards[id] || { box: 0, due: 0, seen: 0 }; }
  function cardsDue(cards, now) { return cards.filter((c) => cardState(c.id).due <= now); }
  function cardsLearned(cards) { return cards.filter((c) => cardState(c.id).box >= 3).length; }

  // ---------- router ----------
  const app = $('#app');
  const routes = [];
  function route(pattern, handler) { routes.push({ pattern, handler }); }
  function navigate(hash) { location.hash = hash; }
  let cleanup = null;
  async function render() {
    if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    const top = parts[0] || 'home';
    $$('.tabbar a, .topbar .navlink').forEach((a) => {
      const t = a.getAttribute('href').replace('#/', '');
      if ((t === top) || (t === '' && top === 'home')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    app.innerHTML = '<div class="empty">Loading…</div>';
    try {
      await loadData();
      for (const r of routes) {
        const m = r.pattern.exec(hash);
        if (m) { const out = await r.handler(...m.slice(1)); if (typeof out === 'function') cleanup = out; window.scrollTo({ top: 0 }); return; }
      }
      app.innerHTML = '<div class="empty">Page not found. <a href="#/">Go home</a></div>';
    } catch (err) {
      app.innerHTML = `<div class="empty">Something went wrong loading the study data.<br><span class="small">${esc(err.message)}</span></div>`;
    }
  }
  window.addEventListener('hashchange', render);

  // ---------- HOME ----------
  route(/^\/$/, () => {
    const chapters = data.chapters;
    const totalSections = chapters.reduce((n, c) => n + c.sections.length, 0);
    const doneSections = chapters.reduce((n, c) => n + chapterStats(c).done, 0);
    const learned = cardsLearned(data.cards);
    const due = cardsDue(data.cards, Date.now()).length;
    const bestMock = progress.mock.length ? Math.max(...progress.mock.map((m) => m.score)) : null;
    const t = data.index.test;
    const last = progress.last;
    const lastCh = last && data.byId[last.chapter];
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Your path to the citizenship test</h1>
        <p class="lead">Everything on the test comes from the official <em>Discover Canada</em> booklet. Read a chapter, flip the cards, then quiz yourself. Small steps, every day.</p>
        ${lastCh ? `<a class="card link" href="#/learn/${lastCh.id}/${last.section}"><div class="row" style="justify-content:space-between"><div><div class="small muted">Continue where you left off</div><div style="font-weight:700;font-size:1.1rem">${esc(lastCh.title)}</div><div class="small muted">${esc(lastCh.sections[last.section] ? lastCh.sections[last.section].title : '')}</div></div><span class="btn primary">Continue ${icon.next}</span></div></a>` : ''}
        <div class="card" style="margin-top:12px">
          <div class="stats">
            <div class="stat"><b>${pct(doneSections, totalSections)}%</b><span>sections read</span></div>
            <div class="stat"><b>${learned}<span class="muted" style="font-size:1rem">/${data.cards.length}</span></b><span>cards learned</span></div>
            <div class="stat"><b>${bestMock == null ? '—' : bestMock + '/20'}</b><span>best mock test</span></div>
          </div>
          <div class="progress" style="margin-top:14px"><span style="width:${pct(doneSections, totalSections)}%"></span></div>
        </div>
        <div class="grid two" style="margin-top:12px">
          <a class="card link" href="#/learn"><div class="row"><span class="pill red">Learn</span></div><div style="font-weight:700;margin-top:8px;font-size:1.1rem">Read the booklet, one section at a time</div><div class="small muted">12 chapters · focus points · tick off what you know</div></a>
          <a class="card link" href="#/cards/due"><div class="row"><span class="pill amber">Cards</span>${due ? `<span class="pill">${due} due</span>` : ''}</div><div style="font-weight:700;margin-top:8px;font-size:1.1rem">Flash cards with spaced repetition</div><div class="small muted">Rate each card; the app brings back the hard ones</div></a>
          <a class="card link" href="#/quiz"><div class="row"><span class="pill green">Quiz</span></div><div style="font-weight:700;margin-top:8px;font-size:1.1rem">Chapter quizzes and a timed mock test</div><div class="small muted">20 questions · 45 minutes · 15 to pass, like the real one</div></a>
          <a class="card link" href="#/book"><div class="row"><span class="pill blue">Booklet</span></div><div style="font-weight:700;margin-top:8px;font-size:1.1rem">The full official booklet, page by page</div><div class="small muted">Every card and question links back to its page</div></a>
        </div>
        <h2 class="h2">About the real test</h2>
        <div class="card flat">
          <ul style="margin:0;padding-left:1.2em">
            <li><b>${t.questions} questions</b>, ${esc(t.format)}.</li>
            <li><b>${t.minutes} minutes</b>. You need <b>${t.pass} of ${t.questions}</b> correct to pass.</li>
            <li>You get <b>${t.chances} chances</b> to pass. Ages ${esc(t.ages)} take it, in ${esc(t.languages)}.</li>
            <li>All questions come from the <em>Discover Canada</em> guide. <a href="${esc(t.source)}" target="_blank" rel="noopener">Official page</a> (checked ${esc(t.verified)}).</li>
          </ul>
        </div>
        <div class="note" style="margin-top:16px"><b>One update since this booklet was printed:</b> since 8 September 2022 Canada's Sovereign is <b>King Charles III</b>. The booklet still says Queen Elizabeth II; the official online guide now says King Charles III, and the Oath names him. Where a question is about the role, think "the Sovereign (King or Queen)".</div>
        <p class="small muted">More help: <a href="#/resources">official links and practice tests</a> · <a href="#/settings">text size, theme, progress backup</a></p>
      </section>`;
  });

  // ---------- LEARN: chapter list ----------
  route(/^\/learn$/, () => {
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Learn</h1>
        <p class="lead">Each chapter is split into short sections. Read one, check the focus points, tick it off. Then quiz the chapter.</p>
        <div class="grid">
          ${data.chapters.map((ch) => {
            const s = chapterStats(ch);
            return `<a class="card link chapter-item" href="#/learn/${ch.id}">
              <div class="num">${ch.order}</div>
              <div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${s.total} section${s.total === 1 ? '' : 's'} · pages ${ch.pages[0]}${ch.pages.length > 1 ? '–' + ch.pages[ch.pages.length - 1] : ''}${s.quizBest != null ? ` · quiz best ${s.quizBest}/${s.quizTotal}` : ''}</div>
              <div class="progress green" style="margin-top:8px"><span style="width:${s.pct}%"></span></div></div>
              <div class="ring" style="--p:${s.pct}"><span>${s.pct === 100 ? '✓' : s.pct + '%'}</span></div>
            </a>`;
          }).join('')}
        </div>
      </section>`;
  });

  // ---------- LEARN: chapter + section ----------
  function renderBlocks(blocks) {
    return (blocks || []).map((b) => {
      if (b.type === 'p') return `<p>${esc(b.text)}</p>`;
      if (b.type === 'list') return `<ul>${(b.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      if (b.type === 'quote') return `<blockquote>${esc(b.text)}${b.who ? `<cite>— ${esc(b.who)}</cite>` : ''}</blockquote>`;
      if (b.type === 'caption') return `<div class="caption"><span>${esc(b.text)}</span></div>`;
      if (b.type === 'table') {
        const rows = b.rows || []; if (!rows.length) return '';
        return `<table><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      if (b.type === 'h') return `<h3 class="h3">${esc(b.text)}</h3>`;
      return '';
    }).join('');
  }
  function renderSection(ch, sec, i) {
    const done = sectionDone(sec.id);
    return `
      <article class="reader" data-section="${esc(sec.id)}">
        <div class="section-head"><h2>${esc(sec.title)}</h2>${pageLink(sec.page)}</div>
        ${sec.focus && sec.focus.length ? `<div class="focusbox"><h4>What to remember</h4><ul>${sec.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
        ${renderBlocks(sec.blocks)}
        <button class="done-toggle" data-done="${esc(sec.id)}" aria-pressed="${done}"><span class="box">${done ? icon.check : ''}</span><span>${done ? 'Done — I know this section' : 'Mark this section as done'}</span></button>
      </article>`;
  }
  route(/^\/learn\/([a-z-]+)(?:\/(\d+))?$/, (chId, secIdx) => {
    const ch = data.byId[chId]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; }
    const stepMode = settings.readMode !== 'all';
    let i = Math.min(parseInt(secIdx || '0', 10) || 0, ch.sections.length - 1);
    progress.last = { chapter: ch.id, section: i }; saveProgress();
    const s = chapterStats(ch);
    const nextCh = data.chapters.find((c) => c.order === ch.order + 1);
        app.innerHTML = `
      <section class="fade-in">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <a class="btn ghost" href="#/learn">${icon.back} All chapters</a>
          <div class="row"><button class="btn ghost small" data-readmode>${stepMode ? 'Show whole chapter' : 'One section at a time'}</button></div>
        </div>
        <div class="small muted">Chapter ${ch.order} · pages ${ch.pages[0]}–${ch.pages[ch.pages.length - 1]}</div>
        <h1 class="h1">${esc(ch.title)}</h1>
        ${ch.summary ? `<p class="lead">${esc(ch.summary)}</p>` : ''}
        <div class="progress green" style="margin:0 0 16px"><span style="width:${s.pct}%"></span></div>
        <details class="tocwrap" ${stepMode ? '' : 'open'}><summary><span>${stepMode ? `Section ${i + 1} of ${ch.sections.length}` : 'Sections'}</span><span class="small muted">${s.done}/${s.total} done</span></summary>
        <nav class="toc" aria-label="Sections in this chapter">
          ${ch.sections.map((sec, k) => `<a href="#/learn/${ch.id}/${k}" class="${sectionDone(sec.id) ? 'done' : ''} ${stepMode && k === i ? 'current' : ''}" data-toc="${k}"><span class="check">${sectionDone(sec.id) ? '✓' : ''}</span><span>${esc(sec.title)}</span><span class="spacer" style="flex:1"></span><span class="small muted">p.${sec.page}</span></a>`).join('')}
        </nav></details>
        <div id="sections">
          ${stepMode ? renderSection(ch, ch.sections[i], i) : ch.sections.map((sec, k) => renderSection(ch, sec, k)).join('<hr style="border:0;border-top:1px solid var(--line);margin:28px 0">')}
        </div>
        <div class="stepper">
          ${stepMode && i > 0 ? `<a class="btn" href="#/learn/${ch.id}/${i - 1}">${icon.back} Previous</a>` : '<span></span>'}
          ${stepMode && i < ch.sections.length - 1 ? `<a class="btn primary" href="#/learn/${ch.id}/${i + 1}">Next section ${icon.next}</a>` : `<a class="btn primary" href="#/quiz/${ch.id}">Quiz this chapter ${icon.next}</a>`}
        </div>
        ${(!stepMode || i === ch.sections.length - 1) ? `<div class="row" style="margin-top:14px;justify-content:center"><a class="btn" href="#/cards/${ch.id}">Flash cards for this chapter</a>${nextCh ? `<a class="btn ghost" href="#/learn/${nextCh.id}">Next chapter: ${esc(nextCh.title)} ${icon.next}</a>` : ''}</div>` : ''}
      </section>`;
    const onClick = (e) => {
      const d = e.target.closest('[data-done]');
      if (d) {
        const id = d.getAttribute('data-done');
        if (progress.sections[id]) delete progress.sections[id]; else progress.sections[id] = Date.now();
        saveProgress();
        const done = sectionDone(id);
        d.setAttribute('aria-pressed', String(done));
        d.innerHTML = `<span class="box">${done ? icon.check : ''}</span><span>${done ? 'Done — I know this section' : 'Mark this section as done'}</span>`;
        const st = chapterStats(ch);
        const bar = $('.progress.green > span'); if (bar) bar.style.width = st.pct + '%';
        const toc = $(`[data-toc="${ch.sections.findIndex((x) => x.id === id)}"]`);
        if (toc) { toc.classList.toggle('done', done); toc.querySelector('.check').textContent = done ? '✓' : ''; }
        if (done) toast(st.done === st.total ? 'Chapter complete!' : 'Nice. Keep going.');
        return;
      }
      if (e.target.closest('[data-readmode]')) { settings.readMode = stepMode ? 'all' : 'step'; saveSettings(); render(); }
    };
    app.addEventListener('click', onClick);
    return () => app.removeEventListener('click', onClick);
  });

  // ---------- CARDS: picker ----------
  route(/^\/cards$/, () => {
    const now = Date.now();
    const dueAll = cardsDue(data.cards, now).length;
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Flash cards</h1>
        <p class="lead">Tap a card to flip it. Then rate yourself: <b>Again</b> brings it back this session, <b>Hard</b> tomorrow, <b>Good</b> in a few days. Cards you know well come back less often.</p>
        <a class="card link" href="#/cards/due"><div class="row" style="justify-content:space-between"><div><div style="font-weight:700;font-size:1.1rem">Due today</div><div class="small muted">${dueAll ? `${dueAll} card${dueAll === 1 ? '' : 's'} ready across all chapters` : 'Nothing due. Pick a chapter below to learn new cards.'}</div></div><span class="pill ${dueAll ? 'red' : ''}">${dueAll}</span></div></a>
        <h2 class="h2">By chapter</h2>
        <div class="grid">
          ${data.chapters.map((ch) => {
            const cards = ch.cards || []; const learned = cardsLearned(cards); const due = cardsDue(cards, now).length;
            return `<a class="card link chapter-item" href="#/cards/${ch.id}"><div class="num">${ch.order}</div><div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${cards.length} cards · ${learned} learned${due ? ` · ${due} due` : ''}</div><div class="progress green" style="margin-top:8px"><span style="width:${pct(learned, cards.length)}%"></span></div></div></a>`;
          }).join('')}
        </div>
        <div class="row" style="margin-top:16px"><a class="btn" href="#/cards/all">${icon.shuffle} Shuffle every card</a></div>
      </section>`;
  });

  // ---------- CARDS: session ----------
  route(/^\/cards\/([a-z-]+)$/, (scope) => {
    const now = Date.now();
    let pool, title;
    if (scope === 'due') { pool = cardsDue(data.cards, now); title = 'Due today'; }
    else if (scope === 'all') { pool = data.cards; title = 'All cards'; }
    else { const ch = data.byId[scope]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; } pool = ch.cards || []; title = ch.title; }
    if (scope !== 'due' && scope !== 'all') {
      // chapter session: due cards first, then the rest (so new cards are learned in order)
      const due = cardsDue(pool, now); const rest = pool.filter((c) => !due.includes(c));
      pool = shuffle(due).concat(rest);
    } else pool = shuffle(pool);
    if (!pool.length) { app.innerHTML = `<section class="fade-in"><a class="btn ghost" href="#/cards">${icon.back} Cards</a><div class="empty">No cards are due right now. Come back tomorrow, or <a href="#/cards/all">shuffle every card</a>.</div></section>`; return; }
    const queue = pool.slice(); let current = null; let flipped = false; let doneCount = 0; const total = queue.length; let again = 0;
    const chOf = (c) => data.byId[c.chapter];
    function draw() {
      current = queue.shift(); flipped = false;
      if (!current) { finish(); return; }
      app.innerHTML = `
        <section class="fade-in">
          <div class="row" style="justify-content:space-between"><a class="btn ghost" href="#/cards">${icon.back} ${esc(title)}</a><span class="small muted">${esc(chOf(current).title)}</span></div>
          <div class="counter"><span>Card ${Math.min(doneCount + 1, total)} of ${total}${again ? ` · ${again} to repeat` : ''}</span><span class="small">level ${cardState(current.id).box + 1}/${INTERVALS.length}</span></div>
          <div class="progress"><span style="width:${pct(doneCount, total)}%"></span></div>
          <div class="deck" style="margin-top:16px">
            <button class="flashcard" id="fc" aria-label="Flash card. Press to flip.">
              <div class="face front"><div class="label">Question</div><div class="text">${esc(current.front)}</div><div class="foot"><span>Tap to reveal</span><span>p.${current.page}</span></div></div>
              <div class="face back"><div class="label">Answer</div><div class="text">${esc(current.back)}</div><div class="foot"><span>${esc(chOf(current).title)}</span><span>p.${current.page}</span></div></div>
            </button>
          </div>
          <div class="rate" id="rate" hidden>
            <button class="btn warn" data-rate="again">Again<small>see it again soon</small></button>
            <button class="btn" data-rate="hard">Hard<small>tomorrow</small></button>
            <button class="btn good" data-rate="good">Good<small>in ${INTERVALS[Math.min(cardState(current.id).box + 1, INTERVALS.length - 1)]} days</small></button>
          </div>
          <div class="row" style="justify-content:center;margin-top:14px">${pageLink(current.page, 'See this in the booklet')}</div>
          <p class="small muted" style="text-align:center;margin-top:16px"><kbd>Space</kbd> flip · <kbd>1</kbd> again · <kbd>2</kbd> hard · <kbd>3</kbd> good</p>
        </section>`;
    }
    function flip() { const fc = $('#fc'); if (!fc) return; flipped = !flipped; fc.classList.toggle('flipped', flipped); $('#rate').hidden = !flipped; }
    function rate(kind) {
      if (!current || !flipped) return;
      const st = cardState(current.id); st.seen = (st.seen || 0) + 1;
      if (kind === 'again') { st.box = 0; st.due = Date.now(); queue.push(current); again++; }
      else if (kind === 'hard') { st.box = Math.max(0, st.box); st.due = Date.now() + DAY; doneCount++; }
      else { st.box = Math.min(INTERVALS.length - 1, st.box + 1); st.due = Date.now() + INTERVALS[st.box] * DAY; doneCount++; }
      progress.cards[current.id] = st; saveProgress();
      if (kind === 'again' && again > 0) { /* repeated card counts when finally rated */ }
      if (kind !== 'again' && again > 0 && queue.length && queue[0] === current) { /* noop */ }
      if (kind !== 'again' && again > 0) again = Math.max(0, again - (queue.includes(current) ? 0 : 0));
      draw();
    }
    function finish() {
      app.innerHTML = `
        <section class="fade-in">
          <a class="btn ghost" href="#/cards">${icon.back} Cards</a>
          <div class="card" style="text-align:center;margin-top:12px"><div class="score">✓</div><div style="font-weight:700;font-size:1.2rem">Session complete</div><p class="muted">${total} cards reviewed. The hard ones will come back sooner.</p>
          <div class="row" style="justify-content:center"><a class="btn primary" href="#/cards/${scope}">Go again</a><a class="btn" href="#/quiz${scope !== 'due' && scope !== 'all' ? '/' + scope : ''}">Quiz</a></div></div>
        </section>`;
    }
    const onClick = (e) => { if (e.target.closest('#fc')) flip(); const r = e.target.closest('[data-rate]'); if (r) rate(r.getAttribute('data-rate')); };
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') { if (!e.target.closest('a,button') || e.target.id === 'fc') { e.preventDefault(); flip(); } }
      if (e.key === '1') rate('again'); if (e.key === '2') rate('hard'); if (e.key === '3') rate('good');
    };
    app.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    draw();
    return () => { app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  });

  // ---------- QUIZ: picker ----------
  route(/^\/quiz$/, () => {
    const t = data.index.test;
    const lastMock = progress.mock[progress.mock.length - 1];
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Quiz</h1>
        <p class="lead">Chapter quizzes check that the facts stuck. The mock test feels like the real thing: ${t.questions} questions, ${t.minutes} minutes, ${t.pass} to pass.</p>
        <a class="card link" href="#/quiz/mock"><div class="row" style="justify-content:space-between"><div><div style="font-weight:700;font-size:1.1rem">Mock citizenship test</div><div class="small muted">${progress.mock.length ? `${progress.mock.length} attempt${progress.mock.length === 1 ? '' : 's'} · last ${lastMock.score}/${t.questions} (${lastMock.score >= t.pass ? 'pass' : 'not yet'})` : 'Random questions from every chapter, timed'}</div></div><span class="btn primary">Start</span></div></a>
        ${data.official ? `<a class="card link" href="#/quiz/official" style="margin-top:12px"><div style="font-weight:700;font-size:1.1rem">The booklet's own study questions</div><div class="small muted">${data.official.mcq.length} sample questions and ${data.official.short.length} questions to answer in your own words (pages 52–53)</div></a>` : ''}
        <h2 class="h2">By chapter</h2>
        <div class="grid">
          ${data.chapters.map((ch) => { const q = progress.quiz[ch.id]; const n = (ch.quiz || []).length; return `<a class="card link chapter-item" href="#/quiz/${ch.id}"><div class="num">${ch.order}</div><div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${n} questions${q ? ` · best ${q.best}/${q.total} · ${q.attempts} attempt${q.attempts === 1 ? '' : 's'}` : ''}</div></div>${q ? `<span class="pill ${pct(q.best, q.total) >= 75 ? 'green' : 'amber'}">${pct(q.best, q.total)}%</span>` : ''}</a>`; }).join('')}
        </div>
      </section>`;
  });

  // ---------- QUIZ: run ----------
  function runQuiz(opts) {
    // opts: {title, questions, backHref, timed(minutes), passMark, onFinish(score,total,answers), kind}
    const qs = opts.questions; let i = 0; let answered = null; const answers = []; let timeLeft = opts.timed ? opts.timed * 60 : null; let timer = null;
    const letters = ['A', 'B', 'C', 'D', 'E'];
    function fmt(s) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }
    function draw() {
      const q = qs[i]; const ch = data.byId[q.chapter];
      app.innerHTML = `
        <section class="fade-in">
          <div class="row" style="justify-content:space-between"><a class="btn ghost" href="${opts.backHref}">${icon.back} ${esc(opts.title)}</a>${timeLeft != null ? `<span class="timer" id="timer">${fmt(timeLeft)}</span>` : `<span class="small muted">${ch ? esc(ch.title) : ''}</span>`}</div>
          <div class="counter"><span>Question ${i + 1} of ${qs.length}</span><span>${answers.filter((a) => a.correct).length} correct so far</span></div>
          <div class="progress"><span style="width:${pct(i, qs.length)}%"></span></div>
          <h2 class="h2" style="margin-top:18px">${esc(q.q)}</h2>
          <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-choice="${k}"><span class="key">${letters[k]}</span><span>${esc(c)}</span></button>`).join('')}</div>
          <div id="explain"></div>
          <div class="stepper"><span></span><button class="btn primary" id="next" hidden>${i + 1 < qs.length ? 'Next' : 'See results'} ${icon.next}</button></div>
          <p class="small muted" style="text-align:center;margin-top:12px"><kbd>1</kbd>–<kbd>${q.choices.length}</kbd> answer · <kbd>Enter</kbd> next</p>
        </section>`;
    }
    function choose(k) {
      if (answered != null) return; const q = qs[i]; answered = k; const correct = k === q.answer;
      answers.push({ id: q.id, q: q.q, chosen: q.choices[k], right: q.choices[q.answer], correct, why: q.why, page: q.page, chapter: q.chapter });
      $$('.choice').forEach((b, idx) => { b.disabled = true; if (idx === q.answer) b.dataset.state = 'correct'; else if (idx === k) b.dataset.state = 'wrong'; });
      if (!opts.timed) $('#explain').innerHTML = `<div class="explain ${correct ? 'ok' : 'bad'}"><b>${correct ? 'Correct.' : 'Not quite — the answer is ' + esc(letters[q.answer]) + '.'}</b>${esc(q.why || '')} <span style="white-space:nowrap">${pageLink(q.page)}</span></div>`;
      $('#next').hidden = false; $('#next').focus();
    }
    function next() { if (answered == null) return; answered = null; i++; if (i >= qs.length) finish(); else draw(); }
    function finish() {
      if (timer) clearInterval(timer); timer = null;
      const score = answers.filter((a) => a.correct).length; const total = qs.length;
      opts.onFinish(score, total, answers);
      const passed = opts.passMark != null ? score >= opts.passMark : pct(score, total) >= 75;
      const wrong = answers.filter((a) => !a.correct);
      app.innerHTML = `
        <section class="fade-in">
          <a class="btn ghost" href="${opts.backHref}">${icon.back} ${esc(opts.title)}</a>
          <div class="card" style="text-align:center;margin-top:12px">
            <div class="score" style="color:${passed ? 'var(--green)' : 'var(--amber)'}">${score}/${total}</div>
            <div style="font-weight:700;font-size:1.2rem">${passed ? (opts.passMark != null ? 'That is a pass.' : 'Strong. You know this chapter.') : (opts.passMark != null ? `Not yet — you need ${opts.passMark}.` : 'Keep going — review the ones you missed.')}</div>
            ${timeLeft != null ? `<div class="small muted">Finished with ${fmt(Math.max(0, timeLeft))} left</div>` : ''}
            <div class="row" style="justify-content:center;margin-top:12px">${wrong.length ? `<button class="btn primary" id="retry-wrong">Retry the ${wrong.length} missed</button>` : ''}<a class="btn" href="${esc(opts.retryHref || opts.backHref)}">Try again</a></div>
          </div>
          ${wrong.length ? `<h2 class="h2">Review</h2><div class="card flat">${wrong.map((a) => `<div class="review-item"><div class="q">${esc(a.q)}</div><div class="small" style="color:var(--red)">You chose: ${esc(a.chosen)}</div><div class="small" style="color:var(--green)">Answer: ${esc(a.right)}</div><div class="small muted" style="margin-top:4px">${esc(a.why || '')} ${pageLink(a.page)}</div></div>`).join('')}</div>` : '<p class="muted" style="text-align:center">Nothing missed. Well done.</p>'}
        </section>`;
      const rw = $('#retry-wrong');
      if (rw) rw.addEventListener('click', () => { const ids = new Set(wrong.map((a) => a.id)); runQuiz(Object.assign({}, opts, { questions: shuffle(qs.filter((q) => ids.has(q.id))), timed: null, passMark: null, title: opts.title })); });
    }
    const onClick = (e) => { const c = e.target.closest('[data-choice]'); if (c) choose(parseInt(c.getAttribute('data-choice'), 10)); if (e.target.closest('#next')) next(); };
    const onKey = (e) => { if (e.target.tagName === 'INPUT') return; const n = parseInt(e.key, 10); if (n >= 1 && n <= (qs[i] ? qs[i].choices.length : 0) && answered == null) choose(n - 1); if (e.key === 'Enter' && answered != null) { e.preventDefault(); next(); } };
    app.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    if (timeLeft != null) timer = setInterval(() => { timeLeft--; const t = $('#timer'); if (t) { t.textContent = fmt(timeLeft); t.classList.toggle('low', timeLeft <= 300); } if (timeLeft <= 0) { if (answered == null && qs[i]) answers.push({ id: qs[i].id, q: qs[i].q, chosen: '(no answer)', right: qs[i].choices[qs[i].answer], correct: false, why: qs[i].why, page: qs[i].page, chapter: qs[i].chapter }); finish(); } }, 1000);
    draw();
    cleanup = () => { app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); if (timer) clearInterval(timer); };
  }
  route(/^\/quiz\/mock$/, () => {
    const t = data.index.test;
    app.innerHTML = `
      <section class="fade-in">
        <a class="btn ghost" href="#/quiz">${icon.back} Quiz</a>
        <h1 class="h1">Mock citizenship test</h1>
        <p class="lead">${t.questions} random questions from every chapter. ${t.minutes} minutes on the clock. You need ${t.pass} right to pass. No hints until the end, like the real test.</p>
        ${progress.mock.length ? `<div class="card flat" style="margin-bottom:14px"><b>Your attempts</b><div class="row" style="margin-top:6px">${progress.mock.slice(-8).map((m) => `<span class="pill ${m.score >= t.pass ? 'green' : 'amber'}">${m.score}/${m.total}</span>`).join('')}</div></div>` : ''}
        <button class="btn primary block" id="start">Start the ${t.minutes}-minute test</button>
      </section>`;
    $('#start').addEventListener('click', () => {
      // stratified sample: at least one from each chapter, rest random
      const perChapter = data.chapters.map((ch) => shuffle(ch.quiz || [])[0]).filter(Boolean);
      const rest = shuffle(data.quiz.filter((q) => !perChapter.includes(q))).slice(0, Math.max(0, t.questions - perChapter.length));
      const qs = shuffle(perChapter.concat(rest)).slice(0, t.questions);
      runQuiz({ title: 'Mock test', questions: qs, backHref: '#/quiz', retryHref: '#/quiz/mock', timed: t.minutes, passMark: t.pass, onFinish: (score, total) => { progress.mock.push({ score, total, at: Date.now() }); saveProgress(); } });
    });
  });
  route(/^\/quiz\/official$/, () => {
    const o = data.official; if (!o) { app.innerHTML = '<div class="empty">Official questions not available.</div>'; return; }
    app.innerHTML = `
      <section class="fade-in">
        <a class="btn ghost" href="#/quiz">${icon.back} Quiz</a>
        <h1 class="h1">The booklet's study questions</h1>
        <p class="lead">${esc(o.intro || '')}</p>
        <button class="btn primary" id="start-mcq">Try the ${o.mcq.length} sample questions</button>
        <h2 class="h2">Answer these in your own words</h2>
        <p class="muted small">Say the answer out loud or write it down, then open it to compare with the booklet.</p>
        ${o.short.map((s) => `<details class="official"><summary>${esc(s.q)}</summary><div class="body">${esc(s.answer)}<div style="margin-top:8px">${pageLink(s.page)} ${s.chapter && data.byId[s.chapter] ? `<a class="pagelink" href="#/learn/${s.chapter}">Read: ${esc(data.byId[s.chapter].title)}</a>` : ''}</div></div></details>`).join('')}
      </section>`;
    $('#start-mcq').addEventListener('click', () => runQuiz({ title: 'Study questions', questions: o.mcq.map((q) => Object.assign({}, q, { chapter: q.chapter || 'rights' })), backHref: '#/quiz/official', onFinish: () => {} }));
  });
  route(/^\/quiz\/([a-z-]+)$/, (chId) => {
    const ch = data.byId[chId]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; }
    const qs = shuffle(ch.quiz || []);
    if (!qs.length) { app.innerHTML = '<div class="empty">No questions for this chapter yet.</div>'; return; }
    runQuiz({ title: ch.title, questions: qs, backHref: '#/quiz', retryHref: '#/quiz/' + ch.id, onFinish: (score, total) => { const p = progress.quiz[ch.id] || { best: 0, total, attempts: 0 }; p.attempts++; p.total = total; p.best = Math.max(p.best, score); p.last = score; progress.quiz[ch.id] = p; saveProgress(); } });
    return cleanup;
  });

  // ---------- BOOK ----------
  const BOOK_PAGES = 68;
  route(/^\/book(?:\/(\d+))?$/, (p) => {
    let page = Math.min(BOOK_PAGES, Math.max(1, parseInt(p || '1', 10) || 1));
    const chapterFor = (n) => data.chapters.slice().reverse().find((c) => n >= c.pages[0]) || null;
    function draw() {
      const ch = chapterFor(page);
      app.innerHTML = `
        <section class="fade-in book">
          <div class="row" style="justify-content:space-between"><h1 class="h1" style="margin:0">Booklet</h1><a class="small" href="discover.pdf#page=${page}" target="_blank" rel="noopener">Open the PDF</a></div>
          <p class="muted small" style="margin:0">Official <em>Discover Canada</em> (2021 print). ${ch ? `This page is in <a href="#/learn/${ch.id}">${esc(ch.title)}</a>.` : ''}</p>
          <div class="page"><img id="pg" src="book/p${String(page).padStart(2, '0')}.jpg" alt="Booklet page ${page}" width="1100" height="1430"></div>
          <div class="controls">
            <button class="btn" id="prev" ${page <= 1 ? 'disabled' : ''}>${icon.back} Prev</button>
            <input class="num" id="num" type="number" min="1" max="${BOOK_PAGES}" value="${page}" aria-label="Page number">
            <span class="small muted">of ${BOOK_PAGES}</span>
            <select id="jump" aria-label="Jump to chapter"><option value="">Jump to…</option>${data.chapters.map((c) => `<option value="${c.pages[0]}" ${ch && ch.id === c.id ? 'selected' : ''}>${esc(c.title)} (p.${c.pages[0]})</option>`).join('')}<option value="52">Study Questions (p.52)</option><option value="66">Memorable Quotes (p.66)</option></select>
            <button class="btn" id="next" ${page >= BOOK_PAGES ? 'disabled' : ''}>Next ${icon.next}</button>
          </div>
        </section>`;
      // preload neighbours
      [page - 1, page + 1].forEach((n) => { if (n >= 1 && n <= BOOK_PAGES) { const im = new Image(); im.src = `book/p${String(n).padStart(2, '0')}.jpg`; } });
      history.replaceState(null, '', '#/book/' + page);
    }
    function go(n) { page = Math.min(BOOK_PAGES, Math.max(1, n)); draw(); window.scrollTo({ top: 0 }); }
    const onClick = (e) => { if (e.target.closest('#prev')) go(page - 1); if (e.target.closest('#next')) go(page + 1); };
    const onChange = (e) => { if (e.target.id === 'num') go(parseInt(e.target.value, 10) || page); if (e.target.id === 'jump' && e.target.value) go(parseInt(e.target.value, 10)); };
    const onKey = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowLeft') go(page - 1); if (e.key === 'ArrowRight') go(page + 1); };
    let tx = null; const onTS = (e) => { tx = e.touches[0].clientX; }; const onTE = (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 70) go(page + (dx < 0 ? 1 : -1)); };
    app.addEventListener('click', onClick); app.addEventListener('change', onChange); document.addEventListener('keydown', onKey); app.addEventListener('touchstart', onTS, { passive: true }); app.addEventListener('touchend', onTE);
    draw();
    return () => { app.removeEventListener('click', onClick); app.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); app.removeEventListener('touchstart', onTS); app.removeEventListener('touchend', onTE); };
  });

  // ---------- RESOURCES ----------
  route(/^\/resources$/, () => {
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Resources</h1>
        <p class="lead">The official sources first. Third-party practice tests can help with exam nerves, but the booklet is the only thing the real test is based on.</p>
        <h2 class="h2">Official (Government of Canada)</h2>
        <div class="card flat"><ul style="margin:0;padding-left:1.2em">
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada.html" target="_blank" rel="noopener">Discover Canada — read online, PDF, eBook and audio</a></li>
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada/read-online/study-questions.html" target="_blank" rel="noopener">Official practice questions</a> (the same ones as in this app's "booklet study questions")</li>
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/study.html" target="_blank" rel="noopener">How to study for the test</a> · <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/how-it-works.html" target="_blank" rel="noopener">How the test works</a> · <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/online.html" target="_blank" rel="noopener">Taking the online test</a></li>
        </ul></div>
        <h2 class="h2">Free third-party practice tests</h2>
        <p class="small muted">Not checked by us for accuracy. If a question contradicts the booklet, the booklet wins.</p>
        <div class="card flat"><ul style="margin:0;padding-left:1.2em">
          <li><a href="https://canoo.ca/canadian-citizenship-practice-test" target="_blank" rel="noopener">Canoo — free 20-question practice test</a> (no sign-up, English or French)</li>
          <li><a href="https://www.citizentest.ca/free-tests" target="_blank" rel="noopener">CitizenTest.ca — free diagnostic test</a> (chapter tests are paid)</li>
        </ul></div>
      </section>`;
  });

  // ---------- SETTINGS ----------
  route(/^\/settings$/, () => {
    const seg = (key, options) => `<div class="seg" role="group">${options.map(([v, label]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${settings[key] === v}">${label}</button>`).join('')}</div>`;
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Settings</h1>
        <div class="card flat">
          <div class="setting"><div><b>Theme</b><div class="small muted">Auto follows your device</div></div>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
          <div class="setting"><div><b>Text size</b></div>${seg('size', [['small', 'A'], ['normal', 'A'], ['large', 'A'], ['xl', 'A']])}</div>
          <div class="setting"><div><b>Font</b><div class="small muted">Hyperlegible is easiest for most readers</div></div>${seg('font', [['default', 'Hyperlegible'], ['serif', 'Serif'], ['system', 'System']])}</div>
          <div class="setting"><div><b>Animations</b></div>${seg('motion', [['on', 'On'], ['off', 'Off']])}</div>
          <div class="setting"><div><b>Reading mode</b><div class="small muted">One section at a time keeps the page short</div></div>${seg('readMode', [['step', 'One section'], ['all', 'Whole chapter']])}</div>
        </div>
        <h2 class="h2">Your progress</h2>
        <div class="card flat">
          <p class="small muted" style="margin-top:0">Progress is saved on this device only. To move it to another phone or laptop, copy the code here and paste it there.</p>
          <div class="row"><button class="btn" id="export">Copy progress code</button><button class="btn" id="import">Paste progress code</button><button class="btn ghost" id="reset" style="color:var(--red)">Reset everything</button></div>
          <textarea id="code" class="sr-only" aria-hidden="true"></textarea>
        </div>
        <p class="small muted" style="margin-top:20px">Content: <em>Discover Canada: The Rights and Responsibilities of Citizenship</em>, © His Majesty the King in Right of Canada, reproduced for personal study. Built with care for one learner, shared for anyone preparing for the test. <a href="#/resources">Resources</a></p>
      </section>`;
    const onClick = async (e) => {
      const b = e.target.closest('[data-set]');
      if (b) { settings[b.getAttribute('data-set')] = b.getAttribute('data-val'); saveSettings(); render(); return; }
      if (e.target.closest('#export')) {
        const code = btoa(unescape(encodeURIComponent(JSON.stringify(progress))));
        try { await navigator.clipboard.writeText(code); toast('Progress code copied'); } catch (err) { const ta = $('#code'); ta.classList.remove('sr-only'); ta.value = code; ta.select(); toast('Copy the code from the box'); }
      }
      if (e.target.closest('#import')) {
        let code = '';
        try { code = await navigator.clipboard.readText(); } catch (err) { code = window.prompt('Paste your progress code') || ''; }
        try { const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (obj && obj.sections) { Object.assign(progress, obj); saveProgress(); toast('Progress restored'); render(); } else toast('That is not a progress code'); } catch (err) { toast('That is not a progress code'); }
      }
      if (e.target.closest('#reset')) {
        if (window.confirm('Reset all progress on this device? This cannot be undone.')) { progress.sections = {}; progress.cards = {}; progress.quiz = {}; progress.mock = []; progress.last = null; saveProgress(); toast('Progress reset'); render(); }
      }
    };
    app.addEventListener('click', onClick);
    return () => app.removeEventListener('click', onClick);
  });

  // ---------- boot ----------
  applySettings();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
