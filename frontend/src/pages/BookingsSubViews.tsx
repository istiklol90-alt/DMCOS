import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, formatDate } from "./financeShared";
import type { Booking } from "./Reservations";
import { DateRangePicker } from "./HotelSearch";
import { SkeletonRow } from "../components/ui/Skeleton";
import Select from "../components/ui/Select";
import {
  TableShell,
  TableHeadRow,
  TableHeadCell,
  TableRow,
  TableCell,
  TableEmptyState,
  TableErrorState,
} from "../components/ui/Table";

// ---------------------------------------------------------------------------
// Transfer list -- who is arriving, who is leaving, and who of them has a
// transfer, for the dates chosen. Its own section in the admin menu (it used
// to be three views tucked inside Bookings).
//
// THE RULE THIS SCREEN IS BUILT ON (owner, 2026-10-13): nothing here is ever
// loaded without a date range. At a hundred applications a day "show me
// everything, then filter" is first a long wait and then a list nobody can
// read.
//
// It previously did exactly that, and worse than slowly: it fetched the
// newest 500 bookings by CREATION date and filtered them in the browser. At
// volume that is the last five days of bookings -- so an arrival next week
// that was booked a month ago was simply absent, with nothing on screen to
// say so. Now the dates go to the server and the server answers for the
// whole database.
//
//   Arrivals    arrival date inside the range     -> ?arrival_from&arrival_to
//   Departures  departure date inside the range   -> see fetchDepartures
//   Transfers   either of the two, one row per booking
//
// Admin-only, English throughout (Decision 109). Cancelled, rejected and
// cancellation-requested bookings are left out of all three: there is no
// arrival, departure or transfer left to organise for them.
// ---------------------------------------------------------------------------

export type TransferListView = "arrivals" | "departures" | "transfers";

const VIEWS: { key: TransferListView; label: string }[] = [
  { key: "arrivals", label: "Arrivals" },
  { key: "departures", label: "Departures" },
  { key: "transfers", label: "All movements" },
];

interface Hotel {
  id: number;
  hotel_name: string;
}

interface RoomType {
  id: number;
  room_name: string;
}

interface MealPlanInfo {
  meal_code: string;
  meal_name: string | null;
}

interface UserRecord {
  id: number;
  name: string;
}

interface TransferOption {
  id: number;
  contract_id: number;
  transfer_type: string;
  transfer_name: string | null;
}

interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  is_lead_guest: boolean;
}

type TransferFilter = "all" | "with" | "without";

const EXCLUDED_STATUSES = ["Cancellation Requested", "Cancelled", "Rejected"];

// The LOCAL calendar date. Not toISOString(), which is the date in UTC and so
// is still yesterday for the first hours of every day east of Greenwich --
// the same mistake Reservations.tsx's todayStr() used to make, and this file
// made it too.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

function formatFlight(number: string | null, date: string | null, time: string | null): string {
  if (!number) return "—";
  const when = date ? formatDate(date) + (time ? ` ${time}` : "") : null;
  return when ? `${number} · ${when}` : number;
}

function transferKey(contractId: number, transferType: string): string {
  return `${contractId}:${transferType}`;
}

// One page is one request; the page size and the ceiling are what keep a
// careless range (a whole year) from turning into an unbounded download. If
// the ceiling is reached the screen says so -- it never shows a silently
// shortened list.
const PAGE = 200;
const MAX_PAGES = 10;

async function fetchAll(query: string, token: string): Promise<{ rows: Booking[]; truncated: boolean }> {
  const rows: Booking[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const chunk = await fetchJson<Booking[]>(
      `/booking-engine/bookings?limit=${PAGE}&skip=${page * PAGE}&${query}`,
      token,
    );
    rows.push(...chunk);
    if (chunk.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function fetchArrivals(from: string, to: string, hotel: string, token: string) {
  const p = new URLSearchParams({ arrival_from: from, arrival_to: to, sort_by: "arrival_date", sort_dir: "asc" });
  if (hotel !== "all") p.set("hotel_id", hotel);
  return fetchAll(p.toString(), token);
}

// The API can filter by arrival date but has no "departure date between"
// filter, and this screen does not add one. It asks instead for every booking
// IN THE HOTEL on the nights just before the range -- the server's existing
// "staying" view -- and keeps the ones that actually leave inside it.
//
// That is complete, not approximate: a guest who leaves on day D slept there
// the night of D-1, so everyone departing in [from, to] is staying during
// [from-1, to-1]. The extra rows it brings back (guests staying on past the
// range) are bounded by the dates too, and are dropped here.
async function fetchDepartures(from: string, to: string, hotel: string, token: string) {
  const p = new URLSearchParams({
    date_view: "staying",
    date_from: shiftDays(from, -1),
    date_to: shiftDays(to, -1),
    sort_by: "arrival_date",
    sort_dir: "asc",
  });
  if (hotel !== "all") p.set("hotel_id", hotel);
  const { rows, truncated } = await fetchAll(p.toString(), token);
  return { rows: rows.filter((b) => b.departure_date >= from && b.departure_date <= to), truncated };
}

export function TransferListSwitch({
  view,
  onChange,
}: {
  view: TransferListView;
  onChange: (view: TransferListView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="text-xl font-semibold text-ink">Transfer list</h2>
      <div role="group" aria-label="Transfer list view" className="flex items-center gap-0.5 rounded-lg border border-ink/15 bg-white p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            aria-pressed={view === v.key}
            onClick={() => onChange(v.key)}
            className={`appearance-none rounded-md border-0 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v.key ? "bg-ink text-white" : "bg-transparent text-slate/70 hover:bg-sand"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TransferListScreen({
  view,
  onViewChange,
}: {
  view: TransferListView;
  onViewChange: (view: TransferListView) => void;
}) {
  const today = isoDate(new Date());
  // The range is shared by the three views: switching from Arrivals to
  // Departures asks the other question about the same dates.
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(shiftDays(today, 6));
  const [hotelFilter, setHotelFilter] = useState("all");
  const [transferFilter, setTransferFilter] = useState<TransferFilter>("all");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  const [roomTypes, setRoomTypes] = useState<Record<number, string>>({});
  const [mealPlans, setMealPlans] = useState<Record<number, MealPlanInfo>>({});
  const [transferNames, setTransferNames] = useState<Record<string, string>>({});
  const [leadGuestNames, setLeadGuestNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Names that do not depend on the dates: once.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Hotel[]>("/hotel-engine/hotels", token)
      .then((rows) => setHotels(Object.fromEntries(rows.map((h) => [h.id, h.hotel_name]))))
      .catch(() => setHotels({}));
    fetchJson<UserRecord[]>("/users", token)
      .then((rows) => setUserNames(Object.fromEntries(rows.map((u) => [u.id, u.name]))))
      .catch(() => setUserNames({}));
  }, []);

  // A range is only acted on once it is complete: the picker reports the
  // first click as (from, ""), and loading on that would throw the calendar
  // away mid-selection.
  const rangeReady = dateFrom !== "" && dateTo !== "" && dateFrom <= dateTo;

  useEffect(() => {
    if (!rangeReady) return;
    let stale = false;
    async function load() {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);
        let rows: Booking[];
        let cut: boolean;
        if (view === "arrivals") {
          ({ rows, truncated: cut } = await fetchArrivals(dateFrom, dateTo, hotelFilter, token));
        } else if (view === "departures") {
          ({ rows, truncated: cut } = await fetchDepartures(dateFrom, dateTo, hotelFilter, token));
        } else {
          const [a, d] = await Promise.all([
            fetchArrivals(dateFrom, dateTo, hotelFilter, token),
            fetchDepartures(dateFrom, dateTo, hotelFilter, token),
          ]);
          const byId = new Map<number, Booking>();
          for (const b of [...a.rows, ...d.rows]) byId.set(b.id, b);
          rows = [...byId.values()];
          cut = a.truncated || d.truncated;
        }
        const visible = rows.filter((b) => !EXCLUDED_STATUSES.includes(b.status));
        if (stale) return;
        setBookings(visible);
        setTruncated(cut);

        // Look-ups for what is on screen: one request per contract / hotel
        // that appears, never one per booking.
        const contractIds = Array.from(new Set(visible.map((b) => b.contract_id)));
        const transferMap: Record<string, string> = {};
        const mealPlanMap: Record<number, MealPlanInfo> = {};
        await Promise.all(
          contractIds.map(async (contractId) => {
            const options = await fetchJson<TransferOption[]>(`/contract-engine/contracts/${contractId}/transfer-options`, token);
            options.forEach((o) => (transferMap[transferKey(contractId, o.transfer_type)] = o.transfer_name ?? o.transfer_type));
            if (view === "transfers") {
              const plans = await fetchJson<{ id: number; meal_code: string; meal_name: string | null }[]>(
                `/contract-engine/contracts/${contractId}/meal-plans`,
                token,
              );
              plans.forEach((mp) => (mealPlanMap[mp.id] = { meal_code: mp.meal_code, meal_name: mp.meal_name }));
            }
          }),
        );
        const roomTypeMap: Record<number, string> = {};
        if (view === "transfers") {
          const hotelIds = Array.from(new Set(visible.map((b) => b.hotel_id)));
          await Promise.all(
            hotelIds.map(async (hotelId) => {
              const types = await fetchJson<RoomType[]>(`/hotel-engine/hotels/${hotelId}/room-types`, token);
              types.forEach((rt) => (roomTypeMap[rt.id] = rt.room_name));
            }),
          );
        }
        if (stale) return;
        setTransferNames(transferMap);
        setMealPlans(mealPlanMap);
        setRoomTypes(roomTypeMap);
      } catch (err) {
        if (!stale) setError(err instanceof Error ? err.message : "Failed to load bookings");
      } finally {
        if (!stale) setLoading(false);
      }
    }
    load();
    return () => {
      stale = true;
    };
  }, [view, dateFrom, dateTo, hotelFilter, rangeReady]);

  const sortField = view === "departures" ? "departure_date" : "arrival_date";

  const rows = useMemo(() => {
    let list = bookings;
    // With / without a transfer is asked of all three views: a guest arriving
    // with no transfer booked is exactly who the desk needs to see too.
    if (transferFilter !== "all") {
      list = list.filter((b) => (transferFilter === "with" ? !!b.transfer_type : !b.transfer_type));
    }
    return [...list].sort((a, b) => a[sortField].localeCompare(b[sortField]) || a.id - b.id);
  }, [bookings, transferFilter, sortField]);

  // Known, accepted limitation (owner's decision): there is no bulk endpoint
  // for guest names, only GET /bookings/{id}/guests. So this asks once per
  // row on screen -- and the rows on screen are now bounded by the date range
  // rather than by "the newest 500". Each booking is asked for once however
  // the filters change.
  const fetchedGuestIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (view === "transfers") return;
    const token = localStorage.getItem("token") || "";
    rows
      .filter((b) => !fetchedGuestIds.current.has(b.id))
      .forEach((b) => {
        fetchedGuestIds.current.add(b.id);
        fetchJson<Guest[]>(`/booking-engine/bookings/${b.id}/guests`, token)
          .then((guests) => {
            const lead = guests.find((g) => g.is_lead_guest) ?? guests[0];
            setLeadGuestNames((prev) => ({ ...prev, [b.id]: lead ? `${lead.first_name} ${lead.last_name}` : "—" }));
          })
          .catch(() => setLeadGuestNames((prev) => ({ ...prev, [b.id]: "—" })));
      });
  }, [rows, view]);

  function transferLabel(b: Booking): string {
    if (!b.transfer_type) return "No transfer";
    return transferNames[transferKey(b.contract_id, b.transfer_type)] ?? b.transfer_type;
  }

  const columnCount = view === "transfers" ? 9 : 7;
  const withTransfer = bookings.filter((b) => !!b.transfer_type).length;
  const isThisWeek = dateFrom === today && dateTo === shiftDays(today, 6);
  const isToday = dateFrom === today && dateTo === today;
  const presetClass = (active: boolean) =>
    `appearance-none rounded-md border-0 px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-ink text-white" : "bg-transparent text-slate/70 hover:bg-sand"
    }`;

  return (
    <div className="transfer-list pb-10">
      <TransferListSwitch view={view} onChange={onViewChange} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DateRangePicker
          checkIn={dateFrom}
          checkOut={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          allowPast
          forceLang="en"
        />
        <div className="flex items-center gap-0.5 rounded-lg border border-ink/15 bg-white p-0.5">
          <button type="button" className={presetClass(isToday)} onClick={() => { setDateFrom(today); setDateTo(today); }}>
            Today
          </button>
          <button type="button" className={presetClass(isThisWeek)} onClick={() => { setDateFrom(today); setDateTo(shiftDays(today, 6)); }}>
            Next 7 days
          </button>
        </div>

        <Select value={hotelFilter} onChange={(e) => setHotelFilter(e.target.value)} className="w-auto">
          <option value="all">All hotels</option>
          {Object.entries(hotels).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-0.5 rounded-lg border border-ink/15 bg-white p-0.5">
          {(["all", "with", "without"] as TransferFilter[]).map((f) => (
            <button key={f} type="button" className={presetClass(transferFilter === f)} onClick={() => setTransferFilter(f)}>
              {f === "all" ? "All" : f === "with" ? "With transfer" : "Without transfer"}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-slate/70">
        {view === "arrivals"
          ? "Guests whose arrival date is inside the chosen dates."
          : view === "departures"
            ? "Guests whose departure date is inside the chosen dates."
            : "Every booking with an arrival or a departure inside the chosen dates."}{" "}
        Cancelled and rejected bookings are not shown.
      </p>

      {truncated && (
        <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          There are more bookings in these dates than this screen loads at once ({PAGE * MAX_PAGES}). The list below is
          incomplete — choose a shorter range or one hotel.
        </p>
      )}

      <TableShell minWidth={view === "transfers" ? "1100px" : "900px"}>
        <TableHeadRow>
          <TableHeadCell>Booking</TableHeadCell>
          <TableHeadCell>Hotel</TableHeadCell>
          {view === "transfers" ? (
            <>
              <TableHeadCell>Room type</TableHeadCell>
              <TableHeadCell>Meal plan</TableHeadCell>
              <TableHeadCell>Arrival</TableHeadCell>
              <TableHeadCell>Departure</TableHeadCell>
              <TableHeadCell>Transfer</TableHeadCell>
              <TableHeadCell>Manager</TableHeadCell>
              <TableHeadCell>Agent</TableHeadCell>
            </>
          ) : (
            <>
              <TableHeadCell>Guest</TableHeadCell>
              <TableHeadCell>{view === "arrivals" ? "Arrival date" : "Departure date"}</TableHeadCell>
              <TableHeadCell>{view === "arrivals" ? "Arrival flight" : "Departure flight"}</TableHeadCell>
              <TableHeadCell>Transfer</TableHeadCell>
              <TableHeadCell>Manager</TableHeadCell>
            </>
          )}
        </TableHeadRow>
        <tbody>
          {!rangeReady ? (
            <TableEmptyState colSpan={columnCount}>Choose the second date to load the list.</TableEmptyState>
          ) : loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={columnCount} />)
          ) : error ? (
            <TableErrorState colSpan={columnCount}>Error: {error}</TableErrorState>
          ) : rows.length === 0 ? (
            <TableEmptyState colSpan={columnCount}>No bookings for these dates</TableEmptyState>
          ) : (
            rows.map((b) => {
              const transferCell = (
                <TableCell className={b.transfer_type ? "text-ink" : "text-slate/55"}>{transferLabel(b)}</TableCell>
              );
              const manager = b.claimed_by !== null ? userNames[b.claimed_by] ?? `#${b.claimed_by}` : "—";
              // In "All movements" the date that falls inside the range is the
              // reason the row is here; the other one is context.
              const inRange = (d: string) => d >= dateFrom && d <= dateTo;
              return (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap font-semibold text-ink">{b.booking_number}</TableCell>
                  <TableCell>{hotels[b.hotel_id] ?? `#${b.hotel_id}`}</TableCell>
                  {view === "transfers" ? (
                    <>
                      <TableCell>{roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}</TableCell>
                      <TableCell>
                        {mealPlans[b.meal_plan_id]?.meal_name || mealPlans[b.meal_plan_id]?.meal_code || `#${b.meal_plan_id}`}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap tabular-nums ${inRange(b.arrival_date) ? "font-semibold text-ink" : "text-slate/55"}`}>
                        {formatDate(b.arrival_date)}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap tabular-nums ${inRange(b.departure_date) ? "font-semibold text-ink" : "text-slate/55"}`}>
                        {formatDate(b.departure_date)}
                      </TableCell>
                      {transferCell}
                      <TableCell>{manager}</TableCell>
                      <TableCell>{userNames[b.agent_id] ?? `#${b.agent_id}`}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{leadGuestNames[b.id] ?? "Loading..."}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-ink">
                        {formatDate(view === "arrivals" ? b.arrival_date : b.departure_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {view === "arrivals"
                          ? formatFlight(b.arrival_flight_number, b.arrival_flight_date, b.arrival_flight_time)
                          : formatFlight(b.departure_flight_number, b.departure_flight_date, b.departure_flight_time)}
                      </TableCell>
                      {transferCell}
                      <TableCell>{manager}</TableCell>
                    </>
                  )}
                </TableRow>
              );
            })
          )}
        </tbody>
      </TableShell>

      {rangeReady && !loading && !error && (
        <div className="mt-3 text-sm text-slate/70">
          <strong className="text-ink">{rows.length}</strong> shown ·{" "}
          <strong className="text-ink">{withTransfer}</strong> with a transfer ·{" "}
          <strong className="text-ink">{bookings.length - withTransfer}</strong> without, in these dates
        </div>
      )}
    </div>
  );
}
