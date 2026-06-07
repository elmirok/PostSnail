export function renderSearchPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostSnail Forest</title>
  <meta name="description" content="Search and register post-quantum signed static microblogs in PostSnail Forest.">
  <link rel="icon" href="/assets/brand/postsnail-icon.png">
  <link rel="stylesheet" href="/forest.css">
  <script src="/forest.js" defer></script>
</head>
<body>
  <main class="shell">
    <header>
      <a class="brand" href="/" aria-label="PostSnail Forest home">
        <img class="forest-brand-icon" src="/assets/brand/postsnail-icon.png" alt="" width="36" height="36" decoding="async">
        <span><strong>PostSnail Forest</strong><span>Searchable tracker for signed static microblogs</span></span>
      </a>
      <nav>
        <a class="btn" href="https://postsnail.org/" target="_blank" rel="noopener noreferrer">PostSnail</a>
        <a class="btn" href="/api/search">JSON API</a>
      </nav>
    </header>
    <section class="hero" aria-labelledby="forest-title">
      <h1 id="forest-title" class="sr-only">Search PostSnail Forest</h1>
      <section class="forest-search-panel" aria-labelledby="search-label">
        <form id="search-form" class="search-form" role="search">
          <div class="search-box">
            <label class="sr-only" id="search-label" for="q">Search PostSnail Forest</label>
            <input id="q" name="q" aria-label="Search PostSnail Forest" autocomplete="off" placeholder="Search PostSnail Forest">
            <button class="primary" type="submit">Search</button>
          </div>
        </form>
        <p>Verified public summaries only: site metadata, titles, tags, excerpts, dates, and digests.</p>
        <div class="creator-action">
          <span>Have a published PostSnail site?</span>
          <button class="register-toggle" id="toggle-register" type="button" aria-expanded="false" aria-controls="register-panel">Register your microblog</button>
        </div>
        <div class="saved-submission-summary" id="saved-submission-summary" aria-live="polite" hidden></div>
        <div class="status" id="status">Search Forest.</div>
      </section>
    </section>
    <section class="panels" aria-label="Forest actions">
      <section class="panel register-panel" id="register-panel" aria-labelledby="register-title" hidden>
        <h2 id="register-title">Register your microblog</h2>
        <p>Use the public homepage URL of a PostSnail site. Registration verifies proofs; it does not create an account or transfer ownership.</p>
        <form id="register-form">
          <label for="site-url"><span>Microblog URL</span><input id="site-url" name="url" type="url" inputmode="url" autocomplete="url" required placeholder="https://your-blog.example/"></label>
          <button class="primary" id="register-button" type="submit">Submit microblog</button>
        </form>
        <div class="notice" id="registration-status" aria-live="polite">Paste a public https PostSnail URL to register it in Forest.</div>
        <div id="registration-details"></div>
      </section>
    </section>
    <section class="results-filter-bar" id="result-filters" aria-label="Result filters" hidden>
      <label class="tag-row" for="tag"><span>Filter by tag</span><input id="tag" name="tag" form="search-form" autocomplete="off" placeholder="optional tag"></label>
      <label class="sort-row" for="sort"><span>Sort by</span><select id="sort" name="sort" form="search-form"><option value="best">Best match</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option><option value="verified">Recently verified</option></select></label>
      <fieldset class="scope-control" aria-label="Search scope">
        <legend>Search scope</legend>
        <label><input type="radio" name="scope" value="all" form="search-form" checked><span>All</span></label>
        <label><input type="radio" name="scope" value="content" form="search-form"><span>Content</span></label>
        <label><input type="radio" name="scope" value="shell" form="search-form"><span>Shell</span></label>
      </fieldset>
    </section>
    <section class="results" id="results"></section>
    <footer>
      <strong>Forest trust model</strong>
      <span>Search results are discoverability hints. Use the creator's manifest and PostSnail ZIP verifier when you need full bundle verification.</span>
      <span>© 2026 Boaz Alhadeff. PostSnail is Apache-2.0 licensed; redistributed copies must preserve NOTICE attribution.</span>
      <span class="legal-links"><a href="https://postsnail.org/docs/legal/">Legal</a><a href="https://postsnail.org/LICENSE">License</a><a href="https://postsnail.org/NOTICE">Notice</a><a href="https://postsnail.org/THIRD_PARTY_NOTICES.md">Third-party notices</a></span>
    </footer>
  </main>
</body>
</html>`;
}

export function renderForestCss(): string {
  return `
:root { color-scheme: light; --ink:#080a2f; --muted:#4d4b63; --line:#16163c; --accent:#2f7a55; --coral:#ef4056; --ok:#18794e; --warn:#9a5b00; --bad:#b42318; --paper:#fffdf7; --soft:#f4f6ef; --green-soft:#e4f4e9; --amber-soft:#fff7e5; --red-soft:#fff1f0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: linear-gradient(180deg, rgba(47,122,85,.12), transparent 360px), var(--paper); }
a { color: inherit; }
.shell { width: min(1040px, calc(100vw - 28px)); margin: 0 auto; padding: 18px 0 42px; }
header { display:flex; align-items:center; justify-content:space-between; gap:14px; padding: 10px 0 18px; border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:10px; text-decoration:none; min-width:0; }
.brand > span { display:flex; flex-direction:column; min-width:0; }
.brand strong { font-size:1.05rem; }
.brand span span { color:var(--muted); font-size:.86rem; }
.forest-brand-icon { image-rendering: pixelated; object-fit: contain; flex:0 0 auto; }
nav { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.btn, button { border:2px solid var(--line); background:var(--paper); border-radius:0; min-height:40px; padding:0 14px; font:inherit; font-weight:800; color:var(--ink); text-decoration:none; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
.btn.primary, button.primary { background:var(--accent); border-color:var(--accent); color:white; }
button:disabled { cursor:not-allowed; opacity:.58; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
.hero { padding: 48px 0 26px; display:grid; gap:12px; }
.kicker { color:var(--coral); font-weight:900; text-transform:uppercase; font-size:.76rem; letter-spacing:0; margin:0; }
h1 { margin:0; font-size: clamp(2rem, 6vw, 4.6rem); line-height:.98; letter-spacing:0; max-width: 900px; }
h2 { margin:0; font-size:1.16rem; letter-spacing:0; }
.hero p { margin:0; color:var(--muted); line-height:1.45; }
.panels { display:grid; grid-template-columns:minmax(0, 1fr); gap:14px; align-items:start; }
.panel { background:var(--paper); border:2px solid var(--line); border-radius:0; padding:14px; display:grid; gap:12px; min-width:0; box-shadow:6px 6px 0 rgba(8,10,47,.11); }
.forest-search-panel { width:min(880px, 100%); justify-self:center; display:grid; padding:0; gap:12px; background:transparent; border:0; box-shadow:none; }
.forest-search-panel p { text-align:center; max-width:720px; justify-self:center; }
.creator-action { display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap; color:var(--muted); font-size:.92rem; }
.register-toggle { background:var(--paper); color:var(--accent); border-color:var(--accent); }
.register-toggle[aria-expanded="true"] { background:var(--green-soft); color:var(--ink); }
.register-panel[hidden], .saved-submission-summary[hidden], .results-filter-bar[hidden] { display:none; }
.saved-submission-summary { width:min(720px, 100%); justify-self:center; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:.9rem; }
.saved-submission-summary strong { color:var(--ink); }
.panel p { margin:0; color:var(--muted); line-height:1.45; }
form { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:10px; }
.search-form { width:min(880px, 100%); justify-self:center; grid-template-columns:1fr; gap:10px; }
.search-box { display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:center; gap:0; border:3px solid var(--line); background:white; box-shadow:6px 6px 0 rgba(47,122,85,.18); }
.search-box input { min-height:64px; border:0; font-size:1.18rem; padding:0 18px; }
.search-box input:focus { outline:3px solid var(--coral); outline-offset:2px; }
.search-box button { min-height:64px; border-width:0 0 0 3px; padding:0 22px; font-size:1.02rem; }
.tag-row { display:grid; grid-template-columns:auto minmax(160px, 260px); align-items:center; justify-content:center; gap:10px; color:var(--muted); font-size:.9rem; }
.tag-row input { min-height:40px; background:var(--paper); }
.sort-row { display:grid; grid-template-columns:auto minmax(150px, 210px); align-items:center; justify-content:center; gap:10px; color:var(--muted); font-size:.9rem; }
.sort-row select { width:100%; min-height:40px; border:2px solid var(--line); border-radius:0; background:var(--paper); color:var(--ink); padding:0 10px; font:inherit; font-weight:800; }
.results-filter-bar { margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; border:2px solid var(--line); background:var(--paper); box-shadow:6px 6px 0 rgba(47,122,85,.12); padding:10px 12px; }
.results-filter-bar .tag-row, .results-filter-bar .sort-row { justify-content:start; }
.scope-control { border:0; padding:0; margin:0; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; }
.scope-control legend { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.scope-control label { display:inline-flex; align-items:center; gap:0; color:var(--ink); font-size:.92rem; }
.scope-control input { position:absolute; opacity:0; pointer-events:none; width:1px; min-height:0; height:1px; }
.scope-control span { min-height:36px; min-width:88px; display:inline-flex; align-items:center; justify-content:center; border:2px solid var(--line); background:var(--paper); padding:0 12px; font-weight:900; }
.scope-control input:checked + span { background:var(--green-soft); box-shadow:4px 4px 0 rgba(47,122,85,.18); }
.scope-control input:focus-visible + span { outline:3px solid var(--coral); outline-offset:2px; }
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
.result { background:var(--paper); border:2px solid var(--line); border-radius:0; padding:14px; display:grid; grid-template-columns:96px minmax(0, 1fr); gap:14px; align-items:start; }
.result-media { width:96px; aspect-ratio:1; border:2px solid var(--line); background:var(--green-soft); display:flex; align-items:center; justify-content:center; overflow:hidden; image-rendering:auto; }
.result-media img { width:100%; height:100%; object-fit:cover; display:block; }
.result-fallback { width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--green-soft), #fff); color:var(--accent); font-weight:1000; font-size:2rem; }
.result-body { min-width:0; display:grid; gap:8px; }
.result h2 { margin:0; font-size:1.1rem; }
.result p { margin:0; color:var(--muted); line-height:1.45; }
.meta, .tags { display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:.86rem; }
.tag { color:var(--accent); }
.alias-badge { display:inline-flex; align-items:center; width:max-content; max-width:100%; min-height:32px; border:2px solid var(--accent); background:var(--green-soft); color:var(--ink); padding:0 9px; font-size:.9rem; font-weight:900; text-decoration:none; overflow-wrap:anywhere; }
.alias-badge::before { content:'@'; color:var(--accent); margin-right:4px; }
details { border-top:1px solid rgba(8,10,47,.18); padding-top:8px; color:var(--muted); }
summary { cursor:pointer; color:var(--ink); font-weight:900; }
.detail-grid { display:grid; grid-template-columns:minmax(96px, 160px) minmax(0, 1fr); gap:6px 10px; margin-top:8px; font-size:.86rem; }
.detail-grid dt { color:var(--ink); font-weight:900; }
.detail-grid dd { margin:0; overflow-wrap:anywhere; min-width:0; }
code { overflow-wrap:anywhere; color:var(--muted); }
.empty { border:2px dashed var(--line); border-radius:0; padding:20px; color:var(--muted); background:var(--soft); }
footer { margin-top:24px; color:var(--muted); display:grid; gap:10px; line-height:1.5; border-top:2px solid var(--line); padding-top:18px; }
footer a { color:var(--ink); font-weight:800; text-decoration-thickness:.08em; }
.legal-links { display:flex; gap:10px; flex-wrap:wrap; font-size:.9rem; }
.shellname-profile { width:min(840px, calc(100vw - 28px)); margin:0 auto; padding:28px 0 44px; display:grid; gap:18px; }
.card { border:2px solid var(--line); box-shadow:6px 6px 0 rgba(47,122,85,.18); padding:18px; display:grid; gap:12px; background:white; }
.card h1 { font-size:clamp(2rem, 8vw, 4rem); overflow-wrap:anywhere; }
.card p { margin:0; color:var(--muted); line-height:1.5; }
dl { display:grid; grid-template-columns:150px minmax(0, 1fr); gap:8px 12px; }
dt { font-weight:900; }
dd { margin:0; overflow-wrap:anywhere; }
@media (max-width: 820px) { .panels { grid-template-columns:1fr; } }
@media (max-width: 680px) { header { align-items:flex-start; flex-direction:column; } nav { justify-content:flex-start; } .hero { padding:34px 0 22px; } form, .search-form, .search-box, .tag-row, .sort-row { grid-template-columns:1fr; } .search-box button { border-width:3px 0 0; } .forest-search-panel p { text-align:left; } .creator-action, .saved-submission-summary { justify-content:flex-start; } .results-filter-bar { align-items:stretch; flex-direction:column; } .scope-control { justify-content:flex-start; } .scope-control label { flex:1 1 88px; } .scope-control span { width:100%; } .result { grid-template-columns:72px minmax(0, 1fr); gap:10px; padding:12px; } .result-media { width:72px; } .detail-grid, dl { grid-template-columns:1fr; } h1 { font-size:2.25rem; } .shell { width:min(100vw - 24px, 1040px); padding-top:12px; } }
`;
}

export function renderForestScript(): string {
  return `
const PUBLIC_DETAIL_KEYS = new Set([
  'bundleFingerprint',
  'createdAt',
  'crawlMessage',
  'crawlStatus',
  'description',
  'digest',
  'expiresAt',
  'excerpt',
  'forest',
  'fullName',
  'generatedAt',
  'handle',
  'imageFiles',
  'logoUrl',
  'manifestUrl',
  'name',
  'postUrl',
  'publicKey',
  'publishedAt',
  'resultType',
  'siteUrl',
  'slug',
  'status',
  'tags',
  'thumbnailUrl',
  'title',
  'updatedAt',
  'url',
  'verifiedAt'
]);
const LAST_SUBMISSION_KEY = 'postsnail.registry.lastSubmission.v1';
const registerForm = document.getElementById('register-form');
const registerPanel = document.getElementById('register-panel');
const toggleRegister = document.getElementById('toggle-register');
const siteUrlInput = document.getElementById('site-url');
const registerButton = document.getElementById('register-button');
const registrationStatusEl = document.getElementById('registration-status');
const registrationDetailsEl = document.getElementById('registration-details');
const savedSubmissionSummaryEl = document.getElementById('saved-submission-summary');
const form = document.getElementById('search-form');
const qInput = document.getElementById('q');
const tagInput = document.getElementById('tag');
const sortInput = document.getElementById('sort');
const scopeInputs = Array.from(document.querySelectorAll('input[name="scope"]'));
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const resultFilters = document.getElementById('result-filters');
let pollTimer = 0;
toggleRegister.addEventListener('click', () => {
  setRegistrationOpen(registerPanel.hidden);
  if (!registerPanel.hidden) siteUrlInput.focus();
});
registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  registerMicroblog();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
tagInput.addEventListener('change', () => search());
sortInput.addEventListener('change', () => search());
scopeInputs.forEach((input) => {
  input.addEventListener('change', () => search());
});
const params = new URLSearchParams(window.location.search);
const initialQ = params.get('q') || '';
const initialTag = params.get('tag') || '';
const initialScope = ['all', 'content', 'shell'].includes(params.get('scope')) ? params.get('scope') : 'all';
const initialSort = ['best', 'newest', 'oldest', 'az', 'za', 'verified'].includes(params.get('sort')) ? params.get('sort') : 'best';
if (initialQ) qInput.value = initialQ;
if (initialTag) tagInput.value = initialTag;
sortInput.value = initialSort;
scopeInputs.forEach((input) => {
  input.checked = input.value === initialScope;
});
restoreLastSubmission();
if (initialQ || initialTag) search();

async function registerMicroblog() {
  setRegistrationOpen(true);
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
      status: data.status || 'queued',
      siteUrl: data.siteUrl || url,
      siteId: data.siteId || '',
      message: data.message || '',
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
  renderSavedSubmissionSummary(submission);
  const status = submission.status || 'queued';
  if (status === 'indexed') {
    renderRegistrationMessage('Your microblog is indexed.', 'ok');
    registrationDetailsEl.innerHTML = '<div class="notice" data-tone="ok"><strong>Indexed site</strong><code>' + escapeHtml(submission.siteUrl || 'Registered site') + '</code><code>Submission: ' + escapeHtml(submission.submissionId) + '</code><div class="actions">' + siteActionLink(submission) + '<button type="button" id="search-indexed">Search Forest</button></div></div>';
    const searchIndexed = document.getElementById('search-indexed');
    if (searchIndexed) searchIndexed.addEventListener('click', () => {
      qInput.value = hostFromUrl(submission.siteUrl);
      search();
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

function renderSavedSubmissionSummary(submission) {
  if (!submission || !submission.submissionId) {
    savedSubmissionSummaryEl.hidden = true;
    savedSubmissionSummaryEl.innerHTML = '';
    return;
  }
  const status = submission.status || 'queued';
  const site = hostFromUrl(submission.siteUrl || '');
  savedSubmissionSummaryEl.hidden = false;
  savedSubmissionSummaryEl.innerHTML = '<strong>Last registration:</strong><span>' + escapeHtml(statusLabel(status)) + (site ? ' · ' + escapeHtml(site) : '') + '</span><button class="btn" type="button" id="resume-registration">View status</button>' + (status === 'indexed' ? '<button class="btn primary" type="button" id="search-last-submission">Search it</button>' : '');
  const resume = document.getElementById('resume-registration');
  if (resume) resume.addEventListener('click', () => {
    setRegistrationOpen(true);
    renderSubmission(submission);
    registerPanel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
  const searchLast = document.getElementById('search-last-submission');
  if (searchLast) searchLast.addEventListener('click', () => {
    qInput.value = hostFromUrl(submission.siteUrl || '');
    search();
  });
}

function statusLabel(status) {
  if (status === 'indexed') return 'Indexed';
  if (status === 'failed') return 'Failed';
  if (status === 'crawling') return 'Verifying';
  return 'Queued';
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
  renderSavedSubmissionSummary(submission);
  if (submission.status === 'queued' || submission.status === 'crawling') {
    checkSubmission(submission.submissionId);
  }
}

function setRegistrationOpen(open) {
  registerPanel.hidden = !open;
  toggleRegister.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggleRegister.textContent = open ? 'Hide registration form' : 'Register your microblog';
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
  const params = searchParams();
  syncUrlParams(params);
  setFiltersVisible(true);
  statusEl.textContent = 'Searching...';
  resultsEl.innerHTML = '';
  try {
    const response = await fetch('/api/search?' + params.toString());
    const data = await response.json();
    if (!response.ok) throw new Error(data && data.error ? data.error : 'Search failed.');
    const items = Array.isArray(data.items) ? data.items : [];
    statusEl.textContent = items.length ? items.length + ' result(s).' : 'No matching results.';
    resultsEl.innerHTML = items.length ? items.map(renderResult).join('') : '<div class="empty">No signed summaries matched this search.</div>';
    if (items.length) window.requestAnimationFrame(scrollToFirstResult);
  } catch {
    statusEl.textContent = 'Search failed.';
    resultsEl.innerHTML = '<div class="empty">Forest could not be searched right now.</div>';
  }
}

function searchParams() {
  const params = new URLSearchParams();
  params.set('q', qInput.value.trim());
  params.set('tag', tagInput.value.trim());
  params.set('scope', currentScope());
  params.set('sort', sortInput.value || 'best');
  return params;
}

function currentScope() {
  return (scopeInputs.find((input) => input.checked) || {}).value || 'all';
}

function setFiltersVisible(visible) {
  resultFilters.hidden = !visible;
}

function syncUrlParams(params) {
  const next = new URLSearchParams();
  const q = params.get('q') || '';
  const tag = params.get('tag') || '';
  const scope = params.get('scope') || 'all';
  const sort = params.get('sort') || 'best';
  if (q) next.set('q', q);
  if (tag) next.set('tag', tag);
  if (scope !== 'all') next.set('scope', scope);
  if (sort !== 'best') next.set('sort', sort);
  const query = next.toString();
  const nextUrl = window.location.pathname + (query ? '?' + query : '');
  window.history.replaceState(null, '', nextUrl);
}

function scrollToFirstResult() {
  const first = resultsEl.querySelector('.result');
  if (!first) return;
  first.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function renderResult(item) {
  if (item.type === 'shellname') return renderShellNameResult(item);
  return item.type === 'shell' ? renderShellResult(item) : renderContentResult(item);
}

function renderContentResult(item) {
  const site = item.site || {};
  const post = item.post || {};
  const tags = Array.isArray(post.tags) ? post.tags.map((tag) => '<span class="tag">#' + escapeHtml(tag) + '</span>').join('') : '';
  const title = post.title || site.title || 'Untitled post';
  const media = renderMedia(post.thumbnailUrl || site.logoUrl, title);
  const details = renderDetails('Post details', mergeDetails(post.details, {
    resultType: 'content',
    siteUrl: site.url,
    postUrl: post.url,
    handle: site.handle,
    title: post.title,
    excerpt: post.excerpt,
    tags: post.tags || [],
    digest: post.digest,
    publicKey: site.publicKey,
    bundleFingerprint: site.bundleFingerprint,
    manifestUrl: site.manifestUrl,
    publishedAt: post.publishedAt,
    generatedAt: site.generatedAt,
    verifiedAt: site.lastVerifiedAt,
    crawlStatus: site.latestCrawlStatus,
    thumbnailUrl: post.thumbnailUrl,
    logoUrl: site.logoUrl
  }));
  return '<article class="result">' + media + '<div class="result-body"><div class="meta"><span>Content</span><span>@' + escapeHtml(site.handle || 'site') + '</span><span>' + escapeHtml(post.publishedAt || '') + '</span></div><h2><a href="' + escapeAttr(post.url || site.url || '#') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a></h2><p>' + escapeHtml(post.excerpt || site.description || '') + '</p><div class="tags">' + tags + '</div><code>' + escapeHtml(post.digest || '') + '</code>' + details + '</div></article>';
}

function renderShellResult(item) {
  const site = item.shell || item.site || {};
  const shellName = item.shellName || {};
  const title = site.title || site.handle || hostFromUrl(site.url) || 'PostSnail Shell';
  const media = renderMedia(site.logoUrl, title);
  const details = renderDetails('Shell details', mergeDetails(site.details, {
    resultType: 'shell',
    siteUrl: site.url,
    handle: site.handle,
    title: site.title,
    description: site.description,
    publicKey: site.publicKey,
    bundleFingerprint: site.bundleFingerprint,
    manifestUrl: site.manifestUrl,
    generatedAt: site.generatedAt,
    verifiedAt: site.lastVerifiedAt,
    crawlStatus: site.latestCrawlStatus,
    crawlMessage: site.latestCrawlMessage,
    logoUrl: site.logoUrl,
    name: shellName.name,
    fullName: shellName.fullName,
    forest: shellName.forest,
    expiresAt: shellName.expiresAt
  }));
  return '<article class="result">' + media + '<div class="result-body"><div class="meta"><span>Shell</span><span>@' + escapeHtml(site.handle || 'site') + '</span><span>' + escapeHtml(site.lastVerifiedAt || '') + '</span></div><h2><a href="' + escapeAttr(site.url || '#') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(title) + '</a></h2>' + renderShellAlias(shellName) + '<p>' + escapeHtml(site.description || 'Public PostSnail site profile indexed by Forest.') + '</p>' + details + '</div></article>';
}

function renderShellAlias(shellName) {
  if (!shellName || !shellName.name) return '';
  const label = shellName.fullName || ('@' + shellName.name + '@forest.postsnail.org');
  return '<div class="actions"><a class="alias-badge" href="/@' + escapeAttr(shellName.name) + '">' + escapeHtml(label.replace(/^@/, '')) + '</a><a class="btn" href="/shellnames/' + escapeAttr(shellName.name) + '.json">Alias JSON</a></div>';
}

function renderShellNameResult(item) {
  const shellName = item.shellName || {};
  const title = shellName.fullName || ('@' + (shellName.name || 'name'));
  const media = renderMedia('', title);
  const details = renderDetails('ShellName details', mergeDetails(shellName.record, {
    resultType: 'shellname',
    name: shellName.name,
    fullName: shellName.fullName,
    forest: shellName.forest,
    siteUrl: shellName.siteUrl,
    publicKey: shellName.publicKey,
    bundleFingerprint: shellName.bundleFingerprint,
    status: shellName.status,
    expiresAt: shellName.expiresAt,
    createdAt: shellName.createdAt,
    updatedAt: shellName.updatedAt
  }));
  return '<article class="result">' + media + '<div class="result-body"><div class="meta"><span>ShellName</span><span>' + escapeHtml(shellName.status || 'active') + '</span><span>' + escapeHtml(shellName.updatedAt || '') + '</span></div><h2><a href="/@' + escapeAttr(shellName.name || '') + '">' + escapeHtml(title) + '</a></h2><p>A Forest-scoped readable alias for a signed PostSnail Shell. It is not an account, DNS, or legal identity.</p><div class="actions"><a class="btn" href="' + escapeAttr(shellName.siteUrl || '#') + '" target="_blank" rel="noopener noreferrer">Visit microblog</a><a class="btn" href="/shellnames/' + escapeAttr(shellName.name || '') + '.json">JSON</a></div>' + details + '</div></article>';
}

function renderMedia(src, label) {
  if (src) return '<div class="result-media"><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(label || 'PostSnail result') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>';
  return '<div class="result-media" aria-hidden="true"><span class="result-fallback">' + escapeHtml(resultInitial(label)) + '</span></div>';
}

function renderDetails(summary, details) {
  const rows = Object.entries(details || {})
    .filter(([key, value]) => isPublicDetail(key, value))
    .map(([key, value]) => '<dt>' + escapeHtml(prettyKey(key)) + '</dt><dd>' + escapeHtml(formatDetailValue(value)) + '</dd>')
    .join('');
  return rows ? '<details><summary>' + escapeHtml(summary) + '</summary><dl class="detail-grid">' + rows + '</dl></details>' : '';
}

function mergeDetails(details, publicFields) {
  return { ...scrubDetails(details), ...publicFields };
}

function scrubDetails(details) {
  const clean = {};
  if (!details || typeof details !== 'object' || Array.isArray(details)) return clean;
  Object.entries(details).forEach(([key, value]) => {
    if (isPublicDetail(key, value)) clean[key] = value;
  });
  return clean;
}

function isPublicDetail(key, value) {
  if (!PUBLIC_DETAIL_KEYS.has(String(key))) return false;
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function formatDetailValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function prettyKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

function resultInitial(value) {
  const text = String(value || 'PostSnail').trim();
  return text ? text[0].toUpperCase() : 'P';
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
`;
}

export function renderShellNameProfile(shellName: any): string {
  const title = shellName?.fullName || "ShellName not found";
  const status = shellName?.status || "missing";
  const siteUrl = shellName?.siteUrl || "";
  const publicKey = shellName?.publicKey || "";
  const fingerprint = shellName?.bundleFingerprint || "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeDocument(title)} - PostSnail Forest</title>
  <meta name="description" content="PostSnail Forest ShellName profile.">
  <link rel="icon" href="/assets/brand/postsnail-icon.png">
  <link rel="stylesheet" href="/forest.css">
</head>
<body>
  <main class="shellname-profile">
    <a class="brand" href="/" aria-label="PostSnail Forest home">
      <img class="forest-brand-icon" src="/assets/brand/postsnail-icon.png" alt="" width="36" height="36" decoding="async">
      <span><strong>PostSnail Forest</strong><span>ShellName profile</span></span>
    </a>
    <section class="card">
      <p class="kicker">ShellName / Forest alias</p>
      <h1>${escapeDocument(title)}</h1>
      <p>${shellName ? "A readable Forest-scoped alias for a signed PostSnail Shell. It is not an account, DNS, or legal identity." : "No ShellName record was found for this name."}</p>
      ${shellName ? `<div class="actions"><a class="btn" href="${escapeDocument(siteUrl)}" target="_blank" rel="noopener noreferrer">Visit microblog</a><a class="btn" href="/shellnames/${escapeDocument(shellName.name)}.json">View JSON</a></div>` : ""}
    </section>
    <section class="card">
      <h2>Public details</h2>
      <dl>
        <dt>Status</dt><dd>${escapeDocument(status)}</dd>
        <dt>Site URL</dt><dd>${escapeDocument(siteUrl)}</dd>
        <dt>Public key</dt><dd>${escapeDocument(publicKey)}</dd>
        <dt>Fingerprint</dt><dd>${escapeDocument(fingerprint)}</dd>
        <dt>Expires</dt><dd>${escapeDocument(shellName?.expiresAt || "")}</dd>
        <dt>Updated</dt><dd>${escapeDocument(shellName?.updatedAt || "")}</dd>
      </dl>
    </section>
    <footer>© 2026 Boaz Alhadeff. PostSnail is Apache-2.0 licensed; redistributed copies must preserve NOTICE attribution.</footer>
  </main>
</body>
</html>`;
}

function escapeDocument(value: unknown): string {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char] || char));
}
