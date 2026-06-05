import { describe, expect, test } from "vitest";
import { renderSearchPage } from "../src/html";

describe("registry homepage", () => {
  test("renders a creator registration form beside search", () => {
    const html = renderSearchPage();

    expect(html).toContain("PostSnail Forest");
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
    expect(html).toContain('id="search-form"');
    expect(html).toContain('class="panel forest-search-panel"');
    expect(html).toContain('class="search-box"');
    expect(html).toContain('placeholder="Search microblogs, creators, tags, content"');
    expect(html).toContain("Filter by tag");
    expect(html).toContain('name="scope"');
    expect(html).toContain('value="all" checked');
    expect(html).toContain("Content");
    expect(html).toContain("Shell");
    expect(html).toContain("setRegistrationOpen");
    expect(html).toContain("Hide registration form");
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
    expect(html).toContain("qInput.value = initialQ");
    expect(html).toContain("tagInput.value = initialTag");
    expect(html).toContain("if (initialQ || initialTag) search()");
  });
});
