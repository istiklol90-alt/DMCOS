import Button from "../ui/Button";

type HeaderProps = {
  onHome: () => void;
};

function Header({ onHome }: HeaderProps) {
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
        </nav>
      </div>
    </header>
  );
}

export default Header;