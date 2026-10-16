import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";

// Decision 215: the agent's OWN markup, per destination, shown on top of the
// price they pay us when they present prices to a client. Display only --
// bookings, invoices and every amount sent to the server stay the agent's
// net price. Our own cost is never in the browser at all: the agent's
// "net" is the price they pay us.

export type Markups = {
  default_percent: number | null;
  by_country: Record<string, number>;
  countries: string[];
  updated_at: string | null;
};

export type PriceMode = "client" | "net";

export function percentFor(markups: Markups | null, country: string | null | undefined): number {
  if (!markups) return 0;
  const own = country ? markups.by_country[country] : undefined;
  return own ?? markups.default_percent ?? 0;
}

// Client figure for one net amount: rounded to a whole unit when a markup
// applies (a client price with cents would read as a calculation), exact
// net otherwise.
export function withMarkup(amount: number, percent: number): number {
  return percent > 0 ? Math.round(amount * (1 + percent / 100)) : amount;
}

export function hasAnyMarkup(markups: Markups | null): boolean {
  if (!markups) return false;
  return (markups.default_percent ?? 0) > 0 || Object.values(markups.by_country).some((p) => p > 0);
}

export async function fetchMarkups(token: string): Promise<Markups> {
  const res = await fetch(`${API_URL}/me/markups`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) handleSessionExpired();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveMarkups(
  token: string,
  body: { default_percent: number | null; by_country: Record<string, number> },
): Promise<Markups> {
  const res = await fetch(`${API_URL}/me/markups`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) handleSessionExpired();
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join("; ") : `HTTP ${res.status}`);
  }
  return res.json();
}

type Ctx = {
  markups: Markups | null;
  mode: PriceMode;
  setMode: (m: PriceMode) => void;
  // Converts a net amount for a hotel in `country` into what is displayed
  // in the current mode.
  shown: (amount: number, country: string | null | undefined) => number;
  active: boolean; // a markup is configured and the client view is on
};

const ClientPricingContext = createContext<Ctx>({
  markups: null,
  mode: "net",
  setMode: () => {},
  shown: (a) => a,
  active: false,
});

const MODE_KEY = "dmc.priceMode";

export function ClientPricingProvider({ children }: { children: ReactNode }) {
  const [markups, setMarkups] = useState<Markups | null>(null);
  const [mode, setModeState] = useState<PriceMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "net" ? "net" : "client";
    } catch {
      return "client";
    }
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetchMarkups(token)
      .then(setMarkups)
      .catch(() => setMarkups(null));
  }, []);

  const setMode = useCallback((m: PriceMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const active = mode === "client" && hasAnyMarkup(markups);
    return {
      markups,
      mode,
      setMode,
      active,
      shown: (amount, country) => (active ? withMarkup(amount, percentFor(markups, country)) : amount),
    };
  }, [markups, mode, setMode]);

  return <ClientPricingContext.Provider value={value}>{children}</ClientPricingContext.Provider>;
}

export function useClientPricing() {
  return useContext(ClientPricingContext);
}
