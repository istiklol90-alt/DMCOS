import { useEffect, useMemo, useState } from "react";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import { useFeedback } from "../components/ui/Feedback";
import { fetchJson } from "./financeShared";
import { BED_TYPES, bedLabel, formatBedding, type BedItem, type BedType, type OccupancyOption } from "./bedding";

// ---------------------------------------------------------------------------
// Decision 211: "Rooms & beds" -- where the sleeping places agents see are
// entered. Per hotel, per room type: a general bed type (free text, shown
// when no combination is described) and, for every occupancy combination
// ("2 adults + 2 children"), the actual sleeping places as a list plus a
// note. Hotel Engine had no screen at all before this (Decision 007); this
// edits only those fields and adds combinations, nothing else about a room.
// ---------------------------------------------------------------------------

interface HotelRow {
  id: number;
  hotel_name: string;
}

interface RoomTypeRow {
  id: number;
  hotel_id: number;
  room_name: string;
  bed_type: string | null;
  max_occupancy: number;
  bedroom_count: number | null;
}

const token = () => localStorage.getItem("token") || "";

function partyLabel(o: { adults: number; children: number; infants: number }): string {
  const parts = [`${o.adults} adult${o.adults === 1 ? "" : "s"}`];
  if (o.children > 0) parts.push(`${o.children} child${o.children === 1 ? "" : "ren"}`);
  if (o.infants > 0) parts.push(`${o.infants} infant${o.infants === 1 ? "" : "s"}`);
  return parts.join(" + ");
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function AdminRooms() {
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [hotelId, setHotelId] = useState<number | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomTypeRow[] | null>(null);
  const [options, setOptions] = useState<OccupancyOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<HotelRow[]>("/hotel-engine/hotels?skip=0&limit=100", token())
      .then((rows) => {
        setHotels(rows);
        if (rows.length > 0) setHotelId(rows[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  function load(id: number) {
    setRoomTypes(null);
    setError(null);
    Promise.all([
      fetchJson<RoomTypeRow[]>(`/hotel-engine/hotels/${id}/room-types`, token()),
      fetchJson<OccupancyOption[]>(`/hotel-engine/hotels/${id}/occupancy-options`, token()),
    ])
      .then(([rts, opts]) => {
        setRoomTypes(rts);
        setOptions(opts);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    if (hotelId !== null) load(hotelId);
  }, [hotelId]);

  const described = options.filter((o) => o.beds.length > 0 || (o.bedding_note ?? "").trim()).length;

  return (
    <div className="pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Rooms &amp; beds</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate/60">
            How each party actually sleeps. Agents see it on the room card in search, in the copied offer and in the
            booking: e.g. “1 king bed + 1 sofa bed (for children)”. For a party with no exact combination, the
            smallest combination that fits it is used.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate/70">
          Hotel
          <Select value={hotelId ?? ""} onChange={(e) => setHotelId(Number(e.target.value))} className="w-72">
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hotel_name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {roomTypes === null && !error && <p className="mt-6 text-sm text-slate/50">Loading…</p>}
      {roomTypes && (
        <p className="mt-4 text-xs text-slate/50">
          {roomTypes.length} room types · {options.length} combinations · {described} with sleeping places entered
        </p>
      )}

      <div className="mt-3 space-y-4">
        {roomTypes?.map((rt) => (
          <RoomTypeCard
            key={rt.id}
            roomType={rt}
            options={options.filter((o) => o.room_type_id === rt.id)}
            onRoomTypeSaved={(saved) => setRoomTypes((prev) => prev?.map((r) => (r.id === saved.id ? saved : r)) ?? null)}
            onOptionSaved={(saved) =>
              setOptions((prev) =>
                prev.some((o) => o.id === saved.id) ? prev.map((o) => (o.id === saved.id ? saved : o)) : [...prev, saved],
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function RoomTypeCard({
  roomType,
  options,
  onRoomTypeSaved,
  onOptionSaved,
}: {
  roomType: RoomTypeRow;
  options: OccupancyOption[];
  onRoomTypeSaved: (rt: RoomTypeRow) => void;
  onOptionSaved: (o: OccupancyOption) => void;
}) {
  const { toast } = useFeedback();
  const [bedType, setBedType] = useState(roomType.bed_type ?? "");
  const [savingBedType, setSavingBedType] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newParty, setNewParty] = useState({ adults: 2, children: 0, infants: 0 });

  async function saveBedType() {
    setSavingBedType(true);
    try {
      const saved = await fetchJson<RoomTypeRow>(`/hotel-engine/room-types/${roomType.id}`, token(), {
        method: "PUT",
        body: JSON.stringify({ bed_type: bedType.trim() || null }),
      });
      onRoomTypeSaved(saved);
      toast(`${roomType.room_name}: bed type saved`, "success");
    } catch (e: any) {
      toast(e.message || "Could not save", "error");
    } finally {
      setSavingBedType(false);
    }
  }

  async function addCombination() {
    try {
      const saved = await fetchJson<OccupancyOption>("/hotel-engine/room-occupancy-options", token(), {
        method: "POST",
        body: JSON.stringify({ room_type_id: roomType.id, ...newParty }),
      });
      onOptionSaved(saved);
      setAdding(false);
      toast(`${roomType.room_name}: ${partyLabel(saved)} added`, "success");
    } catch (e: any) {
      toast(e.message || "Could not add the combination", "error");
    }
  }

  return (
    <Card padding="md" shadow="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{roomType.room_name}</h3>
          <p className="text-xs text-slate/50">
            Up to {roomType.max_occupancy} guests
            {roomType.bedroom_count ? ` · ${roomType.bedroom_count} bedroom${roomType.bedroom_count === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs font-medium text-slate/60">
            General bed type
            <Input
              value={bedType}
              onChange={(e) => setBedType(e.target.value)}
              placeholder="e.g. King or Twin"
              className="mt-1 w-56"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={saveBedType}
            disabled={savingBedType || bedType.trim() === (roomType.bed_type ?? "")}
          >
            {savingBedType ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {options.length === 0 && (
          <p className="rounded-lg bg-sand/50 px-3 py-2 text-xs text-slate/60">
            No combinations yet — only the general bed type above can be shown for this room.
          </p>
        )}
        {options.map((o) => (
          <OptionEditor key={o.id} option={o} onSaved={onOptionSaved} bedroomCount={roomType.bedroom_count} />
        ))}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-ink/10 p-3">
            {(["adults", "children", "infants"] as const).map((k) => (
              <label key={k} className="text-xs font-medium capitalize text-slate/60">
                {k}
                <Input
                  type="number"
                  min={k === "adults" ? 1 : 0}
                  value={newParty[k]}
                  onChange={(e) => setNewParty((p) => ({ ...p, [k]: Math.max(k === "adults" ? 1 : 0, Number(e.target.value) || 0) }))}
                  className="mt-1 w-20"
                />
              </label>
            ))}
            <Button size="sm" onClick={addCombination}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <p className="w-full text-[11px] text-warning">
              A combination is also a booking limit: once a room has combinations, only parties that fit one of them
              can be booked.
            </p>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            + Add combination
          </Button>
        )}
      </div>
    </Card>
  );
}

function OptionEditor({
  option,
  onSaved,
  bedroomCount,
}: {
  option: OccupancyOption;
  onSaved: (o: OccupancyOption) => void;
  bedroomCount: number | null;
}) {
  const { toast } = useFeedback();
  const [beds, setBeds] = useState<BedItem[]>(option.beds);
  const [note, setNote] = useState(option.bedding_note ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(beds) !== JSON.stringify(option.beds) || note.trim() !== (option.bedding_note ?? ""),
    [beds, note, option],
  );

  function updateBed(i: number, patch: Partial<BedItem>) {
    setBeds((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await fetchJson<OccupancyOption>(`/hotel-engine/room-occupancy-options/${option.id}`, token(), {
        method: "PUT",
        body: JSON.stringify({ beds, bedding_note: note.trim() || null }),
      });
      onSaved(saved);
      setBeds(saved.beds);
      setNote(saved.bedding_note ?? "");
      toast(`${partyLabel(saved)}: sleeping places saved`, "success");
    } catch (e: any) {
      toast(e.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  const preview = { beds, note: note.trim() || null };

  return (
    <div className="rounded-xl border border-ink/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {partyLabel(option)}
          {!option.is_active && <span className="ml-2 text-xs font-normal text-slate/50">(inactive)</span>}
        </p>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="mt-2 space-y-2">
        {beds.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              value={b.count}
              onChange={(e) => updateBed(i, { count: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16"
              aria-label="How many"
            />
            <Select
              value={b.type}
              onChange={(e) => updateBed(i, { type: e.target.value as BedType })}
              className="w-60"
              aria-label="Kind of bed"
            >
              {BED_TYPES.map((type) => (
                <option key={type} value={type}>
                  {capitalize(bedLabel(type, 1, "en"))}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-slate/70">
              <input
                type="checkbox"
                checked={b.for_children}
                onChange={(e) => updateBed(i, { for_children: e.target.checked })}
                className="h-4 w-4 accent-gold"
              />
              for children
            </label>
            <Button variant="ghost" size="sm" onClick={() => setBeds((prev) => prev.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setBeds((prev) => [...prev, { type: prev.length === 0 ? "king" : "sofa_bed", count: 1, for_children: false }])}
        >
          + Add bed
        </Button>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. sofa bed made up on request"
        />
      </div>

      <div className="mt-2 rounded-lg bg-sand/50 px-3 py-2 text-xs text-slate/70">
        <span className="font-medium text-ink">Agents see:</span>{" "}
        {formatBedding(preview, "ru", option.children, bedroomCount) ?? <span className="text-slate/40">nothing yet</span>}
        {formatBedding(preview, "en", option.children, bedroomCount) && (
          <span className="block text-slate/50">EN: {formatBedding(preview, "en", option.children, bedroomCount)}</span>
        )}
      </div>
    </div>
  );
}
