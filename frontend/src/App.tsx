// 📁 frontend/src/App.tsx

import { Outlet, useLocation } from "react-router-dom";
import "./App.css";

import Header from "./components/layout/Header";

// ---------------------------------------------------------------------------
// Routing fix (2026-07-29): this used to own an entire `useState<Page>`
// page-switcher, manually rendering one of ~9 page components and never
// delegating to react-router-dom's own `<Outlet/>` -- meaning router.tsx's
// nested routes were matched by the router but never actually mounted, so
// direct URLs/bookmarks/refreshes never worked (documented, known issue).
// App is now a thin layout shell: it renders the real matched child route
// via <Outlet/>, and only decides whether to show the generic marketing
// Header (AgentTopNav replaces it on the three agent/admin pages that have
// their own richer top nav -- same three pages the old `page !== "..."`
// check excluded, just driven by URL path instead of local state now).
//
// Where did the old mount-effect ("stale role in localStorage -> auto-jump
// to that dashboard") and the 8 goTo*/handleLoginSuccess functions go?
// Relocated to where they're actually needed now that there's no shared
// page state to own them centrally: Home.tsx does its own "already logged
// in" redirect on mount; Login.tsx picks its own post-login destination;
// every other page/component that used to receive a navigation callback
// prop now calls useNavigate() directly (Home, Login, Header,
// ChangePassword, AgentDashboard_v2, HotelSearch, AgentTopNav, AdminPanel,
// ManagerDashboard). Auth guarding (token/role checks that used to be
// duplicated in AgentDashboard_v2.tsx/HotelSearch.tsx, and were entirely
// MISSING in AdminPanel.tsx/ManagerDashboard.tsx -- a real gap found
// during this refactor) is now router.tsx's RequireAuth, applied once per
// protected route instead of scattered/inconsistent per-page checks.
// ---------------------------------------------------------------------------

const HEADER_HIDDEN_ON = ["/admin-panel", "/agent-dashboard", "/hotel-search"];

function App() {
  const location = useLocation();
  const showHeader = !HEADER_HIDDEN_ON.includes(location.pathname);

  return (
    <div className="page">
      {showHeader && <Header />}
      <Outlet />
    </div>
  );
}

export default App;
