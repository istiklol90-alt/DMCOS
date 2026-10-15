// ---------------------------------------------------------------------------
// Decision 206: sleeping places ("how will 2 adults + 2 children actually
// sleep in this room?").
//
// Hotel Engine stores them per occupancy option as a structured list --
// {type, count, for_children} -- plus a free-text note. This module is the
// one place that turns that list into words, in Russian or English, so the
// search card, the copied offer and the booking card can never describe the
// same room differently. No i18next here on purpose: the admin panel (always
// English) and the agent panel (RU/EN) both call it with a plain language.
// ---------------------------------------------------------------------------

export type BedType =
  | "king"
  | "queen"
  | "double"
  | "single"
  | "sofa_bed"
  | "day_bed"
  | "rollaway"
  | "bunk_bed"
  | "crib";

export const BED_TYPES: BedType[] = [
  "king",
  "queen",
  "double",
  "single",
  "sofa_bed",
  "day_bed",
  "rollaway",
  "bunk_bed",
  "crib",
];

export interface BedItem {
  type: BedType;
  count: number;
  for_children: boolean;
}

export interface OccupancyOption {
  id: number;
  room_type_id: number;
  adults: number;
  children: number;
  infants: number;
  is_active: boolean;
  beds: BedItem[];
  bedding_note: string | null;
}

export interface Bedding {
  beds: BedItem[];
  note: string | null;
}

type Lang = "ru" | "en";

// Russian: [one, few, many]; English: [one, other].
const LABELS: Record<Lang, Record<BedType, string[]>> = {
  ru: {
    king: ["двуспальная кровать King", "двуспальные кровати King", "двуспальных кроватей King"],
    queen: ["двуспальная кровать Queen", "двуспальные кровати Queen", "двуспальных кроватей Queen"],
    double: ["двуспальная кровать", "двуспальные кровати", "двуспальных кроватей"],
    single: ["односпальная кровать", "односпальные кровати", "односпальных кроватей"],
    sofa_bed: ["раскладной диван", "раскладных дивана", "раскладных диванов"],
    day_bed: ["диван-кушетка (day bed)", "дивана-кушетки (day bed)", "диванов-кушеток (day bed)"],
    rollaway: ["дополнительная кровать", "дополнительные кровати", "дополнительных кроватей"],
    bunk_bed: ["двухъярусная кровать", "двухъярусные кровати", "двухъярусных кроватей"],
    crib: ["детская кроватка", "детские кроватки", "детских кроваток"],
  },
  en: {
    king: ["king bed", "king beds"],
    queen: ["queen bed", "queen beds"],
    double: ["double bed", "double beds"],
    single: ["single bed", "single beds"],
    sofa_bed: ["sofa bed", "sofa beds"],
    day_bed: ["day bed", "day beds"],
    rollaway: ["extra bed (rollaway)", "extra beds (rollaway)"],
    bunk_bed: ["bunk bed", "bunk beds"],
    crib: ["baby cot", "baby cots"],
  },
};

const FOR_CHILDREN: Record<Lang, string> = { ru: "для детей", en: "for children" };

// "для 2 детей" / "for 2 children" -- when the party's children all share
// the one place marked for them, say how many it is for.
function forChildrenCount(n: number, l: Lang): string {
  if (l === "en") return `for ${n} ${n === 1 ? "child" : "children"}`;
  return `для ${n} ${n === 1 ? "ребёнка" : "детей"}`;
}

const ruPlural = new Intl.PluralRules("ru");

function langOf(lang: string): Lang {
  return lang.startsWith("en") ? "en" : "ru";
}

export function bedLabel(type: BedType, count: number, lang: string): string {
  const l = langOf(lang);
  const forms = LABELS[l][type];
  if (l === "en") return count === 1 ? forms[0] : forms[1];
  const rule = ruPlural.select(count);
  return rule === "one" ? forms[0] : rule === "few" ? forms[1] : forms[2];
}

// "1 двуспальная кровать King + 1 раскладной диван (для 2 детей)", with the
// note after a dash. null when there is nothing to say. `children` is the
// party's child count: when exactly one place is marked for children, the
// text says how many children it is for; otherwise just "for children".
export function formatBedding(bedding: Bedding | null | undefined, lang: string, children?: number): string | null {
  if (!bedding) return null;
  const l = langOf(lang);
  const childPlaces = bedding.beds.filter((b) => b.for_children).length;
  const childLabel = childPlaces === 1 && children && children > 0 ? forChildrenCount(children, l) : FOR_CHILDREN[l];
  const parts = bedding.beds.map(
    (b) => `${b.count} ${bedLabel(b.type, b.count, l)}${b.for_children ? ` (${childLabel})` : ""}`,
  );
  const note = bedding.note?.trim();
  if (parts.length === 0) return note || null;
  return note ? `${parts.join(" + ")} — ${note}` : parts.join(" + ");
}

// The occupancy option that describes this party: an exact match first,
// otherwise the smallest configured option that still fits it (options are
// ceilings -- "2A+2C" also covers 2 adults + 1 child, Decision 024). Only
// options that actually carry sleeping places count; null when none do.
export function pickBedding(
  options: OccupancyOption[] | undefined,
  adults: number,
  children: number,
): Bedding | null {
  if (!options) return null;
  const described = options.filter((o) => o.is_active && (o.beds.length > 0 || (o.bedding_note ?? "").trim() !== ""));
  const exact = described.find((o) => o.adults === adults && o.children === children);
  const pick =
    exact ??
    described
      .filter((o) => o.adults >= adults && o.children >= children)
      .sort((a, b) => a.adults - adults + (a.children - children) - (b.adults - adults + (b.children - children)))[0];
  if (!pick) return null;
  // A party with no children borrowing a larger combination (2 adults on a
  // "2A+2C" room) does not get the places that combination makes up for
  // children -- "sofa bed (for children)" would describe kids who are not
  // coming.
  const beds = children === 0 ? pick.beds.filter((b) => !b.for_children) : pick.beds;
  if (beds.length === 0 && !(pick.bedding_note ?? "").trim()) return null;
  return { beds, note: pick.bedding_note };
}
