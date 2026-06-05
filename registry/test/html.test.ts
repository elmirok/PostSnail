import { describe, expect, test } from "vitest";
import { renderSearchPage } from "../src/html";

describe("registry homepage", () => {
  test("renders a creator registration form beside search", () => {
    const html = renderSearchPage();

    expect(html).toContain("Register your microblog");
    expect(html).toContain('id="register-form"');
    expect(html).toContain('id="site-url"');
    expect(html).toContain('name="url"');
    expect(html).toContain('placeholder="https://your-blog.example/"');
    expect(html).toContain('id="registration-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="search-form"');
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
});
