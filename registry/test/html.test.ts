import { describe, expect, test } from "vitest";
import { renderForestCss, renderForestScript, renderSearchPage } from "../src/html";

describe("registry homepage", () => {
  test("renders minimal search first with collapsed registration and deferred filters", () => {
    const html = renderSearchPage();

    expect(html).toContain("PostSnail Forest");
    expect(html).toContain('src="/assets/brand/postsnail-icon.png"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain("Search PostSnail Forest");
    expect(html).not.toContain("Find and register creator-owned microblogs.");
    expect(html).toContain("Register your microblog");
    expect(html).toContain('id="register-form"');
    expect(html).toContain('id="toggle-register"');
    expect(html).toContain('aria-controls="register-panel"');
    expect(html).toContain('id="register-panel"');
    expect(html).toContain('hidden');
    expect(html).toContain('id="site-url"');
    expect(html).toContain('name="url"');
    expect(html).toContain('placeholder="https://your-blog.example/"');
    expect(html).toContain('id="registration-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="saved-submission-summary"');
    expect(html).toContain('id="search-form"');
    expect(html).toContain('class="forest-search-panel"');
    expect(html).toContain('class="search-box"');
    expect(html).toContain('placeholder="Search PostSnail Forest"');
    expect(html).toContain('id="result-filters"');
    expect(html).toContain('class="results-filter-bar"');
    expect(html).toContain('form="search-form"');
    expect(html).toContain("Filter by tag");
    expect(html).toContain('name="scope"');
    expect(html).toMatch(/name="scope" value="all"[^>]*checked/);
    expect(html).toContain("Content");
    expect(html).toContain("Shell");
    expect(html).toContain('id="sort"');
    expect(html).toContain('name="sort"');
    expect(html).toContain("Best match");
    expect(html).toContain("Newest");
    expect(html).toContain("A-Z");
    expect(renderForestScript()).toContain("setRegistrationOpen");
    expect(renderForestScript()).toContain("Hide registration form");
    expect(renderForestScript()).toContain("renderSavedSubmissionSummary");
    expect(html).not.toContain("const shouldOpen");
  });

  test("renders rich result media and details behavior", () => {
    const css = renderForestCss();
    const script = renderForestScript();

    expect(css).toContain("result-media");
    expect(script).toContain("renderMedia");
    expect(script).toContain("renderDetails");
    expect(script).toContain("PUBLIC_DETAIL_KEYS");
    expect(script).toContain("<details");
    expect(script).toContain('loading="lazy"');
    expect(script).toContain('referrerpolicy="no-referrer"');
    expect(script).toContain("Shell details");
    expect(script).toContain("Post details");
    expect(script).toContain("alias-badge");
    expect(script).toContain("renderShellAlias");
    expect(script).not.toContain("private|secret|passphrase");
  });

  test("renders compact PostSnail legal footer links", () => {
    const html = renderSearchPage();

    expect(html).toContain("© 2026 Boaz Alhadeff");
    expect(html).toContain("PostSnail is Apache-2.0 licensed");
    expect(html).toContain("NOTICE attribution");
    expect(html).toContain("https://postsnail.org/docs/legal/");
    expect(html).toContain("https://postsnail.org/LICENSE");
    expect(html).toContain("https://postsnail.org/NOTICE");
    expect(html).toContain("https://postsnail.org/THIRD_PARTY_NOTICES.md");
  });

  test("includes client behavior for submit, polling, saved status, and common failures", () => {
    const html = renderSearchPage();
    const script = renderForestScript();

    expect(html).toContain('<link rel="stylesheet" href="/forest.css">');
    expect(html).toContain('<script src="/forest.js" defer></script>');
    expect(html).not.toContain("<style>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("unsafe-inline");
    expect(script).toContain("postsnail.registry.lastSubmission.v1");
    expect(script).toContain("fetch('/api/submit'");
    expect(script).toContain("fetch('/api/submissions/' + encodeURIComponent");
    expect(script).toContain("localStorage.setItem");
    expect(script).toContain("localStorage.getItem");
    expect(script).toContain("This site is already queued or recently indexed.");
    expect(script).toContain("Submission rate limit reached.");
    expect(script).toContain("Submit a public https URL.");
    expect(script).toContain("Your microblog is indexed.");
  });

  test("supports q and tag URL params for landing-page redirects", () => {
    const script = renderForestScript();

    expect(script).toContain("new URLSearchParams(window.location.search)");
    expect(script).toContain("params.get('q')");
    expect(script).toContain("params.get('tag')");
    expect(script).toContain("params.get('scope')");
    expect(script).toContain("params.get('sort')");
    expect(script).toContain("qInput.value = initialQ");
    expect(script).toContain("tagInput.value = initialTag");
    expect(script).toContain("sortInput.value = initialSort");
    expect(script).toContain("if (initialQ || initialTag) search()");
    expect(script).toContain("syncUrlParams");
  });

  test("search rendering exposes result filters and scrolls to first result", () => {
    const script = renderForestScript();

    expect(script).toContain("setFiltersVisible");
    expect(script).toContain("scrollToFirstResult");
    expect(script).toContain("resultsEl.querySelector('.result')");
    expect(script).toContain("prefers-reduced-motion: reduce");
    expect(script).toContain("items.length ? items.map(renderResult).join('')");
  });
});
