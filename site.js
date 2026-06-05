const landingSearch = document.getElementById("landing-search");

if (landingSearch) {
  landingSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const target = new URL(form.dataset.forestUrl || form.action);
    const query = new FormData(form).get("q");
    const text = typeof query === "string" ? query.trim() : "";
    if (text) target.searchParams.set("q", text);
    window.location.assign(target.toString());
  });
}
