import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "../config";
import { handleSessionExpired } from "../session";
import { fetchMarkups, saveMarkups, type Markups } from "./clientPricing";

// Decision 215: the agent's own account page -- read-only details and the
// agent's own client markup per destination.

type Account = {
  name: string;
  email: string;
  role: string;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  preferred_currency: string | null;
  member_since: string | null;
};

// Free text while typing; committed only when it is a number 0-100 or empty.
function parsePercent(raw: string): number | null | "invalid" {
  const v = raw.trim().replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
  return Math.round(n * 100) / 100;
}

export default function AgentAccount() {
  const { t, i18n } = useTranslation("agentDashboard");
  const [account, setAccount] = useState<Account | null>(null);
  const [markups, setMarkups] = useState<Markups | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [defaultPct, setDefaultPct] = useState("");
  const [byCountry, setByCountry] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch(`${API_URL}/me/account`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) handleSessionExpired();
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setAccount)
      .catch(() => setLoadError(true));
    fetchMarkups(token)
      .then((m) => {
        setMarkups(m);
        setDefaultPct(m.default_percent != null ? String(m.default_percent) : "");
        setByCountry(Object.fromEntries(Object.entries(m.by_country).map(([k, v]) => [k, String(v)])));
      })
      .catch(() => setLoadError(true));
  }, []);

  const countries = markups ? [...new Set([...markups.countries, ...Object.keys(markups.by_country)])].sort() : [];

  async function onSave() {
    setMessage(null);
    const def = parsePercent(defaultPct);
    if (def === "invalid") {
      setMessage({ ok: false, text: t("account.invalidPercent") });
      return;
    }
    const map: Record<string, number> = {};
    for (const c of countries) {
      const p = parsePercent(byCountry[c] ?? "");
      if (p === "invalid") {
        setMessage({ ok: false, text: `${c}: ${t("account.invalidPercent")}` });
        return;
      }
      if (p !== null) map[c] = p;
    }
    const token = localStorage.getItem("token");
    if (!token) return;
    setSaving(true);
    try {
      const saved = await saveMarkups(token, { default_percent: def, by_country: map });
      setMarkups(saved);
      setMessage({ ok: true, text: t("account.saved") });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("account.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  const detail = (label: string, value: string | null | undefined) => (
    <div className="flex flex-col gap-0.5 border-b border-ink/5 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-medium uppercase tracking-wide text-slate/50">{label}</dt>
      <dd className="text-sm text-ink">{value || "—"}</dd>
    </div>
  );

  const pctInput = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-24 rounded-lg border border-ink/15 bg-white px-3 py-2 text-right font-mono text-sm text-ink focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20"
      />
      <span className="text-sm text-slate/60">%</span>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-card">
        <h2 className="font-display text-xl font-semibold text-ink">{t("account.detailsTitle")}</h2>
        <p className="mt-1 text-xs text-slate/50">{t("account.detailsHint")}</p>
        {loadError && !account ? (
          <p className="mt-4 text-sm text-danger">{t("account.loadFailed")}</p>
        ) : (
          <dl className="mt-4">
            {detail(t("account.name"), account?.name)}
            {detail(t("account.email"), account?.email)}
            {detail(t("account.company"), account?.company_name)}
            {detail(t("account.contact"), account?.contact_person)}
            {detail(t("account.phone"), account?.phone)}
            {detail("WhatsApp", account?.whatsapp)}
            {detail(t("account.location"), [account?.city, account?.country].filter(Boolean).join(", "))}
            {detail(t("account.currency"), account?.preferred_currency)}
            {detail(
              t("account.memberSince"),
              account?.member_since ? new Date(account.member_since).toLocaleDateString(i18n.language) : null,
            )}
          </dl>
        )}
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-card">
        <h2 className="font-display text-xl font-semibold text-ink">{t("account.markupTitle")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate/70">{t("account.markupHint")}</p>

        <div className="mt-5 rounded-xl bg-sand/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{t("account.defaultLabel")}</p>
              <p className="text-xs text-slate/50">{t("account.defaultHint")}</p>
            </div>
            {pctInput(defaultPct, setDefaultPct, "0")}
          </div>
        </div>

        <div className="mt-4 divide-y divide-ink/5">
          {countries.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-sm text-ink">{c}</p>
              {pctInput(byCountry[c] ?? "", (v) => setByCountry((prev) => ({ ...prev, [c]: v })), defaultPct || "0")}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate/50">{t("account.countryHint")}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !markups}
            className="appearance-none rounded-full border-0 bg-ink px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t("account.saving") : t("account.save")}
          </button>
          {message && (
            <span className={`text-sm ${message.ok ? "text-success" : "text-danger"}`} role="status">
              {message.text}
            </span>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-gold/30 bg-gold/10 p-4 text-xs leading-relaxed text-ink/80">
          {t("account.markupNote")}
        </div>
      </section>
    </div>
  );
}
