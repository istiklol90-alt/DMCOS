import { useState, useEffect } from "react";
import { API_URL } from "../config";
import BookingsList from "./Reservations";
import Contracts from "./Contracts";
import ContractsAI from "./ContractsAI";
import PriceCalculator from "./PriceCalculator";
import Counteragents from "./Counteragents";
import Finance from "./Finance";

type StatKey = "all" | "agent" | "admin" | "active" | "never_logged" | "inactive";
type RegStatus = "pending" | "approved" | "rejected";
type AdminTab = "users" | "reservations" | "contracts" | "contracts-ai" | "price-calculator" | "counteragents" | "finance";

const statusBadgeClasses: Record<RegStatus, string> = {
  pending: "bg-coral/15 text-coral",
  approved: "bg-teal/15 text-teal",
  rejected: "bg-slate/10 text-slate",
};

const statusBadgeLabels: Record<RegStatus, string> = {
  pending: "В ожидании",
  approved: "Одобрено",
  rejected: "Отклонено",
};

const AdminPanel = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

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
    const key = status as RegStatus;
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClasses[key] ?? "bg-slate/10 text-slate"}`}>
        {statusBadgeLabels[key] ?? status}
      </span>
    );
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
      alert("Заявка одобрена!");
      loadData();
    } catch (err) {
      alert("Ошибка при одобрении");
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
      alert("Заявка отклонена");
      loadData();
    } catch (err) {
      alert("Ошибка при отклонении");
    }
  };

  const handleFilter = (type: string) => {
    setFilterType(type === filterType ? "all" : type);
  };

  const statCards: { key: StatKey; label: string; value: number }[] = [
    { key: "all", label: "Всего", value: stats.total },
    { key: "agent", label: "Агенты", value: stats.agents },
    { key: "admin", label: "Админы", value: stats.admins },
    { key: "active", label: "Активные", value: stats.active },
    { key: "never_logged", label: "Не входили", value: stats.neverLogged },
    { key: "inactive", label: "Неактивные", value: stats.inactive },
  ];

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-78px)] bg-sand px-5 py-10 font-sans text-slate">
        <div className="mx-auto max-w-[1400px]">
          <h1 className="font-display text-3xl font-semibold text-ink">Admin Panel</h1>
          <p className="mt-10 text-center text-sm text-slate/60">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-78px)] bg-sand px-5 py-10 font-sans text-slate">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="font-display text-3xl font-semibold text-ink">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate/70">Управление системой</p>

        {/* ===== ВКЛАДКИ ===== */}
        <div className="mt-6 flex gap-2 border-b border-ink/10">
          <button
            onClick={() => setActiveTab("users")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Пользователи
          </button>
          <button
            onClick={() => setActiveTab("reservations")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "reservations"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Бронирования
          </button>
          <button
            onClick={() => setActiveTab("contracts")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "contracts"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Контракты
          </button>
          <button
            onClick={() => setActiveTab("contracts-ai")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "contracts-ai"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Контракты — ИИ
          </button>
          <button
            onClick={() => setActiveTab("price-calculator")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "price-calculator"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Расчёт цены
          </button>
          <button
            onClick={() => setActiveTab("counteragents")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "counteragents"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Контрагенты
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "finance"
                ? "border-coral text-ink"
                : "border-transparent text-slate/60 hover:text-ink"
            }`}
          >
            Финансы
          </button>
        </div>

        {activeTab === "counteragents" && <Counteragents />}

        {activeTab === "finance" && <Finance />}

        {activeTab === "reservations" && (
          <div className="mt-6">
            <BookingsList
              scope={{ type: "all" }}
              permissions={{ canChangeDates: true, canEditGuestDetails: true, canEditFlights: true, canCancel: true, canClaim: true, canManageInvoices: true }}
            />
          </div>
        )}

        {activeTab === "contracts" && <Contracts />}

        {activeTab === "contracts-ai" && <ContractsAI />}

        {activeTab === "price-calculator" && <PriceCalculator />}

        {activeTab === "users" && (
        <>
        {/* ===== СТАТИСТИКА ===== */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {statCards.map((card) => (
            <div
              key={card.key}
              onClick={() => handleFilter(card.key)}
              className={`relative cursor-pointer rounded-2xl border bg-white px-4 py-3 transition-colors ${
                filterType === card.key ? "border-coral bg-coral/5" : "border-ink/10 hover:border-coral/30"
              }`}
            >
              {filterType === card.key && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] text-white">
                  ✓
                </span>
              )}
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{card.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{card.value}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Заявки</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">{stats.pending}</p>
          </div>
        </div>

        {/* ===== ЗАЯВКИ ===== */}
        {pendingRegs.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 font-display text-lg font-semibold text-ink">Заявки на регистрацию</h3>
            <div className="space-y-3">
              {pendingRegs.map((reg: any) => (
                <div key={reg.id} className="rounded-2xl border border-ink/10 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="font-display text-lg font-semibold text-ink">{reg.full_name || reg.company_name}</span>
                      <span className="text-sm text-slate/60">{reg.email}</span>
                    </div>
                    {getStatusBadge(reg.status)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate/70">
                    <span>Тел: {reg.phone}</span>
                    <span>Страна: {reg.country}</span>
                    <span>Город: {reg.city}</span>
                    <span>Компания: {reg.company_name}</span>
                  </div>
                  <div className="mt-4 flex gap-2.5">
                    <button
                      onClick={() => handleApprove(reg.id)}
                      className="appearance-none rounded-lg border-0 bg-teal px-5 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
                    >
                      Одобрить
                    </button>
                    <button
                      onClick={() => handleReject(reg.id)}
                      className="appearance-none rounded-lg border border-coral/40 bg-transparent px-5 py-2 text-sm font-medium text-coral transition-colors hover:bg-coral/10"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== ПОЛЬЗОВАТЕЛИ ===== */}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            placeholder="Поиск по имени или email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-[220px] flex-1 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          {filterType !== "all" && (
            <button
              onClick={() => handleFilter("all")}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
            >
              Сбросить фильтр
            </button>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
            >
              Очистить поиск
            </button>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Имя</th>
                <th className="px-5 py-3 font-medium">Email / Логин</th>
                <th className="px-5 py-3 font-medium">Пароль</th>
                <th className="px-5 py-3 font-medium">Роль</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 font-medium">Последний вход</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate/50">
                    Пользователи не найдены
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user: any, index: number) => {
                  const isAdmin = user.role?.toLowerCase() === "admin";
                  const statusLabel = !user.is_active
                    ? "Неактивен"
                    : !user.last_login
                      ? "Не входил"
                      : "Активен";
                  const statusClasses = !user.is_active
                    ? "bg-slate/10 text-slate"
                    : !user.last_login
                      ? "bg-coral/15 text-coral"
                      : "bg-teal/15 text-teal";
                  return (
                    <tr key={user.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="px-5 py-3.5 text-slate/60">{index + 1}</td>
                      <td className="px-5 py-3.5 font-medium text-ink">{user.name || "—"}</td>
                      <td className="px-5 py-3.5 text-slate/80">{user.email || "—"}</td>
                      <td className="px-5 py-3.5 font-mono text-slate/40">••••••••</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            isAdmin ? "bg-ink/10 text-ink" : "bg-teal/15 text-teal"
                          }`}
                        >
                          {user.role || "agent"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">
                        {user.last_login ? new Date(user.last_login).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate/60">
          <span>Всего: <strong className="text-ink">{filteredUsers.length}</strong> пользователей</span>
          {filterType !== "all" && (
            <span>
              Фильтр: <strong className="text-ink">{
                filterType === "agent" ? "Агенты" :
                filterType === "admin" ? "Админы" :
                filterType === "active" ? "Активные" :
                filterType === "never_logged" ? "Не входили" :
                filterType === "inactive" ? "Неактивные" : ""
              }</strong>
            </span>
          )}
          {searchQuery && (
            <span>
              Поиск: <strong className="text-ink">"{searchQuery}"</strong>
            </span>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
