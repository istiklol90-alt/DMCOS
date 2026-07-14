import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { DateRangePicker, deriveOccupancy } from "./HotelSearch";

// ---------------------------------------------------------------------------
// Purely a read-only internal verification tool: every call below is a GET
// against the exact same real endpoints HotelSearch.tsx (agent search) and
// Reservations.tsx (BookingDetail's cost breakdown) already call. Zero new
// pricing logic, zero POST/PUT/DELETE anywhere in this file, zero database
// row ever created.
// ---------------------------------------------------------------------------

interface Hotel {
  id: number;
  hotel_name: string;
}

interface RoomType {
  id: number;
  room_name: string;
}

interface Contract {
  id: number;
  hotel_id: number;
  currency: string;
  transfer_required: boolean;
}

interface ContractMealPlan {
  id: number;
  contract_id: number;
  meal_code: string;
  meal_name: string | null;
}

interface ContractTransferOption {
  id: number;
  contract_id: number;
  transfer_type: string;
  transfer_name: string | null;
  price_adult: number;
  price_child: number;
  price_infant: number | null;
  status: string;
}

// The real, full get_room_price response shape -- includes season_id/
// rate_id/applied_special_offer_ids, which this tool explicitly needs to
// display (unlike Reservations.tsx's own narrower RoomPriceBreakdown type,
// which doesn't use those fields today).
interface RoomPriceBreakdown {
  contract_id: number;
  room_type_id: number;
  rate_id: number;
  season_id: number;
  meal_plan_id: number;
  currency: string;
  nights: number;
  base_total: number;
  supplements_total: number;
  price_before_promotions: number;
  applied_promotions: number[];
  applied_special_offer_ids: number[];
  final_total: number;
}

// The real, full get_transfer_price response shape, including Decision
// 059's adult_total/child_total/infant_total -- the real per-bucket
// subtotals, never reconstructed client-side.
interface TransferPriceBreakdown {
  transfer_type: string;
  transfer_name: string | null;
  currency: string;
  price_adult: number;
  price_child: number;
  price_infant: number | null;
  adult_total: number;
  child_total: number;
  infant_total: number;
  total: number;
}

interface MandatoryTaxBreakdown {
  label: string | null;
  rate_per_person_per_night: number;
  chargeable_guests: number;
  nights: number;
  total: number;
  currency: string;
}

interface ContractSeason {
  id: number;
  season_name: string;
  start_date: string;
  end_date: string;
}

interface Promotion {
  id: number;
  promotion_name: string;
  discount_type: string;
  discount_value: number;
}

interface SpecialOffer {
  id: number;
  offer_name: string;
}

async function fetchJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response body wasn't JSON -- keep the generic message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Same plain Markdown-pipe-table convention Reservations.tsx's LPO uses --
// unambiguous as raw plain text even where nothing renders it as an actual
// table, since this is pasted into a plain-text clipboard target, not HTML.
function renderTextTable(rows: [string, string][]): string {
  const lines = ["| Поле | Значение |", "|---|---|"];
  for (const [label, value] of rows) {
    lines.push(`| ${label} | ${value.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n");
}

interface CalculationResult {
  hotelName: string;
  roomTypeName: string;
  mealPlanLabel: string;
  seasonName: string | null;
  roomBreakdown: RoomPriceBreakdown;
  promotionNames: string[];
  specialOfferNames: string[];
  mandatoryTax: MandatoryTaxBreakdown;
  transferBreakdown: TransferPriceBreakdown | null;
  occupancy: { adults: number; children: number; infants: number };
  checkIn: string;
  checkOut: string;
}

function buildSummaryText(r: CalculationResult): string {
  const rows: [string, string][] = [
    ["Отель", r.hotelName],
    ["Тип номера", r.roomTypeName],
    ["Заезд — Выезд", `${r.checkIn} — ${r.checkOut} (${r.roomBreakdown.nights} ноч.)`],
    ["Заполняемость", `${r.occupancy.adults} взр., ${r.occupancy.children} дет., ${r.occupancy.infants} млд.`],
    ["План питания", r.mealPlanLabel],
    ["Сезон", r.seasonName ?? `#${r.roomBreakdown.season_id}`],
    ["Базовая ставка", formatMoney(r.roomBreakdown.base_total, r.roomBreakdown.currency)],
    ["Надбавки (возраст/питание/доп.гость)", formatMoney(r.roomBreakdown.supplements_total, r.roomBreakdown.currency)],
    [
      "Спецпредложение",
      r.specialOfferNames.length > 0 ? r.specialOfferNames.join(", ") : "нет",
    ],
    [
      "Промо-скидка (Early Bird и т.п.)",
      r.promotionNames.length > 0 ? r.promotionNames.join(", ") : "нет",
    ],
    ["Стоимость номера (итого)", formatMoney(r.roomBreakdown.final_total, r.roomBreakdown.currency)],
    [
      r.mandatoryTax.label || "Обязательный сбор",
      formatMoney(r.mandatoryTax.total, r.mandatoryTax.currency),
    ],
  ];

  if (r.transferBreakdown) {
    rows.push([
      `Трансфер (${r.transferBreakdown.transfer_name ?? r.transferBreakdown.transfer_type})`,
      `${formatMoney(r.transferBreakdown.total, r.transferBreakdown.currency)} (взрослые: ${formatMoney(r.transferBreakdown.adult_total, r.transferBreakdown.currency)}, дети: ${formatMoney(r.transferBreakdown.child_total, r.transferBreakdown.currency)})`,
    ]);
  }

  const grandTotal =
    r.roomBreakdown.final_total + r.mandatoryTax.total + (r.transferBreakdown?.total ?? 0);
  rows.push(["ИТОГО", formatMoney(grandTotal, r.roomBreakdown.currency)]);

  return ["Расчёт для проверки", "", renderTextTable(rows)].join("\n");
}

const PriceCalculator = () => {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState<string>("");

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomTypeId, setRoomTypeId] = useState<string>("");

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  const [adults, setAdults] = useState(2);
  const [childAges, setChildAges] = useState<number[]>([]);
  const occupancy = deriveOccupancy(adults, childAges);

  const [contract, setContract] = useState<Contract | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);

  const [mealPlans, setMealPlans] = useState<ContractMealPlan[]>([]);
  const [mealPlanCode, setMealPlanCode] = useState<string>("");

  const [transferOptions, setTransferOptions] = useState<ContractTransferOption[]>([]);
  const [transferType, setTransferType] = useState<string>("");

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Load the real hotel list once, same unfiltered endpoint every other
  // screen in this project uses.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token)
      .then(setHotels)
      .catch(() => setHotels([]));
  }, []);

  // Room types for the selected hotel -- resets everything downstream
  // whenever the hotel changes, so a stale room type from a different
  // hotel can never linger.
  useEffect(() => {
    setRoomTypeId("");
    setRoomTypes([]);
    setContract(null);
    setMealPlans([]);
    setMealPlanCode("");
    setTransferOptions([]);
    setTransferType("");
    setResult(null);
    if (!hotelId) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<RoomType[]>(`/hotel-engine/hotels/${hotelId}/room-types`, token)
      .then(setRoomTypes)
      .catch(() => setRoomTypes([]));
  }, [hotelId]);

  // The hotel's active contract for the selected check-in date -- exactly
  // the same call HotelSearch.tsx makes to resolve which contract's rates
  // actually apply.
  useEffect(() => {
    setContract(null);
    setContractError(null);
    setMealPlans([]);
    setMealPlanCode("");
    setTransferOptions([]);
    setTransferType("");
    setResult(null);
    if (!hotelId || !checkIn) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<Contract | null>(`/contract-engine/hotels/${hotelId}/active-contract?check_in=${checkIn}`, token)
      .then((c) => {
        if (!c) {
          setContractError("Нет активного контракта на выбранную дату заезда");
          return;
        }
        setContract(c);
      })
      .catch((err) => setContractError(err.message || "Не удалось определить контракт"));
  }, [hotelId, checkIn]);

  // Meal plans actually priced for this room type (not every meal plan
  // defined on the contract) -- the exact GET /room-types/{id}/meal-plans
  // Interface Contract endpoint.
  useEffect(() => {
    setMealPlans([]);
    setMealPlanCode("");
    if (!contract || !roomTypeId) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<ContractMealPlan[]>(
      `/contract-engine/contracts/${contract.id}/room-types/${roomTypeId}/meal-plans`,
      token
    )
      .then(setMealPlans)
      .catch(() => setMealPlans([]));
  }, [contract, roomTypeId]);

  // Transfer options actually available on this contract -- optional,
  // "Без трансфера" stays selectable regardless of transfer_required
  // (this is a verification tool, not a real booking flow).
  useEffect(() => {
    setTransferOptions([]);
    setTransferType("");
    if (!contract) return;
    const token = localStorage.getItem("token") || "";
    fetchJson<ContractTransferOption[]>(
      `/contract-engine/contracts/${contract.id}/transfer-options/available`,
      token
    )
      .then(setTransferOptions)
      .catch(() => setTransferOptions([]));
  }, [contract]);

  function handleChildCountChange(newCount: number) {
    setChildAges((prev) =>
      newCount > prev.length ? [...prev, ...Array(newCount - prev.length).fill(8)] : prev.slice(0, newCount)
    );
  }

  function updateChildAge(index: number, rawAge: number) {
    const age = Number.isNaN(rawAge) ? 0 : Math.min(17, Math.max(0, rawAge));
    setChildAges((prev) => prev.map((a, i) => (i === index ? age : a)));
  }

  async function handleCalculate() {
    if (!contract || !roomTypeId || !checkIn || !checkOut || !mealPlanCode) {
      setCalcError("Заполните отель, тип номера, даты и план питания");
      return;
    }
    setCalculating(true);
    setCalcError(null);
    setResult(null);
    const token = localStorage.getItem("token") || "";

    try {
      const roomParams = new URLSearchParams({
        check_in: checkIn,
        check_out: checkOut,
        meal_plan: mealPlanCode,
        adults: String(occupancy.adults),
        children: String(occupancy.children),
        infants: String(occupancy.infants),
      });
      const roomBreakdown = await fetchJson<RoomPriceBreakdown>(
        `/contract-engine/contracts/${contract.id}/room-types/${roomTypeId}/price?${roomParams}`,
        token
      );

      const taxParams = new URLSearchParams({
        nights: String(roomBreakdown.nights),
        adults: String(occupancy.adults),
        children: String(occupancy.children),
      });
      const mandatoryTax = await fetchJson<MandatoryTaxBreakdown>(
        `/contract-engine/contracts/${contract.id}/mandatory-tax?${taxParams}`,
        token
      );

      let transferBreakdown: TransferPriceBreakdown | null = null;
      if (transferType) {
        const transferParams = new URLSearchParams({
          transfer_type: transferType,
          check_in: checkIn,
          check_out: checkOut,
          adults: String(occupancy.adults),
          children: String(occupancy.children),
          infants: String(occupancy.infants),
        });
        transferBreakdown = await fetchJson<TransferPriceBreakdown>(
          `/contract-engine/contracts/${contract.id}/transfer-price?${transferParams}`,
          token
        );
      }

      let seasonName: string | null = null;
      try {
        const season = await fetchJson<ContractSeason>(
          `/contract-engine/contract-seasons/${roomBreakdown.season_id}`,
          token
        );
        seasonName = season.season_name;
      } catch {
        seasonName = null;
      }

      const promotionNames = await Promise.all(
        roomBreakdown.applied_promotions.map((id) =>
          fetchJson<Promotion>(`/contract-engine/promotions/${id}`, token)
            .then((p) => p.promotion_name)
            .catch(() => `#${id}`)
        )
      );

      const specialOfferNames = await Promise.all(
        roomBreakdown.applied_special_offer_ids.map((id) =>
          fetchJson<SpecialOffer>(`/contract-engine/special-offers/${id}`, token)
            .then((o) => o.offer_name)
            .catch(() => `#${id}`)
        )
      );

      const hotelName = hotels.find((h) => String(h.id) === hotelId)?.hotel_name ?? `#${hotelId}`;
      const roomTypeName = roomTypes.find((rt) => String(rt.id) === roomTypeId)?.room_name ?? `#${roomTypeId}`;
      const mealPlanInfo = mealPlans.find((mp) => mp.meal_code === mealPlanCode);
      const mealPlanLabel = mealPlanInfo?.meal_name || mealPlanInfo?.meal_code || mealPlanCode;

      setResult({
        hotelName,
        roomTypeName,
        mealPlanLabel,
        seasonName,
        roomBreakdown,
        promotionNames,
        specialOfferNames,
        mandatoryTax,
        transferBreakdown,
        occupancy,
        checkIn,
        checkOut,
      });
    } catch (err: any) {
      setCalcError(err.message || "Не удалось рассчитать цену");
    } finally {
      setCalculating(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(buildSummaryText(result)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const grandTotal = result
    ? result.roomBreakdown.final_total + result.mandatoryTax.total + (result.transferBreakdown?.total ?? 0)
    : null;

  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-ink/10 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Расчёт цены</h2>
        <p className="mt-1 text-sm text-slate/60">
          Внутренний инструмент проверки — только чтение, ничего не создаёт и не бронирует. Использует те же
          реальные эндпоинты (get_room_price / get_transfer_price / get_mandatory_tax), что и поиск отелей и
          карточка бронирования.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <select
            value={hotelId}
            onChange={(e) => setHotelId(e.target.value)}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          >
            <option value="">Отель...</option>
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hotel_name}
              </option>
            ))}
          </select>

          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            disabled={!hotelId}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Тип номера...</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.room_name}
              </option>
            ))}
          </select>

          <div className="sm:col-span-2">
            <DateRangePicker checkIn={checkIn} checkOut={checkOut} onChange={(a, b) => { setCheckIn(a); setCheckOut(b); }} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate/70">Взрослые</label>
            <input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate/70">Дети</label>
            <input
              type="number"
              min={0}
              value={childAges.length}
              onChange={(e) => handleChildCountChange(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate focus:border-coral focus:outline-none"
            />
          </div>

          {childAges.length > 0 && (
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              {childAges.map((age, i) => (
                <label key={i} className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-sand/40 px-2.5 py-1.5 text-xs text-slate/70">
                  Ребёнок {i + 1}, лет:
                  <input
                    type="number"
                    min={0}
                    max={17}
                    value={age}
                    onChange={(e) => updateChildAge(i, Number(e.target.value))}
                    className="w-14 rounded border border-ink/15 bg-white px-1.5 py-1 text-xs text-slate focus:border-coral focus:outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          <select
            value={mealPlanCode}
            onChange={(e) => setMealPlanCode(e.target.value)}
            disabled={!contract || mealPlans.length === 0}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">План питания...</option>
            {mealPlans.map((mp) => (
              <option key={mp.id} value={mp.meal_code}>
                {mp.meal_name || mp.meal_code}
              </option>
            ))}
          </select>

          <select
            value={transferType}
            onChange={(e) => setTransferType(e.target.value)}
            disabled={!contract}
            className="appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Без трансфера</option>
            {transferOptions.map((t) => (
              <option key={t.id} value={t.transfer_type}>
                {t.transfer_name || t.transfer_type}
              </option>
            ))}
          </select>
        </div>

        {contractError && (
          <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{contractError}</div>
        )}
        {calcError && (
          <div className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{calcError}</div>
        )}

        <button
          type="button"
          onClick={handleCalculate}
          disabled={calculating || !contract}
          className="mt-5 rounded-lg bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {calculating ? "Расчёт..." : "Рассчитать"}
        </button>
      </div>

      {result && grandTotal !== null && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-lg font-semibold text-ink">Результат расчёта</h3>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg border border-ink/15 bg-white px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-sand/60"
            >
              {copied ? "Скопировано ✓" : "Копировать"}
            </button>
          </div>

          <dl className="mt-4 divide-y divide-ink/5 text-sm">
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">Сезон</dt>
              <dd className="font-medium text-ink">{result.seasonName ?? `#${result.roomBreakdown.season_id}`}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">Базовая ставка</dt>
              <dd className="font-mono text-ink">{formatMoney(result.roomBreakdown.base_total, result.roomBreakdown.currency)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">Надбавки (возраст/питание/доп.гость)</dt>
              <dd className="font-mono text-ink">{formatMoney(result.roomBreakdown.supplements_total, result.roomBreakdown.currency)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">Спецпредложение</dt>
              <dd className="font-medium text-ink">
                {result.specialOfferNames.length > 0 ? result.specialOfferNames.join(", ") : "нет"}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">Промо-скидка</dt>
              <dd className="font-medium text-ink">
                {result.promotionNames.length > 0 ? result.promotionNames.join(", ") : "нет"}
              </dd>
            </div>
            <div className="flex justify-between py-2 font-semibold">
              <dt className="text-ink">Стоимость номера</dt>
              <dd className="font-mono text-ink">{formatMoney(result.roomBreakdown.final_total, result.roomBreakdown.currency)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-slate/60">{result.mandatoryTax.label || "Обязательный сбор"}</dt>
              <dd className="font-mono text-ink">{formatMoney(result.mandatoryTax.total, result.mandatoryTax.currency)}</dd>
            </div>
            {result.transferBreakdown && (
              <div className="py-2">
                <div className="flex justify-between">
                  <dt className="text-slate/60">
                    Трансфер ({result.transferBreakdown.transfer_name ?? result.transferBreakdown.transfer_type})
                  </dt>
                  <dd className="font-mono text-ink">{formatMoney(result.transferBreakdown.total, result.transferBreakdown.currency)}</dd>
                </div>
                <p className="mt-1 pl-3 text-[11px] text-slate/50">
                  Взрослые: {formatMoney(result.transferBreakdown.adult_total, result.transferBreakdown.currency)}
                  {result.occupancy.children > 0 && (
                    <> · Дети: {formatMoney(result.transferBreakdown.child_total, result.transferBreakdown.currency)}</>
                  )}
                  {result.occupancy.infants > 0 && (
                    <> · Младенцы: {formatMoney(result.transferBreakdown.infant_total, result.transferBreakdown.currency)}</>
                  )}
                </p>
              </div>
            )}
            <div className="flex justify-between py-3 text-base font-semibold">
              <dt className="text-ink">ИТОГО</dt>
              <dd className="font-mono text-coral">{formatMoney(grandTotal, result.roomBreakdown.currency)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
};

export default PriceCalculator;
