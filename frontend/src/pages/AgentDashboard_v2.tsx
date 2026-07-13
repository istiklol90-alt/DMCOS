import { useEffect, useState } from "react";
import BookingsList from "./Reservations";

// ---------------------------------------------------------------------------
// Tiny inline icon set (no external icon package installed in this project)
// ---------------------------------------------------------------------------

function IconSparkle({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.5c.3 3.2 1.2 5.4 2.8 7 1.6 1.6 3.8 2.5 7 2.8-3.2.3-5.4 1.2-7 2.8-1.6 1.6-2.5 3.8-2.8 7-.3-3.2-1.2-5.4-2.8-7-1.6-1.6-3.8-2.5-7-2.8 3.2-.3 5.4-1.2 7-2.8 1.6-1.6 2.5-3.8 2.8-7Z" />
    </svg>
  );
}

function IconPlus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrowUp({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function IconArrowDown({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

function IconCheck({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function IconClock({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconSend({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 11.5 20.5 3l-6 17.5-3.4-6.6L3 11.5Z" />
    </svg>
  );
}

function IconMenu({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconX({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Real session data (from localStorage, set by Login.tsx after a real login)
// ---------------------------------------------------------------------------

type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function getRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "agent") return "Турагент";
  if (normalized === "admin") return "Администратор";
  if (normalized === "manager") return "Менеджер";
  return role;
}

function DemoTag() {
  return (
    <span className="rounded-full bg-slate/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate/60">
      демо-данные
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const kpis = [
  { label: "Активные брони", value: "128", delta: "+12% за месяц", positive: true },
  { label: "Выручка (USD)", value: "$184,320", delta: "+8.4% за месяц", positive: true },
  { label: "Ожидают оплаты", value: "14", delta: "+3 за неделю", positive: false },
  { label: "Средний чек", value: "$1,440", delta: "−2.1% за месяц", positive: false },
];

const navGroups: {
  label: string;
  items: { name: string; active: boolean; action?: "hotel-search" }[];
}[] = [
  {
    label: "РАБОТА",
    items: [
      { name: "Дашборд", active: true },
      { name: "Поиск и бронирование", active: false, action: "hotel-search" },
      { name: "Бронирования", active: false },
      { name: "Отели", active: false },
      { name: "Клиенты", active: false },
    ],
  },
  {
    label: "ФИНАНСЫ",
    items: [
      { name: "Баланс", active: false },
      { name: "Счета", active: false },
      { name: "Комиссии", active: false },
    ],
  },
  {
    label: "ПОМОЩЬ",
    items: [
      { name: "AI Ассистент", active: false },
      { name: "Поддержка", active: false },
      { name: "Настройки", active: false },
    ],
  },
];

const checklist: { label: string; state: "done" | "waiting" | "todo" }[] = [
  { label: "Заявка получена", state: "done" },
  { label: "Проверка оплаты", state: "done" },
  { label: "Подтверждение отеля", state: "waiting" },
  { label: "Формирование ваучера", state: "todo" },
  { label: "Отправка клиенту", state: "todo" },
];

const chatMessages = [
  {
    from: "ai" as const,
    text: "Здравствуйте! Оплата по брони BR-10432 (Velaa Private Island) должна поступить завтра. Отправить клиенту напоминание?",
  },
  { from: "user" as const, text: "Да, отправь, пожалуйста" },
  {
    from: "ai" as const,
    text: "Готово ✅ Напоминание отправлено Rustam Aliyev в WhatsApp и на email.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type AgentDashboard_v2Props = {
  onNavigateToHotelSearch?: () => void;
};

function AgentDashboard_v2({ onNavigateToHotelSearch }: AgentDashboard_v2Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token) {
      // Clear any stale role/user data too, not just check the token — otherwise
      // App's mount effect reads the leftover "role" on the next load, routes
      // straight back here, and this guard redirects again: an infinite loop.
      localStorage.clear();
      window.location.href = "/login";
      return;
    }

    if (role !== "Agent" && role !== "agent") {
      alert("⛔ Доступ запрещен! Только для агентов.");
      window.location.href = "/";
      return;
    }

    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setCheckingAuth(false);
  }, []);

  if (checkingAuth || !user) {
    return <div className="min-h-screen bg-sand" />;
  }

  return (
    <div className="min-h-screen bg-sand font-sans text-slate flex">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-ink px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-coral to-teal" />
          <span className="font-display text-lg font-semibold text-white">DMC OS</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="text-white/90 p-2 -mr-2"
          aria-label="Открыть меню"
        >
          <IconMenu />
        </button>
      </div>

      {/* Sidebar (desktop) + mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 flex-col bg-ink px-4 py-6 transition-transform duration-200 md:translate-x-0 md:flex ${
          mobileNavOpen ? "flex translate-x-0" : "hidden -translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-coral to-teal shrink-0" />
            <span className="font-display text-lg font-semibold text-white">DMC OS</span>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="text-white/70 p-1 md:hidden"
            aria-label="Закрыть меню"
          >
            <IconX />
          </button>
        </div>

        <nav className="mt-8 flex-1 space-y-7 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[11px] font-semibold tracking-widest text-white/40">{group.label}</p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      if (item.action === "hotel-search") {
                        onNavigateToHotelSearch?.();
                      }
                    }}
                    className={`w-full appearance-none rounded-lg border-l-2 bg-white/5 px-3 py-2 text-left text-sm transition-colors ${
                      item.active
                        ? "border-coral bg-white/10 text-white font-medium"
                        : "border-transparent text-white/80 hover:border-white/30 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral to-teal font-display text-sm font-semibold text-white">
            {getInitials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/50">
              {getRoleLabel(user.role)} · {user.email}
            </p>
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-ink/50 md:hidden"
        />
      )}

      {/* Main content */}
      <main className="min-w-0 flex-1 px-4 pb-12 pt-20 md:ml-60 md:px-8 md:pt-8 lg:px-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-coral">ПАНЕЛЬ АГЕНТА</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
              Добрый день, {getFirstName(user.name)}!
            </h1>
            <p className="mt-1 text-sm text-slate/70">
              Сегодня 4 июля — у вас 5 активных броней и 2 требуют внимания.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl bg-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 sm:self-auto"
          >
            <IconPlus />
            Новое бронирование
          </button>
        </div>

        {/* AI insight strip */}
        <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-ink px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral/20 text-coral">
              <IconSparkle className="w-4 h-4" />
            </span>
            <p className="text-sm leading-relaxed text-white/90">
              <span className="font-medium text-white">AI заметил:</span> бронирование в{" "}
              <span className="font-medium">Rixos Premium Belek</span> подтверждено отелем, а оплата по{" "}
              <span className="font-medium">Velaa Private Island</span> должна поступить завтра.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 self-start rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 sm:self-auto"
          >
            Посмотреть детали
          </button>
        </div>

        {/* KPI cards */}
        <div className="mt-6 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Обзор</h2>
          <DemoTag />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-ink/10 bg-white px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{kpi.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-ink">{kpi.value}</p>
              <p
                className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                  kpi.positive ? "text-teal" : "text-coral"
                }`}
              >
                {kpi.positive ? <IconArrowUp /> : <IconArrowDown />}
                {kpi.delta}
              </p>
            </div>
          ))}
        </div>

        {/* Real bookings — scoped to this agent only, via GET /agents/{id}/bookings */}
        <div className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Мои бронирования</h2>
          <BookingsList
            scope={{ type: "agent", agentId: user.id }}
            permissions={{ canChangeDates: true, canEditGuestDetails: true, canEditFlights: true, canCancel: true, canClaim: false }}
          />
        </div>

        {/* AI assistant + checklist */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* AI Assistant chat */}
          <div className="flex flex-col rounded-2xl border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-coral text-white">
                <IconSparkle className="w-4 h-4" />
              </span>
              <h2 className="font-display text-lg font-semibold text-ink">AI Ассистент</h2>
            </div>

            <div className="flex-1 space-y-3 px-5 py-4">
              {chatMessages.map((m, i) =>
                m.from === "ai" ? (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral/15 text-coral">
                      <IconSparkle className="w-3.5 h-3.5" />
                    </span>
                    <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-sand px-3.5 py-2.5 text-sm leading-relaxed text-slate">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-white">
                      {m.text}
                    </p>
                  </div>
                )
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-ink/10 px-4 py-3">
              <input
                type="text"
                placeholder="Спросите что-нибудь у AI…"
                className="flex-1 rounded-lg border border-ink/10 bg-sand/60 px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:outline-none focus:ring-2 focus:ring-coral/40"
              />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-coral text-white transition-transform hover:-translate-y-0.5"
                aria-label="Отправить"
              >
                <IconSend />
              </button>
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-2xl border border-ink/10 bg-white px-5 py-5">
            <h2 className="font-display text-lg font-semibold text-ink">Этапы согласования</h2>
            <p className="mt-1 text-xs text-slate/50">Velaa Private Island · BR-10432</p>

            <ul className="mt-4 space-y-3">
              {checklist.map((step) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      step.state === "done"
                        ? "bg-teal text-white"
                        : step.state === "waiting"
                          ? "bg-coral/15 text-coral"
                          : "bg-slate/10 text-slate/40"
                    }`}
                  >
                    {step.state === "waiting" ? <IconClock /> : <IconCheck />}
                  </span>
                  <span
                    className={`text-sm ${
                      step.state === "todo" ? "text-slate/40" : "text-slate font-medium"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AgentDashboard_v2;
