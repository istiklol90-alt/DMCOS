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
    <main className="loginPage">
      <div className="loginCard">
        <p className="tag">DMC Operating System</p>
        <h1>Welcome Back</h1>
        <p className="subtitle">Login to access your DMC OS account.</p>

        {error && (
          <div style={styles.errorBox}>
            ❌ {error}
          </div>
        )}

        <form className="loginForm" onSubmit={handleLogin}>
          <div className="field">
            <label>Email</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Введите ваш email"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
            />
          </div>

          <div className="loginOptions">
            <label className="remember">
              <input type="checkbox" />
              Remember me
            </label>
            <button type="button" className="linkButton">
              Forgot password?
            </button>
          </div>

          <button
            className="primary fullWidth"
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="loginFooter">
          <p>CEO • Admin • Sales • Reservation • Finance • Agent</p>
        </div>
      </div>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  errorBox: {
    background: "#fee2e2",
    color: "#dc2626",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "20px",
    fontSize: "14px",
  },
};

export default Login;