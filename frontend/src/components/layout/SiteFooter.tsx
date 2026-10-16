import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SITE_SECTIONS, SECTION_LABEL, useGoToSection } from "./siteSections";

// Footer of the public site (home page and destination pages).
export default function SiteFooter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goToSection = useGoToSection();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#141a31] px-5 pt-14 text-white/70 sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-semibold text-white">DMC OS</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed">{t("site.footer.about")}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t("site.footer.sections")}</p>
          <ul className="mt-4 list-none space-y-2 p-0 text-sm">
            {SITE_SECTIONS.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => goToSection(id)}
                  className="appearance-none border-0 bg-transparent p-0 text-white/70 transition-colors hover:text-white"
                >
                  {t(SECTION_LABEL[id])}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">{t("site.footer.account")}</p>
          <ul className="mt-4 list-none space-y-2 p-0 text-sm">
            {(
              [
                ["/login", "site.auth.agentLogin"],
                ["/register", "site.auth.register"],
                ["/login", "site.auth.admin"],
              ] as const
            ).map(([to, label]) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => navigate(to)}
                  className="appearance-none border-0 bg-transparent p-0 text-white/70 transition-colors hover:text-white"
                >
                  {t(label)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/10 py-6 text-center text-xs text-white/50">
        © {year} DMC OS. {t("site.footer.rights")}
      </div>
    </footer>
  );
}
