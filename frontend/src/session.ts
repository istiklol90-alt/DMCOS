// ---------------------------------------------------------------------------
// Session expiry, handled in one place.
//
// Access tokens live 30 minutes (authentication engine's
// ACCESS_TOKEN_EXPIRE_MINUTES) and there is no refresh flow, so a tab left
// open past that point starts failing every request with a 401 "Invalid
// token". Until now nothing anywhere reacted to that: each panel simply
// rendered the raw backend string in red, or -- worse -- sat on "Загрузка..."
// forever, so a perfectly healthy screen looked broken and gave the user no
// idea that all they had to do was log in again. Reported from a real agent
// session (booking detail: red "Invalid token" under Номера, guests stuck
// loading).
//
// Every fetchJson helper in the app calls handleSessionExpired() the moment
// it sees a 401. The stale credentials are cleared (leaving them behind is
// what produced this project's old redirect-loop trap) and the browser goes
// to /login?expired=1, where Login.tsx explains what happened instead of
// showing an empty form for no visible reason.
//
// A hard location assignment rather than react-router navigation is
// deliberate: this is reachable from module-scope helpers that have no
// router context, and a full reload is the honest response to "every piece
// of state on this page was fetched with credentials that no longer work".
// ---------------------------------------------------------------------------

let redirecting = false;

export function handleSessionExpired() {
  // Several requests usually fail together (a panel fetches rooms, guests and
  // correspondence at once). Only the first one gets to redirect.
  if (redirecting) return;
  redirecting = true;

  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");

  window.location.assign("/login?expired=1");
}

// True when the browser landed on /login because of the redirect above,
// rather than by the user going there themselves.
export function sessionJustExpired(): boolean {
  return new URLSearchParams(window.location.search).get("expired") === "1";
}
