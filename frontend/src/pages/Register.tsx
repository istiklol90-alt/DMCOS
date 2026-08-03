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

const baseInputClass =
  "w-full appearance-none rounded-lg border bg-sand/40 px-4 py-3 text-sm text-slate placeholder:text-slate/40 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30";

const inputClass = (hasError?: string) =>
  `${baseInputClass} ${hasError ? "border-danger" : "border-ink/15"}`;

function CheckIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

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
      errors.email = 'Введите корректный email (например: agent@company.com)';
    }

    // Телефон - понятная проверка
    const cleanPhone = formData.phone.replace(/\s/g, '');
    const phoneRegex = /^\+?\d{10,15}$/;

    if (formData.phone.length === 0) {
      errors.phone = 'Поле "Телефон" обязательно для заполнения';
    } else if (cleanPhone.length < 10) {
      errors.phone = `Номер телефона должен содержать минимум 10 цифр (сейчас ${cleanPhone.length})`;
    } else if (!phoneRegex.test(cleanPhone)) {
      errors.phone = 'Номер телефона должен содержать только цифры и знак "+" (например: +992901234567)';
    }

    // Полное имя
    if (!/^[a-zA-Zа-яА-Я\s]{2,50}$/.test(formData.full_name)) {
      errors.full_name = 'Введите полное имя (только буквы, от 2 до 50 символов)';
    }

    // Название компании
    if (formData.company_name.length < 2) {
      errors.company_name = 'Введите название компании (минимум 2 символа)';
    }

    // Юридическое название
    if (formData.legal_company_name.length < 2) {
      errors.legal_company_name = 'Введите юридическое название (минимум 2 символа)';
    }

    // Контактное лицо
    if (formData.contact_person.length < 2) {
      errors.contact_person = 'Введите контактное лицо (минимум 2 символа)';
    }

    // Страна
    if (!formData.country) {
      errors.country = 'Выберите страну';
    }

    // Город
    if (formData.city.length < 2) {
      errors.city = 'Введите город (минимум 2 символа)';
    }

    // Адрес
    if (formData.address.length < 5) {
      errors.address = 'Введите адрес (минимум 5 символов)';
    }

    // Условия
    if (!formData.terms_accepted) {
      errors.terms_accepted = 'Необходимо принять условия';
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
      <div className="flex min-h-[calc(100vh-78px)] items-center justify-center bg-sand px-5 py-12 font-sans text-slate">
        <div className="w-full max-w-lg rounded-2xl border border-ink/10 bg-white p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckIcon />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Регистрация успешна!</h1>
          <p className="mt-2 text-sm text-slate/70">Ваша заявка принята в обработку.</p>
          <p className="mt-4 inline-block rounded-lg bg-sand px-4 py-2 font-mono text-sm text-ink">
            <span className="font-sans font-semibold">Application ID:</span> {applicationId}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate/60">
            Мы отправили подтверждение на вашу почту.<br />
            Наша команда рассмотрит заявку в течение 24-48 часов.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="mt-6 appearance-none rounded-xl border-0 bg-ink px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl bg-sand px-5 py-10 font-sans text-slate">
      <h1 className="font-display text-3xl font-semibold text-ink">Регистрация агента</h1>
      <p className="mt-2 text-sm text-slate/70">Заполните все поля для регистрации в DMC OS</p>

      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">
        {/* Личные данные */}
        <div className="mb-6 border-b border-ink/10 pb-6">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Личные данные</h3>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Полное имя *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Иван Иванов"
                className={inputClass(fieldErrors.full_name)}
                required
              />
              {fieldErrors.full_name && <span className="text-xs text-danger">{fieldErrors.full_name}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="agent@company.com"
                className={inputClass(fieldErrors.email)}
                required
              />
              {fieldErrors.email && <span className="text-xs text-danger">{fieldErrors.email}</span>}
            </div>
          </div>
        </div>

        {/* Адрес */}
        <div className="mb-6 border-b border-ink/10 pb-6">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Адрес</h3>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Страна *</label>
              <select
                name="country"
                value={formData.country}
                onChange={handleChange}
                className={inputClass(fieldErrors.country)}
                required
              >
                {COUNTRIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              {fieldErrors.country && <span className="text-xs text-danger">{fieldErrors.country}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Город *</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Душанбе"
                className={inputClass(fieldErrors.city)}
                required
              />
              {fieldErrors.city && <span className="text-xs text-danger">{fieldErrors.city}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Адрес *</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="ул. Ленина 123"
              className={inputClass(fieldErrors.address)}
              required
            />
            {fieldErrors.address && <span className="text-xs text-danger">{fieldErrors.address}</span>}
          </div>
        </div>

        {/* Контактные данные */}
        <div className="mb-6 border-b border-ink/10 pb-6">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Контактные данные</h3>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Телефон *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+992901234567"
                className={inputClass(fieldErrors.phone)}
                required
              />
              {fieldErrors.phone && <span className="text-xs text-danger">{fieldErrors.phone}</span>}
              {!fieldErrors.phone && formData.phone && (
                <span className="text-xs text-success">Номер принят</span>
              )}
              <span className="text-xs text-slate/50">Пример: +992901234567 (минимум 10 цифр)</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">WhatsApp</label>
              <input
                type="tel"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                placeholder="+992901234567"
                className={inputClass(fieldErrors.whatsapp)}
              />
              {fieldErrors.whatsapp && <span className="text-xs text-danger">{fieldErrors.whatsapp}</span>}
            </div>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Контактное лицо *</label>
              <input
                type="text"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleChange}
                placeholder="Иван Иванов"
                className={inputClass(fieldErrors.contact_person)}
                required
              />
              {fieldErrors.contact_person && <span className="text-xs text-danger">{fieldErrors.contact_person}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Предпочитаемая валюта</label>
              <select
                name="preferred_currency"
                value={formData.preferred_currency}
                onChange={handleChange}
                className={inputClass()}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="RUB">RUB</option>
                <option value="TJS">TJS</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Предпочитаемый язык</label>
              <select
                name="preferred_language"
                value={formData.preferred_language}
                onChange={handleChange}
                className={inputClass()}
              >
                <option value="English">English</option>
                <option value="Russian">Russian</option>
                <option value="Tajik">Tajik</option>
                <option value="Uzbek">Uzbek</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Рынок</label>
              <select
                name="market"
                value={formData.market}
                onChange={handleChange}
                className={inputClass()}
              >
                <option value="Tourism">Tourism</option>
                <option value="Business">Business</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>
          </div>
        </div>

        {/* Данные компании */}
        <div className="mb-6 border-b border-ink/10 pb-6">
          <h3 className="mb-4 font-display text-lg font-semibold text-ink">Данные компании</h3>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Название компании *</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                placeholder="Travel Agency LTD"
                className={inputClass(fieldErrors.company_name)}
                required
              />
              {fieldErrors.company_name && <span className="text-xs text-danger">{fieldErrors.company_name}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Юридическое название *</label>
              <input
                type="text"
                name="legal_company_name"
                value={formData.legal_company_name}
                onChange={handleChange}
                placeholder="ООО Travel Agency"
                className={inputClass(fieldErrors.legal_company_name)}
                required
              />
              {fieldErrors.legal_company_name && <span className="text-xs text-danger">{fieldErrors.legal_company_name}</span>}
            </div>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Количество сотрудников</label>
              <input
                type="number"
                name="number_of_employees"
                value={formData.number_of_employees}
                onChange={handleChange}
                className={inputClass()}
                min="1"
                placeholder="10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink">Годовой доход (USD)</label>
              <input
                type="number"
                name="annual_revenue"
                value={formData.annual_revenue}
                onChange={handleChange}
                className={inputClass()}
                min="0"
                placeholder="150000"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink">Основные рынки</label>
            <input
              type="text"
              name="main_markets"
              value={formData.main_markets}
              onChange={handleChange}
              placeholder="Tajikistan, Uzbekistan, Russia"
              className={inputClass()}
            />
          </div>
        </div>

        {/* Условия */}
        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate/80">
            <input
              type="checkbox"
              name="terms_accepted"
              checked={formData.terms_accepted}
              onChange={handleChange}
              className="accent-gold"
              required
            />
            Я принимаю условия использования *
          </label>
          {fieldErrors.terms_accepted && <span className="text-xs text-danger">{fieldErrors.terms_accepted}</span>}
        </div>

        {error && (
          <div className="my-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="mt-6 w-full appearance-none rounded-xl border-0 bg-ink py-4 text-base font-semibold text-white shadow-sm shadow-ink/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {status === 'loading' ? 'Отправка...' : 'Зарегистрироваться'}
        </button>
      </form>
    </div>
  );
};

export default Register;
