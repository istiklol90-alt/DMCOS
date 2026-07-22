import { useEffect, useState } from "react";
import { fetchJson, formatMoney, formatDate, StatusBadge } from "./financeShared";

// ---------------------------------------------------------------------------
// "Cashback" -- Decision 088 restructure: promoted to its own top-level tab
// for consistency ("each its own distinct section"), but deliberately keeps
// its existing simple full-list UI -- hotel count doesn't have the same
// scale problem agent count does, so no search-first treatment is needed
// here.
// ---------------------------------------------------------------------------

interface Hotel {
  id: number;
  hotel_name: string;
}

interface CashbackArrangement {
  id: number;
  hotel_id: number;
  terms: string;
  rebate_percentage: number | null;
  volume_threshold: number | null;
  currency: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

const Cashback = () => {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);
  const [arrangements, setArrangements] = useState<CashbackArrangement[]>([]);
  const [arrangementsLoading, setArrangementsLoading] = useState(false);
  const [arrangementsError, setArrangementsError] = useState<string | null>(null);

  const [showAddArrangement, setShowAddArrangement] = useState(false);
  const [termsInput, setTermsInput] = useState("");
  const [currencyInput, setCurrencyInput] = useState("USD");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [rebateInput, setRebateInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingArrangement, setSavingArrangement] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<Hotel[]>("/hotel-engine/hotels", token)
      .then((data) => {
        setHotels(data);
        if (data.length > 0) setSelectedHotelId(data[0].id);
      })
      .catch(() => setHotels([]));
  }, []);

  async function loadArrangements(hotelId: number) {
    const token = localStorage.getItem("token") || "";
    try {
      setArrangementsLoading(true);
      setArrangementsError(null);
      setArrangements(
        await fetchJson<CashbackArrangement[]>(`/finance-engine/hotels/${hotelId}/cashback-arrangements`, token)
      );
    } catch (err: any) {
      setArrangementsError(err.message || "Failed to load arrangements");
    } finally {
      setArrangementsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedHotelId !== null) loadArrangements(selectedHotelId);
  }, [selectedHotelId]);

  async function handleAddArrangement() {
    if (!termsInput.trim()) {
      setAddError("Specify the arrangement terms");
      return;
    }
    if (!startDateInput) {
      setAddError("Specify a start date");
      return;
    }
    if (selectedHotelId === null) return;
    const token = localStorage.getItem("token") || "";
    try {
      setSavingArrangement(true);
      setAddError(null);
      await fetchJson(`/finance-engine/hotels/${selectedHotelId}/cashback-arrangements`, token, {
        method: "POST",
        body: JSON.stringify({
          terms: termsInput,
          currency: currencyInput,
          start_date: startDateInput,
          end_date: endDateInput || null,
          rebate_percentage: rebateInput ? parseFloat(rebateInput) : null,
          volume_threshold: thresholdInput ? parseFloat(thresholdInput) : null,
        }),
      });
      setShowAddArrangement(false);
      setTermsInput("");
      setStartDateInput("");
      setEndDateInput("");
      setRebateInput("");
      setThresholdInput("");
      await loadArrangements(selectedHotelId);
    } catch (err: any) {
      setAddError(err.message || "Failed to save arrangement");
    } finally {
      setSavingArrangement(false);
    }
  }

  return (
    <div className="pb-10">
      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedHotelId ?? ""}
            onChange={(e) => setSelectedHotelId(Number(e.target.value))}
            className="min-w-[240px] appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
          >
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hotel_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setShowAddArrangement(true);
              setAddError(null);
            }}
            disabled={selectedHotelId === null}
            className="appearance-none rounded-lg border-0 bg-teal px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            Add arrangement
          </button>
        </div>

        {arrangementsLoading && <p className="mt-6 text-center text-sm text-slate/60">Loading...</p>}
        {arrangementsError && <p className="mt-6 text-center text-sm text-red-600">Error: {arrangementsError}</p>}

        {!arrangementsLoading && !arrangementsError && (
          <div className="mt-4 space-y-3">
            {arrangements.length === 0 ? (
              <p className="rounded-2xl border border-ink/10 bg-white px-5 py-10 text-center text-sm text-slate/50">
                No cashback arrangements for this hotel yet
              </p>
            ) : (
              arrangements.map((a) => (
                <div key={a.id} className="rounded-2xl border border-ink/10 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink">{a.terms}</p>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate/70">
                    {a.rebate_percentage !== null && <span>Rate: {a.rebate_percentage}%</span>}
                    {a.volume_threshold !== null && (
                      <span>Threshold: {formatMoney(a.volume_threshold, a.currency)}</span>
                    )}
                    <span>
                      From {formatDate(a.start_date)}
                      {a.end_date ? ` to ${formatDate(a.end_date)}` : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showAddArrangement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={() => setShowAddArrangement(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ink">New cashback arrangement</h3>
            <div className="mt-3 space-y-3">
              <textarea
                placeholder="Terms (e.g.: 5% rebate at $1M turnover)"
                value={termsInput}
                onChange={(e) => setTermsInput(e.target.value)}
                rows={3}
                className="w-full appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
              <div className="flex gap-2.5">
                <input
                  type="number"
                  placeholder="Rate %"
                  value={rebateInput}
                  onChange={(e) => setRebateInput(e.target.value)}
                  className="w-1/2 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="number"
                  placeholder="Turnover threshold"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-1/2 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
              </div>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="Currency"
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="date"
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  className="w-1/3 appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
                />
              </div>
            </div>
            {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={handleAddArrangement}
                disabled={savingArrangement}
                className="flex-1 appearance-none rounded-lg border-0 bg-coral px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {savingArrangement ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddArrangement(false)}
                className="appearance-none rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-slate/70 transition-colors hover:bg-sand/60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cashback;
