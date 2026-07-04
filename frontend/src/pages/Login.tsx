import { useState } from "react";
import { API_URL } from "../config";

type LoginProps = {
  onLoginSuccess: (role?: string, isFirstLogin?: boolean) => void;
};

function Login({ onLoginSuccess }: LoginProps) {
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
        console.log("📌 Переход на:", data.role === "Admin" ? "admin-panel" : "dashboard");

        onLoginSuccess(data.role, data.is_first_login);
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
      <div className="w-full max-w-lg rounded-2xl border border-ink/10 bg-white p-10 sm:p-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-coral">DMC Operating System</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Welcome Back</h1>
        <p className="mt-2 text-sm text-slate/70">Login to access your DMC OS account.</p>

        {error && (
          <div className="mt-5 rounded-lg bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
            {error}
          </div>
        )}

        <form className="mt-6 flex flex-col gap-5" onSubmit={handleLogin}>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Email</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Введите ваш email"
              required
              className="w-full appearance-none rounded-lg border border-ink/15 bg-sand/40 px-4 py-3 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              className="w-full appearance-none rounded-lg border border-ink/15 bg-sand/40 px-4 py-3 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate/70">
              <input type="checkbox" className="accent-coral" />
              Remember me
            </label>
            <button
              type="button"
              className="appearance-none border-0 bg-transparent text-sm font-medium text-teal hover:underline"
            >
              Forgot password?
            </button>
          </div>

          <button
            className="appearance-none rounded-xl border-0 bg-coral py-3.5 text-sm font-semibold text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="mt-8 border-t border-ink/10 pt-5 text-center text-xs text-slate/50">
          <p>CEO • Admin • Sales • Reservation • Finance • Agent</p>
        </div>
      </div>
    </main>
  );
}

export default Login;