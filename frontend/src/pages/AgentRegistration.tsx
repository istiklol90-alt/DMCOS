import React, { useState } from 'react';
import axios from 'axios';

const AgentRegistration = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_registration: '',
    tax_number: '',
    country: '',
    city: '',
    address: '',
    years_in_business: 0,
    number_of_employees: 1,
    annual_revenue: 0,
    main_markets: '',
    terms_accepted: true
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applicationId, setApplicationId] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError('');

    try {
      const response = await axios.post('http://localhost:8000/api/agents/register', formData);
      
      if (response.status === 200) {
        setStatus('success');
        setApplicationId(response.data.application_id);
        console.log('✅ Registration successful!', response.data);
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.response?.data?.detail || 'Registration failed');
      console.error('❌ Registration error:', err);
    }
  };

  if (status === 'success') {
    return (
      <div style={styles.successContainer}>
        <h1>✅ Registration Successful!</h1>
        <div style={styles.card}>
          <p><strong>Application ID:</strong></p>
          <p style={styles.appId}>{applicationId}</p>
          <p style={styles.info}>We will review your application within 24-48 hours.</p>
          <p style={styles.info}>Check your email for confirmation.</p>
          <button 
            onClick={() => window.location.href = '/'}
            style={styles.button}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1>📝 Agent Registration</h1>
      <p>Register to become a DMC OS partner</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div style={styles.field}>
            <label>Full Name *</label>
            <input
              type="text"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label>Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label>Phone *</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label>Company Name *</label>
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.row}>
          <div style={styles.field}>
            <label>Country *</label>
            <input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label>City *</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              required
              style={styles.input}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label>Address *</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            required
            style={styles.input}
          />
        </div>

        <button 
          type="submit" 
          disabled={status === 'loading'}
          style={styles.submitButton}
        >
          {status === 'loading' ? 'Submitting...' : 'Register'}
        </button>

        {status === 'error' && (
          <div style={styles.errorBox}>
            ❌ {error}
          </div>
        )}
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '800px',
    margin: '50px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  form: {
    background: '#f5f5f5',
    padding: '30px',
    borderRadius: '10px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
  },
  submitButton: {
    width: '100%',
    padding: '15px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontSize: '18px',
    cursor: 'pointer',
    marginTop: '20px',
  },
  successContainer: {
    maxWidth: '600px',
    margin: '50px auto',
    padding: '20px',
    textAlign: 'center',
    fontFamily: 'Arial, sans-serif',
  },
  card: {
    background: '#d4edda',
    padding: '30px',
    borderRadius: '10px',
    border: '1px solid #c3e6cb',
  },
  appId: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#155724',
    background: 'white',
    padding: '10px',
    borderRadius: '5px',
  },
  info: {
    color: '#155724',
    marginTop: '10px',
  },
  button: {
    padding: '10px 30px',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    marginTop: '20px',
  },
  errorBox: {
    background: '#f8d7da',
    color: '#721c24',
    padding: '15px',
    borderRadius: '5px',
    marginTop: '20px',
  },
};

export default AgentRegistration;