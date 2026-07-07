import { useEffect, useState } from "react";
import { API_URL } from "../config";

// ---------------------------------------------------------------------------
// Tiny inline icons (same approach as AgentDashboard_v2.tsx — no icon
// package installed in this project)
// ---------------------------------------------------------------------------

function IconPlus({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconMinus({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

function IconAlert({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 9v4M12 17h.01M10.3 3.9 2.7 17.3a1.8 1.8 0 0 0 1.6 2.7h15.4a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Real session + API types
//
// Hotel/RoomType/Contract/ContractMealPlan/RoomPrice shapes below are typed
// from the actual Pydantic Response schemas in
// backend/app/engines/hotel/schemas.py and backend/app/engines/contract/
// schemas.py + service.py's get_room_price return dict — not guessed.
// ---------------------------------------------------------------------------

type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type Hotel = {
  id: number;
  hotel_name: string;
  brand: string | null;
  country: string;
  region: string | null;
  island: string | null;
  city: string;
  star_rating: number | null;
  status: string;
};

type RoomType = {
  id: number;
  hotel_id: number;
  room_name: string;
  room_size: number | null;
  bed_type: string | null;
  max_occupancy: number;
  status: string;
};

type Contract = {
  id: number;
  hotel_id: number;
  contract_status: string;
  currency: string;
};

type ContractMealPlan = {
  id: number;
  contract_id: number;
  meal_code: string;
  meal_name: string | null;
};

type RoomPrice = {
  contract_id: number;
  room_type_id: number;
  rate_id: number;
  meal_plan_id: number;
  currency: string;
  nights: number;
  final_total: number;
};

type MealPlanOption = {
  mealCode: string;
  mealName: string | null;
  price?: RoomPrice;
  priceError?: string;
};

type RoomTypeResult = RoomType & {
  options: MealPlanOption[];
  priceError?: string;
};

type HotelResult = Hotel & {
  contractId?: number;
  roomTypes: RoomTypeResult[];
};

const CARD_GRADIENTS = [
  "from-teal to-ink",
  "from-coral to-ink",
  "from-ink to-teal",
  "from-teal to-coral",
  "from-coral to-teal",
];

function cheapestOptionPrice(rt: RoomTypeResult): number | null {
  const priced = rt.options.filter((o) => o.price).map((o) => o.price!.final_total);
  return priced.length > 0 ? Math.min(...priced) : null;
}

function sortRoomTypesByPrice(roomTypes: RoomTypeResult[]): RoomTypeResult[] {
  // Cheapest first, using each room type's cheapest available meal-plan
  // option; room types with no priced option at all (no active contract,
  // no meal plans, every price call failed) sort after every priced room
  // type instead of disrupting the cheap-to-expensive reading.
  return [...roomTypes].sort((a, b) => {
    const pa = cheapestOptionPrice(a);
    const pb = cheapestOptionPrice(b);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return 0;
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Small fetch helper — attaches the real JWT, throws with the backend's
// own error detail on failure (Hotel/Contract Engine's api.py maps
// ValueError -> HTTP 400 with {"detail": "..."})
// ---------------------------------------------------------------------------

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
      // response body wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Guest counter control
// ---------------------------------------------------------------------------

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate/70">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Уменьшить: ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <IconMinus />
        </button>
        <span className="w-4 text-center text-sm font-medium text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`Увеличить: ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/15 text-ink transition-colors hover:bg-sand"
        >
          <IconPlus />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotel result card
// ---------------------------------------------------------------------------

function HotelCard({ hotel, gradient }: { hotel: HotelResult; gradient: string }) {
  const location = [hotel.island, hotel.city, hotel.country].filter(Boolean).join(", ");

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-col sm:flex-row">
        <div className={`relative h-36 shrink-0 bg-gradient-to-br sm:h-auto sm:w-56 ${gradient}`}>
          {hotel.star_rating != null && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink">
              {"★".repeat(hotel.star_rating)} {hotel.star_rating}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-display text-xl font-semibold text-ink">{hotel.hotel_name}</h3>
              <p className="mt-0.5 truncate text-sm text-slate/60">{location || "—"}</p>
            </div>
            {!hotel.contractId && (
              <span className="shrink-0 rounded-full bg-slate/10 px-2.5 py-1 text-xs font-medium text-slate/60">
                Нет активного контракта
              </span>
            )}
          </div>

          {hotel.roomTypes.length === 0 ? (
            <p className="mt-4 text-sm text-slate/50">Нет доступных типов номеров.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {sortRoomTypesByPrice(hotel.roomTypes).map((rt) => (
                <div
                  key={rt.id}
                  className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm"
                >
                  <h4 className="font-display text-base font-semibold text-ink">
                    {rt.room_name}
                  </h4>
                  <p className="mt-1 text-xs text-slate/50">До {rt.max_occupancy} гостей</p>

                  {rt.priceError ? (
                    <p className="mt-3 text-xs font-medium text-slate/50">{rt.priceError}</p>
                  ) : (
                    <div className="mt-3 divide-y divide-ink/5 border-t border-ink/5">
                      {rt.options.map((opt) => {
                        const perNight = opt.price ? opt.price.final_total / opt.price.nights : null;
                        return (
                          <div
                            key={opt.mealCode}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                          >
                            <span className="text-sm font-medium text-ink">
                              {opt.mealName ?? opt.mealCode}
                            </span>

                            <div className="flex shrink-0 items-center gap-3">
                              {opt.price ? (
                                <div className="text-right">
                                  <p className="font-mono text-sm font-semibold text-ink">
                                    {opt.price.currency}{" "}
                                    {perNight!.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
                                    <span className="ml-1 text-xs font-normal text-slate/50">
                                      / ночь
                                    </span>
                                  </p>
                                  <p className="text-[11px] text-slate/50">
                                    Итого за {opt.price.nights} ноч.: {opt.price.currency}{" "}
                                    {opt.price.final_total.toLocaleString("ru-RU")}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-slate/50">
                                  {opt.priceError ?? "Цена недоступна"}
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={!opt.price}
                                className="rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                              >
                                Выбрать
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type HotelSearchProps = {
  onBack?: () => void;
};

function HotelSearch({ onBack }: HotelSearchProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Same auth guard pattern as AgentDashboard_v2.tsx: check token first,
    // clear stale localStorage before redirecting so App's mount effect
    // doesn't read a leftover "role" and route straight back here.
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token) {
      localStorage.clear();
      window.location.href = "/login";
      return;
    }

    if (role !== "Agent" && role !== "agent") {
      alert("⛔ Доступ запрещен! Только для агентов.");
      window.location.href = "/";
      return;
    }

    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    setCheckingAuth(false);
  }, []);

  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<HotelResult[]>([]);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!checkIn || !checkOut) {
      setFormError("Укажите даты заезда и выезда.");
      return;
    }
    if (checkOut <= checkIn) {
      setFormError("Дата выезда должна быть позже даты заезда.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return; // guarded above; satisfies TypeScript below

    setSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const hotels = await fetchJson<Hotel[]>("/hotel-engine/hotels?skip=0&limit=100", token);

      const withRooms = await Promise.all(
        hotels.map(async (hotel): Promise<HotelResult> => {
          let roomTypes: RoomType[] = [];
          try {
            roomTypes = await fetchJson<RoomType[]>(
              `/hotel-engine/hotels/${hotel.id}/room-types`,
              token
            );
          } catch {
            roomTypes = [];
          }

          let contractId: number | undefined;
          try {
            const contract = await fetchJson<Contract | null>(
              `/contract-engine/hotels/${hotel.id}/active-contract?check_in=${checkIn}`,
              token
            );
            contractId = contract?.id;
          } catch {
            contractId = undefined;
          }

          const roomTypeResults = await Promise.all(
            roomTypes.map(async (rt): Promise<RoomTypeResult> => {
              if (!contractId) {
                return { ...rt, options: [], priceError: "Нет активного контракта" };
              }
              try {
                const mealPlans = await fetchJson<ContractMealPlan[]>(
                  `/contract-engine/contracts/${contractId}/room-types/${rt.id}/meal-plans`,
                  token
                );
                if (mealPlans.length === 0) {
                  return { ...rt, options: [], priceError: "Нет доступных тарифов для этого номера" };
                }

                const options = await Promise.all(
                  mealPlans.map(async (mp): Promise<MealPlanOption> => {
                    try {
                      const priceQuery = new URLSearchParams({
                        check_in: checkIn,
                        check_out: checkOut,
                        meal_plan: mp.meal_code,
                        adults: String(adults),
                        children: String(children),
                        infants: String(infants),
                      });
                      const price = await fetchJson<RoomPrice>(
                        `/contract-engine/contracts/${contractId}/room-types/${rt.id}/price?${priceQuery.toString()}`,
                        token
                      );
                      return { mealCode: mp.meal_code, mealName: mp.meal_name, price };
                    } catch (err) {
                      return {
                        mealCode: mp.meal_code,
                        mealName: mp.meal_name,
                        priceError: err instanceof Error ? err.message : "Цена недоступна",
                      };
                    }
                  })
                );

                return { ...rt, options };
              } catch (err) {
                return {
                  ...rt,
                  options: [],
                  priceError: err instanceof Error ? err.message : "Не удалось загрузить тарифы",
                };
              }
            })
          );

          return { ...hotel, contractId, roomTypes: roomTypeResults };
        })
      );

      setResults(withRooms);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Не удалось загрузить список отелей.");
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }

  if (checkingAuth || !user) {
    return <div className="min-h-screen bg-sand" />;
  }

  return (
    <div className="min-h-screen bg-sand font-sans text-slate">
      <div className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-coral to-teal" />
            <span className="font-display text-lg font-semibold text-ink">DMC OS</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate/60 sm:inline">
              {getInitials(user.name)} · {user.name}
            </span>
            <button
              type="button"
              onClick={() => (onBack ? onBack() : (window.location.href = "/agent-dashboard"))}
              className="text-sm font-medium text-teal hover:underline"
            >
              ← Назад к дашборду
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <p className="text-xs font-semibold tracking-widest text-coral">ПОИСК И БРОНИРОВАНИЕ</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">Найти отель</h1>

        <form
          onSubmit={handleSearch}
          className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 sm:p-6"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5 lg:col-span-2">
              <label className="text-sm font-medium text-ink">Направление / отель</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Мальдивы, Rixos..."
                className="w-full appearance-none rounded-lg border border-ink/15 bg-sand/40 px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
              <p className="text-[11px] text-slate/40">
                Поиск по названию пока не поддерживается Hotel Engine — показаны все отели.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Заезд</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required
                className="w-full appearance-none rounded-lg border border-ink/15 bg-sand/40 px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Выезд</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                required
                className="w-full appearance-none rounded-lg border border-ink/15 bg-sand/40 px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Гости</label>
              <div className="flex flex-col gap-2 rounded-lg border border-ink/15 bg-sand/40 px-3 py-2.5">
                <Counter label="Взрослые" value={adults} min={1} onChange={setAdults} />
                <Counter label="Дети" value={children} min={0} onChange={setChildren} />
                <Counter label="Младенцы" value={infants} min={0} onChange={setInfants} />
              </div>
            </div>
          </div>

          {formError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-coral/10 px-4 py-2.5 text-sm font-medium text-coral">
              <IconAlert />
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={searching}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {searching ? "Ищем..." : "Найти"}
          </button>
        </form>

        {searchError && (
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-coral/10 px-5 py-4 text-sm font-medium text-coral">
            <IconAlert />
            Не удалось загрузить данные: {searchError}
          </div>
        )}

        {!searching && hasSearched && !searchError && results.length === 0 && (
          <p className="mt-6 text-sm text-slate/60">Отели не найдены.</p>
        )}

        <div className="mt-6 space-y-5">
          {results.map((hotel, i) => (
            <HotelCard key={hotel.id} hotel={hotel} gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default HotelSearch;
