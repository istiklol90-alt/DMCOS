import { useTranslation } from "react-i18next";
import Button from "../ui/Button";

type HeaderProps = {
  onHome: () => void;
};

function Header({ onHome }: HeaderProps) {
  const { i18n } = useTranslation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-ink">
      <div className="mx-auto flex h-[78px] max-w-6xl items-center justify-between px-5 sm:px-10">
        <div
          onClick={onHome}
          className="cursor-pointer font-display text-2xl font-semibold text-white transition-opacity hover:opacity-80"
        >
          DMC OS
        </div>

        <nav className="flex items-center gap-4">
          <button
            onClick={onHome}
            className="appearance-none border-0 bg-transparent text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            Home
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
        </nav>
      </div>
    </header>
  );
}

export default Header;