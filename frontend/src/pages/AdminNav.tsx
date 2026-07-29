import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Decision 088 -- two-level top nav, replacing the flat 9-item tab bar.
// NAV_STRUCTURE is the single source of truth: adding a future group (e.g.
// Payment Engine) or a new leaf under an existing group is a data change
// here, not a new block of JSX in AdminPanel.tsx. Parent items are pure
// dropdown triggers -- they never have their own content, only leaf keys
// are valid AdminTab values. Stays a horizontal bar (not a sidebar) so the
// content area below keeps the full page width.
// ---------------------------------------------------------------------------

export interface NavItem {
  key: string;
  label: string;
  children?: NavItem[];
}

export const NAV_STRUCTURE: NavItem[] = [
  { key: "users", label: "Users" },
  {
    key: "bookings-group",
    label: "Bookings",
    children: [
      { key: "bookings-needs-attention", label: "Needs Attention" },
      { key: "reservations", label: "Bookings" },
      { key: "bookings-transfers", label: "Transfers" },
      { key: "bookings-arrival", label: "Arrival" },
      { key: "bookings-departure", label: "Departure" },
    ],
  },
  {
    key: "contracts-group",
    label: "Contracts",
    children: [
      { key: "contracts", label: "Contracts" },
      { key: "contracts-ai", label: "Contracts — AI" },
    ],
  },
  { key: "price-calculator", label: "Price calculator" },
  { key: "counteragents", label: "Counteragents" },
  {
    key: "finance-group",
    label: "Finance",
    children: [
      { key: "invoices", label: "Invoices" },
      { key: "balance", label: "Balance" },
      { key: "cashback", label: "Cashback" },
    ],
  },
];

interface AdminNavProps {
  activeTab: string;
  onSelect: (key: string) => void;
}

const AdminNav = ({ activeTab, onSelect }: AdminNavProps) => {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLeaf = (key: string) => {
    onSelect(key);
    setOpenGroup(null);
  };

  return (
    <div ref={navRef} className="flex flex-1 gap-1">
      {NAV_STRUCTURE.map((item) => {
        if (!item.children) {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => selectLeaf(item.key)}
              className={`appearance-none border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium transition-colors ${
                isActive ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          );
        }

        const hasActiveChild = item.children.some((child) => child.key === activeTab);
        const isOpen = openGroup === item.key;

        return (
          <div key={item.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? null : item.key)}
              className={`flex appearance-none items-center gap-1 border-0 border-b-2 bg-transparent px-4 py-2 text-sm font-medium transition-colors ${
                hasActiveChild || isOpen ? "border-coral text-ink" : "border-transparent text-slate/60 hover:text-ink"
              }`}
            >
              {item.label}
              <span className={`text-[9px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-ink/10 bg-white py-1.5 shadow-lg">
                {item.children.map((child) => {
                  const isActive = activeTab === child.key;
                  return (
                    <button
                      key={child.key}
                      type="button"
                      onClick={() => selectLeaf(child.key)}
                      className={`block w-full appearance-none border-0 bg-transparent px-4 py-2 text-left text-sm font-medium transition-colors ${
                        isActive ? "text-coral" : "text-slate/70 hover:bg-sand/60 hover:text-ink"
                      }`}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AdminNav;
