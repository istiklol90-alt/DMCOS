import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "./financeShared";
import type { Booking } from "./Reservations";

// ---------------------------------------------------------------------------
// Three specialized, read-only presentations over the exact same booking
// data BookingsList (Reservations.tsx) already fetches -- no new backend
// logic beyond what already existed, per the project owner's explicit scope.
// Not built via BookingsList's adminExtensions mechanism: that only appends
// trailing columns to a fixed base column set, and these three views need a
// genuinely different column set each (guest names, flight times, transfer
// names instead of status/currency/sale price) -- confirmed during planning
// that adminExtensions can't do that. One shared component instead of three
// near-duplicate files, since all three need identical bulk-fetch
// boilerplate (bookings, hotel names, assigned-manager/agent names) and
// Arrival/Departure are structurally identical (same columns, arrival_* vs
// departure_* fields swapped).
//
// Admin-only, plain English throughout -- no i18n, per Decision 109's
// admin/agent split and the standing "new admin code is English from the
// start" instruction. All three exclude Cancelled/Rejected bookings, same
// as BookingsList's own "staying" date-mode exclusion -- a cancelled
// booking has no real transfer/arrival/departure to operate on.
// ---------------------------------------------------------------------------

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US");
}

function formatFlight(number: string | null, date: string | null, time: string | null): string {
  if (!number) return "—";
  const when = date ? formatDate(date) + (time ? ` ${time}` : "") : null;
  return when ? `${number} · ${when}` : number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAheadStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

const EXCLUDED_STATUSES = ["Cancellation Requested", "Cancelled", "Rejected"];

type Mode = "transfers" | "arrival" | "departure";
type DateFilter = "today" | "week" | "all";
type TransferFilter = "all" | "with" | "without";

function transferKey(contractId: number, transferType: string): string {
  return `${contractId}:${transferType}`;
}

function BookingsSubView({ mode }: { mode: Mode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  const [roomTypes, setRoomTypes] = useState<Record<number, string>>({});
  const [mealPlans, setMealPlans] = useState<Record<number, MealPlanInfo>>({});
  const [transferNames, setTransferNames] = useState<Record<string, string>>({});
  const [leadGuestNames, setLeadGuestNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hotelFilter, setHotelFilter] = useState("all");
  const [transferFilter, setTransferFilter] = useState<TransferFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(mode === "transfers" ? "all" : "week");

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("token") || "";
      try {
        setLoading(true);
        setError(null);

        const bookingsData = await fetchJson<Booking[]>("/booking-engine/bookings?limit=500", token);
        const visible = bookingsData.filter((b) => !EXCLUDED_STATUSES.includes(b.status));
        setBookings(visible);

        const hotelsData = await fetchJson<Hotel[]>("/hotel-engine/hotels", token);
        const hotelMap: Record<number, string> = {};
        hotelsData.forEach((h) => (hotelMap[h.id] = h.hotel_name));
        setHotels(hotelMap);

        const usersData = await fetchJson<UserRecord[]>("/users", token);
        const userMap: Record<number, string> = {};
        usersData.forEach((u) => (userMap[u.id] = u.name));
        setAgentNames(userMap);

        // Transfer type -> human name is needed by all three views (Arrival/
        // Departure show it as a column too, not just Transfers), bulk-fetched
        // per unique contract_id -- same pattern as the meal-plan lookup
        // below, via the existing GET /contracts/{id}/transfer-options
        // endpoint (no new backend endpoint needed).
        const uniqueContractIds = Array.from(new Set(visible.map((b) => b.contract_id)));
        const transferMap: Record<string, string> = {};
        await Promise.all(
          uniqueContractIds.map(async (contractId) => {
            const options = await fetchJson<TransferOption[]>(
              `/contract-engine/contracts/${contractId}/transfer-options`,
              token
            );
            options.forEach((o) => (transferMap[transferKey(contractId, o.transfer_type)] = o.transfer_name ?? o.transfer_type));
          })
        );
        setTransferNames(transferMap);

        if (mode === "transfers") {
          const uniqueHotelIds = Array.from(new Set(visible.map((b) => b.hotel_id)));
          const roomTypeMap: Record<number, string> = {};
          await Promise.all(
            uniqueHotelIds.map(async (hotelId) => {
              const roomTypesData = await fetchJson<RoomType[]>(
                `/hotel-engine/hotels/${hotelId}/room-types`,
                token
              );
              roomTypesData.forEach((rt) => (roomTypeMap[rt.id] = rt.room_name));
            })
          );
          setRoomTypes(roomTypeMap);

          const mealPlanMap: Record<number, MealPlanInfo> = {};
          await Promise.all(
            uniqueContractIds.map(async (contractId) => {
              const mealPlansData = await fetchJson<
                { id: number; meal_code: string; meal_name: string | null }[]
              >(`/contract-engine/contracts/${contractId}/meal-plans`, token);
              mealPlansData.forEach(
                (mp) => (mealPlanMap[mp.id] = { meal_code: mp.meal_code, meal_name: mp.meal_name })
              );
            })
          );
          setMealPlans(mealPlanMap);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load bookings");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const dateField = mode === "departure" ? "departure_date" : "arrival_date";

  const filteredRows = useMemo(() => {
    let list = bookings;
    if (hotelFilter !== "all") list = list.filter((b) => String(b.hotel_id) === hotelFilter);
    if (mode === "transfers" && transferFilter !== "all") {
      list = list.filter((b) => (transferFilter === "with" ? !!b.transfer_type : !b.transfer_type));
    }
    if (mode !== "transfers" && dateFilter !== "all") {
      const today = todayStr();
      const end = dateFilter === "today" ? today : weekAheadStr();
      list = list.filter((b) => {
        const d = b[dateField];
        return d >= today && d <= end;
      });
    }
    return [...list].sort((a, b) => a[dateField].localeCompare(b[dateField]));
  }, [bookings, hotelFilter, transferFilter, dateFilter, mode, dateField]);

  // Known, accepted limitation (per explicit project-owner decision): guest
  // names have no bulk backend endpoint (only GET /bookings/{id}/guests,
  // per-booking) -- rather than add one speculatively, this fires one call
  // per row, but ONLY for rows currently visible after filtering (default
  // filter is "This Week", keeping the real call count small at today's
  // volume). fetchedIdsRef guarantees each booking is only ever requested
  // once, even as filters change back and forth. This does not scale to an
  // unfiltered "show every arrival ever" view -- if that need ever arises,
  // a real bulk endpoint (e.g. GET /booking-engine/bookings/guests?ids=...)
  // should be added then, not before.
  const fetchedGuestIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (mode === "transfers") return;
    const token = localStorage.getItem("token") || "";
    const toFetch = filteredRows.filter((b) => !fetchedGuestIdsRef.current.has(b.id));
    toFetch.forEach((b) => {
      fetchedGuestIdsRef.current.add(b.id);
      fetchJson<Guest[]>(`/booking-engine/bookings/${b.id}/guests`, token)
        .then((guests) => {
          const lead = guests.find((g) => g.is_lead_guest) ?? guests[0];
          setLeadGuestNames((prev) => ({
            ...prev,
            [b.id]: lead ? `${lead.first_name} ${lead.last_name}` : "—",
          }));
        })
        .catch(() => {
          setLeadGuestNames((prev) => ({ ...prev, [b.id]: "—" }));
        });
    });
  }, [filteredRows, mode]);

  function transferLabel(b: Booking): string {
    if (!b.transfer_type) return "—";
    return transferNames[transferKey(b.contract_id, b.transfer_type)] ?? b.transfer_type;
  }

  if (loading) {
    return <p className="mt-10 text-center text-sm text-slate/60">Loading bookings...</p>;
  }
  if (error) {
    return <p className="mt-10 text-center text-sm text-red-600">Error: {error}</p>;
  }

  const columnCount = mode === "transfers" ? 9 : 7;

  return (
    <div className="pb-10">
      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <select
          value={hotelFilter}
          onChange={(e) => setHotelFilter(e.target.value)}
          className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
        >
          <option value="all">All hotels</option>
          {Object.entries(hotels).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        {mode === "transfers" && (
          <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white p-1">
            {(["all", "with", "without"] as TransferFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTransferFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  transferFilter === f ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
                }`}
              >
                {f === "all" ? "All" : f === "with" ? "With transfer" : "Without transfer"}
              </button>
            ))}
          </div>
        )}

        {mode !== "transfers" && (
          <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white p-1">
            {(["today", "week", "all"] as DateFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setDateFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateFilter === f ? "bg-coral text-white" : "text-slate/70 hover:bg-sand/60"
                }`}
              >
                {f === "today" ? "Today" : f === "week" ? "This week" : "All"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
              <th className="px-4 py-3 font-medium">Booking #</th>
              <th className="px-4 py-3 font-medium">Hotel</th>
              {mode === "transfers" ? (
                <>
                  <th className="px-4 py-3 font-medium">Room type</th>
                  <th className="px-4 py-3 font-medium">Meal plan</th>
                  <th className="px-4 py-3 font-medium">Transfer status</th>
                  <th className="px-4 py-3 font-medium">Transfer type</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Assigned manager</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">{mode === "arrival" ? "Arrival date" : "Departure date"}</th>
                  <th className="px-4 py-3 font-medium">{mode === "arrival" ? "Arrival flight" : "Departure flight"}</th>
                  <th className="px-4 py-3 font-medium">Transfer type</th>
                  <th className="px-4 py-3 font-medium">Assigned manager</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-sm text-slate/50">
                  No bookings found
                </td>
              </tr>
            ) : (
              filteredRows.map((b) => (
                <tr key={b.id} className="border-b border-ink/5 last:border-b-0 hover:bg-sand/40">
                  <td className="px-4 py-3.5 font-medium text-ink">{b.booking_number}</td>
                  <td className="px-4 py-3.5 text-slate/80">{hotels[b.hotel_id] ?? `#${b.hotel_id}`}</td>
                  {mode === "transfers" ? (
                    <>
                      <td className="px-4 py-3.5 text-slate/80">{roomTypes[b.room_type_id] ?? `#${b.room_type_id}`}</td>
                      <td className="px-4 py-3.5 text-slate/80">
                        {mealPlans[b.meal_plan_id]?.meal_name || mealPlans[b.meal_plan_id]?.meal_code || `#${b.meal_plan_id}`}
                      </td>
                      <td className="px-4 py-3.5 text-slate/70">{b.transfer_type ? "With transfer" : "Without transfer"}</td>
                      <td className="px-4 py-3.5 text-slate/70">{transferLabel(b)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                        {formatDate(b.arrival_date)} → {formatDate(b.departure_date)}
                      </td>
                      <td className="px-4 py-3.5 text-slate/80">
                        {b.claimed_by !== null ? agentNames[b.claimed_by] ?? `#${b.claimed_by}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-slate/80">{agentNames[b.agent_id] ?? `#${b.agent_id}`}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3.5 text-slate/80">{leadGuestNames[b.id] ?? "Loading..."}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                        {formatDate(mode === "arrival" ? b.arrival_date : b.departure_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                        {mode === "arrival"
                          ? formatFlight(b.arrival_flight_number, b.arrival_flight_date, b.arrival_flight_time)
                          : formatFlight(b.departure_flight_number, b.departure_flight_date, b.departure_flight_time)}
                      </td>
                      <td className="px-4 py-3.5 text-slate/70">{transferLabel(b)}</td>
                      <td className="px-4 py-3.5 text-slate/80">
                        {b.claimed_by !== null ? agentNames[b.claimed_by] ?? `#${b.claimed_by}` : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-slate/60">
        Total: <strong className="text-ink">{filteredRows.length}</strong> booking{filteredRows.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function TransfersView() {
  return <BookingsSubView mode="transfers" />;
}

export function ArrivalView() {
  return <BookingsSubView mode="arrival" />;
}

export function DepartureView() {
  return <BookingsSubView mode="departure" />;
}
