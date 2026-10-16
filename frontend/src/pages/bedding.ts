// ---------------------------------------------------------------------------
// Decision 211: sleeping places ("how will 2 adults + 2 children actually
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
//
// `bedroomCount` (the room type's own): a room with several bedrooms says
// so first, otherwise "3 king beds" reads as three beds in one room --
// "3 спальни, в каждой — двуспальная кровать King; + 1 диван-кушетка". When
// nothing else is known it still says "3 спальни".
export function formatBedding(
  bedding: Bedding | null | undefined,
  lang: string,
  children?: number,
  bedroomCount?: number | null,
): string | null {
  const l = langOf(lang);
  const rooms = bedroomCount && bedroomCount > 1 ? bedroomsLabel(bedroomCount, l) : null;
  if (!bedding) return rooms;
  const childPlaces = bedding.beds.filter((b) => b.for_children).length;
  const childLabel = childPlaces === 1 && children && children > 0 ? forChildrenCount(children, l) : FOR_CHILDREN[l];
  const item = (b: BedItem) => `${b.count} ${bedLabel(b.type, b.count, l)}${b.for_children ? ` (${childLabel})` : ""}`;
  const note = bedding.note?.trim();
  const withNote = (text: string | null) => (text && note ? `${text} — ${note}` : text || note || null);

  if (!rooms) return withNote(bedding.beds.length ? bedding.beds.map(item).join(" + ") : null);

  // One main bed per bedroom, all of one kind: "в каждой — ...".
  const main = bedding.beds.filter((b) => MAIN_BEDS.has(b.type) && !b.for_children);
  const extras = bedding.beds.filter((b) => !main.includes(b));
  if (main.length === 1 && main[0].count === bedroomCount) {
    const each = `${rooms}, ${EACH[l]} ${bedLabel(main[0].type, 1, l)}`;
    return withNote(extras.length ? `${each}; + ${extras.map(item).join(" + ")}` : each);
  }
  if (bedding.beds.length === 0) return withNote(rooms);
  if (main.length === 0) return withNote(`${rooms} + ${bedding.beds.map(item).join(" + ")}`);
  return withNote(`${rooms}: ${bedding.beds.map(item).join(" + ")}`);
}

// What every screen shows: the described sleeping places when the hotel has
// entered them, otherwise the room's own free-text bed type -- both led by the
// number of bedrooms when there is more than one. null when nothing is known.
export function describeSleeping(
  bedding: Bedding | null | undefined,
  bedType: string | null | undefined,
  lang: string,
  children?: number,
  bedroomCount?: number | null,
): string | null {
  if (bedding) return formatBedding(bedding, lang, children, bedroomCount);
  const rooms = formatBedding(null, lang, children, bedroomCount);
  const free = bedType?.trim();
  if (free) return rooms ? `${rooms}: ${free}` : free;
  return rooms;
}

// Beds a bedroom is built around (as opposed to extras set up in a room).
const MAIN_BEDS = new Set<BedType>(["king", "queen", "double", "single"]);
const EACH: Record<Lang, string> = { ru: "в каждой —", en: "each with a" };

function bedroomsLabel(n: number, l: Lang): string {
  if (l === "en") return `${n} bedrooms`;
  const rule = ruPlural.select(n);
  return `${n} ${rule === "one" ? "спальня" : rule === "few" ? "спальни" : "спален"}`;
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
  // Prefer a combination with the same number of adults: its extra places
  // are the children's, which can be left out below. A combination with
  // more adults would describe a bed for a guest who is not coming (2 adults
  // shown "king + day bed" because the room also takes 3 adults).
  const pick =
    exact ??
    described
      .filter((o) => o.adults >= adults && o.children >= children)
      .sort((a, b) => a.adults - adults - (b.adults - adults) || a.children - children - (b.children - children))[0];
  if (!pick) return null;
  // A party with no children borrowing a larger combination (2 adults on a
  // "2A+2C" room) does not get the places that combination makes up for
  // children -- "sofa bed (for children)" would describe kids who are not
  // coming.
  const beds = children === 0 ? pick.beds.filter((b) => !b.for_children) : pick.beds;
  if (beds.length === 0 && !(pick.bedding_note ?? "").trim()) return null;
  return { beds, note: pick.bedding_note };
}
