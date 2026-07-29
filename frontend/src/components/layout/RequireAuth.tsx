import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Routing fix (2026-07-29): the single shared auth guard every protected
// route goes through, replacing what used to be scattered, inconsistent
// per-page checks. AgentDashboard_v2.tsx and HotelSearch.tsx each
// independently implemented an identical token/role check with a hard
// window.location.href redirect; AdminPanel.tsx and ManagerDashboard.tsx
// had NO client-side guard at all -- a real gap found during this
// refactor's own investigation, not hypothetical (an unauthenticated user
// landing on either just saw silently-failing API calls, never a
// redirect). This consolidates both into one place, applied consistently
// via router.tsx.
//
// localStorage.clear() on a missing token preserves the exact reasoning
// the original AgentDashboard_v2.tsx guard's own comment already
// documented: clearing stale role/user data too (not just the token)
// avoids a future redirect loop, since nothing here re-reads a leftover
// "role" to route back to a protected page anymore.
//
// Role compare is case-insensitive, matching this project's existing
// string-based role convention (role casing is inconsistent across the
// stack -- checked exact casing rather than assuming one).
export default function RequireAuth({
  role,
  children,
}: {
  role?: "admin" | "agent" | "manager";
  children: ReactNode;
}) {
  const token = localStorage.getItem("token");
  const userRole = (localStorage.getItem("role") || "").toLowerCase();

  if (!token) {
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  if (role && userRole !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
