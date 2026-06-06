import { describe, expect, test } from "vitest";
import { renderSearchPage } from "../src/html";

describe("registry homepage", () => {
  test("renders minimal search first with collapsed registration and deferred filters", () => {
    const html = renderSearchPage();

    expect(html).toContain("PostSnail Forest");
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
    expect(html).toContain("setRegistrationOpen");
    expect(html).toContain("Hide registration form");
    expect(html).toContain("renderSavedSubmissionSummary");
    expect(html).not.toContain("const shouldOpen");
  });

  test("renders rich result media and details behavior", () => {
    const html = renderSearchPage();

    expect(html).toContain("result-media");
    expect(html).toContain("renderMedia");
    expect(html).toContain("renderDetails");
    expect(html).toContain("<details");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain("Shell details");
    expect(html).toContain("Post details");
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

    expect(html).toContain("postsnail.registry.lastSubmission.v1");
    expect(html).toContain("fetch('/api/submit'");
    expect(html).toContain("fetch('/api/submissions/' + encodeURIComponent");
    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain("This site is already queued or recently indexed.");
    expect(html).toContain("Submission rate limit reached.");
    expect(html).toContain("Submit a public https URL.");
    expect(html).toContain("Your microblog is indexed.");
  });

  test("supports q and tag URL params for landing-page redirects", () => {
    const html = renderSearchPage();

    expect(html).toContain("new URLSearchParams(window.location.search)");
    expect(html).toContain("params.get('q')");
    expect(html).toContain("params.get('tag')");
    expect(html).toContain("params.get('scope')");
    expect(html).toContain("qInput.value = initialQ");
    expect(html).toContain("tagInput.value = initialTag");
    expect(html).toContain("if (initialQ || initialTag) search()");
    expect(html).toContain("syncUrlParams");
  });

  test("search rendering exposes result filters and scrolls to first result", () => {
    const html = renderSearchPage();

    expect(html).toContain("setFiltersVisible");
    expect(html).toContain("scrollToFirstResult");
    expect(html).toContain("resultsEl.querySelector('.result')");
    expect(html).toContain("prefers-reduced-motion: reduce");
    expect(html).toContain("items.length ? items.map(renderResult).join('')");
  });
});
