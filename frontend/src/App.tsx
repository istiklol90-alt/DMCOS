import { useState } from "react";
import "./App.css";

type Page = "home" | "register";

function App() {
  const [page, setPage] = useState<Page>("home");

  return (
    <div className="page">
      <header className="header">
        <div className="logo" onClick={() => setPage("home")}>
          DMC OS
        </div>

        <nav>
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("register")}>
            Partner Registration
          </button>
          <button>Agent Login</button>
          <button>Admin Login</button>
        </nav>
      </header>

      {page === "home" ? <Home setPage={setPage} /> : <Register />}
    </div>
  );
}

function Home({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <main className="hero">
      <div className="heroText">
        <p className="tag">DMC Operating System</p>
        <h1>One platform for agents, hotels, contracts, rates and bookings.</h1>

        <p className="subtitle">
          DMC OS helps manage partner registration, hotel contracts, prices,
          booking requests, payments and future AI automation.
        </p>

        <div className="buttons">
          <button className="primary" onClick={() => setPage("register")}>
            Register as Partner
          </button>
          <button className="secondary">Agent Login</button>
          <button className="secondary">Admin Login</button>
        </div>
      </div>
    </main>
  );
}

function Register() {
  const [message, setMessage] = useState("");

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    alert("Submit clicked");
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const data = {
      company_name: form.get("company_name"),
      legal_company_name: form.get("legal_company_name"),
      country: form.get("country"),
      city: form.get("city"),
      contact_person: form.get("contact_person"),
      email: form.get("email"),
      phone: form.get("phone"),
      whatsapp: form.get("whatsapp"),
      website: form.get("website"),
      preferred_currency: form.get("preferred_currency"),
      preferred_language: form.get("preferred_language"),
      market: form.get("market"),
      notes: form.get("notes"),
    };

    alert("Before fetch");

    try {
      const response = await fetch("http://127.0.0.1:8000/agent-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      alert("After fetch: " + response.status);

      if (response.ok) {
        setMessage("Application submitted successfully. Status: Pending.");
        event.currentTarget.reset();
      } else {
        setMessage("Error status: " + response.status);
      }
    } catch (error) {
      alert("Fetch error: " + error);
      setMessage("Fetch error. Backend connection failed.");
    }
  }

  return (
    <main className="formPage">
      <div className="formCard">
        <p className="tag">Partner Registration</p>
        <h1>Register your agency</h1>

        <form className="form" onSubmit={submitApplication}>
          <input name="company_name" placeholder="Company Name" required />
          <input
            name="legal_company_name"
            placeholder="Legal Company Name"
            required
          />
          <input name="country" placeholder="Country" required />
          <input name="city" placeholder="City" required />
          <input name="contact_person" placeholder="Contact Person" required />
          <input name="email" placeholder="Email" required />
          <input name="phone" placeholder="Phone" required />
          <input name="whatsapp" placeholder="WhatsApp" required />
          <input name="website" placeholder="Website" />
          <input
            name="preferred_currency"
            placeholder="Preferred Currency"
            required
          />
          <input
            name="preferred_language"
            placeholder="Preferred Language"
            required
          />
          <input name="market" placeholder="Market" required />
          <textarea name="notes" placeholder="Notes" />

          <button className="primary" type="submit">
            Submit Application
          </button>
        </form>

        {message && <p className="successMessage">{message}</p>}
      </div>
    </main>
  );
}

export default App;