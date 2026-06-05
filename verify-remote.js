import { verifyRemoteSite } from "./src/remote-verifier.js";

const form = document.getElementById("remote-form");
const input = document.getElementById("remote-url");
const resultEl = document.getElementById("remote-result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultEl.className = "notice warning";
  resultEl.textContent = "Fetching public proof metadata...";
  try {
    const result = await verifyRemoteSite(input.value.trim());
    renderResult(result);
  } catch (error) {
    resultEl.className = "notice warning";
    resultEl.textContent = error.message || "Remote verification failed.";
  }
});

function renderResult(result) {
  resultEl.className = `notice ${result.ok ? "good" : "warning"}`;
  resultEl.innerHTML = `
    <strong>${result.ok ? "Remote proof verified" : "Remote proof could not be fully verified"}</strong>
    <p>${escapeHtml(result.summary.siteTitle || result.summary.siteUrl)}</p>
    ${result.summary.bundleFingerprint ? `<p class="hash-cell">${escapeHtml(result.summary.bundleFingerprint)}</p>` : ""}
    <div class="check-list">
      ${result.checks.map((check) => `
        <div class="check-row ${check.ok ? "ok" : "bad"}">
          <span>${check.ok ? "Pass" : "Fail"}</span>
          <strong>${escapeHtml(check.label)}</strong>
          ${check.error ? `<p>${escapeHtml(check.error)}</p>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
