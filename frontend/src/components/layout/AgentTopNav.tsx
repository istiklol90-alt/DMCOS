import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  IconCalendar,
  IconCheck,
  IconSend,
  IconChevronRight,
  IconMenu,
  IconX,
} from "../ui/icons";

// ---------------------------------------------------------------------------
// DMC OS design system, Phase 1. One shared top nav for the agent
// experience, replacing two previously-stacked, independently-built bars:
// App.tsx unconditionally rendered the generic Header.tsx (logo/"Home"
// link/language toggle) ABOVE both AgentDashboard_v2.tsx's own sidebar and
// HotelSearch.tsx's own separate inline top nav -- confirmed during Phase 1
// scoping, not assumed. Both agent pages now render this instead; Header.tsx
// keeps serving Home/Login/Register/etc., which don't need the richer
// agent-specific nav (Search/Bookings/Finance links, avatar+role dropdown).
//
// "Messages" and the notification bell are visual placeholders, not wired
// to anything real -- no messaging/notification feature exists yet. No fake
// badge/unread count is shown on either, per explicit instruction: a real
// feature can attach real data to these later without this shell changing.
// "Finance" navigates to the dashboard (same as "Bookings") because that's
// genuinely where the real, existing per-booking invoice/voucher downloads
// live today (Decision 102's DocumentsSection, inside each booking's detail
// view) -- there is no separate aggregate "Finance" page to link to, and
// pretending otherwise would be exactly the kind of fake destination this
// redesign is explicitly told to avoid.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

function IconBell({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconMessage({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getRoleLabel(role: string, t: (key: string) => string): string {
  const normalized = role.trim().toLowerCase();
  if (normalized === "agent") return t("roleLabel.agent");
  if (normalized === "admin") return t("roleLabel.admin");
  if (normalized === "manager") return t("roleLabel.manager");
  return role;
}

interface AgentTopNavProps {
  user: SessionUser;
  active: "search" | "dashboard";
  onNavigateSearch: () => void;
  onNavigateDashboard: () => void;
}

export default function AgentTopNav({ user, active, onNavigateSearch, onNavigateDashboard }: AgentTopNavProps) {
  const { t, i18n } = useTranslation("agentDashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function handleLogout() {
    localStorage.clear();
    window.location.href = "/";
  }

  const navItemClass = (isActive: boolean) =>
    `appearance-none border-0 bg-transparent rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
    }`;

  const navLinks = (
    <>
      <button type="button" onClick={onNavigateSearch} className={navItemClass(active === "search")}>
        <span className="inline-flex items-center gap-1.5">
          <IconCalendar className="h-4 w-4" />
          {t("nav.search")}
        </span>
      </button>
      <button type="button" onClick={onNavigateDashboard} className={navItemClass(active === "dashboard")}>
        <span className="inline-flex items-center gap-1.5">
          <IconCheck className="h-4 w-4" />
          {t("nav.bookings")}
        </span>
      </button>
      <button type="button" onClick={onNavigateDashboard} className={navItemClass(false)}>
        <span className="inline-flex items-center gap-1.5">
          <IconSend className="h-4 w-4" />
          {t("nav.finance")}
        </span>
      </button>
      <button type="button" className={navItemClass(false)}>
        <span className="inline-flex items-center gap-1.5">
          <IconMessage className="h-4 w-4" />
          {t("nav.messages")}
        </span>
      </button>
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-ink">
      <div className="mx-auto flex h-[78px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-10">
        <div
          onClick={onNavigateDashboard}
          className="flex shrink-0 cursor-pointer items-center gap-2.5"
        >
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-coral to-teal" />
          <span className="font-display text-lg font-semibold text-white">DMC OS</span>
        </div>

        <nav className="hidden items-center gap-1 md:flex">{navLinks}</nav>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            aria-label={t("nav.notifications")}
            className="hidden appearance-none rounded-lg border-0 bg-transparent p-2 text-white/70 transition-colors hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            <IconBell />
          </button>

          <button
            type="button"
            onClick={() => setMobileNavOpen((o) => !o)}
            aria-label={mobileNavOpen ? t("mobileNav.closeMenu") : t("mobileNav.openMenu")}
            className="appearance-none border-0 bg-transparent p-2 text-white/90 md:hidden"
          >
            {mobileNavOpen ? <IconX /> : <IconMenu />}
          </button>

          <div className="flex items-center gap-0.5 rounded-full border border-white/15 p-0.5">
            <button
              type="button"
              onClick={() => i18n.changeLanguage("ru")}
              className={`appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-medium transition-colors ${
                i18n.language === "ru" ? "bg-white/15 text-white" : "bg-transparent text-white/70 hover:text-white"
              }`}
            >
              RU
            </button>
            <button
              type="button"
              onClick={() => i18n.changeLanguage("en")}
              className={`appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-medium transition-colors ${
                i18n.language === "en" ? "bg-white/15 text-white" : "bg-transparent text-white/70 hover:text-white"
              }`}
            >
              EN
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex appearance-none items-center gap-2 rounded-full border-0 bg-transparent p-1 pr-2 transition-colors hover:bg-white/5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-coral to-teal font-display text-xs font-semibold text-white">
                {getInitials(user.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block truncate text-sm font-medium leading-tight text-white">{user.name}</span>
                <span className="block truncate text-[11px] leading-tight text-white/50">{getRoleLabel(user.role, t)}</span>
              </span>
              <IconChevronRight className={`hidden h-3.5 w-3.5 text-white/40 transition-transform sm:block ${menuOpen ? "rotate-90" : ""}`} />
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default appearance-none border-0 bg-transparent"
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-ink/10 bg-white py-1.5 shadow-card">
                  <div className="px-3.5 py-2">
                    <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                    <p className="truncate text-xs text-slate/50">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-ink/10" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full appearance-none border-0 bg-transparent px-3.5 py-2 text-left text-sm text-slate/70 transition-colors hover:bg-sand/60 hover:text-ink"
                  >
                    {t("nav.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-t border-white/10 px-5 py-3 md:hidden">
          {navLinks}
        </nav>
      )}
    </header>
  );
}
