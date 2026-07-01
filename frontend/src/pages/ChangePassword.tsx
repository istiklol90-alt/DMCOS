import { useState } from "react";
import axios from "axios";
import { API_URL } from "../config";

const ChangePassword = () => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const userData = localStorage.getItem("user");
      const email = userData ? JSON.parse(userData).email : null;

      const response = await axios.post(
        `${API_URL}/auth/change-password`,
        {
          old_password: oldPassword,
          new_password: newPassword,
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setSuccess(true);
        localStorage.clear();

        if (email) {
          const loginResponse = await axios.post(
            `${API_URL}/auth/login`,
            {
              email: email,
              password: newPassword,
            }
          );

          if (loginResponse.data.success) {
            localStorage.setItem("token", loginResponse.data.access_token);
            localStorage.setItem("role", loginResponse.data.role);
            localStorage.setItem("user", JSON.stringify(loginResponse.data.user));
            localStorage.setItem("is_first_login", "false");

            setTimeout(() => {
              window.location.href = "/";
            }, 1500);
          }
        }
      } else {
        setError(response.data.message || "Ошибка смены пароля");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Ошибка сервера");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <h1>✅ Пароль успешно изменен!</h1>
        <p>Вы будете автоматически перенаправлены...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>🔑 Смена пароля</h1>
      <p>Это ваш первый вход. Установите новый пароль.</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label>Текущий пароль</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Новый пароль</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label>Подтверждение пароля</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Сохранение..." : "Сменить пароль"}
        </button>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "500px",
    margin: "50px auto",
    padding: "30px",
    fontFamily: "Arial, sans-serif",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  input: {
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "16px",
  },
  button: {
    padding: "14px",
    background: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    cursor: "pointer",
  },
  error: {
    color: "#dc3545",
    padding: "10px",
    background: "#f8d7da",
    borderRadius: "8px",
  },
};

export default ChangePassword;