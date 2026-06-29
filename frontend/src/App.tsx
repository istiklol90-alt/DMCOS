import { useState } from "react";
import "./App.css";

type Page = "home" | "register";

const countries = [
  { name: "Tajikistan", code: "+992" },
  { name: "Uzbekistan", code: "+998" },
  { name: "Kazakhstan", code: "+7" },
  { name: "Russia", code: "+7" },
  { name: "Kyrgyzstan", code: "+996" },
  { name: "Azerbaijan", code: "+994" },
  { name: "UAE", code: "+971" },
  { name: "Maldives", code: "+960" },
  { name: "Turkey", code: "+90" },
  { name: "India", code: "+91" },
  { name: "Other", code: "" },
];

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
          <button onClick={() => setPage("register")}>Partner Registration</button>
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
    <main className="homePage">
      <section className="heroSection">
        <div className="heroLeft">
          <p className="tag">DMC OPERATING SYSTEM</p>

          <h1>
            One platform to manage agents, hotels, contracts, rates and bookings.
          </h1>

          <p className="subtitle">
            DMC OS helps tour operators manage partner registration, hotel
            contracts, rates, booking requests, payments and future AI automation.
          </p>

          <div className="buttons">
            <button className="primary" onClick={() => setPage("register")}>
              Register as Partner
            </button>
            <button className="secondary">Agent Login</button>
            <button className="secondary">Admin Login</button>
          </div>
        </div>

        <div className="heroCard">
          <h3>System Status</h3>

          <div className="statusRow">
            <span>Backend API</span>
            <b>Ready</b>
          </div>

          <div className="statusRow">
            <span>Agent Registration</span>
            <b>Working</b>
          </div>

          <div className="statusRow">
            <span>AI Automation</span>
            <b>Future Module</b>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="featureCard">
          <h3>Agent Registration</h3>
          <p>Collect partner details and save applications with pending status.</p>
        </div>

        <div className="featureCard">
          <h3>Hotel Contracts</h3>
          <p>Future module for rates, offers, contracts and hotel conditions.</p>
        </div>

        <div className="featureCard">
          <h3>Booking Requests</h3>
          <p>Manage agent requests, confirmations, payments and operations.</p>
        </div>

        <div className="featureCard">
          <h3>AI Assistant</h3>
          <p>Future AI will read contracts, emails and help automate decisions.</p>
        </div>
      </section>
    </main>
  );
}

function Register() {
  const [message, setMessage] = useState("");
  const [country, setCountry] = useState("Tajikistan");

  const selectedCountry = countries.find((item) => item.name === country);
  const phoneCode = selectedCountry?.code || "";

  function hasLetter(value: FormDataEntryValue | null) {
    return /[a-zA-Zа-яА-Я]/.test(String(value || ""));
  }

  function onlyDigits(value: FormDataEntryValue | null) {
    return String(value || "").replace(/\D/g, "");
  }

  async function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const phoneDigits = onlyDigits(form.get("phone"));
    const whatsappDigits = onlyDigits(form.get("whatsapp"));

    if (!hasLetter(form.get("company_name"))) {
      setMessage("Company name is not valid.");
      return;
    }

    if (!hasLetter(form.get("legal_company_name"))) {
      setMessage("Legal company name is not valid.");
      return;
    }

    if (!hasLetter(form.get("city"))) {
      setMessage("City is not valid.");
      return;
    }

    if (!hasLetter(form.get("contact_person"))) {
      setMessage("Contact person is not valid.");
      return;
    }

    if (phoneDigits.length < 6) {
      setMessage("Phone number is not valid. Use numbers only.");
      return;
    }

    if (whatsappDigits.length < 6) {
      setMessage("WhatsApp number is not valid. Use numbers only.");
      return;
    }

    const data = {
      company_name: form.get("company_name"),
      legal_company_name: form.get("legal_company_name"),
      country: country,
      city: form.get("city"),
      contact_person: form.get("contact_person"),
      email: form.get("email"),
      phone: `${phoneCode}${phoneDigits}`,
      whatsapp: `${phoneCode}${whatsappDigits}`,
      website: form.get("website"),
      preferred_currency: form.get("preferred_currency"),
      preferred_language: form.get("preferred_language"),
      market: form.get("market"),
      notes: form.get("notes"),
    };

    try {
      const response = await fetch("http://127.0.0.1:8000/agent-registration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setMessage("Application submitted successfully. Status: Pending.");
        formElement.reset();
        setCountry("Tajikistan");
      } else if (response.status === 500) {
        setMessage("This email may already be registered. Try another email.");
      } else {
        setMessage("Error status: " + response.status);
      }
    } catch {
      setMessage("Backend connection failed. Please make sure backend is running.");
    }
  }

  return (
    <main className="formPage">
      <div className="formCard">
        <p className="tag">Partner Registration</p>
        <h1>Register your agency</h1>

        <form className="form" onSubmit={submitApplication}>
          <div className="field">
            <label>Company Name</label>
            <input name="company_name" placeholder="Example: Rustar Travel" required />
          </div>

          <div className="field">
            <label>Legal Company Name</label>
            <input name="legal_company_name" placeholder="Example: Rustar Travel LLC" required />
          </div>

          <div className="field">
            <label>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} {item.code}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>City</label>
            <input name="city" placeholder="Example: Dushanbe" required />
          </div>

          <div className="field">
            <label>Contact Person</label>
            <input name="contact_person" placeholder="Example: Daler Rajabov" required />
          </div>

          <div className="field">
            <label>Email</label>
            <input name="email" type="email" placeholder="example@company.com" required />
          </div>

          <div className="field">
            <label>Phone Number</label>
            <div className="phoneRow">
              <input className="phoneCode" value={phoneCode} readOnly />
              <input name="phone" placeholder="Only numbers" required />
            </div>
          </div>

          <div className="field">
            <label>WhatsApp Number</label>
            <div className="phoneRow">
              <input className="phoneCode" value={phoneCode} readOnly />
              <input name="whatsapp" placeholder="Only numbers" required />
            </div>
          </div>

          <div className="field">
            <label>Website</label>
            <input name="website" placeholder="https://company.com" />
          </div>

          <div className="field">
            <label>Preferred Currency</label>
            <select name="preferred_currency" required>
              <option value="">Select currency</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="TJS">TJS</option>
              <option value="UZS">UZS</option>
              <option value="KZT">KZT</option>
            </select>
          </div>

          <div className="field">
            <label>Preferred Language</label>
            <select name="preferred_language" required>
              <option value="">Select language</option>
              <option value="English">English</option>
              <option value="Russian">Russian</option>
            </select>
          </div>

          <div className="field">
            <label>Market</label>
            <input name="market" placeholder="Example: CIS / Tajikistan / Uzbekistan" required />
          </div>

          <div className="field fullWidth">
            <label>Notes</label>
            <textarea name="notes" placeholder="Additional information" />
          </div>

          <button className="primary fullWidth" type="submit">
            Submit Application
          </button>
        </form>

        {message && <p className="successMessage">{message}</p>}
      </div>
    </main>
  );
}

export default App;