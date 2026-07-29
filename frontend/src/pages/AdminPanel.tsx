import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import adminI18n from "../i18n/i18nAdmin";
import { API_URL } from "../config";
import AdminBookingsList, { AdminNeedsAttentionView } from "./AdminBookingFinance";
import { TransfersView, ArrivalView, DepartureView } from "./BookingsSubViews";
import Contracts from "./Contracts";
import ContractsAI from "./ContractsAI";
import PriceCalculator from "./PriceCalculator";
import Counteragents from "./Counteragents";
import Invoices from "./Invoices";
import Balance from "./Balance";
import Cashback from "./Cashback";
import AdminNav from "./AdminNav";
import Card from "../components/ui/Card";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Skeleton, SkeletonText, SkeletonRow } from "../components/ui/Skeleton";
import {
  TableShell,
  TableHeadRow,
  TableHeadCell,
  TableRow,
  TableCell,
  TableEmptyState,
} from "../components/ui/Table";

type StatKey = "all" | "agent" | "admin" | "active" | "never_logged" | "inactive";
type RegStatus = "pending" | "approved" | "rejected";
type AdminTab =
  | "users"
  | "bookings-needs-attention"
  | "reservations"
  | "bookings-transfers"
  | "bookings-arrival"
  | "bookings-departure"
  | "contracts"
  | "contracts-ai"
  | "price-calculator"
  | "counteragents"
  | "invoices"
  | "balance"
  | "cashback";

const statusBadgeTones: Record<RegStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

const statusBadgeLabels: Record<RegStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const AdminPanel = () => {
  const navigate = useNavigate();
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
      console.error("Load error:", err);
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
    return <Badge tone={statusBadgeTones[key] ?? "neutral"}>{statusBadgeLabels[key] ?? status}</Badge>;
  };

  const handleApprove = async (id: number) => {
    if (!window.confirm("Approve this application?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/agent-registrations/${id}/approve`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comments: "Approved" })
      });
      alert("Application approved!");
      loadData();
    } catch (err) {
      alert("Error while approving");
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt("Enter the rejection reason:");
    if (!reason) return;
    if (!window.confirm("Reject this application?")) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/agent-registrations/${id}/reject?comments=${encodeURIComponent(reason)}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      alert("Application rejected");
      loadData();
    } catch (err) {
      alert("Error while rejecting");
    }
  };

  const handleFilter = (type: string) => {
    setFilterType(type === filterType ? "all" : type);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const statCards: { key: StatKey; label: string; value: number }[] = [
    { key: "all", label: "Total", value: stats.total },
    { key: "agent", label: "Agents", value: stats.agents },
    { key: "admin", label: "Admins", value: stats.admins },
    { key: "active", label: "Active", value: stats.active },
    { key: "never_logged", label: "Never logged in", value: stats.neverLogged },
    { key: "inactive", label: "Inactive", value: stats.inactive },
  ];

  // UX pass (2026-07-29, same treatment as Reservations.tsx's BookingsList
  // and BookingsSubViews.tsx, Decision 127): this used to fully unmount
  // the ENTIRE admin panel -- AdminNav included -- on every loadData()
  // call, which fires not just on mount but also after every
  // approve/reject action. An admin approving a registration would
  // briefly lose the whole nav bar. Now AdminNav/Log out stay mounted
  // unconditionally; only the Users tab's own stat cards/table react to
  // `loading`, matching Google Material's skeleton-screen guidance.

  return (
    <I18nextProvider i18n={adminI18n}>
    <div className="min-h-screen bg-sand px-5 py-4 font-sans text-slate">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex items-center justify-between gap-4 border-b border-ink/10">
          <AdminNav activeTab={activeTab} onSelect={(key) => setActiveTab(key as AdminTab)} />
          <Button variant="secondary" size="sm" onClick={handleLogout} className="shrink-0">
            Log out
          </Button>
        </div>

        {activeTab === "counteragents" && <Counteragents />}

        {activeTab === "invoices" && <Invoices />}

        {activeTab === "balance" && <Balance />}

        {activeTab === "cashback" && <Cashback />}

        {activeTab === "bookings-needs-attention" && <AdminNeedsAttentionView />}

        {activeTab === "reservations" && <AdminBookingsList scope={{ type: "all" }} />}

        {activeTab === "bookings-transfers" && <TransfersView />}

        {activeTab === "bookings-arrival" && <ArrivalView />}

        {activeTab === "bookings-departure" && <DepartureView />}

        {activeTab === "contracts" && <Contracts />}

        {activeTab === "contracts-ai" && <ContractsAI />}

        {activeTab === "price-calculator" && <PriceCalculator />}

        {activeTab === "users" && (
        <>
        {/* ===== PAGE HEADER ===== */}
        <div className="mt-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Users</h2>
          <p className="mt-1 text-sm text-slate/60">Manage agent and admin accounts, review registration applications.</p>
        </div>

        {/* ===== STATS ===== */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {loading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <Card key={i} padding="sm" shadow="card">
                <SkeletonText width="60%" className="h-3" />
                <Skeleton className="mt-2 h-6 w-10" />
              </Card>
            ))
          ) : (
            <>
              {statCards.map((card) => (
                <Card
                  key={card.key}
                  padding="sm"
                  shadow="card"
                  onClick={() => handleFilter(card.key)}
                  className={`relative cursor-pointer transition-colors ${
                    filterType === card.key ? "border-coral bg-coral/5" : "hover:border-coral/30"
                  }`}
                >
                  {filterType === card.key && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] text-white">
                      ✓
                    </span>
                  )}
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/50">{card.label}</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-ink">{card.value}</p>
                </Card>
              ))}
              <Card padding="sm" shadow="card" className={stats.pending > 0 ? "border-coral/30 bg-coral/5" : ""}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate/50">Applications</p>
                <p className={`mt-1 font-display text-2xl font-semibold ${stats.pending > 0 ? "text-coral" : "text-ink"}`}>
                  {stats.pending}
                </p>
              </Card>
            </>
          )}
        </div>

        {/* ===== APPLICATIONS ===== */}
        {pendingRegs.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              Registration applications
              <Badge tone="coral">{pendingRegs.length}</Badge>
            </h3>
            <div className="space-y-3">
              {pendingRegs.map((reg: any) => (
                <Card key={reg.id} padding="lg" shadow="card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="font-display text-lg font-semibold text-ink">{reg.full_name || reg.company_name}</span>
                      <span className="text-sm text-slate/60">{reg.email}</span>
                    </div>
                    {getStatusBadge(reg.status)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate/70">
                    <span>Phone: {reg.phone}</span>
                    <span>Country: {reg.country}</span>
                    <span>City: {reg.city}</span>
                    <span>Company: {reg.company_name}</span>
                  </div>
                  <div className="mt-4 flex gap-2.5">
                    <Button variant="dark" onClick={() => handleApprove(reg.id)}>
                      Approve
                    </Button>
                    <Button variant="danger" onClick={() => handleReject(reg.id)}>
                      Reject
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ===== USERS ===== */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink">All users</h3>
          <div className="flex flex-wrap items-center gap-2.5">
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-[220px]"
            />
            {filterType !== "all" && (
              <Button variant="secondary" size="sm" onClick={() => handleFilter("all")}>
                Reset filter
              </Button>
            )}
            {searchQuery && (
              <Button variant="secondary" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl shadow-card">
        <TableShell minWidth="820px">
          <TableHeadRow>
            <TableHeadCell>#</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Email / Login</TableHeadCell>
            <TableHeadCell>Password</TableHeadCell>
            <TableHeadCell>Role</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell>Last login</TableHeadCell>
          </TableHeadRow>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={7} />)
            ) : filteredUsers.length === 0 ? (
              <TableEmptyState colSpan={7}>No users found</TableEmptyState>
            ) : (
              filteredUsers.map((user: any, index: number) => {
                const isAdmin = user.role?.toLowerCase() === "admin";
                const statusLabel = !user.is_active
                  ? "Inactive"
                  : !user.last_login
                    ? "Never logged in"
                    : "Active";
                const statusTone: BadgeTone = !user.is_active ? "neutral" : !user.last_login ? "warning" : "success";
                const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();
                return (
                  <TableRow key={user.id} className="hover:bg-sand/40 transition-colors">
                    <TableCell className="text-slate/60">{index + 1}</TableCell>
                    <TableCell className="font-medium text-ink">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                            isAdmin ? "bg-ink" : "bg-teal"
                          }`}
                        >
                          {initial}
                        </span>
                        {user.name || "—"}
                      </div>
                    </TableCell>
                    <TableCell>{user.email || "—"}</TableCell>
                    <TableCell className="font-mono text-slate/40">••••••••</TableCell>
                    <TableCell>
                      <Badge tone={isAdmin ? "ink" : "success"}>{user.role || "agent"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {user.last_login ? new Date(user.last_login).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </tbody>
        </TableShell>
        </div>

        <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate/60">
          <span>Total: <strong className="text-ink">{filteredUsers.length}</strong> users</span>
          {filterType !== "all" && (
            <span>
              Filter: <strong className="text-ink">{
                filterType === "agent" ? "Agents" :
                filterType === "admin" ? "Admins" :
                filterType === "active" ? "Active" :
                filterType === "never_logged" ? "Never logged in" :
                filterType === "inactive" ? "Inactive" : ""
              }</strong>
            </span>
          )}
          {searchQuery && (
            <span>
              Search: <strong className="text-ink">"{searchQuery}"</strong>
            </span>
          )}
        </div>
        </>
        )}
      </div>
    </div>
    </I18nextProvider>
  );
};

export default AdminPanel;
