// Stable per-browser identity for the ideas + comments + ask surfaces.
// We generate a UUID once on first use and stash it in localStorage; every
// subsequent API call ships it so the backend can attribute submissions
// without forcing a login.
//
// Privacy note: this is not a real account — it's wiped if the user clears
// site data, and a savvy user can swap it freely. The backend treats it as
// best-effort identity for moderation/dedupe, not as a security boundary.

const STORAGE_KEY = "docweb:clientId";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers — good enough for non-cryptographic ID.
  return "fallback-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked (Safari private mode etc.) — return a per-session
    // ID; rate-limit attribution may drift but the UI still works.
    return generateId();
  }
}
