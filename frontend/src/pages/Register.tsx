import { useState } from 'react';
import axios from 'axios';
import { API_URL } from "../config";  // ← ДОБАВЛЕНО!

// Список стран с кодами
const COUNTRIES = [
  { name: "Tajikistan", code: "+992", flag: "🇹🇯" },
  { name: "Uzbekistan", code: "+998", flag: "🇺🇿" },
  { name: "Kazakhstan", code: "+7", flag: "🇰🇿" },
  { name: "Kyrgyzstan", code: "+996", flag: "🇰🇬" },
  { name: "Russia", code: "+7", flag: "🇷🇺" },
  { name: "Turkey", code: "+90", flag: "🇹🇷" },
  { name: "UAE", code: "+971", flag: "🇦🇪" },
  { name: "USA", code: "+1", flag: "🇺🇸" },
];

const Register = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    whatsapp: '',
    company_name: '',
    legal_company_name: '',
    country: 'Tajikistan',
    city: '',
    address: '',
    number_of_employees: 0,
    annual_revenue: 0,
    main_markets: '',
    terms_accepted: false,
    contact_person: '',
    preferred_currency: 'USD',
    preferred_language: 'English',
    market: 'Tourism'
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applicationId, setApplicationId] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Автоматическая установка кода страны
  const handleCountryChange = (country: string) => {
    const selected = COUNTRIES.find(c => c.name === country);
    if (selected) {
      const currentPhone = formData.phone.replace(/^\+?\d*\s*/, '');
      const currentWhatsapp = formData.whatsapp.replace(/^\+?\d*\s*/, '');
      
      setFormData({
        ...formData,
        country: country,
        phone: currentPhone ? selected.code + ' ' + currentPhone : '',
        whatsapp: formData.whatsapp ? selected.code + ' ' + currentWhatsapp : '',
      });
    }
  };

  // Валидация всех полей с понятными сообщениями
  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      errors.email = '❌ Введите корректный email (например: agent@company.com)';
    }

    // Телефон - понятная проверка
    const cleanPhone = formData.phone.replace(/\s/g, '');
    const phoneRegex = /^\+?\d{10,15}$/;
    
    if (formData.phone.length === 0) {
      errors.phone = '❌ Поле "Телефон" обязательно для заполнения';
    } else if (cleanPhone.length < 10) {
      errors.phone = `❌ Номер телефона должен содержать минимум 10 цифр (сейчас ${cleanPhone.length})`;
    } else if (!phoneRegex.test(cleanPhone)) {
      errors.phone = '❌ Номер телефона должен содержать только цифры и знак "+" (например: +992901234567)';
    }

    // Полное имя
    if (!/^[a-zA-Zа-яА-Я\s]{2,50}$/.test(formData.full_name)) {
      errors.full_name = '❌ Введите полное имя (только буквы, от 2 до 50 символов)';
    }

    // Название компании
    if (formData.company_name.length < 2) {
      errors.company_name = '❌ Введите название компании (минимум 2 символа)';
    }

    // Юридическое название
    if (formData.legal_company_name.length < 2) {
      errors.legal_company_name = '❌ Введите юридическое название (минимум 2 символа)';
    }

    // Контактное лицо
    if (formData.contact_person.length < 2) {
      errors.contact_person = '❌ Введите контактное лицо (минимум 2 символа)';
    }

    // Страна
    if (!formData.country) {
      errors.country = '❌ Выберите страну';
    }

    // Город
    if (formData.city.length < 2) {
      errors.city = '❌ Введите город (минимум 2 символа)';
    }

    // Адрес
    if (formData.address.length < 5) {
      errors.address = '❌ Введите адрес (минимум 5 символов)';
    }

    // Условия
    if (!formData.terms_accepted) {
      errors.terms_accepted = '❌ Необходимо принять условия';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === 'country') {
      handleCountryChange(value);
      return;
    }

    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!validateForm()) {
      setStatus('error');
      return;
    }

    setStatus('loading');

    try {
      const response = await axios.post(
        `${API_URL}/agent-registration`,  // ← ИЗМЕНЕНО!
        formData
      );
      setStatus('success');
      setApplicationId(response.data.application_id || response.data.id);
    } catch (err: any) {
      setStatus('error');
      const errorMessage = err.response?.data?.detail || err.message || 'Registration failed';
      setError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      console.error('Registration error:', err);
    }
  };

  if (status === 'success') {
    return (
      <div style={styles.successContainer}>
        <div style={styles.successCard}>
          <div style={styles.successIcon}>✅</div>
          <h1>Регистрация успешна!</h1>
          <p>Ваша заявка принята в обработку.</p>
          <p style={styles.appId}>
            <strong>Application ID:</strong> {applicationId}
          </p>
          <p style={styles.info}>
            Мы отправили подтверждение на вашу почту.<br />
            Наша команда рассмотрит заявку в течение 24-48 часов.
          </p>
          <button onClick={() => window.location.href = '/'} style={styles.button}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>📝 Регистрация агента</h1>
      <p style={styles.subtitle}>Заполните все поля для регистрации в DMC OS</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Личные данные */}
        <div style={styles.section}>
          <h3>Личные данные</h3>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Полное имя *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Иван Иванов"
                style={{ ...styles.input, borderColor: fieldErrors.full_name ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.full_name && <span style={styles.errorText}>{fieldErrors.full_name}</span>}
            </div>
            <div style={styles.field}>
              <label>Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="agent@company.com"
                style={{ ...styles.input, borderColor: fieldErrors.email ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.email && <span style={styles.errorText}>{fieldErrors.email}</span>}
            </div>
          </div>
        </div>

        {/* Адрес */}
        <div style={styles.section}>
          <h3>Адрес</h3>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Страна *</label>
              <select
                name="country"
                value={formData.country}
                onChange={handleChange}
                style={{ ...styles.input, borderColor: fieldErrors.country ? '#dc3545' : '#ddd' }}
                required
              >
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.flag} {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {fieldErrors.country && <span style={styles.errorText}>{fieldErrors.country}</span>}
            </div>
            <div style={styles.field}>
              <label>Город *</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Душанбе"
                style={{ ...styles.input, borderColor: fieldErrors.city ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.city && <span style={styles.errorText}>{fieldErrors.city}</span>}
            </div>
          </div>
          <div style={styles.field}>
            <label>Адрес *</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="ул. Ленина 123"
              style={{ ...styles.input, borderColor: fieldErrors.address ? '#dc3545' : '#ddd' }}
              required
            />
            {fieldErrors.address && <span style={styles.errorText}>{fieldErrors.address}</span>}
          </div>
        </div>

        {/* Контактные данные */}
        <div style={styles.section}>
          <h3>Контактные данные</h3>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Телефон *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+992901234567"
                style={{ ...styles.input, borderColor: fieldErrors.phone ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.phone && <span style={styles.errorText}>{fieldErrors.phone}</span>}
              {!fieldErrors.phone && formData.phone && (
                <span style={styles.hint}>✅ Номер принят</span>
              )}
              <span style={styles.hint}>📌 Пример: +992901234567 (минимум 10 цифр)</span>
            </div>
            <div style={styles.field}>
              <label>WhatsApp</label>
              <input
                type="tel"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                placeholder="+992901234567"
                style={{ ...styles.input, borderColor: fieldErrors.whatsapp ? '#dc3545' : '#ddd' }}
              />
              {fieldErrors.whatsapp && <span style={styles.errorText}>{fieldErrors.whatsapp}</span>}
            </div>
          </div>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Контактное лицо *</label>
              <input
                type="text"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleChange}
                placeholder="Иван Иванов"
                style={{ ...styles.input, borderColor: fieldErrors.contact_person ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.contact_person && <span style={styles.errorText}>{fieldErrors.contact_person}</span>}
            </div>
            <div style={styles.field}>
              <label>Предпочитаемая валюта</label>
              <select
                name="preferred_currency"
                value={formData.preferred_currency}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
                <option value="TJS">TJS</option>
              </select>
            </div>
          </div>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Предпочитаемый язык</label>
              <select
                name="preferred_language"
                value={formData.preferred_language}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="English">English</option>
                <option value="Russian">Russian</option>
                <option value="Tajik">Tajik</option>
                <option value="Uzbek">Uzbek</option>
              </select>
            </div>
            <div style={styles.field}>
              <label>Рынок</label>
              <select
                name="market"
                value={formData.market}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="Tourism">Tourism</option>
                <option value="Business">Business</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>
          </div>
        </div>

        {/* Данные компании */}
        <div style={styles.section}>
          <h3>Данные компании</h3>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Название компании *</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="Travel Agency LTD"
                style={{ ...styles.input, borderColor: fieldErrors.company_name ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.company_name && <span style={styles.errorText}>{fieldErrors.company_name}</span>}
            </div>
            <div style={styles.field}>
              <label>Юридическое название *</label>
              <input
                type="text"
                name="legal_company_name"
                value={formData.legal_company_name}
                onChange={handleChange}
                placeholder="ООО Travel Agency"
                style={{ ...styles.input, borderColor: fieldErrors.legal_company_name ? '#dc3545' : '#ddd' }}
                required
              />
              {fieldErrors.legal_company_name && <span style={styles.errorText}>{fieldErrors.legal_company_name}</span>}
            </div>
          </div>
          <div style={styles.row}>
            <div style={styles.field}>
              <label>Количество сотрудников</label>
              <input
                type="number"
                name="number_of_employees"
                value={formData.number_of_employees}
                onChange={handleChange}
                style={styles.input}
                min="1"
                placeholder="10"
              />
            </div>
            <div style={styles.field}>
              <label>Годовой доход (USD)</label>
              <input
                type="number"
                name="annual_revenue"
                value={formData.annual_revenue}
                onChange={handleChange}
                style={styles.input}
                min="0"
                placeholder="150000"
              />
            </div>
          </div>
          <div style={styles.field}>
            <label>Основные рынки</label>
            <input
              type="text"
              name="main_markets"
              value={formData.main_markets}
              onChange={handleChange}
              placeholder="Tajikistan, Uzbekistan, Russia"
              style={styles.input}
            />
          </div>
        </div>

        {/* Условия */}
        <div style={styles.field}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              name="terms_accepted"
              checked={formData.terms_accepted}
              onChange={handleChange}
              style={styles.checkbox}
              required
            />
            Я принимаю условия использования *
          </label>
          {fieldErrors.terms_accepted && <span style={styles.errorText}>{fieldErrors.terms_accepted}</span>}
        </div>

        {error && (
          <div style={styles.errorBox}>
            ❌ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          style={{ ...styles.submitButton, opacity: status === 'loading' ? 0.6 : 1 }}
        >
          {status === 'loading' ? 'Отправка...' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '900px',
    margin: '40px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  subtitle: {
    color: '#666',
    marginBottom: '30px',
  },
  form: {
    background: '#f8f9fa',
    padding: '30px',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
  },
  section: {
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e0e0e0',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '15px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '16px',
    transition: 'border 0.3s',
    width: '100%',
    boxSizing: 'border-box',
  },
  checkbox: {
    marginRight: '10px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitButton: {
    width: '100%',
    padding: '16px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '18px',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'opacity 0.3s',
  },
  successContainer: {
    maxWidth: '600px',
    margin: '80px auto',
    padding: '20px',
    textAlign: 'center',
  },
  successCard: {
    background: '#d4edda',
    padding: '40px',
    borderRadius: '12px',
    border: '1px solid #c3e6cb',
  },
  successIcon: {
    fontSize: '48px',
  },
  appId: {
    fontSize: '20px',
    color: '#155724',
    background: 'white',
    padding: '10px',
    borderRadius: '8px',
    display: 'inline-block',
  },
  info: {
    color: '#155724',
    marginTop: '15px',
  },
  button: {
    padding: '12px 30px',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '20px',
    fontSize: '16px',
  },
  errorBox: {
    background: '#f8d7da',
    color: '#721c24',
    padding: '15px',
    borderRadius: '8px',
    margin: '15px 0',
  },
  errorText: {
    color: '#dc3545',
    fontSize: '12px',
    marginTop: '4px',
  },
  hint: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
};

export default Register;