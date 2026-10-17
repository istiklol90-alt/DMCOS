import { useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import { TableShell, TableHeadRow, TableHeadCell, TableRow, TableCell, TableEmptyState } from "../components/ui/Table";
import SuccessBanner from "../components/ui/SuccessBanner";

// Admin -> Packages (Package Engine, 2026-10-17). Built from the shared admin
// components (Card, Button, Input, Select, Table) and the same page header
// as every other admin screen, so it looks and reads like the rest.
//   agents  -- one commission for all agents, exceptions for selected agents
//              (found by search: there may be thousands), and the per-agent
//              "one-way flight packages" switch;
//   addons  -- insurance and visa: cost and price, quick price changes with
//              history; selling below cost needs a reason;
//   rules   -- cancellation penalties per component type.

type Section = "agents" | "addons" | "rules";

interface AgentRow { user_id: number; name: string | null; email: string | null; rate_percent: number; own_rate: boolean; one_way_flights_allowed: boolean }
interface AddOn { id: number; kind: string; name: string; supplier: string | null; destination_country: string | null; basis: string; currency: string; cost: number; price: number; active: boolean }
interface PriceChange { id: number; old_cost: number | null; new_cost: number | null; old_price: number | null; new_price: number | null; reason: string | null; changed_at: string | null }
interface Rule { id: number; component_type: string; days_before: number; penalty_percent: number; note: string | null }

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (res.status === 401) handleSessionExpired();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join("; ") : `HTTP ${res.status}`);
  }
  return res.json();
}

const num = (v: string) => Number(v.replace(",", "."));

function PageHeader({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-slate/70">{text}</p>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p className="mt-2 text-sm text-danger">{text}</p> : null;
}

// An on/off switch that says what it does in words next to it.
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex appearance-none items-center gap-2.5 border-0 bg-transparent p-0 text-sm text-ink"
    >
      <span className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-ink/20"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span className={on ? "font-medium text-success" : "text-slate/70"}>{label}</span>
    </button>
  );
}

// --------------------------------------------------------------------------
// Agents & commission
// --------------------------------------------------------------------------

function AgentsCommission() {
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [defaultEdit, setDefaultEdit] = useState("");
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<AgentRow[]>([]);
  const [rateEdits, setRateEdits] = useState<Record<number, string>>({});
  const timer = useRef<number | undefined>(undefined);

  const load = async () => {
    try {
      const [d, r] = await Promise.all([api<{ rate_percent: number }>("/package-engine/commission"), api<AgentRow[]>("/package-engine/agents")]);
      setDefaultRate(d.rate_percent);
      setDefaultEdit(String(d.rate_percent));
      setRows(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setFound([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      api<AgentRow[]>(`/package-engine/agents/search?q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => setFound([]));
    }, 250);
  }, [q]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setAgent = (id: number, body: object) => run(() => api(`/package-engine/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }));

  return (
    <div className="pb-10">
      <PageHeader
        title="Package commission"
        text="The agent's earning on a whole package. Client price (gross) = net ÷ (1 − commission). One rate applies to every agent; give selected agents a different rate below."
      />

      <Card padding="md" className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Commission for all agents</h3>
        <p className="mt-1 text-sm text-slate/60">Used for every agent who has no rate of their own.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input className="w-24 text-right text-base" value={defaultEdit} onChange={(e) => { setDefaultEdit(e.target.value); setSaved(false); }} />
            <span className="text-base text-ink">%</span>
          </div>
          <Button
            disabled={defaultEdit === "" || num(defaultEdit) === defaultRate}
            onClick={() => run(async () => { await api("/package-engine/commission", { method: "PUT", body: JSON.stringify({ rate_percent: num(defaultEdit) }) }); setSaved(true); })}
          >
            Save
          </Button>
          {saved && <span className="text-sm text-success">Saved</span>}
          {defaultRate === 0 && <span className="text-sm text-warning">Not set yet — agents currently earn 0 % on packages.</span>}
        </div>
      </Card>

      <Card padding="md" className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Agents with their own settings</h3>
        <p className="mt-1 text-sm text-slate/60">
          A different commission (e.g. strong sellers 10 %), or permission to book packages with a one-way flight. Every agent not listed here uses the rate for all agents.
        </p>

        <div className="relative mt-4 max-w-md">
          <Input className="w-full" placeholder="Find an agent by name, e-mail or company…" value={q} onChange={(e) => setQ(e.target.value)} />
          {found.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-card">
              {found.map((a) => (
                <button
                  key={a.user_id}
                  type="button"
                  onClick={() => { setQ(""); setFound([]); setAgent(a.user_id, { one_way_flights_allowed: a.one_way_flights_allowed }); }}
                  className="block w-full appearance-none border-0 border-b border-ink/5 bg-white px-3 py-2 text-left text-sm last:border-b-0 hover:bg-sand/50"
                >
                  <span className="font-medium text-ink">{a.name}</span>
                  <span className="ml-2 text-slate/50">{a.email}</span>
                  {a.own_rate && <span className="ml-2 text-xs text-gold-deep">already {a.rate_percent}%</span>}
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 2 && found.length === 0 && <p className="mt-1 text-xs text-slate/50">No agent found.</p>}
        </div>

        <TableShell minWidth="44rem">

            <TableHeadRow>
              <TableHeadCell>Agent</TableHeadCell>
              <TableHeadCell>Commission</TableHeadCell>
              <TableHeadCell>One-way flight packages</TableHeadCell>
              <TableHeadCell className="text-right"> </TableHeadCell>
            </TableHeadRow>

          <tbody>
            {rows.length === 0 && <TableEmptyState colSpan={4}>No agents with their own settings — everyone uses the rate for all agents.</TableEmptyState>}
            {rows.map((a) => {
              const edit = rateEdits[a.user_id];
              const value = edit ?? String(a.rate_percent);
              return (
                <TableRow key={a.user_id}>
                  <TableCell>
                    <span className="block font-medium text-ink">{a.name}</span>
                    <span className="block text-xs text-slate/50">{a.email}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input className="w-20 text-right" value={value} onChange={(e) => setRateEdits((p) => ({ ...p, [a.user_id]: e.target.value }))} />
                      <span>%</span>
                      {edit !== undefined && num(edit) !== a.rate_percent && (
                        <Button size="sm" onClick={() => { setRateEdits((p) => { const n = { ...p }; delete n[a.user_id]; return n; }); setAgent(a.user_id, { rate_percent: num(edit) }); }}>
                          Save
                        </Button>
                      )}
                      {!a.own_rate && <span className="text-xs text-slate/50">(rate for all)</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch on={a.one_way_flights_allowed} onChange={(v) => setAgent(a.user_id, { one_way_flights_allowed: v })} label={a.one_way_flights_allowed ? "Allowed" : "Not allowed"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => run(() => api(`/package-engine/agents/${a.user_id}`, { method: "DELETE" }))}>
                      Back to rate for all
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </TableShell>
        <ErrorLine text={error} />
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Insurance & visa
// --------------------------------------------------------------------------

function AddOnRow({ a, onChanged }: { a: AddOn; onChanged: () => void }) {
  const [cost, setCost] = useState(String(a.cost));
  const [price, setPrice] = useState(String(a.price));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceChange[] | null>(null);
  const c = num(cost);
  const p = num(price);
  const dirty = c !== a.cost || p !== a.price;
  const below = p < c;

  const save = async () => {
    setError(null);
    try {
      await api(`/package-engine/add-ons/${a.id}`, { method: "PUT", body: JSON.stringify({ cost: c, price: p, reason: reason || null }) });
      setReason("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium uppercase text-slate/70">{a.kind}</span>
        </TableCell>
        <TableCell>
          <span className="block font-medium text-ink">{a.name}</span>
          <span className="block text-xs text-slate/50">
            {a.destination_country || "All destinations"} · {a.basis.replace(/_/g, " ")}
            {a.supplier ? ` · ${a.supplier}` : ""}
          </span>
        </TableCell>
        <TableCell>
          <Input className="w-24 text-right" value={cost} onChange={(e) => setCost(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input className={`w-24 text-right ${below ? "border-danger text-danger" : ""}`} value={price} onChange={(e) => setPrice(e.target.value)} />
          {below && <span className="mt-1 block text-[11px] text-danger">Loss {(c - p).toFixed(2)} {a.currency} per unit</span>}
        </TableCell>
        <TableCell className="text-xs text-slate/60">{a.currency}</TableCell>
        <TableCell>
          <Switch
            on={a.active}
            onChange={async (v) => { await api(`/package-engine/add-ons/${a.id}`, { method: "PUT", body: JSON.stringify({ active: v }) }).catch(() => null); onChanged(); }}
            label={a.active ? "On sale" : "Off"}
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-col items-end gap-1.5">
            {dirty && (
              <>
                {below && <Input className="w-52" placeholder="Reason (required below cost)" value={reason} onChange={(e) => setReason(e.target.value)} />}
                <Button size="sm" onClick={save}>Save price</Button>
              </>
            )}
            <Button variant="ghost" className="text-xs text-gold-deep" onClick={async () => setHistory(history ? null : await api<PriceChange[]>(`/package-engine/add-ons/${a.id}/price-changes`))}>
              {history ? "Hide history" : "History"}
            </Button>
          </div>
          <ErrorLine text={error} />
        </TableCell>
      </TableRow>
      {history && (
        <tr className="bg-sand/40">
          <td colSpan={7} className="px-4 py-2 text-xs text-slate/70">
            {history.map((h) => (
              <div key={h.id}>
                {h.changed_at ? new Date(h.changed_at).toLocaleString("en-GB") : ""} — cost {h.old_cost ?? "—"} → {h.new_cost}, price {h.old_price ?? "—"} → {h.new_price}
                {h.reason ? ` · ${h.reason}` : ""}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function AddOns() {
  const [rows, setRows] = useState<AddOn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const empty = { kind: "insurance", name: "", supplier: "", destination_country: "", basis: "per_person", currency: "USD", cost: "", price: "", reason: "" };
  const [form, setForm] = useState(empty);
  const [added, setAdded] = useState<AddOn | null>(null);
  const load = () => api<AddOn[]>("/package-engine/add-ons").then(setRows).catch((e) => setError(String(e.message || e)));
  useEffect(() => {
    load();
  }, []);
  const below = form.cost !== "" && form.price !== "" && num(form.price) < num(form.cost);

  return (
    <div className="pb-10">
      <PageHeader title="Insurance & visa" text="Optional extras the agent may add to a package. Cost is ours and never shown to agents; price is what the agent pays. Every price change is kept in the history." />
      <Card padding="md" className="mt-6">
        <TableShell minWidth="58rem">

            <TableHeadRow>
              <TableHeadCell>Type</TableHeadCell>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Cost</TableHeadCell>
              <TableHeadCell>Price</TableHeadCell>
              <TableHeadCell>Cur.</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell className="text-right"> </TableHeadCell>
            </TableHeadRow>

          <tbody>
            {rows.length === 0 && <TableEmptyState colSpan={7}>No insurance or visa options yet.</TableEmptyState>}
            {rows.map((a) => (
              <AddOnRow key={`${a.id}-${a.cost}-${a.price}-${a.active}`} a={a} onChanged={load} />
            ))}
          </tbody>
        </TableShell>
      </Card>

      <Card padding="md" className="mt-6">
        <h3 className="font-display text-lg font-semibold text-ink">Add an option</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="insurance">Insurance</option>
            <option value="visa">Visa</option>
          </Select>
          <Input className="lg:col-span-2" placeholder="Name (the agent sees this)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <Input placeholder="Destination (empty = all)" value={form.destination_country} onChange={(e) => setForm({ ...form, destination_country: e.target.value })} />
          <Select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>
            <option value="per_person">Per person</option>
            <option value="per_person_per_day">Per person per day</option>
            <option value="per_booking">Per booking</option>
          </Select>
          <Input placeholder="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          <div className="flex gap-3">
            <Input className="w-full" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <Input className={`w-full ${below ? "border-danger" : ""}`} placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          {below && <Input className="lg:col-span-2" placeholder="Reason (price below cost)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}
        </div>
        <Button
          className="mt-4"
          disabled={!form.name.trim() || form.cost === "" || form.price === ""}
          onClick={async () => {
            setError(null);
            try {
              const created = await api<AddOn>("/package-engine/add-ons", {
                method: "POST",
                body: JSON.stringify({ ...form, supplier: form.supplier || null, destination_country: form.destination_country || null, cost: num(form.cost), price: num(form.price), reason: form.reason || null }),
              });
              setForm(empty);
              setAdded(created);
              load();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Add option
        </Button>
        {added && (
          <SuccessBanner title={`${added.kind === "visa" ? "Visa" : "Insurance"} "${added.name}" has been added`} onClose={() => setAdded(null)}>
            Price {added.price} {added.currency} · {added.destination_country || "all destinations"} · on sale to agents in packages.
          </SuccessBanner>
        )}
        <ErrorLine text={error} />
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Cancellation rules
// --------------------------------------------------------------------------

function Rules() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ component_type: "insurance", days_before: "", penalty_percent: "", note: "" });
  const [added, setAdded] = useState<Rule | null>(null);
  const load = () => api<Rule[]>("/package-engine/cancellation-rules").then(setRows).catch((e) => setError(String(e.message || e)));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="pb-10">
      <PageHeader title="Cancellation rules" text="Penalty for cancelling each kind of service, by days before arrival. A package's penalty is the sum of its parts. Hotels keep their own contract terms." />
      <Card padding="md" className="mt-6">
        <TableShell>

            <TableHeadRow>
              <TableHeadCell>Service</TableHeadCell>
              <TableHeadCell>Within (days before arrival)</TableHeadCell>
              <TableHeadCell>Penalty</TableHeadCell>
              <TableHeadCell>Note</TableHeadCell>
              <TableHeadCell className="text-right"> </TableHeadCell>
            </TableHeadRow>

          <tbody>
            {rows.length === 0 && <TableEmptyState colSpan={5}>No rules yet.</TableEmptyState>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="capitalize">{r.component_type}</TableCell>
                <TableCell>{r.days_before}</TableCell>
                <TableCell>{r.penalty_percent}%</TableCell>
                <TableCell className="text-xs text-slate/60">{r.note}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => api(`/package-engine/cancellation-rules/${r.id}`, { method: "DELETE" }).then(load).catch((e) => setError(String(e.message || e)))}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </TableShell>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select value={form.component_type} onChange={(e) => setForm({ ...form, component_type: e.target.value })}>
            <option value="transfer">Transfer</option>
            <option value="flight">Flight</option>
            <option value="insurance">Insurance</option>
            <option value="visa">Visa</option>
          </Select>
          <Input className="w-28" placeholder="Days" value={form.days_before} onChange={(e) => setForm({ ...form, days_before: e.target.value })} />
          <Input className="w-28" placeholder="Penalty %" value={form.penalty_percent} onChange={(e) => setForm({ ...form, penalty_percent: e.target.value })} />
          <Input className="w-56" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button
            disabled={form.days_before === "" || form.penalty_percent === ""}
            onClick={async () => {
              setError(null);
              try {
                const created = await api<Rule>("/package-engine/cancellation-rules", { method: "POST", body: JSON.stringify({ component_type: form.component_type, days_before: Number(form.days_before), penalty_percent: num(form.penalty_percent), note: form.note || null }) });
                setForm({ ...form, days_before: "", penalty_percent: "", note: "" });
                setAdded(created);
                load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Add rule
          </Button>
        </div>
        {added && (
          <SuccessBanner title="Cancellation rule has been added" onClose={() => setAdded(null)}>
            {added.component_type}: within {added.days_before} days before arrival — {added.penalty_percent}% penalty.
          </SuccessBanner>
        )}
        <ErrorLine text={error} />
      </Card>
    </div>
  );
}

export default function AdminPackages({ section }: { section: Section }) {
  if (section === "agents") return <AgentsCommission />;
  if (section === "addons") return <AddOns />;
  return <Rules />;
}
