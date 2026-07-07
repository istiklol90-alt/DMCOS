import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AgentDashboard_v2 from "./pages/AgentDashboard_v2";
import HotelSearch from "./pages/HotelSearch";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "register",
        element: <Register />,
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "dashboard",
        element: <Dashboard />,
      },
      {
        path: "admin-panel",
        element: <AdminPanel />,
      },
      {
        path: "agent-dashboard",
        element: <AgentDashboard_v2 />,
      },
      {
        path: "hotel-search",
        element: <HotelSearch />,
      },
    ],
  },
]);

export default router;