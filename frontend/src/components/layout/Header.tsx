import Button from "../ui/Button";

type HeaderProps = {
  onHome: () => void;
};

function Header({ onHome }: HeaderProps) {
  return (
    <header className="header">
      <div className="headerContainer">
        <div className="logo" onClick={onHome}>
          🏨 DMC OS
        </div>

        <nav className="nav">
          <button className="navLink" onClick={onHome}>
            🏠 Home
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;