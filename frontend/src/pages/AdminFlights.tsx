import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import { TableShell, TableHeadRow, TableHeadCell, TableRow, TableCell, TableEmptyState } from "../components/ui/Table";
import SuccessBanner from "../components/ui/SuccessBanner";

// Admin -> Packages -> Flights (Flight Engine, 2026-10-17). The owner enters
// the seats himself: 1) the flights (one direction each), 2) a schedule --
// period + weekdays + seats / cost / standard price per cabin -- which creates
// every departure date, 3) the price grid: dates x flights with seats sold /
// free, the price editable inline or for many selected dates at once. A
// price below cost needs a reason; every change is kept in the history.

interface Leg { id: number; direction: string; airline: string | null; flight_number: string; origin: string; destination: string; destination_country: string; departure_time: string; arrival_time: string; arrival_day_offset: number; currency: string; active: boolean; departures: number; seats_sold: number; first_date: string | null; last_date: string | null }
interface Row { departure_id: number; date: string; cabin: string; direction: string; flight_number: string; route: string; departure_time: string; arrival_time: string; arrival_day_offset: number; currency: string; seats_total: number; seats_sold: number; seats_free: number; cost_per_seat: number; price_per_seat: number; standard_price: number; below_cost: boolean }
interface Change { id: number; old_price: number | null; new_price: number | null; old_cost: number | null; new_cost: number | null; old_seats: number | null; new_seats: number | null; reason: string | null; changed_at: string | null }

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (res.status === 401) handleSessionExpired();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const d = body?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join("; ") : `HTTP ${res.status}`);
  }
  return res.json();
}

const num = (v: string) => Number(v.replace(",", "."));
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });

function ErrorLine({ text }: { text: string | null }) {
  return text ? <p className="mt-2 text-sm text-danger">{text}</p> : null;
}

// ----------------------------------------------------------------------------
// 1. Flights
// ----------------------------------------------------------------------------

// Owner, 2026-10-17: every detail entered separately and clearly -- arrival
// flight (to the destination) and departure flight (back home), each with
// its own number, airports and times, checked before saving. Stored values
// stay "outbound" / "return"; only the wording is the booking wording.
const DIR_LABEL: Record<string, string> = { outbound: "Arrival flight", return: "Departure flight" };
const DIR_HINT: Record<string, string> = { outbound: "to the destination", return: "back home" };
const FLIGHT_NO = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Digits typed as 0910 become 09:10.
function timeInput(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

type LegForm = { direction: string; airline: string; flight_number: string; origin: string; destination: string; destination_country: string; departure_time: string; arrival_time: string; arrival_day_offset: string; currency: string };
const EMPTY_FORM: LegForm = { direction: "outbound", airline: "", flight_number: "", origin: "", destination: "", destination_country: "", departure_time: "", arrival_time: "", arrival_day_offset: "0", currency: "USD" };
const toForm = (l: Leg): LegForm => ({ direction: l.direction, airline: l.airline || "", flight_number: l.flight_number, origin: l.origin, destination: l.destination, destination_country: (l.destination_country || "").trim(), departure_time: l.departure_time, arrival_time: l.arrival_time, arrival_day_offset: String(l.arrival_day_offset || 0), currency: l.currency });

// Every problem the server would refuse, shown before Save.
function formProblems(f: LegForm, legs: Leg[], editingId: number | null): string[] {
  const out: string[] = [];
  const no = f.flight_number.replace(/\s/g, "").toUpperCase();
  if (!f.destination_country) out.push("Choose the destination.");
  if (!no) out.push("Enter the flight number.");
  else if (!FLIGHT_NO.test(no)) out.push(`Flight number ${no} does not look right — airline code + number, e.g. SZ105.`);
  if (!f.origin.trim()) out.push("Enter the departure airport (From).");
  if (!f.destination.trim()) out.push("Enter the arrival airport (To).");
  if (f.origin.trim() && f.origin.trim().toLowerCase() === f.destination.trim().toLowerCase()) out.push("From and To cannot be the same airport.");
  if (!TIME.test(f.departure_time)) out.push("Departure time must be HH:MM, e.g. 09:10.");
  if (!TIME.test(f.arrival_time)) out.push("Arrival time must be HH:MM, e.g. 13:40.");
  if (!/^[A-Z]{3}$/.test(f.currency.trim().toUpperCase())) out.push("Currency must be a 3-letter code, e.g. USD.");
  if (no && legs.some((l) => l.id !== editingId && l.flight_number === no && l.direction === f.direction && (l.destination_country || "").trim() === f.destination_country)) out.push(`Flight ${no} is already entered as ${DIR_LABEL[f.direction].toLowerCase()} — edit that line instead.`);
  return out;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink/70">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate/50">{hint}</span>}
    </label>
  );
}

function LegEditor({ initial, legs, countries, editing, locked, onSave, onCancel }: {
  initial: LegForm; legs: Leg[]; countries: string[]; editing: Leg | null; locked: boolean;
  onSave: (f: LegForm) => Promise<void>; onCancel?: () => void;
}) {
  const [f, setF] = useState<LegForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const problems = formProblems(f, legs, editing?.id ?? null);
  const set = (k: keyof LegForm, v: string) => setF({ ...f, [k]: v });
  const no = f.flight_number.replace(/\s/g, "").toUpperCase();
  const ready = TIME.test(f.departure_time) && TIME.test(f.arrival_time) && f.origin && f.destination;

  return (
    <div className="rounded-xl border border-ink/15 bg-white p-4">
      <p className="text-sm font-semibold text-ink">{editing ? `Edit flight ${editing.flight_number}` : "Add a flight"}</p>

      <p className="mt-3 text-xs font-medium text-ink/70">Which flight is this?</p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {(["outbound", "return"] as const).map((d) => {
          const on = f.direction === d;
          return (
            <button key={d} type="button" disabled={locked} aria-pressed={on} onClick={() => set("direction", d)}
              className={`appearance-none rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink hover:bg-sand"}`}>
              <span className="block text-sm font-semibold">{d === "outbound" ? "→ " : "← "}{DIR_LABEL[d]}</span>
              <span className={`block text-xs ${on ? "text-white/70" : "text-slate/60"}`}>{d === "outbound" ? "Flies the tourists TO the destination, e.g. Dushanbe → Male" : "Flies them BACK home, e.g. Male → Dushanbe"}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Destination" hint="Our countries only">
          <Select value={f.destination_country} disabled={locked} onChange={(e) => set("destination_country", e.target.value)}>
            <option value="">Choose…</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={`${DIR_LABEL[f.direction]} number`} hint="e.g. SZ105">
          <Input value={f.flight_number} onChange={(e) => set("flight_number", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Airline">
          <Input value={f.airline} placeholder="e.g. Somon Air" onChange={(e) => set("airline", e.target.value)} />
        </Field>
        <Field label="Currency" hint="Prices of this flight">
          <Input value={f.currency} disabled={locked} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-sand/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Departure</p>
          <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
            <Field label="From (airport / city)"><Input value={f.origin} placeholder={f.direction === "outbound" ? "e.g. Dushanbe (DYU)" : "e.g. Male (MLE)"} onChange={(e) => set("origin", e.target.value)} /></Field>
            <Field label="Departure time" hint="24h, HH:MM"><Input value={f.departure_time} inputMode="numeric" placeholder="09:10" onChange={(e) => set("departure_time", timeInput(e.target.value))} /></Field>
          </div>
        </div>
        <div className="rounded-lg bg-sand/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Arrival</p>
          <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
            <Field label="To (airport / city)"><Input value={f.destination} placeholder={f.direction === "outbound" ? "e.g. Male (MLE)" : "e.g. Dushanbe (DYU)"} onChange={(e) => set("destination", e.target.value)} /></Field>
            <Field label="Arrival time" hint="Local time, HH:MM"><Input value={f.arrival_time} inputMode="numeric" placeholder="13:40" onChange={(e) => set("arrival_time", timeInput(e.target.value))} /></Field>
          </div>
          <Select className="mt-2" value={f.arrival_day_offset} onChange={(e) => set("arrival_day_offset", e.target.value)}>
            <option value="0">Arrives the same day</option>
            <option value="1">Arrives the next day (+1)</option>
            <option value="2">Arrives in two days (+2)</option>
          </Select>
        </div>
      </div>

      {ready && (
        <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          <span className="font-semibold">{DIR_LABEL[f.direction]} {no || "—"}</span>{f.airline ? ` · ${f.airline}` : ""}: departs {f.origin} at {f.departure_time}, arrives {f.destination} at {f.arrival_time}
          {f.arrival_day_offset !== "0" ? ` (+${f.arrival_day_offset} day)` : " (same day)"}{f.destination_country ? ` · package destination ${f.destination_country}` : ""}.
        </p>
      )}
      {locked && <p className="mt-2 text-xs text-warning">Seats on this flight are already sold — direction, destination and currency are locked.</p>}
      {tried && problems.length > 0 && (
        <ul className="mt-3 list-disc rounded-lg border border-danger/30 bg-danger/5 py-2 pl-8 pr-3 text-sm text-danger">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={saving} onClick={async () => {
          setTried(true);
          setError(null);
          if (problems.length) return;
          setSaving(true);
          try {
            await onSave({ ...f, flight_number: no, currency: f.currency.trim().toUpperCase() });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        }}>{editing ? "Save changes" : "Add flight"}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
      <ErrorLine text={error} />
    </div>
  );
}

function FlightsCard({ legs, onChanged }: { legs: Leg[]; onChanged: () => void }) {
  const [banner, setBanner] = useState<{ leg: Leg; verb: string } | null>(null);
  const [editing, setEditing] = useState<Leg | null>(null);
  // A new form (fresh key) for "Add the departure flight for SZ104", prefilled reversed.
  const [draft, setDraft] = useState<{ key: number; form: LegForm }>({ key: 0, form: EMPTY_FORM });
  // Our destinations only: the countries we have hotels in.
  const [countries, setCountries] = useState<string[]>([]);
  useEffect(() => {
    api<string[]>("/flight-engine/destinations").then(setCountries).catch(() => setCountries([]));
  }, []);
  const payload = (f: LegForm) => JSON.stringify({ ...f, airline: f.airline.trim() || null, arrival_day_offset: Number(f.arrival_day_offset) });
  const groups = (["outbound", "return"] as const).map((d) => ({ d, rows: legs.filter((l) => l.direction === d) }));

  return (
    <Card padding="md" className="mt-6">
      <h3 className="font-display text-lg font-semibold text-ink">1. Flights</h3>
      <p className="mt-1 text-sm text-slate/60">Enter the arrival flight (to the destination) and the departure flight (back home) separately — each with its own number, airports and times. Dates are created in step 2.</p>

      {groups.map(({ d, rows }) => (
        <div key={d} className="mt-5">
          <p className="text-sm font-semibold text-ink">{d === "outbound" ? "→ " : "← "}{DIR_LABEL[d]}s <span className="font-normal text-slate/60">— {DIR_HINT[d]}</span></p>
          <TableShell minWidth="60rem">
            <TableHeadRow>
              <TableHeadCell>Flight number</TableHeadCell>
              <TableHeadCell>Departure</TableHeadCell>
              <TableHeadCell>Arrival</TableHeadCell>
              <TableHeadCell>Destination</TableHeadCell>
              <TableHeadCell>Dates</TableHeadCell>
              <TableHeadCell>Sold</TableHeadCell>
              <TableHeadCell className="text-right"> </TableHeadCell>
            </TableHeadRow>
            <tbody>
              {rows.length === 0 && <TableEmptyState colSpan={7}>No {DIR_LABEL[d].toLowerCase()}s yet.</TableEmptyState>}
              {rows.map((l) => (
                <TableRow key={l.id} className={banner?.leg.id === l.id ? "bg-success/10" : editing?.id === l.id ? "bg-gold/10" : ""}>
                  <TableCell className="font-semibold">{l.flight_number}{l.airline ? <span className="block text-xs font-normal text-slate/50">{l.airline}</span> : null}</TableCell>
                  <TableCell>{l.origin}<span className="block font-mono text-sm">{l.departure_time}</span></TableCell>
                  <TableCell>{l.destination}<span className="block font-mono text-sm">{l.arrival_time}{l.arrival_day_offset ? <span className="ml-1 text-xs text-warning">+{l.arrival_day_offset} day</span> : null}</span></TableCell>
                  <TableCell>{(l.destination_country || "").trim()}<span className="block text-xs text-slate/50">{l.currency}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {l.departures ? <>{l.first_date ? fmtDate(l.first_date) : ""} – {l.last_date ? fmtDate(l.last_date) : ""}<span className="block text-xs text-slate/50">{l.departures} departures</span></> : <span className="text-xs text-warning">no dates yet — step 2</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{l.seats_sold}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => { setEditing(l); setBanner(null); }}>Edit</Button>
                      <Button variant="ghost" className="text-xs text-gold-deep" onClick={() => {
                        setEditing(null);
                        setDraft({ key: Date.now(), form: { ...EMPTY_FORM, direction: l.direction === "outbound" ? "return" : "outbound", airline: l.airline || "", origin: l.destination, destination: l.origin, destination_country: (l.destination_country || "").trim(), currency: l.currency } });
                      }}>Add the {l.direction === "outbound" ? "departure" : "arrival"} flight for it</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </TableShell>
        </div>
      ))}

      {banner && (
        <SuccessBanner title={`Flight ${banner.leg.flight_number} has been ${banner.verb}`} onClose={() => setBanner(null)}>
          {DIR_LABEL[banner.leg.direction]} · departs {banner.leg.origin} {banner.leg.departure_time} → arrives {banner.leg.destination} {banner.leg.arrival_time}{banner.leg.arrival_day_offset ? ` (+${banner.leg.arrival_day_offset})` : ""} · {(banner.leg.destination_country || "").trim()}.
          {banner.verb === "added" ? " Next: create its departure dates in step 2." : ""}
        </SuccessBanner>
      )}

      <div className="mt-5">
        {editing ? (
          <LegEditor key={`edit-${editing.id}`} initial={toForm(editing)} legs={legs} countries={countries} editing={editing} locked={editing.seats_sold > 0}
            onCancel={() => setEditing(null)}
            onSave={async (f) => {
              const leg = await api<Leg>(`/flight-engine/legs/${editing.id}`, { method: "PUT", body: payload(f) });
              setEditing(null);
              setBanner({ leg, verb: "updated" });
              onChanged();
            }} />
        ) : (
          <LegEditor key={`new-${draft.key}`} initial={draft.form} legs={legs} countries={countries} editing={null} locked={false}
            onSave={async (f) => {
              const leg = await api<Leg>("/flight-engine/legs", { method: "POST", body: payload(f) });
              setDraft({ key: Date.now(), form: EMPTY_FORM });
              setBanner({ leg, verb: "added" });
              onChanged();
            }} />
        )}
      </div>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// 2. Schedule
// ----------------------------------------------------------------------------

function ScheduleCard({ legs, onChanged }: { legs: Leg[]; onChanged: () => void }) {
  const [legId, setLegId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [cabins, setCabins] = useState({ economy: { on: true, seats: "", cost: "", price: "" }, business: { on: false, seats: "", cost: "", price: "" } });
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; kept_manual_price: number; seats_kept_at_sold: string[] } | null>(null);
  const plans = (["economy", "business"] as const).filter((c) => cabins[c].on).map((c) => ({ cabin: c, seats: Number(cabins[c].seats), cost: num(cabins[c].cost), price: num(cabins[c].price), reason: reason || null }));
  const below = plans.some((p) => p.price < p.cost);

  return (
    <Card padding="md" className="mt-6">
      <h3 className="font-display text-lg font-semibold text-ink">2. Schedule — create departure dates</h3>
      <p className="mt-1 text-sm text-slate/60">Pick a flight, the period and the weekdays it flies; set seats, cost and the standard price per cabin. New dates are created; dates that already exist are updated to these seats, cost and standard price (a price you changed by hand on a date is kept).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate/60">Flight
          <Select value={legId} onChange={(e) => setLegId(e.target.value)}>
            <option value="">Choose a flight…</option>
            {legs.map((l) => <option key={l.id} value={l.id}>{DIR_LABEL[l.direction]} {l.flight_number} · {l.origin} {l.departure_time} → {l.destination} {l.arrival_time}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate/60">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate/60">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="mt-4">
        <p className="text-xs text-slate/60">Flies on</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                className={`appearance-none rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${on ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink hover:bg-sand"}`}>
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {(["economy", "business"] as const).map((c) => (
          <div key={c} className={`rounded-xl border p-4 ${cabins[c].on ? "border-ink/20 bg-white" : "border-ink/10 bg-sand/40"}`}>
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" className="h-4 w-4 accent-gold" checked={cabins[c].on} onChange={(e) => setCabins({ ...cabins, [c]: { ...cabins[c], on: e.target.checked } })} />
              {c === "economy" ? "Economy" : "Business"}
            </label>
            {cabins[c].on && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Input placeholder="Seats" value={cabins[c].seats} onChange={(e) => setCabins({ ...cabins, [c]: { ...cabins[c], seats: e.target.value } })} />
                <Input placeholder="Cost / seat" value={cabins[c].cost} onChange={(e) => setCabins({ ...cabins, [c]: { ...cabins[c], cost: e.target.value } })} />
                <Input placeholder="Price / seat" value={cabins[c].price} onChange={(e) => setCabins({ ...cabins, [c]: { ...cabins[c], price: e.target.value } })} />
              </div>
            )}
          </div>
        ))}
      </div>
      {below && <Input className="mt-3 w-full max-w-md" placeholder="Reason (a price is below cost)" value={reason} onChange={(e) => setReason(e.target.value)} />}
      <Button
        className="mt-4"
        disabled={!legId || !from || !to || days.length === 0 || plans.length === 0 || plans.some((p) => !p.seats || Number.isNaN(p.cost) || Number.isNaN(p.price))}
        onClick={async () => {
          setMsg(null);
          setResult(null);
          try {
            const r = await api<{ created: number; updated: number; kept_manual_price: number; seats_kept_at_sold: string[] }>(`/flight-engine/legs/${legId}/schedule`, { method: "POST", body: JSON.stringify({ date_from: from, date_to: to, weekdays: days, cabins: plans }) });
            setResult(r);
            onChanged();
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
          }
        }}
      >
        Create / update departures
      </Button>
      {result && (
        <SuccessBanner
          title={result.created + result.updated === 0 ? "Nothing to change — every date already matches" : `Schedule saved: ${result.created} new, ${result.updated} updated`}
          onClose={() => setResult(null)}
        >
          {result.kept_manual_price > 0 && <p className="text-warning">{result.kept_manual_price} date(s) kept a price you had changed by hand — change those in step 3.</p>}
          {result.seats_kept_at_sold.length > 0 && <p className="text-warning">Seats not lowered below what is already sold: {result.seats_kept_at_sold.join(", ")}.</p>}
          {result.created + result.updated > 0 && <p>See them in step 3 below.</p>}
        </SuccessBanner>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// 3. Price grid
// ----------------------------------------------------------------------------

function GridRowView({ r, selected, onSelect, onSaved }: { r: Row; selected: boolean; onSelect: (v: boolean) => void; onSaved: () => void }) {
  const [price, setPrice] = useState(String(r.price_per_seat));
  const [seats, setSeats] = useState(String(r.seats_total));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Change[] | null>(null);
  const p = num(price);
  const s = Number(seats);
  const dirty = p !== r.price_per_seat || s !== r.seats_total;
  const below = p < r.cost_per_seat;
  const load = r.seats_total ? Math.round((r.seats_sold / r.seats_total) * 100) : 0;
  return (
    <>
      <TableRow className={below ? "bg-danger/5" : ""}>
        <TableCell><input type="checkbox" className="h-4 w-4 accent-gold" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label="Select" /></TableCell>
        <TableCell className="whitespace-nowrap font-medium">{fmtDate(r.date)}</TableCell>
        <TableCell className="whitespace-nowrap"><span className="block text-[11px] text-slate/50">{r.direction === "outbound" ? "→ Arrival" : "← Departure"}</span>{r.flight_number}<span className="block text-xs text-slate/50">{r.departure_time}–{r.arrival_time}{r.arrival_day_offset ? ` +${r.arrival_day_offset}` : ""}</span></TableCell>
        <TableCell className="capitalize">{r.cabin}</TableCell>
        <TableCell>
          <span className="font-mono">{r.seats_sold}/{r.seats_total}</span>
          <span className="ml-2 text-xs text-slate/50">{r.seats_free} free</span>
          <span className="mt-1 block h-1.5 w-24 rounded-full bg-ink/10"><span className="block h-1.5 rounded-full bg-gold" style={{ width: `${load}%` }} /></span>
        </TableCell>
        <TableCell className="font-mono text-slate/70">{r.cost_per_seat}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <Input className={`w-24 text-right ${below ? "border-danger text-danger" : ""}`} value={price} onChange={(e) => setPrice(e.target.value)} />
            <span className="text-xs text-slate/50">{r.currency}</span>
          </div>
          {below && <span className="mt-1 block text-[11px] text-danger">−{(r.cost_per_seat - p).toFixed(0)} per seat</span>}
          {r.price_per_seat !== r.standard_price && !dirty && <span className="mt-1 block text-[11px] text-slate/50">standard {r.standard_price}</span>}
        </TableCell>
        <TableCell><Input className="w-20 text-right" value={seats} onChange={(e) => setSeats(e.target.value)} /></TableCell>
        <TableCell className="text-right">
          <div className="flex flex-col items-end gap-1.5">
            {dirty && (
              <>
                {below && p !== r.price_per_seat && <Input className="w-44" placeholder="Reason (below cost)" value={reason} onChange={(e) => setReason(e.target.value)} />}
                <Button size="sm" onClick={async () => {
                  setError(null);
                  try {
                    await api(`/flight-engine/departures/${r.departure_id}`, { method: "PUT", body: JSON.stringify({ price_per_seat: p, seats_total: s, reason: reason || null }) });
                    onSaved();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}>Save</Button>
              </>
            )}
            <Button variant="ghost" className="text-xs text-gold-deep" onClick={async () => setHistory(history ? null : await api<Change[]>(`/flight-engine/departures/${r.departure_id}/history`))}>
              {history ? "Hide history" : "History"}
            </Button>
          </div>
          <ErrorLine text={error} />
        </TableCell>
      </TableRow>
      {history && (
        <tr className="bg-sand/40">
          <td colSpan={9} className="px-4 py-2 text-xs text-slate/70">
            {history.length === 0 ? "No changes yet." : history.map((h) => (
              <div key={h.id}>
                {h.changed_at ? new Date(h.changed_at).toLocaleString("en-GB") : ""} — price {h.old_price} → {h.new_price}
                {h.old_seats !== h.new_seats ? `, seats ${h.old_seats} → ${h.new_seats}` : ""}{h.reason ? ` · ${h.reason}` : ""}
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

function GridCard({ refreshKey }: { refreshKey: number }) {
  const today = new Date();
  const [from, setFrom] = useState(iso(today));
  const [to, setTo] = useState(iso(new Date(today.getTime() + 30 * 86400000)));
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState<"price" | "percent">("price");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!from || !to) return;
    api<Row[]>(`/flight-engine/departures?date_from=${from}&date_to=${to}`).then((r) => { setRows(r); setSelected(new Set()); }).catch((e) => setError(String(e.message || e)));
  }, [from, to, refreshKey, tick]);

  const allOn = rows.length > 0 && selected.size === rows.length;
  const reload = () => setTick((t) => t + 1);
  const summary = useMemo(() => {
    const seats = rows.reduce((a, r) => a + r.seats_total, 0);
    const sold = rows.reduce((a, r) => a + r.seats_sold, 0);
    return { seats, sold, below: rows.filter((r) => r.below_cost).length };
  }, [rows]);

  return (
    <Card padding="md" className="mt-6">
      <h3 className="font-display text-lg font-semibold text-ink">3. Prices by date</h3>
      <p className="mt-1 text-sm text-slate/60">Change the price of a seat on any date from the load — in the row, or for all selected dates at once. A price below cost is shown in red and needs a reason.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate/60">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate/60">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <p className="pb-2 text-sm text-slate/60">{rows.length} departures · {summary.sold}/{summary.seats} seats sold{summary.below ? ` · ${summary.below} below cost` : ""}</p>
      </div>

      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 p-3">
          <span className="text-sm font-medium text-ink">{selected.size} selected:</span>
          <Select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as "price" | "percent")}>
            <option value="price">Set price to</option>
            <option value="percent">Change by %</option>
          </Select>
          <Input className="w-28" placeholder={bulkMode === "price" ? "e.g. 200" : "e.g. -20"} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
          <Input className="w-56" placeholder="Reason (needed below cost)" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
          <Button size="sm" disabled={bulkValue === ""} onClick={async () => {
            setError(null);
            try {
              await api("/flight-engine/departures/bulk-price", { method: "POST", body: JSON.stringify({ departure_ids: [...selected], [bulkMode]: num(bulkValue), reason: bulkReason || null }) });
              setBulkValue("");
              setBulkReason("");
              reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}>Apply</Button>
        </div>
      )}

      <TableShell minWidth="62rem">
        <TableHeadRow>
          <TableHeadCell><input type="checkbox" className="h-4 w-4 accent-gold" checked={allOn} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.departure_id)) : new Set())} aria-label="Select all" /></TableHeadCell>
          <TableHeadCell>Date</TableHeadCell>
          <TableHeadCell>Flight</TableHeadCell>
          <TableHeadCell>Cabin</TableHeadCell>
          <TableHeadCell>Sold / seats</TableHeadCell>
          <TableHeadCell>Cost</TableHeadCell>
          <TableHeadCell>Price / seat</TableHeadCell>
          <TableHeadCell>Seats</TableHeadCell>
          <TableHeadCell className="text-right"> </TableHeadCell>
        </TableHeadRow>
        <tbody>
          {rows.length === 0 && <TableEmptyState colSpan={9}>No departures in this period — create them in step 2.</TableEmptyState>}
          {rows.map((r) => (
            <GridRowView key={`${r.departure_id}-${r.price_per_seat}-${r.seats_total}`} r={r} selected={selected.has(r.departure_id)}
              onSelect={(v) => { const n = new Set(selected); if (v) n.add(r.departure_id); else n.delete(r.departure_id); setSelected(n); }} onSaved={reload} />
          ))}
        </tbody>
      </TableShell>
      <ErrorLine text={error} />
    </Card>
  );
}

export default function AdminFlights() {
  const [legs, setLegs] = useState<Leg[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const load = () => api<Leg[]>("/flight-engine/legs").then(setLegs).catch(() => setLegs([]));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="pb-10">
      <div>
        <h2 className="text-xl font-semibold text-ink">Flights</h2>
        <p className="mt-0.5 text-sm text-slate/70">Seats we hold for packages: add the flights, create the departure dates, then manage the price per date from the load.</p>
      </div>
      <FlightsCard legs={legs} onChanged={load} />
      <ScheduleCard legs={legs} onChanged={() => setRefreshKey((k) => k + 1)} />
      <GridCard refreshKey={refreshKey} />
    </div>
  );
}
