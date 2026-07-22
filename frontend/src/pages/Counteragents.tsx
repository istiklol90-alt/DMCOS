import { useEffect, useState } from "react";
import { API_URL } from "../config";

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
  const [settings, setSettings] = useState<PricingSettings | null>(null);
  const [markupInput, setMarkupInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
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
        fetchJson<PricingSettings>("/pricing-engine/settings", token),
        fetchJson<AgentSummary[]>("/pricing-engine/agents/standard", token),
        fetchJson<ExclusiveAgent[]>("/pricing-engine/agents/exclusive", token),
      ]);
      setSettings(settingsData);
      setMarkupInput(String(settingsData.standard_markup_amount_per_night));
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

  async function handleSaveSettings() {
    const value = parseFloat(markupInput);
    if (isNaN(value) || value < 0) {
      setSettingsError("Enter a valid amount (0 or greater)");
      return;
    }
    const token = localStorage.getItem("token") || "";
    try {
      setSavingSettings(true);
      setSettingsError(null);
      const updated = await fetchJson<PricingSettings>("/pricing-engine/settings", token, {
        method: "PUT",
        body: JSON.stringify({ standard_markup_amount_per_night: value }),
      });
      setSettings(updated);
      setMarkupInput(String(updated.standard_markup_amount_per_night));
    } catch (err: any) {
      setSettingsError(err.message || "Failed to save setting");
    } finally {
      setSavingSettings(false);
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
      <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-5">
        <h3 className="font-display text-lg font-semibold text-ink">Global markup</h3>
        <p className="mt-1 text-sm text-slate/60">
          A flat per-night amount added to the room price (Net from Contract Engine) for all agents.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <input
            type="number"
            min={0}
            step="0.01"
            value={markupInput}
            onChange={(e) => setMarkupInput(e.target.value)}
            className="w-40 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          />
          <span className="text-sm text-slate/60">{settings?.currency ?? "USD"} / night</span>
          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="appearance-none rounded-lg border-0 bg-coral px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : "Save"}
          </button>
        </div>
        {settingsError && <p className="mt-2 text-sm text-red-600">{settingsError}</p>}
        {settings?.updated_at && (
          <p className="mt-2 text-xs text-slate/50">Updated: {new Date(settings.updated_at).toLocaleString()}</p>
        )}
      </div>

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
        <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {standardAgents.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-5 py-10 text-center text-sm text-slate/50">
                    No standard agents found
                  </td>
                </tr>
              ) : (
                standardAgents.map((a) => (
                  <tr key={a.user_id} className="border-b border-ink/5 last:border-b-0">
                    <td className="px-5 py-3.5 font-medium text-ink">{a.name}</td>
                    <td className="px-5 py-3.5 text-slate/80">{a.email}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !listError && subTab === "exclusive" && (
        <>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="appearance-none rounded-lg border-0 bg-teal px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Add
            </button>
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Added</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {exclusiveAgents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate/50">
                      No exclusive agents yet
                    </td>
                  </tr>
                ) : (
                  exclusiveAgents.map((a) => (
                    <tr key={a.id} className="border-b border-ink/5 last:border-b-0">
                      <td className="px-5 py-3.5 font-medium text-ink">{a.name}</td>
                      <td className="px-5 py-3.5 text-slate/80">{a.email}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate/70">{formatDate(a.assigned_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveExclusive(a.user_id)}
                          disabled={removingUserId === a.user_id}
                          className="appearance-none rounded-lg border border-coral/40 bg-transparent px-3.5 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                        >
                          {removingUserId === a.user_id ? "..." : "Return to standard"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== Add to exclusive modal ===== */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-ink">Add to exclusive</h3>
            <input
              type="text"
              autoFocus
              placeholder="Search by name or email..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="mt-3 w-full appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            />
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-ink/10">
              {filteredAddCandidates.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate/50">No agents found</p>
              ) : (
                filteredAddCandidates.map((a) => (
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
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="mt-3 w-full appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Counteragents;
