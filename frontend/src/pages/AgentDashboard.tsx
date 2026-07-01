import { useState, useEffect } from "react";
import { API_URL } from "../config";

// Тип для контракта
interface Contract {
  id: number;
  hotelId: number;
  hotelName: string;
  city: string;
  country: string;
  roomType: string;
  mealPlan: string;
  price: number;
  currency: string;
  validFrom: string;
  validTo: string;
  available: boolean;
}

interface Hotel {
  id: number;
  name: string;
  city: string;
  country: string;
  rating: number;
  image: string;
  contracts: Contract[];
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

const AgentDashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [filteredHotels, setFilteredHotels] = useState<Hotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  
  // Фильтры
  const [selectedCountry, setSelectedCountry] = useState("UAE");
  const [selectedCity, setSelectedCity] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [nights, setNights] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedMeal, setSelectedMeal] = useState("");
  const [showResults, setShowResults] = useState(false);

  // Только UAE и Maldives
  const countries = ["UAE", "Maldives"];

  // Города по странам
  const cityMap: Record<string, string[]> = {
    "UAE": ["Dubai", "Abu Dhabi", "Sharjah", "Fujairah"],
    "Maldives": ["Male", "Hulhumale", "Addu City"]
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    
    if (!token) {
      window.location.href = "/login";
      return;
    }
    
    if (role !== "Agent" && role !== "agent") {
      alert("⛔ Доступ запрещен! Только для агентов.");
      window.location.href = "/";
      return;
    }
    
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
    
    loadContracts();
  }, []);

  // Загрузка контрактов (имитация данных из БД)
  const loadContracts = () => {
    setLoading(true);
    setTimeout(() => {
      const contractData: Contract[] = [
        // ===== UAE - DUBAI =====
        { id: 1, hotelId: 1, hotelName: "Burj Al Arab", city: "Dubai", country: "UAE", roomType: "Deluxe Suite", mealPlan: "BB", price: 800, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 2, hotelId: 1, hotelName: "Burj Al Arab", city: "Dubai", country: "UAE", roomType: "Deluxe Suite", mealPlan: "HB", price: 900, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 3, hotelId: 1, hotelName: "Burj Al Arab", city: "Dubai", country: "UAE", roomType: "Deluxe Suite", mealPlan: "FB", price: 1050, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 4, hotelId: 1, hotelName: "Burj Al Arab", city: "Dubai", country: "UAE", roomType: "Deluxe Suite", mealPlan: "AI", price: 1200, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== UAE - DUBAI =====
        { id: 5, hotelId: 2, hotelName: "Atlantis The Palm", city: "Dubai", country: "UAE", roomType: "Ocean View", mealPlan: "BB", price: 600, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 6, hotelId: 2, hotelName: "Atlantis The Palm", city: "Dubai", country: "UAE", roomType: "Ocean View", mealPlan: "HB", price: 700, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 7, hotelId: 2, hotelName: "Atlantis The Palm", city: "Dubai", country: "UAE", roomType: "Ocean View", mealPlan: "FB", price: 820, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== UAE - DUBAI =====
        { id: 8, hotelId: 3, hotelName: "Jumeirah Beach Hotel", city: "Dubai", country: "UAE", roomType: "Standard", mealPlan: "BB", price: 450, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 9, hotelId: 3, hotelName: "Jumeirah Beach Hotel", city: "Dubai", country: "UAE", roomType: "Standard", mealPlan: "HB", price: 530, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== UAE - ABU DHABI =====
        { id: 10, hotelId: 4, hotelName: "Emirates Palace", city: "Abu Dhabi", country: "UAE", roomType: "Royal Suite", mealPlan: "BB", price: 700, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 11, hotelId: 4, hotelName: "Emirates Palace", city: "Abu Dhabi", country: "UAE", roomType: "Royal Suite", mealPlan: "HB", price: 800, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 12, hotelId: 4, hotelName: "Emirates Palace", city: "Abu Dhabi", country: "UAE", roomType: "Royal Suite", mealPlan: "FB", price: 950, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== MALDIVES =====
        { id: 13, hotelId: 5, hotelName: "Soneva Jani", city: "Male", country: "Maldives", roomType: "Water Villa", mealPlan: "BB", price: 1200, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 14, hotelId: 5, hotelName: "Soneva Jani", city: "Male", country: "Maldives", roomType: "Water Villa", mealPlan: "HB", price: 1400, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 15, hotelId: 5, hotelName: "Soneva Jani", city: "Male", country: "Maldives", roomType: "Water Villa", mealPlan: "FB", price: 1600, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 16, hotelId: 5, hotelName: "Soneva Jani", city: "Male", country: "Maldives", roomType: "Water Villa", mealPlan: "AI", price: 1800, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== MALDIVES =====
        { id: 17, hotelId: 6, hotelName: "Conrad Maldives", city: "Male", country: "Maldives", roomType: "Beach Villa", mealPlan: "HB", price: 900, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 18, hotelId: 6, hotelName: "Conrad Maldives", city: "Male", country: "Maldives", roomType: "Beach Villa", mealPlan: "FB", price: 1050, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        // ===== MALDIVES =====
        { id: 19, hotelId: 7, hotelName: "Gili Lankanfushi", city: "Male", country: "Maldives", roomType: "Villa Suite", mealPlan: "BB", price: 850, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
        { id: 20, hotelId: 7, hotelName: "Gili Lankanfushi", city: "Male", country: "Maldives", roomType: "Villa Suite", mealPlan: "HB", price: 980, currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", available: true },
      ];

      // Группируем по отелям
      const hotelMap: Record<string, Hotel> = {};
      contractData.forEach(c => {
        if (!hotelMap[c.hotelName]) {
          hotelMap[c.hotelName] = {
            id: c.hotelId,
            name: c.hotelName,
            city: c.city,
            country: c.country,
            rating: 4.5 + Math.random() * 0.5,
            image: "🏨",
            contracts: []
          };
        }
        hotelMap[c.hotelName].contracts.push(c);
      });

      const hotelsList = Object.values(hotelMap);
      setHotels(hotelsList);
      setFilteredHotels(hotelsList);
      setLoading(false);
    }, 500);
  };

  // Обновление городов при смене страны
  useEffect(() => {
    if (selectedCountry && cityMap[selectedCountry]) {
      setCities(cityMap[selectedCountry]);
      setSelectedCity("");
    }
  }, [selectedCountry]);

  const handleSearch = () => {
    let results = hotels;
    
    // Фильтр по стране
    if (selectedCountry) {
      results = results.filter(h => h.country === selectedCountry);
    }
    
    // Фильтр по городу
    if (selectedCity) {
      results = results.filter(h => h.city === selectedCity);
    }
    
    // Фильтр по питанию
    if (selectedMeal) {
      results = results.map(hotel => ({
        ...hotel,
        contracts: hotel.contracts.filter(c => c.mealPlan === selectedMeal)
      })).filter(hotel => hotel.contracts.length > 0);
    }
    
    setFilteredHotels(results);
    setShowResults(true);
  };

  const handleSelectHotel = (hotel: Hotel) => {
    setSelectedHotel(hotel);
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🏨 DMC OS</h1>
          <p style={styles.welcome}>Добро пожаловать, {user?.name || "Агент"}!</p>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>
          🚪 Выйти
        </button>
      </div>

      {/* Поиск */}
      <div style={styles.searchSection}>
        <h2 style={styles.searchTitle}>🔍 Поиск отелей</h2>
        
        <div style={styles.filtersRow}>
          <div style={styles.filterGroup}>
            <label>Страна</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={styles.filterSelect}
            >
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label>Город</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={styles.filterSelect}
              disabled={!selectedCountry}
            >
              <option value="">Все города</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label>Заезд</label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              style={styles.filterInput}
            />
          </div>
          <div style={styles.filterGroup}>
            <label>Ночей</label>
            <input
              type="number"
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
              min={1}
              style={styles.filterInput}
            />
          </div>
          <div style={styles.filterGroup}>
            <label>Выезд</label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              style={styles.filterInput}
            />
          </div>
        </div>

        <div style={styles.filtersRow}>
          <div style={styles.filterGroup}>
            <label>Питание</label>
            <select
              value={selectedMeal}
              onChange={(e) => setSelectedMeal(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">Все</option>
              <option value="BB">BB</option>
              <option value="HB">HB</option>
              <option value="FB">FB</option>
              <option value="AI">AI</option>
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label>Взрослые</label>
            <input
              type="number"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              min={1}
              max={10}
              style={styles.filterInput}
            />
          </div>
          <div style={styles.filterGroup}>
            <label>Дети</label>
            <input
              type="number"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              min={0}
              max={10}
              style={styles.filterInput}
            />
          </div>
        </div>

        <button onClick={handleSearch} style={styles.searchButton}>
          🔍 Найти
        </button>
      </div>

      {/* Результаты */}
      {showResults && (
        <div style={styles.resultsSection}>
          <h2>🏨 {filteredHotels.length} отелей найдено</h2>
          <div style={styles.hotelGrid}>
            {filteredHotels.map((hotel) => (
              <div
                key={hotel.id}
                style={{
                  ...styles.hotelCard,
                  border: selectedHotel?.id === hotel.id ? "3px solid #007bff" : "1px solid #e0e0e0",
                }}
                onClick={() => handleSelectHotel(hotel)}
              >
                <div style={styles.hotelImage}>
                  <span style={styles.hotelEmoji}>{hotel.image}</span>
                  <div style={styles.starsDisplay}>
                    {"★".repeat(Math.floor(hotel.rating))}
                  </div>
                </div>
                <div style={styles.hotelInfo}>
                  <h3 style={styles.hotelName}>{hotel.name}</h3>
                  <p style={styles.hotelLocation}>📍 {hotel.city}, {hotel.country}</p>
                  <p style={styles.hotelRating}>⭐ {hotel.rating.toFixed(1)} / 5.0</p>
                  
                  <div style={styles.contractsSection}>
                    <h4>📋 Контракты:</h4>
                    {hotel.contracts.map((contract) => (
                      <div key={contract.id} style={styles.contractItem}>
                        <span style={styles.roomType}>{contract.roomType}</span>
                        <span style={styles.mealPlan}>{contract.mealPlan}</span>
                        <span style={styles.contractPrice}>
                          ${contract.price} {contract.currency}
                        </span>
                        <span style={contract.available ? styles.available : styles.unavailable}>
                          {contract.available ? "✅" : "❌"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "2px solid #e0e0e0",
    paddingBottom: "15px",
    marginBottom: "20px",
  },
  title: {
    fontSize: "28px",
    color: "#1a1a2e",
    margin: 0,
  },
  welcome: {
    fontSize: "14px",
    color: "#666",
    margin: "5px 0 0",
  },
  logoutButton: {
    padding: "8px 20px",
    background: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
  },
  searchSection: {
    background: "#f8f9fa",
    padding: "24px",
    borderRadius: "12px",
    marginBottom: "24px",
    border: "1px solid #e0e0e0",
  },
  searchTitle: {
    fontSize: "20px",
    marginBottom: "20px",
    color: "#1a1a2e",
  },
  filtersRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "15px",
    marginBottom: "15px",
    alignItems: "flex-end",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: "1",
    minWidth: "120px",
  },
  filterInput: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
  },
  filterSelect: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    fontSize: "14px",
    background: "white",
  },
  searchButton: {
    width: "100%",
    padding: "14px",
    background: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "18px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  resultsSection: {
    marginTop: "20px",
  },
  hotelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
    gap: "20px",
  },
  hotelCard: {
    background: "white",
    borderRadius: "12px",
    border: "1px solid #e0e0e0",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    cursor: "pointer",
    transition: "all 0.3s",
  },
  hotelImage: {
    background: "#f0f0f0",
    padding: "20px",
    textAlign: "center",
    position: "relative",
  },
  hotelEmoji: {
    fontSize: "48px",
  },
  starsDisplay: {
    position: "absolute",
    top: "10px",
    right: "10px",
    fontSize: "14px",
    color: "#ffc107",
  },
  hotelInfo: {
    padding: "16px",
  },
  hotelName: {
    fontSize: "18px",
    margin: "0 0 4px",
    color: "#1a1a2e",
  },
  hotelLocation: {
    fontSize: "13px",
    color: "#666",
    margin: "0 0 4px",
  },
  hotelRating: {
    fontSize: "14px",
    color: "#ffc107",
    margin: "0 0 8px",
  },
  contractsSection: {
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid #e0e0e0",
  },
  contractItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: "13px",
  },
  roomType: {
    fontWeight: "bold",
    color: "#1a1a2e",
  },
  mealPlan: {
    background: "#e9ecef",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "11px",
  },
  contractPrice: {
    fontWeight: "bold",
    color: "#007bff",
  },
  available: {
    color: "#28a745",
  },
  unavailable: {
    color: "#dc3545",
  },
};

export default AgentDashboard;