import { createBrowserRouter, Navigate } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import DestinationPage from "./pages/DestinationPage";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AgentDashboard_v2 from "./pages/AgentDashboard_v2";
import ManagerDashboard from "./pages/ManagerDashboard";
import HotelSearch from "./pages/HotelSearch";
import RequireAuth from "./components/layout/RequireAuth";

// ---------------------------------------------------------------------------
// Routing fix (2026-07-29): every page App.tsx used to render from its own
// `useState<Page>` is now a real route here, matched against the URL --
// direct links/bookmarks/refreshes now land on the actual intended page
// instead of silently falling back to Home (the documented, known bug).
// Home/Register/Login stay unguarded (that's the point of them); every
// other page is wrapped in RequireAuth, the single shared token/role guard
// that replaces what used to be duplicated (AgentDashboard_v2.tsx/
// HotelSearch.tsx) or entirely missing (AdminPanel.tsx/ManagerDashboard.tsx
// had no client-side guard at all before this) per-page.
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "destinations/:slug", element: <DestinationPage /> },
      { path: "register", element: <Register /> },
      { path: "login", element: <Login /> },
      {
        path: "change-password",
        element: (
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        ),
      },
      {
        path: "dashboard",
        element: (
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        ),
      },
      {
        path: "admin-panel",
        element: (
          <RequireAuth role="admin">
            <AdminPanel />
          </RequireAuth>
        ),
      },
      {
        path: "agent-dashboard",
        element: (
          <RequireAuth role="agent">
            <AgentDashboard_v2 />
          </RequireAuth>
        ),
      },
      {
        path: "manager-dashboard",
        element: (
          <RequireAuth role="manager">
            <ManagerDashboard />
          </RequireAuth>
        ),
      },
      {
        path: "hotel-search",
        element: (
          <RequireAuth role="agent">
            <HotelSearch />
          </RequireAuth>
        ),
      },
      // No route matched -- previously nothing handled this at all.
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default router;
