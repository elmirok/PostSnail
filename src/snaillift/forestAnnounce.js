const DEFAULT_FOREST_ANNOUNCE_URL = "https://forest.postsnail.org/api/announce";

export async function announceForestAfterLiveVerification({
  liveVerification,
  announcePayload,
  forestAnnounceUrl = DEFAULT_FOREST_ANNOUNCE_URL,
  fetcher = fetch,
} = {}) {
  if (!liveVerification?.ok) {
    return {
      ok: false,
      status: 0,
      message: "Forest was not notified because live verification did not pass.",
    };
  }
  if (!announcePayload || typeof announcePayload !== "object") {
    return { ok: false, status: 0, message: "Missing PostSnail announce payload." };
  }

  const response = await fetcher(new Request(forestAnnounceUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(announcePayload),
  }));
  let body = {};
  try {
    body = await response.clone().json();
  } catch {
    body = { message: await response.text() };
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    message: body.message || body.error || body.status || (response.ok ? "Forest accepted the announce." : "Forest rejected the announce."),
  };
}
