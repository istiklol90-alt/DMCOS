import { useState, type ReactNode } from "react";
import { NAV_STRUCTURE } from "../../pages/AdminNav";
import Button from "../ui/Button";
import { IconChevronLeft, IconMenu } from "../ui/icons";

// Collapsible: reported live (2026-07-30) -- the sidebar was permanently
// visible with no way to reclaim its width for wide tables (Needs
// Attention, Bookings). A chevron button inside the sidebar collapses it
// to full-width content; a menu icon in the topbar brings it back.
// Persisted in localStorage so a reload/tab-switch doesn't reset it,
// same flat-key convention as token/role/user elsewhere in this app.
const COLLAPSE_KEY = "admin_sidebar_collapsed";

// ---------------------------------------------------------------------------
// Design System v1.0 -- replaces AdminNav's horizontal top-tab-dropdown
// shell with a left sidebar, per the project owner's explicit brief
// ("Создать единый Sidebar... одинаковые отступы... одинаковый стиль
// активного раздела"), scoped to the admin panel only (agent-facing
// AgentTopNav is deliberately untouched, confirmed with the owner).
//
// Reuses AdminNav.tsx's NAV_STRUCTURE data array and its exact controlled
// activeTab/onSelect contract verbatim -- zero navigation LOGIC changes,
// this is purely a new presentational shell over the same data/state
// AdminPanel.tsx already owns. AdminNav.tsx itself is left in place,
// unused by AdminPanel now but not deleted (nothing else in this pass
// justifies removing it, and it's still a real, working component).
//
// Groups are an accordion, one open at a time (reported live 2026-07-30):
// clicking a group (Bookings/Contracts/Finance) expands its children;
// clicking a different group closes the first and opens the one just
// clicked; clicking a top-level leaf (Users/Price calculator/
// Counteragents) closes whichever group was open, since navigating there
// means leaving that section entirely.
// ---------------------------------------------------------------------------

function findParentGroupKey(tab: string): string | null {
  for (const item of NAV_STRUCTURE) {
    if (item.children?.some((c) => c.key === tab)) return item.key;
  }
  return null;
}

// One shared class builder for every nav row -- leaf, group header, and
// child leaf all render through this, so "one look" is true by
// construction instead of three hand-copied className strings that can
// drift apart (exactly what happened before: group headers were small
// uppercase labels while leaves were normal-size sentence-case buttons).
function navItemClass(active: boolean): string {
  // Subtle white frame around every item -- requested live so each row
  // reads as a distinct, cleanly-bounded box against the solid navy
  // sidebar instead of flat unbordered text.
  return `appearance-none rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
    active
      ? "border-white/20 bg-gold/20 text-white"
      : "border-white/10 bg-transparent text-white/65 hover:border-white/25 hover:bg-white/5 hover:text-white"
  }`;
}

interface AdminShellProps {
  activeTab: string;
  onSelect: (key: string) => void;
  userLabel: string;
  onLogout: () => void;
  children: ReactNode;
}

export default function AdminShell({ activeTab, onSelect, userLabel, onLogout, children }: AdminShellProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "true");
  // Whichever group's children currently contain the active tab starts
  // open (so loading straight into e.g. "Arrival" doesn't hide the very
  // item you're on) -- every subsequent change is purely user clicks,
  // handled imperatively below rather than re-derived from activeTab on
  // every render, so a group can also be manually closed without
  // immediately springing back open.
  const [openGroup, setOpenGroup] = useState<string | null>(() => findParentGroupKey(activeTab));

  function toggleCollapsed(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, String(next));
  }

  return (
    <div className="flex min-h-screen bg-sand font-sans text-slate">
      {!collapsed && (
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-4 py-6 text-white md:flex">
        <div className="mb-8 flex items-center justify-between gap-2.5 px-2">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-7 shrink-0 rounded-lg bg-gold" />
            <span className="font-display text-lg text-white">DMC OS</span>
          </div>
          <button
            type="button"
            onClick={() => toggleCollapsed(true)}
            aria-label="Collapse sidebar"
            className="appearance-none rounded-lg border-0 bg-transparent p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_STRUCTURE.map((item) => {
            if (!item.children) {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelect(item.key);
                    setOpenGroup(null);
                  }}
                  className={navItemClass(isActive)}
                >
                  {item.label}
                </button>
              );
            }

            const isOpen = openGroup === item.key;
            const hasActiveChild = item.children.some((child) => child.key === activeTab);

            return (
              <div key={item.key} className="mt-1 first:mt-0">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : item.key)}
                  className={`flex w-full items-center justify-between ${navItemClass(hasActiveChild && !isOpen)}`}
                >
                  {item.label}
                  <span className={`text-[10px] text-white/40 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-0.5 flex flex-col gap-0.5 pl-3">
                    {item.children.map((child) => {
                      const isActive = activeTab === child.key;
                      return (
                        <button
                          key={child.key}
                          type="button"
                          onClick={() => {
                            onSelect(child.key);
                            setOpenGroup(item.key);
                          }}
                          className={navItemClass(isActive)}
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
        </nav>
      </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-ink/10 bg-white/80 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            {collapsed && (
              <button
                type="button"
                onClick={() => toggleCollapsed(false)}
                aria-label="Expand sidebar"
                className="hidden appearance-none rounded-lg border border-ink/15 bg-white p-2 text-ink transition-colors hover:bg-sand md:flex"
              >
                <IconMenu className="h-4 w-4" />
              </button>
            )}
            {/* Mobile fallback: sidebar is md:flex-only, so below that
                breakpoint the nav needs to still be reachable somehow --
                deliberately left as a known gap for this foundation pass
                (this project's admin panel is a desktop-first internal
                tool, same assumption AdminNav's own dropdown already made)
                rather than building a mobile drawer nobody asked for yet. */}
            <span className="font-display text-base text-ink md:hidden">DMC OS</span>
            <span className="hidden text-sm text-slate/50 md:inline">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink">{userLabel}</span>
            <Button variant="secondary" size="sm" onClick={onLogout}>
              Log out
            </Button>
          </div>
        </header>

        <main className="flex-1 px-5 py-4">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
