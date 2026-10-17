import type { TransferListView } from "./BookingsSubViews";

// ---------------------------------------------------------------------------
// Admin restructure, Stage B1: which admin screen is showing lives in the
// URL, as two query parameters on the one existing /admin-panel route:
//
//   /admin-panel                                        Bookings
//   /admin-panel?section=invoices                       Invoices
//   /admin-panel?section=transfer-list                  Transfer list, Arrivals
//   /admin-panel?section=transfer-list&view=departures  Transfer list, Departures
//
// `view` belongs to the Transfer list alone. It used to belong to Bookings,
// when Arrivals / Departures / Transfers were views of that screen; an old
// address of that shape (/admin-panel?view=arrivals) now simply opens
// Bookings, and is corrected.
//
// Query parameters rather than path segments on purpose: the route table
// (router.tsx) is shared with the agent panel and does not have to change.
//
// The default screen carries no parameters, so the address everyone already
// has bookmarked -- and the one Login.tsx and Home.tsx navigate to -- still
// means exactly what it meant.
//
// Everything here is pure: URLSearchParams in, values or URLSearchParams out.
// Reading never throws and never trusts its input -- an unknown, empty,
// repeated or hostile value resolves to the default screen.
// ---------------------------------------------------------------------------

export type AdminSection =
  | "reservations"
  | "contracts"
  | "contracts-ai"
  | "rooms"
  | "price-calculator"
  | "markup"
  | "invoices"
  | "balance"
  | "cashback"
  | "users"
  | "special-agents"
  | "transfer-list"
  | "packages-agents"
  | "packages-addons"
  | "packages-rules"
  | "packages-flights";

export const DEFAULT_SECTION: AdminSection = "reservations";

// What a section is called in the address bar. Named after what the menu
// calls the screen today, not after the internal key -- "statements", not
// "balance"; "import", not "contracts-ai" -- so a pasted link reads like the
// place it leads to.
const SECTION_URL_NAME: Record<AdminSection, string> = {
  reservations: "bookings",
  contracts: "contracts",
  "contracts-ai": "import",
  rooms: "rooms",
  "price-calculator": "price-calculator",
  markup: "markup",
  invoices: "invoices",
  balance: "statements",
  cashback: "cashback",
  users: "users",
  "special-agents": "special-agents",
  "transfer-list": "transfer-list",
  "packages-agents": "packages-agents",
  "packages-addons": "packages-insurance-visa",
  "packages-rules": "packages-cancellation",
  "packages-flights": "packages-flights",
};

const SECTION_BY_URL_NAME = new Map<string, AdminSection>(
  (Object.entries(SECTION_URL_NAME) as [AdminSection, string][]).map(([section, name]) => [name, section]),
);

// The one section that has views of its own.
const VIEW_SECTION: AdminSection = "transfer-list";
const TRANSFER_LIST_VIEWS: readonly TransferListView[] = ["arrivals", "departures", "transfers"];
export const DEFAULT_VIEW: TransferListView = "arrivals";

export interface AdminLocation {
  section: AdminSection;
  // Only the Transfer list has views; for every other section this is always
  // the default and is not written to the address.
  view: TransferListView;
}

export function readAdminLocation(params: URLSearchParams): AdminLocation {
  const rawSection = params.get("section");
  // No parameter at all is the default screen, not an error.
  if (rawSection === null) {
    return { section: DEFAULT_SECTION, view: DEFAULT_VIEW };
  }
  const section = SECTION_BY_URL_NAME.get(rawSection.trim().toLowerCase());
  // An address that names a section which does not exist is not half-trusted:
  // it resolves to the plain default screen, view included.
  if (section === undefined) return { section: DEFAULT_SECTION, view: DEFAULT_VIEW };
  return { section, view: section === VIEW_SECTION ? readView(params) : DEFAULT_VIEW };
}

function readView(params: URLSearchParams): TransferListView {
  const raw = (params.get("view") ?? "").trim().toLowerCase();
  return (TRANSFER_LIST_VIEWS as readonly string[]).includes(raw) ? (raw as TransferListView) : DEFAULT_VIEW;
}

// The one correct spelling of a location. Parameters this module does not own
// are carried over untouched and keep their position; `set` (not delete +
// append) is what keeps "section" where it already was, so an address that is
// already correct comes back byte-identical and nothing is rewritten.
export function writeAdminLocation(current: URLSearchParams, location: AdminLocation): URLSearchParams {
  const next = new URLSearchParams(current);
  if (location.section === DEFAULT_SECTION) next.delete("section");
  else next.set("section", SECTION_URL_NAME[location.section]);
  if (location.section === VIEW_SECTION && location.view !== DEFAULT_VIEW) next.set("view", location.view);
  else next.delete("view");
  return next;
}
