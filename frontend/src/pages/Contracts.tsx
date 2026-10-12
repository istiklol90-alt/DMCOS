import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";

// ---------------------------------------------------------------------------
// Types (only the fields this screen actually reads) — mirror Contract
// Engine's real response schemas field-for-field, no translation layer.
// ---------------------------------------------------------------------------

interface Contract {
  id: number;
  hotel_id: number;
  contract_name: string;
  contract_code: string | null;
  currency: string;
  start_date: string;
  end_date: string;
  payment_terms: string | null;
  contract_status: string;
  transfer_required: boolean;
  mandatory_tax_per_person_per_night: number | null;
  mandatory_tax_label: string | null;
}

interface ContractSeason {
  id: number;
  season_name: string;
  start_date: string;
  end_date: string;
  priority: number;
  status: string;
}

interface ContractMealPlan {
  id: number;
  meal_code: string;
  meal_name: string | null;
  description: string | null;
}

interface ContractTransferOption {
  id: number;
  transfer_type: string;
  transfer_name: string | null;
  price_adult: number;
  price_child: number;
  price_infant: number | null;
  // Decision 196: "per_person" (a seaplane seat, priced per passenger) or
  // "per_vehicle" (a road transfer — one flat fare for the car).
  pricing_basis: string;
  price_per_vehicle: number | null;
  // Decision 197: null means the contract states no limit (a seaplane).
  max_passengers: number | null;
  // Decision 198: separate cap on guests aged 12+. null = no adult limit.
  max_adults: number | null;
  status: string;
}

interface ContractAgeCategory {
  id: number;
  category_name: string;
  min_age: number | null;
  max_age: number | null;
}

interface Rate {
  id: number;
  season_id: number;
  room_type_id: number;
  meal_plan_id: number;
  currency: string;
  base_price: number;
  base_occupancy: number;
  minimum_stay: number | null;
  maximum_stay: number | null;
  status: string;
}

interface RateSupplement {
  id: number;
  rate_id: number;
  adjustment_type: string;
  age_category_id: number | null;
  meal_plan_id: number | null;
  calculation_basis: string;
  amount: number;
  status: string;
}

interface Hotel {
  id: number;
  hotel_name: string;
}

interface RoomType {
  id: number;
  room_name: string;
}

interface ContractCoverage {
  seasonCount: number;
  roomTypeCount: number;
}

// Decision 069/071 (Pricing Engine): a contract can have zero, one, or many
// rows -- room_type_id/meal_plan_id null means "applies to all", start_date/
// end_date null means "always active". Most contracts have zero rows.
interface ContractExclusiveDiscount {
  id: number;
  contract_id: number;
  room_type_id: number | null;
  meal_plan_id: number | null;
  start_date: string | null;
  end_date: string | null;
  discount_percent: number;
}

type Mode = "list" | "detail";

// ---------------------------------------------------------------------------
// Fetch helper — same pattern as ContractsAI.tsx/HotelSearch.tsx's fetchJson
// ---------------------------------------------------------------------------

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
      // response body wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US");
}

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  "Waiting Approval": "Waiting Approval",
  Active: "Active",
  Expired: "Expired",
  Cancelled: "Cancelled",
  Archived: "Archived",
};

const CONTRACT_STATUS_CLASSES: Record<string, string> = {
  Draft: "bg-slate/10 text-slate",
  "Waiting Approval": "bg-coral/15 text-coral",
  Active: "bg-teal/15 text-teal",
  Expired: "bg-slate/10 text-slate",
  Cancelled: "bg-red-500/15 text-red-600",
  Archived: "bg-slate/10 text-slate",
};

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  age_category_price: "Age category surcharge",
  meal_plan_supplement: "Meal plan surcharge",
  extra_bed: "Extra bed",
  single_occupancy: "Single occupancy",
  extra_person: "Extra person",
};

const CALCULATION_BASIS_LABELS: Record<string, string> = {
  per_person_per_night: "per person/night",
  per_stay: "per stay",
  percentage_of_rate: "% of rate",
};

function ContractStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        CONTRACT_STATUS_CLASSES[status] ?? "bg-slate/10 text-slate"
      }`}
    >
      {CONTRACT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const Contracts = () => {
  const [mode, setMode] = useState<Mode>("list");

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  // null (distinct from "not loaded yet", which is simply absent from the
  // map) means the per-contract coverage fetch failed -- never collapsed
  // into a false "0 · 0", which would misrepresent a real error as a
  // confirmed empty contract.
  const [coverage, setCoverage] = useState<Record<number, ContractCoverage | null>>({});
  // Empty array is the expected default for most contracts (no exclusive
  // arrangement at all) -- distinct from undefined ("not fetched yet").
  const [exclusiveDiscounts, setExclusiveDiscounts] = useState<Record<number, ContractExclusiveDiscount[]>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [detailDiscounts, setDetailDiscounts] = useState<ContractExclusiveDiscount[]>([]);
  const [discountFormOpen, setDiscountFormOpen] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null);
  const [formPercent, setFormPercent] = useState("");
  const [formRoomTypeId, setFormRoomTypeId] = useState("");
  const [formMealPlanId, setFormMealPlanId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);

  // Decision 196: transfers are now editable here rather than only viewable.
  // Every destination arranges them differently -- per seat by seaplane, per
  // car by road -- so adding a new destination's transfers must be data entry
  // by the owner, not a script run by a developer.
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null);
  const [tfType, setTfType] = useState("");
  const [tfName, setTfName] = useState("");
  const [tfBasis, setTfBasis] = useState<"per_person" | "per_vehicle">("per_person");
  const [tfAdult, setTfAdult] = useState("");
  const [tfChild, setTfChild] = useState("");
  const [tfInfant, setTfInfant] = useState("");
  const [tfVehicle, setTfVehicle] = useState("");
  const [tfMaxPax, setTfMaxPax] = useState("");
  const [tfMaxAdults, setTfMaxAdults] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [detailSeasons, setDetailSeasons] = useState<ContractSeason[]>([]);
  const [detailMealPlans, setDetailMealPlans] = useState<ContractMealPlan[]>([]);
  const [detailTransferOptions, setDetailTransferOptions] = useState<ContractTransferOption[]>([]);
  const [detailAgeCategories, setDetailAgeCategories] = useState<ContractAgeCategory[]>([]);
  const [detailRates, setDetailRates] = useState<Rate[]>([]);
  const [detailSupplementsByRate, setDetailSupplementsByRate] = useState<Record<number, RateSupplement[]>>({});
  const [detailRoomTypes, setDetailRoomTypes] = useState<Record<number, string>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function loadList() {
    const token = localStorage.getItem("token") || "";
    try {
      setListLoading(true);
      setListError(null);
      const [contractsData, hotelsData] = await Promise.all([
        fetchJson<Contract[]>("/contract-engine/contracts?skip=0&limit=100", token),
        fetchJson<Hotel[]>("/hotel-engine/hotels", token),
      ]);
      setContracts(contractsData);
      const hotelMap: Record<number, string> = {};
      hotelsData.forEach((h) => (hotelMap[h.id] = h.hotel_name));
      setHotels(hotelMap);

      // Coverage ("N seasons · M room types") isn't returned by
      // list_contracts itself -- derived client-side per contract from its
      // seasons and rates, same accepted N+1 pattern HotelSearch.tsx
      // already uses for hotel -> room-types.
      const coverageEntries = await Promise.all(
        contractsData.map(async (c): Promise<[number, ContractCoverage | null]> => {
          try {
            const [seasons, rates] = await Promise.all([
              fetchJson<ContractSeason[]>(`/contract-engine/contracts/${c.id}/seasons`, token),
              fetchJson<Rate[]>(`/contract-engine/contracts/${c.id}/rates`, token),
            ]);
            const roomTypeCount = new Set(rates.map((r) => r.room_type_id)).size;
            return [c.id, { seasonCount: seasons.length, roomTypeCount }];
          } catch (err: any) {
            console.error(`Coverage fetch failed for contract ${c.id}:`, err);
            return [c.id, null];
          }
        })
      );
      setCoverage(Object.fromEntries(coverageEntries));

      // Decision 069/071: /pricing-engine returns an empty list when a
      // contract has no exclusive-discount rows (the expected case for most
      // contracts) -- never throws, unlike coverage's own try/catch above.
      const discountEntries = await Promise.all(
        contractsData.map(async (c): Promise<[number, ContractExclusiveDiscount[]]> => {
          const discounts = await fetchJson<ContractExclusiveDiscount[]>(
            `/pricing-engine/contracts/${c.id}/exclusive-discounts`,
            token
          );
          return [c.id, discounts];
        })
      );
      setExclusiveDiscounts(Object.fromEntries(discountEntries));
    } catch (err: any) {
      setListError(err.message || "Failed to load contract list");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "list") loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function openDetail(contractId: number) {
    setMode("detail");
    setDetailError(null);
    setDetailLoading(true);
    setDetailContract(null);
    setDetailSeasons([]);
    setDetailMealPlans([]);
    setDetailTransferOptions([]);
    setDetailAgeCategories([]);
    setDetailRates([]);
    setDetailSupplementsByRate({});
    setDetailRoomTypes({});
    setDetailDiscounts([]);
    setDiscountFormOpen(false);
    setEditingDiscountId(null);
    setDiscountError(null);
    const token = localStorage.getItem("token") || "";
    try {
      const [contract, seasons, mealPlans, transferOptions, ageCategories, rates, discounts] = await Promise.all([
        fetchJson<Contract>(`/contract-engine/contracts/${contractId}`, token),
        fetchJson<ContractSeason[]>(`/contract-engine/contracts/${contractId}/seasons`, token),
        fetchJson<ContractMealPlan[]>(`/contract-engine/contracts/${contractId}/meal-plans`, token),
        fetchJson<ContractTransferOption[]>(`/contract-engine/contracts/${contractId}/transfer-options`, token),
        fetchJson<ContractAgeCategory[]>(`/contract-engine/contracts/${contractId}/age-categories`, token),
        fetchJson<Rate[]>(`/contract-engine/contracts/${contractId}/rates`, token),
        fetchJson<ContractExclusiveDiscount[]>(`/pricing-engine/contracts/${contractId}/exclusive-discounts`, token),
      ]);
      setDetailContract(contract);
      setDetailSeasons(seasons);
      setDetailMealPlans(mealPlans);
      setDetailTransferOptions(transferOptions);
      setDetailAgeCategories(ageCategories);
      setDetailRates(rates);
      setDetailDiscounts(discounts);

      const [roomTypesData, supplementsEntries] = await Promise.all([
        fetchJson<RoomType[]>(`/hotel-engine/hotels/${contract.hotel_id}/room-types`, token),
        Promise.all(
          rates.map(async (r): Promise<[number, RateSupplement[]]> => {
            try {
              const supplements = await fetchJson<RateSupplement[]>(
                `/contract-engine/rates/${r.id}/supplements`,
                token
              );
              return [r.id, supplements];
            } catch {
              return [r.id, []];
            }
          })
        ),
      ]);
      const roomTypeMap: Record<number, string> = {};
      roomTypesData.forEach((rt) => (roomTypeMap[rt.id] = rt.room_name));
      setDetailRoomTypes(roomTypeMap);
      setDetailSupplementsByRate(Object.fromEntries(supplementsEntries));
    } catch (err: any) {
      setDetailError(err.message || "Failed to load contract details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetailDiscounts() {
    if (!detailContract) return;
    const token = localStorage.getItem("token") || "";
    const discounts = await fetchJson<ContractExclusiveDiscount[]>(
      `/pricing-engine/contracts/${detailContract.id}/exclusive-discounts`,
      token
    );
    setDetailDiscounts(discounts);
  }

  function openNewDiscountForm() {
    setEditingDiscountId(null);
    setFormPercent("");
    setFormRoomTypeId("");
    setFormMealPlanId("");
    setFormStartDate("");
    setFormEndDate("");
    setDiscountError(null);
    setDiscountFormOpen(true);
  }

  function openEditDiscountForm(d: ContractExclusiveDiscount) {
    setEditingDiscountId(d.id);
    setFormPercent(String(d.discount_percent));
    setFormRoomTypeId(d.room_type_id != null ? String(d.room_type_id) : "");
    setFormMealPlanId(d.meal_plan_id != null ? String(d.meal_plan_id) : "");
    setFormStartDate(d.start_date ?? "");
    setFormEndDate(d.end_date ?? "");
    setDiscountError(null);
    setDiscountFormOpen(true);
  }

  function closeDiscountForm() {
    setDiscountFormOpen(false);
    setEditingDiscountId(null);
  }

  async function handleSaveDiscountForm() {
    if (!detailContract) return;
    const value = parseFloat(formPercent);
    if (isNaN(value) || value <= 0 || value >= 100) {
      setDiscountError("Enter a percentage between 0 and 100 (exclusive)");
      return;
    }
    if (formStartDate && formEndDate && formStartDate > formEndDate) {
      setDiscountError("Start date cannot be later than end date");
      return;
    }
    const token = localStorage.getItem("token") || "";
    const payload = {
      discount_percent: value,
      room_type_id: formRoomTypeId ? Number(formRoomTypeId) : null,
      meal_plan_id: formMealPlanId ? Number(formMealPlanId) : null,
      start_date: formStartDate || null,
      end_date: formEndDate || null,
    };
    try {
      setSavingDiscount(true);
      setDiscountError(null);
      if (editingDiscountId) {
        await fetchJson(`/pricing-engine/exclusive-discounts/${editingDiscountId}`, token, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson(`/pricing-engine/contracts/${detailContract.id}/exclusive-discounts`, token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await refreshDetailDiscounts();
      closeDiscountForm();
    } catch (err: any) {
      setDiscountError(err.message || "Failed to save discount");
    } finally {
      setSavingDiscount(false);
    }
  }

  async function handleDeleteDiscount(id: number) {
    if (!window.confirm("Delete this exclusive discount?")) return;
    const token = localStorage.getItem("token") || "";
    try {
      setSavingDiscount(true);
      await fetchJson(`/pricing-engine/exclusive-discounts/${id}`, token, { method: "DELETE" });
      await refreshDetailDiscounts();
    } catch (err: any) {
      alert(err.message || "Failed to delete discount");
    } finally {
      setSavingDiscount(false);
    }
  }

  // ---- Transfers (Decision 196) -----------------------------------------
  async function refreshDetailTransfers() {
    if (!detailContract) return;
    const token = localStorage.getItem("token") || "";
    setDetailTransferOptions(
      await fetchJson<ContractTransferOption[]>(
        `/contract-engine/contracts/${detailContract.id}/transfer-options`,
        token
      )
    );
  }

  function openNewTransferForm() {
    setEditingTransferId(null);
    setTfType("");
    setTfName("");
    setTfBasis("per_person");
    setTfAdult("");
    setTfChild("");
    setTfInfant("");
    setTfVehicle("");
    setTfMaxPax("");
    setTfMaxAdults("");
    setTransferError(null);
    setTransferFormOpen(true);
  }

  function openEditTransferForm(o: ContractTransferOption) {
    setEditingTransferId(o.id);
    setTfType(o.transfer_type);
    setTfName(o.transfer_name ?? "");
    setTfBasis(o.pricing_basis === "per_vehicle" ? "per_vehicle" : "per_person");
    setTfAdult(String(o.price_adult));
    setTfChild(String(o.price_child));
    setTfInfant(o.price_infant != null ? String(o.price_infant) : "");
    setTfVehicle(o.price_per_vehicle != null ? String(o.price_per_vehicle) : "");
    setTfMaxPax(o.max_passengers != null ? String(o.max_passengers) : "");
    setTfMaxAdults(o.max_adults != null ? String(o.max_adults) : "");
    setTransferError(null);
    setTransferFormOpen(true);
  }

  async function handleSaveTransferForm() {
    if (!detailContract) return;
    const type = tfType.trim();
    if (!type) {
      setTransferError("Enter a transfer type code (e.g. sedan_standard, seaplane)");
      return;
    }
    // Validated here as well as server-side, so the owner sees the problem
    // beside the field rather than as a 400 from the API.
    // Decision 197: empty means "no stated limit" (a seaplane), which is a
    // real answer, not a missing one -- so it is sent as null, never dropped.
    const maxPax = tfMaxPax.trim() === "" ? null : parseInt(tfMaxPax, 10);
    if (maxPax !== null && (isNaN(maxPax) || maxPax < 1)) {
      setTransferError("Max guests must be a whole number of 1 or more, or left empty");
      return;
    }
    const maxAdults = tfMaxAdults.trim() === "" ? null : parseInt(tfMaxAdults, 10);
    if (maxAdults !== null && (isNaN(maxAdults) || maxAdults < 1)) {
      setTransferError("Max adults must be a whole number of 1 or more, or left empty");
      return;
    }
    // Decision 198: an adult limit above the total is meaningless and would
    // only mislead whoever reads the row later.
    if (maxAdults !== null && maxPax !== null && maxAdults > maxPax) {
      setTransferError("Max adults cannot exceed max guests");
      return;
    }
    let payload: Record<string, unknown>;
    if (tfBasis === "per_vehicle") {
      const vehicle = parseFloat(tfVehicle);
      if (isNaN(vehicle) || vehicle < 0) {
        setTransferError("Enter the fare for one vehicle, round trip");
        return;
      }
      payload = {
        transfer_type: type,
        transfer_name: tfName.trim() || null,
        pricing_basis: "per_vehicle",
        price_per_vehicle: vehicle,
        price_adult: 0,
        price_child: 0,
        price_infant: null,
        max_passengers: maxPax,
        max_adults: maxAdults,
      };
    } else {
      const adult = parseFloat(tfAdult);
      const child = parseFloat(tfChild);
      if (isNaN(adult) || adult < 0 || isNaN(child) || child < 0) {
        setTransferError("Enter both the adult and the child price");
        return;
      }
      const infant = tfInfant.trim() === "" ? null : parseFloat(tfInfant);
      if (infant !== null && (isNaN(infant) || infant < 0)) {
        setTransferError("Infant price must be a number, or left empty");
        return;
      }
      payload = {
        transfer_type: type,
        transfer_name: tfName.trim() || null,
        pricing_basis: "per_person",
        price_adult: adult,
        price_child: child,
        price_infant: infant,
        max_passengers: maxPax,
        max_adults: maxAdults,
      };
    }
    try {
      setSavingTransfer(true);
      setTransferError(null);
      if (editingTransferId) {
        await fetchJson(`/contract-engine/contract-transfer-options/${editingTransferId}`, token(), {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJson(`/contract-engine/contract-transfer-options`, token(), {
          method: "POST",
          body: JSON.stringify({ ...payload, contract_id: detailContract.id }),
        });
      }
      await refreshDetailTransfers();
      setTransferFormOpen(false);
      setEditingTransferId(null);
    } catch (err: any) {
      setTransferError(err.message || "Failed to save transfer");
    } finally {
      setSavingTransfer(false);
    }
  }

  async function handleDeleteTransfer(o: ContractTransferOption) {
    if (
      !window.confirm(
        `Delete "${o.transfer_name ?? o.transfer_type}"? Bookings that already used it keep the fare they were charged.`
      )
    )
      return;
    try {
      setSavingTransfer(true);
      await fetchJson(`/contract-engine/contract-transfer-options/${o.id}`, token(), {
        method: "DELETE",
      });
      await refreshDetailTransfers();
    } catch (err: any) {
      alert(err.message || "Failed to delete transfer");
    } finally {
      setSavingTransfer(false);
    }
  }

  function token() {
    return localStorage.getItem("token") || "";
  }

  function seasonName(seasonId: number) {
    return detailSeasons.find((s) => s.id === seasonId)?.season_name ?? `#${seasonId}`;
  }

  function mealPlanCode(mealPlanId: number) {
    return detailMealPlans.find((m) => m.id === mealPlanId)?.meal_code ?? `#${mealPlanId}`;
  }

  function ageCategoryName(ageCategoryId: number) {
    return detailAgeCategories.find((a) => a.id === ageCategoryId)?.category_name ?? `#${ageCategoryId}`;
  }

  // ===== List =====

  if (mode === "list") {
    return (
      <div>
        <p className="mt-6 text-sm text-slate/60">
          All contracts from Contract Engine — created manually, via API, or via AI Core Engine, with no
          separate registration: the list always reads the real contracts table directly.
        </p>

        {listLoading && <p className="mt-10 text-center text-sm text-slate/60">Loading...</p>}
        {listError && <p className="mt-10 text-center text-sm text-red-600">Error: {listError}</p>}

        {!listLoading && !listError && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Hotel</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Coverage</th>
                  <th className="px-4 py-3 font-medium">Discount (Excl.)</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate/50">
                      No contracts found
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => {
                    const cov = coverage[c.id];
                    const discounts = exclusiveDiscounts[c.id];
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openDetail(c.id)}
                        className="cursor-pointer border-b border-ink/5 last:border-b-0 hover:bg-sand/40"
                      >
                        <td className="px-4 py-3.5 font-medium text-ink">{c.contract_name}</td>
                        <td className="px-4 py-3.5 text-slate/80">{hotels[c.hotel_id] ?? `#${c.hotel_id}`}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                          {formatDate(c.start_date)} → {formatDate(c.end_date)}
                        </td>
                        <td className="px-4 py-3.5 text-slate/70">{c.currency}</td>
                        <td className="px-4 py-3.5">
                          <ContractStatusBadge status={c.contract_status} />
                        </td>
                        <td className="px-4 py-3.5 text-slate/70">
                          {cov === undefined && "—"}
                          {cov === null && <span className="text-red-600">Failed to load</span>}
                          {cov && `${cov.seasonCount} season(s) · ${cov.roomTypeCount} room type(s)`}
                        </td>
                        <td className="px-4 py-3.5 text-slate/70">
                          {discounts && discounts.length > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-teal/15 px-2.5 py-1 text-xs font-medium text-teal">
                              {discounts.length === 1
                                ? `${discounts[0].discount_percent}%`
                                : `${discounts.length} discounts`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ===== Detail =====

  return (
    <div className="pb-10">
      <button
        type="button"
        onClick={() => setMode("list")}
        className="mt-6 text-sm font-medium text-slate/60 hover:text-ink"
      >
        ← Back to list
      </button>

      {detailLoading && <p className="mt-10 text-center text-sm text-slate/60">Loading...</p>}
      {detailError && <p className="mt-10 text-center text-sm text-red-600">Error: {detailError}</p>}

      {!detailLoading && detailContract && (
        <>
          <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">{detailContract.contract_name}</h3>
                <p className="mt-1 text-sm text-slate/70">
                  {hotels[detailContract.hotel_id] ?? `#${detailContract.hotel_id}`}
                  {" · "}
                  {formatDate(detailContract.start_date)} → {formatDate(detailContract.end_date)}
                  {" · "}
                  {detailContract.currency}
                </p>
              </div>
              <ContractStatusBadge status={detailContract.contract_status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate/60">
              {detailContract.contract_code && <span>Code: {detailContract.contract_code}</span>}
              <span>Transfer required: {detailContract.transfer_required ? "yes" : "no"}</span>
              {detailContract.mandatory_tax_per_person_per_night != null && (
                <span>
                  {detailContract.mandatory_tax_label ?? "Tax"}: {detailContract.mandatory_tax_per_person_per_night}{" "}
                  {detailContract.currency} / person / night
                </span>
              )}
            </div>

            {/* ===== Exclusive discounts (Decision 069, extended by 071) ===== */}
            <div className="mt-4 border-t border-ink/5 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate/50">
                    Exclusive room rate discounts
                  </p>
                  <p className="mt-1 text-xs text-slate/60">
                    Applied only to agents in the exclusive tier on the "Counteragents" tab. You can set a
                    single discount for the whole contract, or separate discounts per room type / meal plan /
                    arrival period — an empty field means "applies to all".
                  </p>
                </div>
                {!discountFormOpen && (
                  <button
                    type="button"
                    onClick={openNewDiscountForm}
                    className="appearance-none rounded-lg border-0 bg-teal px-4 py-2 text-xs font-medium text-white transition-transform hover:-translate-y-0.5"
                  >
                    Add discount
                  </button>
                )}
              </div>

              {detailDiscounts.length === 0 && !discountFormOpen ? (
                <p className="mt-3 text-sm text-slate/50">No discounts configured for this contract.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {detailDiscounts.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-sand/30 px-3.5 py-2.5"
                    >
                      <div className="text-sm text-ink">
                        <span className="font-semibold text-coral">{d.discount_percent}%</span>{" "}
                        <span className="text-slate/70">
                          {d.room_type_id != null
                            ? detailRoomTypes[d.room_type_id] ?? `type #${d.room_type_id}`
                            : "all room types"}
                          {" · "}
                          {d.meal_plan_id != null ? mealPlanCode(d.meal_plan_id) : "all meal plans"}
                          {" · "}
                          {d.start_date || d.end_date
                            ? `${d.start_date ? formatDate(d.start_date) : "…"} → ${
                                d.end_date ? formatDate(d.end_date) : "…"
                              }`
                            : "always active"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDiscountForm(d)}
                          className="appearance-none rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-slate/70 transition-colors hover:bg-sand/60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(d.id)}
                          disabled={savingDiscount}
                          className="appearance-none rounded-lg border border-coral/40 bg-transparent px-3 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {discountFormOpen && (
                <div className="mt-3 rounded-xl border border-coral/20 bg-coral/5 p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="text-xs text-slate/60">
                      Room type
                      <select
                        value={formRoomTypeId}
                        onChange={(e) => setFormRoomTypeId(e.target.value)}
                        className="mt-1 w-full appearance-none rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                      >
                        <option value="">All room types</option>
                        {Object.entries(detailRoomTypes).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate/60">
                      Meal plan
                      <select
                        value={formMealPlanId}
                        onChange={(e) => setFormMealPlanId(e.target.value)}
                        className="mt-1 w-full appearance-none rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                      >
                        <option value="">All meal plans</option>
                        {detailMealPlans.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.meal_code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-slate/60">
                      Start date
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="mt-1 w-full appearance-none rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                      />
                    </label>
                    <label className="text-xs text-slate/60">
                      End date
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        className="mt-1 w-full appearance-none rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                      />
                    </label>
                    <label className="text-xs text-slate/60">
                      Discount, %
                      <input
                        type="number"
                        min={0}
                        max={99}
                        step="0.1"
                        placeholder="e.g. 10"
                        value={formPercent}
                        onChange={(e) => setFormPercent(e.target.value)}
                        className="mt-1 w-full appearance-none rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleSaveDiscountForm}
                      disabled={savingDiscount}
                      className="appearance-none rounded-lg border-0 bg-coral px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    >
                      {savingDiscount ? "..." : editingDiscountId ? "Save changes" : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={closeDiscountForm}
                      disabled={savingDiscount}
                      className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                  {discountError && <p className="mt-2 text-sm text-red-600">{discountError}</p>}
                </div>
              )}
            </div>
          </div>

          {/* ===== Seasons ===== */}
          <h4 className="mb-2 mt-6 font-display text-base font-semibold text-ink">
            Seasons ({detailSeasons.length})
          </h4>
          {detailSeasons.length === 0 ? (
            <p className="text-sm text-slate/50">No seasons defined.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {detailSeasons.map((s) => (
                <div key={s.id} className="rounded-xl border border-ink/10 bg-white p-3.5">
                  <p className="font-medium text-ink">{s.season_name}</p>
                  <p className="mt-1 text-xs text-slate/60">
                    {formatDate(s.start_date)} → {formatDate(s.end_date)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ===== Meal Plans ===== */}
          <h4 className="mb-2 mt-6 font-display text-base font-semibold text-ink">
            Meal Plans ({detailMealPlans.length})
          </h4>
          {detailMealPlans.length === 0 ? (
            <p className="text-sm text-slate/50">No meal plans defined.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detailMealPlans.map((m) => (
                <span
                  key={m.id}
                  className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm text-ink"
                >
                  {m.meal_code}
                  {m.meal_name ? ` — ${m.meal_name}` : ""}
                </span>
              ))}
            </div>
          )}

          {/* ===== Transfers (Decision 196) ===== */}
          <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-base font-semibold text-ink">
              Transfers ({detailTransferOptions.length})
            </h4>
            {!transferFormOpen && (
              <button
                type="button"
                onClick={openNewTransferForm}
                className="appearance-none rounded-lg border-0 bg-teal px-4 py-2 text-xs font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                Add transfer
              </button>
            )}
          </div>
          <p className="mb-2.5 text-xs text-slate/50">
            Priced either per person (a seaplane seat) or per vehicle (a car — one fare whoever rides
            in it). Agents can always choose to go without a transfer unless this contract makes one
            mandatory.
          </p>
          {detailTransferOptions.length === 0 ? (
            <p className="text-sm text-slate/50">No transfers defined.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {detailTransferOptions.map((t) => (
                <div key={t.id} className="rounded-xl border border-ink/10 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">{t.transfer_name ?? t.transfer_type}</p>
                    <span
                      className={
                        t.status === "Active"
                          ? "shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success"
                          : "shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-slate/60"
                      }
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-slate/40">{t.transfer_type}</p>
                  <p className="mt-1 text-xs text-slate/60">
                    {t.pricing_basis === "per_vehicle" ? (
                      <>
                        {detailContract.currency} {t.price_per_vehicle} · per vehicle, round trip
                      </>
                    ) : (
                      <>
                        Adult: {t.price_adult} · Child: {t.price_child}
                        {t.price_infant != null ? ` · Infant: ${t.price_infant}` : ""} · per person
                      </>
                    )}
                    {t.max_passengers != null ? ` · up to ${t.max_passengers} guests` : ""}
                    {t.max_adults != null ? ` (max ${t.max_adults} aged 12+)` : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditTransferForm(t)}
                      className="rounded border border-ink/15 bg-white px-2 py-0.5 text-[11px] font-medium text-ink/70 hover:bg-sand"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTransfer(t)}
                      className="rounded border border-danger/25 bg-white px-2 py-0.5 text-[11px] font-medium text-danger hover:bg-danger/5"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {transferFormOpen && (
            <div className="mt-3 rounded-xl border border-ink/15 bg-sand/40 p-4">
              <p className="mb-3 text-sm font-semibold text-ink">
                {editingTransferId ? "Edit transfer" : "New transfer"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-xs text-slate/60">
                  Type code
                  <input
                    value={tfType}
                    onChange={(e) => setTfType(e.target.value)}
                    placeholder="sedan_standard"
                    className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-xs text-slate/60">
                  Name shown to the agent
                  <input
                    value={tfName}
                    onChange={(e) => setTfName(e.target.value)}
                    placeholder="Standard Sedan 2025"
                    className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                  />
                </label>
              </div>

              {/* Built from buttons rather than native radios: the legacy
                  global input{width:100%;padding:14px} rule stretches every
                  native radio across its container. */}
              <div className="mt-3">
                <p className="text-xs text-slate/60">Priced</p>
                <div className="mt-1 flex gap-2">
                  {(["per_person", "per_vehicle"] as const).map((basis) => (
                    <button
                      key={basis}
                      type="button"
                      onClick={() => setTfBasis(basis)}
                      className={
                        tfBasis === basis
                          ? "rounded-lg border border-gold bg-gold/15 px-3 py-1.5 text-xs font-semibold text-ink"
                          : "rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-slate/60 hover:bg-sand"
                      }
                    >
                      {basis === "per_person" ? "Per person" : "Per vehicle"}
                    </button>
                  ))}
                </div>
              </div>

              {tfBasis === "per_vehicle" ? (
                <label className="mt-3 flex max-w-xs flex-col text-xs text-slate/60">
                  Fare for one vehicle, round trip ({detailContract.currency})
                  <input
                    type="number"
                    step="0.01"
                    value={tfVehicle}
                    onChange={(e) => setTfVehicle(e.target.value)}
                    placeholder="220"
                    className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                  />
                  <span className="mt-1 text-[11px] text-slate/50">
                    Party size does not change this. One option selected means one vehicle.
                  </span>
                </label>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col text-xs text-slate/60">
                    Adult ({detailContract.currency})
                    <input
                      type="number"
                      step="0.01"
                      value={tfAdult}
                      onChange={(e) => setTfAdult(e.target.value)}
                      className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col text-xs text-slate/60">
                    Child ({detailContract.currency})
                    <input
                      type="number"
                      step="0.01"
                      value={tfChild}
                      onChange={(e) => setTfChild(e.target.value)}
                      className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col text-xs text-slate/60">
                    Infant — optional
                    <input
                      type="number"
                      step="0.01"
                      value={tfInfant}
                      onChange={(e) => setTfInfant(e.target.value)}
                      placeholder="leave empty if free"
                      className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                    />
                  </label>
                </div>
              )}

              {/* Decision 197: capacity applies to both bases -- a car has
                  seats, and so does a shared speedboat -- so this sits outside
                  the per-person / per-vehicle branch. */}
              <div className="mt-3 grid max-w-lg gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-xs text-slate/60">
                  Max guests in total — optional
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={tfMaxPax}
                    onChange={(e) => setTfMaxPax(e.target.value)}
                    placeholder="no limit"
                    className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-xs text-slate/60">
                  Of those, max aged 12+ — optional
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={tfMaxAdults}
                    onChange={(e) => setTfMaxAdults(e.target.value)}
                    placeholder="no separate limit"
                    className="mt-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-gold focus:outline-none"
                  />
                </label>
              </div>
              <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-slate/50">
                Two separate limits, because a car has both. A sedan is <strong>4 in total, of
                which 2 aged 12+</strong>: 2 adults + 2 children fits, 3 adults does not, 1 adult +
                3 children fits again. Leave a field empty for no limit — a seaplane has neither.
                Infants count toward the total: a seat belt cannot be shared. An option that cannot
                take the party is not offered to the agent, and is refused if requested anyway.
              </p>

              {transferError && <p className="mt-2 text-xs text-danger">{transferError}</p>}
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={handleSaveTransferForm}
                  disabled={savingTransfer}
                  className="appearance-none rounded-lg border-0 bg-coral px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {savingTransfer ? "..." : editingTransferId ? "Save changes" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferFormOpen(false);
                    setEditingTransferId(null);
                  }}
                  disabled={savingTransfer}
                  className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ===== Rates ===== */}
          <h4 className="mb-2 mt-6 font-display text-base font-semibold text-ink">
            Rates ({detailRates.length})
          </h4>
          {detailRates.length === 0 ? (
            <p className="text-sm text-slate/50">No rates defined.</p>
          ) : (
            <div className="space-y-3">
              {detailRates.map((r) => {
                const supplements = detailSupplementsByRate[r.id] ?? [];
                return (
                  <div key={r.id} className="rounded-2xl border border-ink/10 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {detailRoomTypes[r.room_type_id] ?? `#${r.room_type_id}`}
                      </span>
                      <span className="text-sm text-slate/70">
                        {seasonName(r.season_id)} · {mealPlanCode(r.meal_plan_id)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate/70">
                      {r.base_price} {r.currency} / night (based on {r.base_occupancy} adult(s))
                      {r.minimum_stay ? ` · min. ${r.minimum_stay} night(s)` : ""}
                    </p>
                    {supplements.length > 0 && (
                      <div className="mt-2.5 space-y-1 border-t border-ink/5 pt-2.5">
                        {supplements.map((s) => (
                          <p key={s.id} className="text-xs text-slate/60">
                            {ADJUSTMENT_TYPE_LABELS[s.adjustment_type] ?? s.adjustment_type}
                            {s.age_category_id != null ? ` (${ageCategoryName(s.age_category_id)})` : ""}
                            {s.meal_plan_id != null ? ` (${mealPlanCode(s.meal_plan_id)})` : ""}: {s.amount}{" "}
                            {r.currency} {CALCULATION_BASIS_LABELS[s.calculation_basis] ?? s.calculation_basis}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Contracts;
