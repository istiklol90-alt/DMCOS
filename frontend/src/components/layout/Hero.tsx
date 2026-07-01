import Button from "../ui/Button";

type HeroProps = {
  onRegister: () => void;
  onAgentLogin: () => void;
  onAdminLogin: () => void;
};

function Hero({
  onRegister,
  onAgentLogin,
  onAdminLogin,
}: HeroProps) {
  const handleRegister = () => {
    console.log('🔘 Нажата кнопка Register');
    console.log('✅ Вызываю onRegister()');
    onRegister();
    console.log('✅ onRegister() выполнен');
    // Принудительный переход
    window.location.href = '/register';
  };

  const handleAgentLogin = () => {
    console.log('🔘 Нажата кнопка Agent Login');
    onAgentLogin();
    window.location.href = '/login';
  };

  const handleAdminLogin = () => {
    console.log('🔘 Нажата кнопка Admin Login');
    onAdminLogin();
    window.location.href = '/login';
  };

  return (
    <section className="hero">
      <div className="heroContent">
        <p className="tag">DMC Operating System</p>

        <h1>
          One platform for agents,
          <br />
          hotels, contracts,
          <br />
          rates and bookings.
        </h1>

        <p className="subtitle">
          Manage partners, contracts, rates, bookings, payments,
          finance and AI automation in one modern platform.
        </p>

        <div className="heroButtons">
          <Button onClick={handleRegister}>
            Register as Partner
          </Button>

          <Button onClick={handleAgentLogin}>
            Agent Login
          </Button>

          <Button onClick={handleAdminLogin}>
            Admin Login
          </Button>
        </div>
      </div>
    </section>
  );
}

export default Hero;