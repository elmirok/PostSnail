export function renderSearchPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostSnail Forest</title>
  <meta name="description" content="Search and register post-quantum signed static microblogs in PostSnail Forest.">
  <style>
    :root { color-scheme: light; --ink:#080a2f; --muted:#4d4b63; --line:#16163c; --accent:#2f7a55; --coral:#ef4056; --ok:#18794e; --warn:#9a5b00; --bad:#b42318; --paper:#fffdf7; --soft:#f4f6ef; --green-soft:#e4f4e9; --amber-soft:#fff7e5; --red-soft:#fff1f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: linear-gradient(180deg, rgba(47,122,85,.12), transparent 360px), var(--paper); }
    a { color: inherit; }
    .shell { width: min(1040px, calc(100vw - 28px)); margin: 0 auto; padding: 18px 0 42px; }
    header { display:flex; align-items:center; justify-content:space-between; gap:14px; padding: 10px 0 18px; border-bottom:1px solid var(--line); }
    .brand { display:flex; flex-direction:column; text-decoration:none; }
    .brand strong { font-size:1.05rem; }
    .brand span { color:var(--muted); font-size:.86rem; }
    nav { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .btn, button { border:2px solid var(--line); background:var(--paper); border-radius:0; min-height:40px; padding:0 14px; font:inherit; font-weight:800; color:var(--ink); text-decoration:none; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
    .btn.primary, button.primary { background:var(--accent); border-color:var(--accent); color:white; }
    button:disabled { cursor:not-allowed; opacity:.58; }
    .hero { padding: 34px 0 24px; display:grid; gap:10px; }
    .kicker { color:var(--coral); font-weight:900; text-transform:uppercase; font-size:.76rem; letter-spacing:0; margin:0; }
    h1 { margin:0; font-size: clamp(2rem, 6vw, 4.6rem); line-height:.98; letter-spacing:0; max-width: 900px; }
    h2 { margin:0; font-size:1.16rem; letter-spacing:0; }
    .hero p:last-child { margin:0; color:var(--muted); max-width:760px; font-size:1.05rem; line-height:1.55; }
    .panels { display:grid; grid-template-columns:minmax(0, 1.1fr) minmax(300px, .9fr); gap:14px; align-items:start; }
    .panel { background:var(--paper); border:2px solid var(--line); border-radius:0; padding:14px; display:grid; gap:12px; min-width:0; box-shadow:6px 6px 0 rgba(8,10,47,.11); }
    .panel p { margin:0; color:var(--muted); line-height:1.45; }
    form { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:10px; }
    .search-form { grid-template-columns:minmax(0, 1fr) minmax(120px, 180px) auto; }
    label { display:grid; gap:6px; color:var(--muted); font-size:.9rem; }
    label span { color:var(--ink); font-weight:700; }
    input { width:100%; min-height:42px; border:2px solid var(--line); border-radius:0; padding:0 12px; font:inherit; }
    .status { color:var(--muted); min-height:1.4em; line-height:1.45; }
    .notice { border:2px solid var(--line); border-radius:0; padding:12px; background:var(--soft); display:grid; gap:8px; min-width:0; }
    .notice strong { color:var(--ink); }
    .notice[data-tone="ok"] { background:var(--green-soft); border-color:#bfe6ce; color:var(--ok); }
    .notice[data-tone="warn"] { background:var(--amber-soft); border-color:#f0d49a; color:var(--warn); }
    .notice[data-tone="bad"] { background:var(--red-soft); border-color:#f2b8b5; color:var(--bad); }
    .notice code { color:inherit; }
    .actions { display:flex; gap:8px; flex-wrap:wrap; }
    .results { display:grid; gap:10px; margin-top:14px; }
    .result { background:var(--paper); border:2px solid var(--line); border-radius:0; padding:14px; display:grid; gap:8px; }
    .result h2 { margin:0; font-size:1.1rem; }
    .result p { margin:0; color:var(--muted); line-height:1.45; }
    .meta, .tags { display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:.86rem; }
    .tag { color:var(--accent); }
    code { overflow-wrap:anywhere; color:var(--muted); }
    .empty { border:2px dashed var(--line); border-radius:0; padding:20px; color:var(--muted); background:var(--soft); }
    footer { margin-top:24px; color:var(--muted); display:grid; gap:10px; line-height:1.5; border-top:2px solid var(--line); padding-top:18px; }
    footer a { color:var(--ink); font-weight:800; text-decoration-thickness:.08em; }
    .legal-links { display:flex; gap:10px; flex-wrap:wrap; font-size:.9rem; }
    @media (max-width: 820px) { .panels { grid-template-columns:1fr; } }
    @media (max-width: 680px) { header { align-items:flex-start; flex-direction:column; } nav { justify-content:flex-start; } form, .search-form { grid-template-columns:1fr; } h1 { font-size:2.25rem; } .shell { width:min(100vw - 24px, 1040px); padding-top:12px; } }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <a class="brand" href="/"><strong>PostSnail Forest</strong><span>Searchable tracker for signed static microblogs</span></a>
      <nav>
        <a class="btn" href="https://postsnail.org/" target="_blank" rel="noopener noreferrer">PostSnail</a>
        <a class="btn" href="/api/search">JSON API</a>
      </nav>
    </header>
    <section class="hero">
      <p class="kicker">Forest / Verified public summaries / No login</p>
      <h1>Find and register creator-owned microblogs.</h1>
      <p>PostSnail Forest verifies public proof files, then indexes only site metadata plus post titles, tags, excerpts, dates, and digests.</p>
    </section>
    <section class="panels" aria-label="Forest actions">
      <section class="panel" aria-labelledby="register-title">
        <h2 id="register-title">Register your microblog</h2>
        <p>Use the public homepage URL of a PostSnail site. Registration verifies proofs; it does not create an account or transfer ownership.</p>
        <form id="register-form">
          <label for="site-url"><span>Microblog URL</span><input id="site-url" name="url" type="url" inputmode="url" autocomplete="url" required placeholder="https://your-blog.example/"></label>
          <button class="primary" id="register-button" type="submit">Submit microblog</button>
        </form>
        <div class="notice" id="registration-status" aria-live="polite">Paste a public https PostSnail URL to register it in Forest.</div>
        <div id="registration-details"></div>
      </section>
      <section class="panel" aria-labelledby="search-title">
        <h2 id="search-title">Search Forest</h2>
        <p>Search indexed public summaries. Full bundle verification still belongs in the PostSnail admin verifier.</p>
        <form id="search-form" class="search-form" role="search">
          <input id="q" name="q" autocomplete="off" placeholder="Search titles, tags, excerpts">
          <input id="tag" name="tag" autocomplete="off" placeholder="tag">
          <button class="primary" type="submit">Search Forest</button>
        </form>
        <div class="status" id="status">Search Forest.</div>
      </section>
    </section>
    <section class="results" id="results"></section>
    <footer>
      <strong>Forest trust model</strong>
      <span>Search results are discoverability hints. Use the creator's manifest and PostSnail ZIP verifier when you need full bundle verification.</span>
      <span>© 2026 Boaz Alhadeff. PostSnail is Apache-2.0 licensed; redistributed copies must preserve NOTICE attribution.</span>
      <span class="legal-links"><a href="https://postsnail.org/docs/legal/">Legal</a><a href="https://postsnail.org/LICENSE">License</a><a href="https://postsnail.org/NOTICE">Notice</a><a href="https://postsnail.org/THIRD_PARTY_NOTICES.md">Third-party notices</a></span>
    </footer>
  </main>
  <script>
    const LAST_SUBMISSION_KEY = 'postsnail.registry.lastSubmission.v1';
    const registerForm = document.getElementById('register-form');
    const siteUrlInput = document.getElementById('site-url');
    const registerButton = document.getElementById('register-button');
    const registrationStatusEl = document.getElementById('registration-status');
    const registrationDetailsEl = document.getElementById('registration-details');
    const form = document.getElementById('search-form');
    const qInput = document.getElementById('q');
    const tagInput = document.getElementById('tag');
    const statusEl = document.getElementById('status');
    const resultsEl = document.getElementById('results');
    let pollTimer = 0;
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      registerMicroblog();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      search();
    });
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q') || '';
    const initialTag = params.get('tag') || '';
    if (initialQ) qInput.value = initialQ;
    if (initialTag) tagInput.value = initialTag;
    restoreLastSubmission();
    if (initialQ || initialTag) search();

    async function registerMicroblog() {
      const url = siteUrlInput.value.trim();
      if (!url) {
        renderRegistrationMessage('Submit a public https URL.', 'bad');
        siteUrlInput.focus();
        return;
      }
      clearPollTimer();
      setRegisterBusy(true);
      renderRegistrationMessage('Submitting microblog to Forest...', 'warn');
      registrationDetailsEl.innerHTML = '';
      try {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: url })
        });
        const data = await safeJson(response);
        if (!response.ok) {
          renderRegistrationMessage(registrationErrorMessage(response.status, data && data.error), response.status === 409 ? 'warn' : 'bad');
          return;
        }
        const submission = {
          submissionId: data.submissionId,
          siteUrl: data.siteUrl,
          status: data.status || 'queued',
          updatedAt: new Date().toISOString()
        };
        saveSubmission(submission);
        renderSubmission(submission);
        checkSubmission(submission.submissionId);
      } catch {
        renderRegistrationMessage('Forest could not be reached. Please try again.', 'bad');
      } finally {
        setRegisterBusy(false);
      }
    }

    async function checkSubmission(submissionId) {
      clearPollTimer();
      try {
        const response = await fetch('/api/submissions/' + encodeURIComponent(submissionId));
        const data = await safeJson(response);
        if (!response.ok) {
          renderRegistrationMessage(data && data.error ? data.error : 'Submission status could not be loaded.', 'bad');
          return;
        }
        const previous = loadSubmission();
        const submission = {
          submissionId: data.submissionId || submissionId,
          siteUrl: previous && previous.siteUrl ? previous.siteUrl : '',
          siteId: data.siteId || '',
          status: data.status || 'queued',
          message: data.message || '',
          updatedAt: data.updatedAt || new Date().toISOString()
        };
        saveSubmission(submission);
        renderSubmission(submission);
        if (submission.status === 'queued' || submission.status === 'crawling') {
          pollTimer = window.setTimeout(() => checkSubmission(submission.submissionId), 3000);
        }
      } catch {
        renderRegistrationMessage('Status check failed. Retrying shortly...', 'warn');
        pollTimer = window.setTimeout(() => checkSubmission(submissionId), 5000);
      }
    }

    function renderSubmission(submission) {
      const status = submission.status || 'queued';
      if (status === 'indexed') {
        renderRegistrationMessage('Your microblog is indexed.', 'ok');
        registrationDetailsEl.innerHTML = '<div class="notice" data-tone="ok"><strong>Indexed site</strong><code>' + escapeHtml(submission.siteUrl || 'Registered site') + '</code><code>Submission: ' + escapeHtml(submission.submissionId) + '</code><div class="actions">' + siteActionLink(submission) + '<button type="button" id="search-indexed">Search Forest</button></div></div>';
        const searchIndexed = document.getElementById('search-indexed');
        if (searchIndexed) searchIndexed.addEventListener('click', () => {
          qInput.value = hostFromUrl(submission.siteUrl);
          search();
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return;
      }
      if (status === 'failed') {
        renderRegistrationMessage('Verification failed. Forest could not verify this PostSnail proof.', 'bad');
        registrationDetailsEl.innerHTML = '<div class="notice" data-tone="bad"><strong>What to check</strong><span>' + escapeHtml(submission.message || 'Publish a fresh PostSnail ZIP and make sure .well-known/postsnail.json is reachable.') + '</span><code>Submission: ' + escapeHtml(submission.submissionId) + '</code></div>';
        return;
      }
      if (status === 'crawling') {
        renderRegistrationMessage('Verifying public proof files...', 'warn');
      } else {
        renderRegistrationMessage('Queued for verification.', 'warn');
      }
      registrationDetailsEl.innerHTML = '<div class="notice" data-tone="warn"><strong>' + (status === 'crawling' ? 'Verifying' : 'Queued') + '</strong><span>Forest will index public summaries after the proof passes.</span><code>' + escapeHtml(submission.siteUrl || 'Submitted site') + '</code><code>Submission: ' + escapeHtml(submission.submissionId) + '</code></div>';
    }

    function siteActionLink(submission) {
      if (submission.siteId) return '<a class="btn" href="/api/sites/' + encodeURIComponent(submission.siteId) + '">View site JSON</a>';
      return '<a class="btn" href="#search-form">Search below</a>';
    }

    function renderRegistrationMessage(message, tone) {
      registrationStatusEl.textContent = message;
      registrationStatusEl.dataset.tone = tone || '';
    }

    function registrationErrorMessage(status, fallback) {
      if (status === 400) return fallback || 'Submit a public https URL.';
      if (status === 409) return 'This site is already queued or recently indexed.';
      if (status === 429) return 'Submission rate limit reached.';
      return fallback || 'Registration could not be completed.';
    }

    function setRegisterBusy(busy) {
      registerButton.disabled = busy;
      registerButton.textContent = busy ? 'Submitting...' : 'Submit microblog';
    }

    function restoreLastSubmission() {
      const submission = loadSubmission();
      if (!submission || !submission.submissionId) return;
      if (submission.siteUrl) siteUrlInput.value = submission.siteUrl;
      renderSubmission(submission);
      if (submission.status === 'queued' || submission.status === 'crawling') {
        checkSubmission(submission.submissionId);
      }
    }

    function saveSubmission(submission) {
      try {
        localStorage.setItem(LAST_SUBMISSION_KEY, JSON.stringify(submission));
      } catch {
        // Storage is optional; the page still works without it.
      }
    }

    function loadSubmission() {
      try {
        const raw = localStorage.getItem(LAST_SUBMISSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function clearPollTimer() {
      if (pollTimer) window.clearTimeout(pollTimer);
      pollTimer = 0;
    }

    async function safeJson(response) {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }

    async function search() {
      const params = new URLSearchParams(new FormData(form));
      statusEl.textContent = 'Searching...';
      resultsEl.innerHTML = '';
      try {
        const response = await fetch('/api/search?' + params.toString());
        const data = await response.json();
        statusEl.textContent = data.items.length ? data.items.length + ' result(s).' : 'No matching results.';
        resultsEl.innerHTML = data.items.length ? data.items.map(renderResult).join('') : '<div class="empty">No signed summaries matched this search.</div>';
      } catch {
        statusEl.textContent = 'Search failed.';
        resultsEl.innerHTML = '<div class="empty">Forest could not be searched right now.</div>';
      }
    }
    function renderResult(item) {
      const tags = item.post.tags.map((tag) => '<span class="tag">#' + escapeHtml(tag) + '</span>').join('');
      return '<article class="result"><div class="meta"><span>@' + escapeHtml(item.site.handle) + '</span><span>' + escapeHtml(item.post.publishedAt || '') + '</span></div><h2><a href="' + escapeAttr(item.post.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(item.post.title) + '</a></h2><p>' + escapeHtml(item.post.excerpt) + '</p><div class="tags">' + tags + '</div><code>' + escapeHtml(item.post.digest) + '</code></article>';
    }
    function hostFromUrl(value) {
      try {
        return new URL(value).hostname.replace(/^www\\./, '');
      } catch {
        return value || '';
      }
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
    }
    function escapeAttr(value) { return escapeHtml(value); }
  </script>
</body>
</html>`;
}
