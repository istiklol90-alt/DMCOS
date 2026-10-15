import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import adminI18n from "../i18n/i18nAdmin";
import { API_URL } from "../config";
import AdminBookingsList from "./AdminBookingFinance";
import { DEFAULT_VIEW, readAdminLocation, writeAdminLocation, type AdminSection } from "./adminLocation";
import TransferListScreen, { type TransferListView } from "./BookingsSubViews";
import Contracts from "./Contracts";
import ContractsAI from "./ContractsAI";
import AdminRooms from "./AdminRooms";
import PriceCalculator from "./PriceCalculator";
import Counteragents from "./Counteragents";
import Invoices from "./Invoices";
import Balance from "./Balance";
import Cashback from "./Cashback";
import AdminShell from "../components/layout/AdminShell";
import Card from "../components/ui/Card";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import ViewTabs from "../components/ui/ViewTabs";
import { FeedbackProvider, useFeedback } from "../components/ui/Feedback";
import { SkeletonRow } from "../components/ui/Skeleton";
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
// The set of screens is defined once, next to the URL names they go by.
type AdminTab = AdminSection;

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

const AdminPanelContent = () => {
  const navigate = useNavigate();
  const { confirm, promptText, toast } = useFeedback();
  const [users, setUsers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  // Stage B1: the screen being shown is READ FROM THE URL, not held in
  // component state. That one change is what makes a refresh land where you
  // were, Back and Forward move between screens, and a pasted link open the
  // screen it was copied from -- there is no second copy of "where am I" to
  // fall out of step with the address bar. See adminLocation.ts for the
  // address format and how an invalid one is resolved.
  //
  // Stage A's default still holds: no parameters means Bookings, the list.
  const [searchParams, setSearchParams] = useSearchParams();
  const { section: activeTab, view: transferView } = useMemo(
    () => readAdminLocation(searchParams),
    [searchParams],
  );

  // The view the Transfer list was last showing. The address only names a
  // view while that section is on screen, so this is what lets "Transfer
  // list (Departures) -> Invoices -> Transfer list" return to Departures.
  const lastTransferView = useRef<TransferListView>(transferView);
  useEffect(() => {
    if (activeTab === "transfer-list") lastTransferView.current = transferView;
  }, [activeTab, transferView]);

  function goTo(section: AdminTab, view: TransferListView, options: { replace?: boolean } = {}) {
    const next = writeAdminLocation(searchParams, { section, view });
    // Choosing the screen you are already on must not add a history entry --
    // Back would then appear to do nothing.
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: options.replace ?? false });
  }

  function setTransferView(view: TransferListView) {
    goTo("transfer-list", view);
  }

  // An address that is valid but not written the standard way -- or not valid
  // at all -- is corrected in place. `replace`, so the bad address is not left
  // behind in history for Back to return to. The screen itself is already
  // right before this runs (it is derived above), so correcting the address
  // remounts nothing and requests nothing.
  useEffect(() => {
    const canonical = writeAdminLocation(searchParams, { section: activeTab, view: transferView });
    if (canonical.toString() !== searchParams.toString()) setSearchParams(canonical, { replace: true });
  }, [searchParams, activeTab, transferView, setSearchParams]);

  // Decision 187: which pages are open, oldest first. Selecting a nav item
  // adds it rather than replacing what you were on, so switching to Invoices
  // to check something and coming back to Bookings is two clicks, not a
  // reload of a screen you had already filtered.
  const [openTabs, setOpenTabs] = useState<AdminTab[]>([activeTab]);
  // The page being closed, between removing it from the bar and the address
  // moving off it. Those are two separate updates, and the address one may
  // land a render later; without this the effect below would see "the screen
  // in the address is not an open page" in between and put the tab back.
  const closingTab = useRef<AdminTab | null>(null);
  // Whatever screen the address names is an open page -- including one
  // reached by Back, Forward or a pasted link rather than through the menu.
  useEffect(() => {
    if (closingTab.current === activeTab) return;
    closingTab.current = null;
    setOpenTabs((tabs) => (tabs.includes(activeTab) ? tabs : [...tabs, activeTab]));
  }, [activeTab, openTabs]);

  function openTab(key: AdminTab) {
    goTo(key, key === "transfer-list" ? lastTransferView.current : DEFAULT_VIEW);
  }

  function closeTab(key: AdminTab) {
    const next = openTabs.filter((t) => t !== key);
    // Closing the page you are looking at has to land you somewhere: the
    // one to its left, or the first remaining. Never an empty screen --
    // if it was the last tab it simply stays open.
    if (next.length === 0) return;
    if (key === activeTab) closingTab.current = key;
    setOpenTabs(next);
    if (key === activeTab) {
      const target = next[Math.max(0, openTabs.indexOf(key) - 1)];
      // `replace`: a page you closed should not come back on Back.
      goTo(target, target === "transfer-list" ? lastTransferView.current : DEFAULT_VIEW, { replace: true });
    }
  }

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

  // The server's own explanation of a refusal, when it gave one. FastAPI puts
  // it under "detail" -- a string for a deliberate refusal, a list of
  // {loc, msg} objects for a validation failure.
  const describeFailure = async (res: Response, fallback: string): Promise<string> => {
    try {
      const body = await res.json();
      if (typeof body?.detail === "string" && body.detail.trim()) return body.detail;
      if (Array.isArray(body?.detail)) {
        const lines = body.detail.map((d: any) => d?.msg).filter(Boolean);
        if (lines.length) return lines.join("; ");
      }
      if (typeof body?.message === "string" && body.message.trim()) return body.message;
    } catch {
      // not JSON -- fall through to the generic message
    }
    return `${fallback} (server answered ${res.status})`;
  };

  const handleApprove = async (id: number) => {
    const ok = await confirm({
      title: "Approve this application?",
      message: "An agent account is created and its temporary password is emailed to the applicant.",
      confirmLabel: "Approve",
    });
    if (!ok) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/agent-registrations/${id}/approve`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comments: "Approved" })
      });
      // fetch() resolves for ANY answer the server gives, including a refusal;
      // only a 2xx means the application was actually approved. This used to
      // announce success for a 400 or a 500 alike. On failure nothing is
      // reloaded, so the application and its buttons stay exactly where they
      // were and the action can simply be tried again.
      if (!res.ok) {
        toast(await describeFailure(res, "The application was not approved"), "error");
        return;
      }
      toast("Application approved");
      loadData();
    } catch {
      toast("The application was not approved — the server could not be reached. Try again.", "error");
    }
  };

  const handleReject = async (id: number) => {
    // One dialog instead of prompt() followed by confirm(): the reason and
    // the decision are the same step, and the reason is required in place.
    const reason = await promptText({
      title: "Reject this application?",
      inputLabel: "Rejection reason",
      placeholder: "Shown to the applicant",
      confirmLabel: "Reject",
      tone: "danger",
    });
    if (!reason) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/agent-registrations/${id}/reject?comments=${encodeURIComponent(reason)}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
        toast(await describeFailure(res, "The application was not rejected"), "error");
        return;
      }
      toast("Application rejected");
      loadData();
    } catch {
      toast("The application was not rejected — the server could not be reached. Try again.", "error");
    }
  };

  const handleFilter = (type: string) => {
    setFilterType(type === filterType ? "all" : type);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  const userLabel = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return u.name ? `${u.name}${u.role ? ` · ${u.role}` : ""}` : "Admin";
    } catch {
      return "Admin";
    }
  })();

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
      <AdminShell
        activeTab={activeTab}
        onSelect={(key) => openTab(key as AdminTab)}
        openTabs={openTabs}
        onCloseTab={(key) => closeTab(key as AdminTab)}
        userLabel={userLabel}
        onLogout={handleLogout}
      >
        {activeTab === "markup" && <Counteragents section="markup" />}

        {activeTab === "special-agents" && <Counteragents section="agents" />}

        {activeTab === "invoices" && <Invoices />}

        {activeTab === "balance" && <Balance />}

        {activeTab === "cashback" && <Cashback />}

        {activeTab === "reservations" && <AdminBookingsList scope={{ type: "all" }} />}

        {/* Arrivals, departures and transfers for chosen dates -- its own
            section, not a view of Bookings. */}
        {activeTab === "transfer-list" && <TransferListScreen view={transferView} onViewChange={setTransferView} />}

        {activeTab === "contracts" && <Contracts />}

        {activeTab === "contracts-ai" && <ContractsAI />}

        {activeTab === "rooms" && <AdminRooms />}

        {activeTab === "price-calculator" && <PriceCalculator />}

        {activeTab === "users" && (
        <>
        {/* ===== PAGE HEADER ===== */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">Users & applications</h2>
            <p className="mt-0.5 text-sm text-slate/70">Everyone who can sign in, and agents who have applied for an account.</p>
          </div>
          {/* Was the seventh stat card. Not a filter of the user list, so it
              is not a view -- it is a count of work waiting below. */}
          {!loading && (
            <Badge tone={stats.pending > 0 ? "warning" : "neutral"} dot={stats.pending > 0}>
              {stats.pending} pending {stats.pending === 1 ? "application" : "applications"}
            </Badge>
          )}
        </div>

        {/* ===== VIEWS ===== */}
        {/* The same six filters the stat cards used to be, as one line of
            named views with their counts. Selecting the active view again
            still returns to "Total", exactly as clicking a card did. */}
        <ViewTabs
          className="mt-4"
          tabs={statCards.map((card) => ({
            key: card.key,
            label: card.label,
            count: loading ? undefined : card.value,
          }))}
          activeKey={filterType}
          onSelect={handleFilter}
        />

        {/* ===== APPLICATIONS ===== */}
        {pendingRegs.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink">
              Registration applications
              <Badge tone="warning">{pendingRegs.length}</Badge>
            </h3>
            <div className="space-y-3">
              {pendingRegs.map((reg: any) => (
                <Card key={reg.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="text-base font-semibold text-ink">{reg.full_name || reg.company_name}</span>
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
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(reg.id)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReject(reg.id)}>
                      Reject
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ===== USERS ===== */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">All users</h3>
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

        <div className="overflow-hidden rounded-2xl">
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
                      <Badge tone={isAdmin ? "ink" : "neutral"}>{user.role || "agent"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTone} dot>{statusLabel}</Badge>
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
      </AdminShell>
  );
};

// Providers live here, one level above the screen itself, because the
// screen's own handlers call useFeedback() -- a hook can only read a provider
// that is above the component calling it. The dialog/toast layers render
// beside AdminShell rather than inside it, hence the theme class passed down.
const AdminPanel = () => (
  <I18nextProvider i18n={adminI18n}>
    <FeedbackProvider layerClassName="admin-theme font-sans text-slate">
      <AdminPanelContent />
    </FeedbackProvider>
  </I18nextProvider>
);

export default AdminPanel;
