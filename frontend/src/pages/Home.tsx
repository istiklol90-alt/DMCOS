type HomeProps = {
  onRegister: () => void;
  onAgentLogin: () => void;
  onAdminLogin: () => void;
};

function Home({ onRegister, onAgentLogin, onAdminLogin }: HomeProps) {
  console.log('🏠 Home рендерится');
  console.log('📌 onAgentLogin:', onAgentLogin);
  console.log('📌 onAdminLogin:', onAdminLogin);
  
  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h1 style={styles.title}>🏨 DMC OS</h1>
        <p style={styles.subtitle}>B2B платформа для туристических агентств</p>
        <p style={styles.description}>
          Отели, контракты, бронирования, цены и AI автоматизация в одной платформе
        </p>

        <div style={styles.buttons}>
          <button 
            onClick={() => {
              console.log('🔘 Нажата кнопка Регистрация');
              onRegister();
            }} 
            style={styles.primaryButton}
          >
            📝 Регистрация
          </button>
          <button 
            onClick={() => {
              console.log('🔘 Нажата кнопка Вход для агентов');
              onAgentLogin();
            }} 
            style={styles.secondaryButton}
          >
            👤 Вход для агентов
          </button>
          <button 
            onClick={() => {
              console.log('🔘 Нажата кнопка Админ');
              onAdminLogin();
            }} 
            style={styles.adminButton}
          >
            🔐 Админ
          </button>
        </div>
      </div>

      <section style={styles.features}>
        <div style={styles.featureCard}>
          <h3>🏨 Отели</h3>
          <p>Контракты, цены, наличие и спецпредложения</p>
        </div>
        <div style={styles.featureCard}>
          <h3>📋 Бронирования</h3>
          <p>Быстрое создание, подтверждение и управление</p>
        </div>
        <div style={styles.featureCard}>
          <h3>💰 Цены</h3>
          <p>Актуальные цены и скидки от партнеров</p>
        </div>
        <div style={styles.featureCard}>
          <h3>🤖 AI Ассистент</h3>
          <p>Умные рекомендации и автоматизация</p>
        </div>
      </section>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "40px 20px",
    fontFamily: "Arial, sans-serif",
  },
  hero: {
    textAlign: "center",
    padding: "60px 20px",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    borderRadius: "20px",
    color: "white",
    marginBottom: "40px",
  },
  title: {
    fontSize: "48px",
    marginBottom: "10px",
  },
  subtitle: {
    fontSize: "24px",
    color: "#4fc3f7",
  },
  description: {
    fontSize: "16px",
    color: "#ccc",
    maxWidth: "600px",
    margin: "20px auto",
  },
  buttons: {
    display: "flex",
    gap: "15px",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: "30px",
  },
  primaryButton: {
    padding: "14px 35px",
    fontSize: "16px",
    background: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  secondaryButton: {
    padding: "14px 35px",
    fontSize: "16px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  adminButton: {
    padding: "14px 35px",
    fontSize: "16px",
    background: "#6c757d",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  features: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
  },
  featureCard: {
    background: "#f8f9fa",
    padding: "24px",
    borderRadius: "12px",
    textAlign: "center",
    border: "1px solid #e0e0e0",
  },
};

export default Home;