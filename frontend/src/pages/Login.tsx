import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log("📥 Ответ сервера:", data);

      if (data.success) {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", data.role);
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("is_first_login", data.is_first_login ? "true" : "false");

        console.log("✅ Роль получена:", data.role);
        console.log("✅ Первый вход:", data.is_first_login);

        // Routing fix (2026-07-29): same role-based destination logic
        // App.tsx's own handleLoginSuccess used to own, relocated here
        // now that App is a thin layout with no page state to set.
        if (data.is_first_login) {
          navigate("/change-password");
        } else if (data.role === "Admin" || data.role === "admin") {
          navigate("/admin-panel");
        } else if (data.role === "Manager" || data.role === "manager") {
          navigate("/manager-dashboard");
        } else {
          navigate("/agent-dashboard");
        }
      } else {
        setError(data.message || "Invalid email or password");
      }
    } catch (error) {
      setError("Cannot connect to Backend");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-78px)] items-center justify-center bg-sand px-6 py-12 font-sans text-slate">
      <Card padding="none" shadow="card" className="w-full max-w-lg p-10 sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-deep">DMC Operating System</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Welcome Back</h1>
        <p className="mt-2 text-sm text-slate/70">Login to access your DMC OS account.</p>

        {error && (
          <div className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <form className="mt-6 flex flex-col gap-5" onSubmit={handleLogin}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Email</label>
            <Input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Введите ваш email"
              required
              tone="sand"
              scale="lg"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              tone="sand"
              scale="lg"
              className="w-full"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate/70">
              <input type="checkbox" className="accent-gold" />
              Remember me
            </label>
            <Button type="button" variant="ghost">
              Forgot password?
            </Button>
          </div>

          <Button type="submit" variant="primary" size="lg" disabled={loading} className="w-full">
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>

        <div className="mt-8 border-t border-ink/10 pt-5 text-center text-xs text-slate/50">
          <p>CEO • Admin • Sales • Reservation • Finance • Agent</p>
        </div>
      </Card>
    </main>
  );
}

export default Login;