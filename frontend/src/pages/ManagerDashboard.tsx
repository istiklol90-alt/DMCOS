import { useState, useEffect } from "react";

const ManagerDashboard = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>📊 Manager Dashboard</h1>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Выйти
        </button>
      </div>

      <p style={styles.subtitle}>Управление агентами и бронированиями</p>

      <div style={styles.stats}>
        <div style={styles.statCard}>
          <h3>👥 Агенты</h3>
          <p>25</p>
        </div>
        <div style={styles.statCard}>
          <h3>📋 Бронирования</h3>
          <p>48</p>
        </div>
        <div style={styles.statCard}>
          <h3>💰 Доход</h3>
          <p>$125,000</p>
        </div>
        <div style={styles.statCard}>
          <h3>📈 Рост</h3>
          <p>+12%</p>
        </div>
      </div>

      <div style={styles.content}>
        <h2>📋 Последние бронирования</h2>
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Агент</span>
            <span>Отель</span>
            <span>Дата</span>
            <span>Сумма</span>
            <span>Статус</span>
          </div>
          <div style={styles.tableRow}>
            <span>Иванов И.</span>
            <span>Grand Hotel</span>
            <span>01.07.2026</span>
            <span>$450</span>
            <span style={{ color: "#28a745" }}>✅ Подтверждено</span>
          </div>
          <div style={styles.tableRow}>
            <span>Петров П.</span>
            <span>Plaza Hotel</span>
            <span>02.07.2026</span>
            <span>$680</span>
            <span style={{ color: "#ffc107" }}>⏳ В обработке</span>
          </div>
          <div style={styles.tableRow}>
            <span>Сидоров С.</span>
            <span>City Inn</span>
            <span>03.07.2026</span>
            <span>$320</span>
            <span style={{ color: "#dc3545" }}>❌ Отменено</span>
          </div>
        </div>
      </div>

      {user && (
        <div style={styles.userInfo}>
          <p><strong>👤 {user.name || user.full_name}</strong></p>
          <p><strong>📧 {user.email}</strong></p>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #e0e0e0",
    paddingBottom: "15px",
    marginBottom: "10px",
  },
  logoutButton: {
    padding: "8px 20px",
    background: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },
  subtitle: {
    color: "#666",
    marginBottom: "30px",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginBottom: "30px",
  },
  statCard: {
    background: "#f8f9fa",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
    border: "1px solid #e0e0e0",
  },
  content: {
    background: "white",
    padding: "24px",
    borderRadius: "12px",
    border: "1px solid #ddd",
  },
  table: {
    marginTop: "15px",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
    gap: "10px",
    padding: "12px",
    background: "#f8f9fa",
    fontWeight: "bold",
    borderRadius: "8px",
    marginBottom: "8px",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
    gap: "10px",
    padding: "12px",
    borderBottom: "1px solid #eee",
  },
  userInfo: {
    marginTop: "30px",
    padding: "20px",
    background: "#e3f2fd",
    borderRadius: "10px",
    border: "1px solid #90caf9",
  },
};

export default ManagerDashboard;