// 📁 frontend/src/App.tsx

import { useState, useEffect } from "react";
import "./App.css";

import Header from "./components/layout/Header";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import AgentDashboard from "./pages/AgentDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";

export type Page =
  | "home"
  | "register"
  | "login"
  | "change-password"
  | "dashboard"
  | "admin-panel"
  | "agent-dashboard"
  | "manager-dashboard";

function App() {
  const [page, setPage] = useState<Page>("home");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0);

  console.log('🔄 Текущая страница:', page);

  useEffect(() => {
    const role = localStorage.getItem("role");
    console.log('🔄 useEffect: роль из localStorage:', role);
    
    if (role === "Admin" || role === "admin") {
      console.log('✅ Автоматический вход как Админ');
      setUserRole("admin");
      setPage("admin-panel");
    } else if (role === "Manager" || role === "manager") {
      console.log('✅ Автоматический вход как Менеджер');
      setUserRole("manager");
      setPage("manager-dashboard");
    } else if (role === "Agent" || role === "agent") {
      console.log('✅ Автоматический вход как Агент');
      setUserRole("agent");
      setPage("agent-dashboard");
    }
  }, []);

  const handleLoginSuccess = (role?: string, isFirstLogin?: boolean) => {
    console.log('📌 App: получена роль:', role);
    console.log('📌 Первый вход:', isFirstLogin);
    
    // Если первый вход → смена пароля
    if (isFirstLogin) {
      console.log('🔄 Первый вход, перенаправление на смену пароля');
      setPage("change-password");
      return;
    }
    
    if (role === "Admin" || role === "admin") {
      console.log('✅ Админ, переход на admin-panel');
      setUserRole("admin");
      setPage("admin-panel");
      setForceUpdate(prev => prev + 1);
    } else if (role === "Manager" || role === "manager") {
      console.log('✅ Менеджер, переход на manager-dashboard');
      setUserRole("manager");
      setPage("manager-dashboard");
      setForceUpdate(prev => prev + 1);
    } else {
      console.log('✅ Агент, переход на agent-dashboard');
      setUserRole("agent");
      setPage("agent-dashboard");
      setForceUpdate(prev => prev + 1);
    }
  };

  const goToHome = () => {
    console.log('📌 Переход на Home');
    setPage("home");
  };

  const goToRegister = () => {
    console.log('📌 Переход на Register');
    setPage("register");
  };

  const goToLogin = () => {
    console.log('📌 Переход на Login');
    setPage("login");
  };

  const goToAdminPanel = () => {
    console.log('📌 Переход на Admin Panel');
    setPage("admin-panel");
  };

  const goToAgentDashboard = () => {
    console.log('📌 Переход на Agent Dashboard');
    setPage("agent-dashboard");
  };

  const goToManagerDashboard = () => {
    console.log('📌 Переход на Manager Dashboard');
    setPage("manager-dashboard");
  };

  return (
    <div className="page">
      <Header onHome={goToHome} />

      {page === "home" && (
        <Home
          onRegister={goToRegister}
          onAgentLogin={goToLogin}
          onAdminLogin={goToLogin}
        />
      )}

      {page === "register" && <Register />}
      
      {page === "login" && <Login onLoginSuccess={handleLoginSuccess} />}
      
      {page === "change-password" && <ChangePassword />}
      
      {page === "admin-panel" && <AdminPanel />}
      
      {page === "agent-dashboard" && <AgentDashboard />}
      
      {page === "manager-dashboard" && <ManagerDashboard />}
      
      {page === "dashboard" && <Dashboard />}
    </div>
  );
}

export default App;