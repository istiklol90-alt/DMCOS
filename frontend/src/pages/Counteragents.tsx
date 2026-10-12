import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import { TableShell, TableHeadRow, TableHeadCell, TableRow, TableCell, TableEmptyState } from "../components/ui/Table";

// ---------------------------------------------------------------------------
// Admin-only screen for Pricing Engine's agent-category management (Decision
// 069): the global per-night markup setting, and moving agents between the
// Standard and Exclusive pricing tiers. Standard is never stored explicitly
// (absence from ExclusiveAgent means Standard) -- "Standard agents" below
// is simply every real agent minus whoever is in the Exclusive list.
// ---------------------------------------------------------------------------

interface PricingSettings {
  id: number;
  standard_markup_amount_per_night: number;
  currency: string;
  updated_at: string | null;
}

interface AgentSummary {
  user_id: number;
  name: string;
  email: string;
}

interface ExclusiveAgent {
  id: number;
  user_id: number;
  name: string;
  email: string;
  assigned_by: number;
  assigned_at: string;
}

type SubTab = "standard" | "exclusive";

async function fetchJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  // A 30-minute token simply expires while a tab sits open; every request
  // then fails with 401 "Invalid token". Handled once, centrally, instead of
  // each panel rendering that raw string or hanging on a spinner forever.
  if (response.status === 401) {
    handleSessionExpired();
    throw new Error("Session expired");
  }
  if (!response.ok) {
    let detail = `Request error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response body wasn't JSON -- keep the generic message
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US");
}

const Counteragents = () => {
  // Decision 193: one markup row per currency, keyed by currency code.
  const [settings, setSettings] = useState<PricingSettings[]>([]);
  const [markupInputs, setMarkupInputs] = useState<Record<string, string>>({});
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [subTab, setSubTab] = useState<SubTab>("standard");
  const [standardAgents, setStandardAgents] = useState<AgentSummary[]>([]);
  const [exclusiveAgents, setExclusiveAgents] = useState<ExclusiveAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addingUserId, setAddingUserId] = useState<number | null>(null);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  async function loadAll() {
    const token = localStorage.getItem("token") || "";
    try {
      setLoading(true);
      setListError(null);
      const [settingsData, standardData, exclusiveData] = await Promise.all([
        fetchJson<PricingSettings[]>("/pricing-engine/settings/all", token),
        fetchJson<AgentSummary[]>("/pricing-engine/agents/standard", token),
        fetchJson<ExclusiveAgent[]>("/pricing-engine/agents/exclusive", token),
      ]);
      setSettings(settingsData);
      // Decision 193: one markup per currency, so the form holds one input
      // per currency rather than a single global figure.
      setMarkupInputs(
        Object.fromEntries(
          settingsData.map((row) => [row.currency, String(row.standard_markup_amount_per_night)]),
        ),
      );
      setStandardAgents(standardData);
      setExclusiveAgents(exclusiveData);
    } catch (err: any) {
      setListError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSaveSettings(currency: string) {
    const value = parseFloat(markupInputs[currency] ?? "");
    if (isNaN(value) || value < 0) {
      setSettingsError("Enter a valid amount (0 or greater)");
      return;
    }
    const token = localStorage.getItem("token") || "";
    try {
      setSavingCurrency(currency);
      setSettingsError(null);
      const updated = await fetchJson<PricingSettings>("/pricing-engine/settings", token, {
        method: "PUT",
        body: JSON.stringify({ standard_markup_amount_per_night: value, currency }),
      });
      setSettings((prev) => prev.map((r) => (r.currency === updated.currency ? updated : r)));
      setMarkupInputs((prev) => ({
        ...prev,
        [updated.currency]: String(updated.standard_markup_amount_per_night),
      }));
    } catch (err: any) {
      setSettingsError(err.message || "Failed to save setting");
    } finally {
      setSavingCurrency(null);
    }
  }

  async function handleAddExclusive(userId: number) {
    const token = localStorage.getItem("token") || "";
    try {
      setAddingUserId(userId);
      await fetchJson("/pricing-engine/agents/exclusive", token, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
      setShowAddModal(false);
      setAddSearch("");
      await loadAll();
      setSubTab("exclusive");
    } catch (err: any) {
      alert(err.message || "Failed to add agent to exclusive");
    } finally {
      setAddingUserId(null);
    }
  }

  async function handleRemoveExclusive(userId: number) {
    if (!window.confirm("Return this agent to Standard?")) return;
    const token = localStorage.getItem("token") || "";
    try {
      setRemovingUserId(userId);
      await fetchJson(`/pricing-engine/agents/exclusive/${userId}`, token, { method: "DELETE" });
      await loadAll();
    } catch (err: any) {
      alert(err.message || "Failed to return agent to standard");
    } finally {
      setRemovingUserId(null);
    }
  }

  const filteredAddCandidates = standardAgents.filter((a) => {
    if (!addSearch) return true;
    const q = addSearch.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  return (
    <div className="pb-10">
      {/* ===== Global markup setting ===== */}
      <Card padding="md" className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Global markup</h3>
        <p className="mt-1 text-sm text-slate/60">
          A flat per-night amount added to the room price (Net from Contract Engine) for all agents.
          {/* Decision 193: one figure per currency. The markup is an absolute
              amount, not a percentage, so a single global number applied to a
              EUR contract would charge 10 EUR where 10 USD was configured --
              a different amount, silently. A contract's own currency decides
              which row applies. */}
          <span className="mt-1 block text-slate/50">
            Set per currency — the contract's own currency decides which one applies. No conversion
            happens anywhere: a booking priced in EUR is invoiced and paid in EUR.
          </span>
        </p>
        <div className="mt-3 space-y-2">
          {settings.length === 0 ? (
            <p className="text-sm text-slate/50">Loading…</p>
          ) : (
            settings.map((row) => (
              <div key={row.currency} className="flex flex-wrap items-center gap-2.5">
                <span className="w-12 text-sm font-semibold text-ink">{row.currency}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={markupInputs[row.currency] ?? ""}
                  onChange={(e) =>
                    setMarkupInputs((prev) => ({ ...prev, [row.currency]: e.target.value }))
                  }
                  scale="lg"
                  className="w-40"
                />
                <span className="text-sm text-slate/60">{row.currency} / night</span>
                <Button
                  onClick={() => handleSaveSettings(row.currency)}
                  disabled={savingCurrency !== null}
                >
                  {savingCurrency === row.currency ? "Saving..." : "Save"}
                </Button>
                {row.updated_at && (
                  <span className="text-xs text-slate/50">
                    Updated {new Date(row.updated_at).toLocaleString()}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        {settingsError && <p className="mt-2 text-sm text-red-600">{settingsError}</p>}
      </Card>

      {/* ===== Sub-tabs ===== */}
      <div className="mt-6 flex gap-2 border-b border-ink/10">
        <button
          type="button"
          onClick={() => setSubTab("standard")}
          className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            subTab === "standard" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
          }`}
        >
          Standard agents ({standardAgents.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("exclusive")}
          className={`appearance-none border-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            subTab === "exclusive" ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
          }`}
        >
          Exclusive agents ({exclusiveAgents.length})
        </button>
      </div>

      {loading && <p className="mt-10 text-center text-sm text-slate/60">Loading...</p>}
      {listError && <p className="mt-10 text-center text-sm text-red-600">Error: {listError}</p>}

      {!loading && !listError && subTab === "standard" && (
        <TableShell minWidth="600px">
          <TableHeadRow>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>Email</TableHeadCell>
          </TableHeadRow>
          <tbody>
            {standardAgents.length === 0 ? (
              <TableEmptyState colSpan={2}>No standard agents found</TableEmptyState>
            ) : (
              standardAgents.map((a) => (
                <TableRow key={a.user_id}>
                  <TableCell className="font-medium text-ink">{a.name}</TableCell>
                  <TableCell>{a.email}</TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      {!loading && !listError && subTab === "exclusive" && (
        <>
          <div className="mt-4 flex justify-end">
            <Button variant="dark" onClick={() => setShowAddModal(true)}>
              Add
            </Button>
          </div>
          <TableShell minWidth="700px">
            <TableHeadRow>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Email</TableHeadCell>
              <TableHeadCell>Added</TableHeadCell>
              <TableHeadCell>{null}</TableHeadCell>
            </TableHeadRow>
            <tbody>
              {exclusiveAgents.length === 0 ? (
                <TableEmptyState colSpan={4}>No exclusive agents yet</TableEmptyState>
              ) : (
                exclusiveAgents.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-ink">{a.name}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(a.assigned_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemoveExclusive(a.user_id)}
                        disabled={removingUserId === a.user_id}
                      >
                        {removingUserId === a.user_id ? "..." : "Return to standard"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </tbody>
          </TableShell>
        </>
      )}

      {/* ===== Add to exclusive modal ===== */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}>
        <h3 className="font-display text-lg font-semibold text-ink">Add to exclusive</h3>
        <Input
          type="text"
          autoFocus
          placeholder="Search by name or email..."
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          scale="lg"
          className="mt-3 w-full"
        />
        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-ink/10">
          {filteredAddCandidates.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate/50">No agents found</p>
          ) : (
            filteredAddCandidates.map((a) => (
              // A list row acting as a click target, not a form action button --
              // deliberately left hand-styled rather than forced into Button's
              // CTA shape (no rounded/padding/variant fit here).
              <button
                key={a.user_id}
                type="button"
                onClick={() => handleAddExclusive(a.user_id)}
                disabled={addingUserId === a.user_id}
                className="flex w-full appearance-none items-center justify-between border-0 border-b border-ink/5 bg-white px-4 py-3 text-left text-sm last:border-b-0 hover:bg-sand/40 disabled:opacity-50"
              >
                <span>
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="ml-2 text-slate/60">{a.email}</span>
                </span>
                {addingUserId === a.user_id && <span className="text-xs text-slate/50">...</span>}
              </button>
            ))
          )}
        </div>
        <Button variant="secondary" onClick={() => setShowAddModal(false)} className="mt-3 w-full">
          Cancel
        </Button>
      </Modal>
    </div>
  );
};

export default Counteragents;
