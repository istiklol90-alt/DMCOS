import { useState, useEffect } from "react";
import { API_URL } from "../config";

const AdminPanel = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      const usersRes = await fetch(`${API_URL}/users`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      setUsers(usersData);

      const regRes = await fetch(`${API_URL}/agent-registrations`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const regData = await regRes.json();
      setRegistrations(regData);

    } catch (err) {
      console.error("Ошибка загрузки:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = users.filter((u: any) => {
    if (filterType === "agent") return u.role?.toLowerCase() === "agent";
    if (filterType === "admin") return u.role?.toLowerCase() === "admin";
    if (filterType === "active") return u.is_active === true;
    if (filterType === "never_logged") return u.is_active === true && !u.last_login;
    if (filterType === "inactive") return u.is_active === false;
    return true;
  }).filter((u: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const pendingRegs = registrations.filter((r: any) => r.status === "pending");

  const stats = {
    total: users.length,
    agents: users.filter((u: any) => u.role?.toLowerCase() === "agent").length,
    admins: users.filter((u: any) => u.role?.toLowerCase() === "admin").length,
    active: users.filter((u: any) => u.is_active === true).length,
    neverLogged: users.filter((u: any) => u.is_active === true && !u.last_login).length,
    inactive: users.filter((u: any) => u.is_active === false).length,
    pending: pendingRegs.length,
  };

  const getStatusBadge = (status: string) => {
    const styles: any = {
      pending: { background: "#ffc107", color: "#333" },
      approved: { background: "#28a745", color: "white" },
      rejected: { background: "#dc3545", color: "white" },
    };
    const labels: any = {
      pending: "⏳ В ожидании",
      approved: "✅ Одобрено",
      rejected: "❌ Отклонено",
    };
    return <span style={{ ...styles[status], padding: "3px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
      {labels[status] || status}
    </span>;
  };

  const handleApprove = async (id: number) => {
    if (!window.confirm("Одобрить заявку?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/agent-registrations/${id}/approve`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comments: "Одобрено" })
      });
      alert("✅ Заявка одобрена!");
      loadData();
    } catch (err) {
      alert("❌ Ошибка при одобрении");
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt("Укажите причину отклонения:");
    if (!reason) return;
    if (!window.confirm("Отклонить заявку?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/agent-registrations/${id}/reject?comments=${encodeURIComponent(reason)}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      alert("❌ Заявка отклонена");
      loadData();
    } catch (err) {
      alert("❌ Ошибка при отклонении");
    }
  };

  const handleFilter = (type: string) => {
    setFilterType(type === filterType ? "all" : type);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>📋 Admin Panel</h1>
        <p style={styles.loading}>⏳ Загрузка...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📋 Admin Panel</h1>
      <p style={styles.subtitle}>Управление системой</p>

      {/* ===== СТАТИСТИКА ===== */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #6c757d", cursor: "pointer", background: filterType === "all" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("all"); }}>
          <span style={styles.statLabel}>👤 Всего</span>
          <span style={styles.statNumber}>{stats.total}</span>
          {filterType === "all" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #007bff", cursor: "pointer", background: filterType === "agent" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("agent"); }}>
          <span style={styles.statLabel}>🤝 Агенты</span>
          <span style={styles.statNumber}>{stats.agents}</span>
          {filterType === "agent" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #dc3545", cursor: "pointer", background: filterType === "admin" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("admin"); }}>
          <span style={styles.statLabel}>🔐 Админы</span>
          <span style={styles.statNumber}>{stats.admins}</span>
          {filterType === "admin" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #28a745", cursor: "pointer", background: filterType === "active" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("active"); }}>
          <span style={styles.statLabel}>✅ Активные</span>
          <span style={styles.statNumber}>{stats.active}</span>
          {filterType === "active" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #ffc107", cursor: "pointer", background: filterType === "never_logged" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("never_logged"); }}>
          <span style={styles.statLabel}>🟡 Не входили</span>
          <span style={styles.statNumber}>{stats.neverLogged}</span>
          {filterType === "never_logged" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #dc3545", cursor: "pointer", background: filterType === "inactive" ? "#e9ecef" : "white" }} onClick={() => { handleFilter("inactive"); }}>
          <span style={styles.statLabel}>⛔ Неактивные</span>
          <span style={styles.statNumber}>{stats.inactive}</span>
          {filterType === "inactive" && <span style={styles.activeFilter}>✓</span>}
        </div>
        <div style={{ ...styles.statCard, borderBottom: "4px solid #ffc107" }}>
          <span style={styles.statLabel}>📋 Заявки</span>
          <span style={styles.statNumber}>{stats.pending}</span>
        </div>
      </div>

      {/* ===== ЗАЯВКИ ===== */}
      {pendingRegs.length > 0 && (
        <div style={styles.regSection}>
          <h3 style={styles.regSectionTitle}>📋 Заявки на регистрацию</h3>
          {pendingRegs.map((reg: any) => (
            <div key={reg.id} style={styles.regCard}>
              <div style={styles.regHeader}>
                <div>
                  <span style={styles.regName}>{reg.full_name || reg.company_name}</span>
                  <span style={styles.regEmail}>📧 {reg.email}</span>
                </div>
                {getStatusBadge(reg.status)}
              </div>
              <div style={styles.regBody}>
                <span>📞 {reg.phone}</span>
                <span>🌍 {reg.country}</span>
                <span>🏙️ {reg.city}</span>
                <span>🏢 {reg.company_name}</span>
              </div>
              <div style={styles.regActions}>
                <button onClick={() => handleApprove(reg.id)} style={styles.approveBtn}>✅ Одобрить</button>
                <button onClick={() => handleReject(reg.id)} style={styles.rejectBtn}>❌ Отклонить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== ПОЛЬЗОВАТЕЛИ ===== */}
      <div style={styles.filters}>
        <input
          type="text"
          placeholder="🔍 Поиск по имени или email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        {filterType !== "all" && (
          <button onClick={() => { handleFilter("all"); }} style={styles.clearFilter}>
            ✕ Сбросить фильтр
          </button>
        )}
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} style={styles.clearFilter}>
            ✕ Очистить поиск
          </button>
        )}
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Имя</th>
              <th style={styles.th}>Email / Логин</th>
              <th style={styles.th}>Пароль</th>
              <th style={styles.th}>Роль</th>
              <th style={styles.th}>Статус</th>
              <th style={styles.th}>Последний вход</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                  📭 Пользователи не найдены
                </td>
              </tr>
            ) : (
              filteredUsers.map((user: any, index: number) => (
                <tr key={user.id} style={styles.tr}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.td}><strong>{user.name || "—"}</strong></td>
                  <td style={styles.td}>{user.email || "—"}</td>
                  <td style={styles.td}>••••••••</td>
                  <td style={styles.td}>
                    <span style={{
                      background: user.role?.toLowerCase() === "admin" ? "#dc3545" : "#007bff",
                      color: "white",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}>
                      {user.role || "agent"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      color: user.is_active && user.last_login ? "#28a745" : user.is_active ? "#ffc107" : "#dc3545",
                      fontWeight: "bold"
                    }}>
                      {!user.is_active ? "⛔ Неактивен" : !user.last_login ? "🟡 Не входил" : "✅ Активен"}
                    </span>
                  </td>
                  <td style={styles.td}>{user.last_login ? new Date(user.last_login).toLocaleString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.footer}>
        <span>👥 Всего: <strong>{filteredUsers.length}</strong> пользователей</span>
        {filterType !== "all" && (
          <span style={{ color: "#666" }}>
            Фильтр: <strong>{
              filterType === "agent" ? "Агенты" :
              filterType === "admin" ? "Админы" :
              filterType === "active" ? "Активные" :
              filterType === "never_logged" ? "Не входили" :
              filterType === "inactive" ? "Неактивные" : ""
            }</strong>
          </span>
        )}
        {searchQuery && (
          <span style={{ color: "#666" }}>
            Поиск: <strong>"{searchQuery}"</strong>
          </span>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: "1400px", margin: "0 auto", padding: "20px", fontFamily: "Arial, sans-serif" },
  title: { color: "#1a1a2e", fontSize: "28px", marginBottom: "4px" },
  subtitle: { color: "#666", marginBottom: "20px", fontSize: "14px" },
  loading: { textAlign: "center", padding: "50px", color: "#666" },

  statsRow: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "10px", marginBottom: "20px" },
  statCard: { background: "white", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", cursor: "pointer" },
  statLabel: { fontSize: "13px", color: "#555" },
  statNumber: { fontSize: "20px", fontWeight: "bold", color: "#1a1a2e" },
  activeFilter: { position: "absolute", top: "-6px", right: "-6px", background: "#007bff", color: "white", borderRadius: "50%", width: "18px", height: "18px", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" },

  regSection: { marginBottom: "20px" },
  regSectionTitle: { fontSize: "16px", color: "#856404", marginBottom: "10px" },

  filters: { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" },
  searchInput: { flex: "1", minWidth: "200px", padding: "8px 14px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" },
  clearFilter: { padding: "8px 14px", background: "#f8f9fa", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#555" },

  tableWrapper: { background: "white", border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th: { textAlign: "left", padding: "10px 14px", background: "#f8f9fa", borderBottom: "2px solid #e0e0e0", fontWeight: "bold", color: "#333" },
  tr: { borderBottom: "1px solid #f0f0f0" },
  td: { padding: "9px 14px", verticalAlign: "middle" },

  regCard: { background: "#fff3cd", padding: "16px 20px", borderRadius: "10px", border: "1px solid #ffc107", marginBottom: "12px" },
  regHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  regName: { fontWeight: "bold", fontSize: "16px" },
  regEmail: { marginLeft: "15px", color: "#555", fontSize: "14px" },
  regBody: { display: "flex", gap: "15px", flexWrap: "wrap", fontSize: "14px", color: "#555" },
  regActions: { marginTop: "12px", display: "flex", gap: "10px" },
  approveBtn: { padding: "6px 20px", background: "#28a745", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" },
  rejectBtn: { padding: "6px 20px", background: "#dc3545", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" },

  empty: { textAlign: "center", padding: "40px", color: "#666" },
  footer: { marginTop: "12px", display: "flex", gap: "20px", fontSize: "14px", color: "#666" },
};

export default AdminPanel;