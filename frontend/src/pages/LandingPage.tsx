import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    business_type: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!formData.name.trim() || !formData.email.trim() || !formData.company.trim()) {
      setSubmitError('Please fill in all required fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setSubmitError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/register-interest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitSuccess(true);
        setFormData({
          name: '',
          email: '',
          company: '',
          phone: '',
          business_type: '',
          message: ''
        });
      } else {
        setSubmitError('Unable to submit form. Please try again.');
      }
    } catch (err) {
      setSubmitError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToForm = () => {
    const formSection = document.getElementById('register-form');
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-icon">≋</span>
            <span className="logo-text">Nigzsu</span>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#solution">Solution</a>
            <button onClick={() => navigate('/login')} className="nav-login-btn">
              Login
            </button>
            <button onClick={scrollToForm} className="nav-cta-btn">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Transform Your CCTV Footage<br />
            Into <span className="highlight">Instant Business Insights</span>
          </h1>
          <p className="hero-subtitle">
            Your cameras capture everything. Now learn from it.<br />
            Frictionless visual intelligence for busy SMB owners — free, instant, and effortless.
          </p>
          <button onClick={scrollToForm} className="hero-cta-btn">
            Get Started Free
            <span className="btn-arrow">→</span>
          </button>
        </div>
        <div className="hero-visual">
          <div className="visual-grid">
            <div className="visual-card"></div>
            <div className="visual-card"></div>
            <div className="visual-card"></div>
            <div className="visual-card"></div>
          </div>
        </div>
      </section>

      <section className="problem-section">
        <div className="section-container">
          <h2 className="section-title">The Overlooked Opportunity</h2>
          <p className="section-description">
            Most businesses already have CCTV systems installed—but they're only using them for security. 
            The rich operational data your cameras capture every day goes completely unused.
          </p>
          <div className="problem-stats">
            <div className="stat-card">
              <div className="stat-number">68%</div>
              <div className="stat-label">of CCTV footage goes strategically unused</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">0</div>
              <div className="stat-label">time or budget for complex analytics</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">100%</div>
              <div className="stat-label">free to integrate and use</div>
            </div>
          </div>
        </div>
      </section>

      <section id="solution" className="solution-section">
        <div className="section-container">
          <h2 className="section-title">Meet Nigzsu</h2>
          <p className="section-description">
            We transform raw CCTV footage into clear, actionable intelligence—without the hassle, 
            technical complexity, or cost.
          </p>
          <div className="solution-cards">
            <div className="solution-card">
              <div className="card-icon">⚡</div>
              <h3>Instant Clarity</h3>
              <p>Real-time processing delivers insights immediately—no waiting, no complexity.</p>
            </div>
            <div className="solution-card">
              <div className="card-icon">🔌</div>
              <h3>Effortless Integration</h3>
              <p>Secure API connects to your existing CCTV system. Zero setup costs, zero disruption.</p>
            </div>
            <div className="solution-card">
              <div className="card-icon">📊</div>
              <h3>Customizable Dashboard</h3>
              <p>Intuitive interface tailored to your business needs—no technical expertise required.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="section-container">
          <h2 className="section-title">Built For Busy Business Owners</h2>
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon">✓</div>
              <div className="feature-content">
                <h3>No Technical Expertise</h3>
                <p>Designed for decision-makers who don't have time to waste learning complex systems.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">✓</div>
              <div className="feature-content">
                <h3>Zero Hidden Fees</h3>
                <p>Completely free from setup to usage. No subscription traps or surprise charges.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">✓</div>
              <div className="feature-content">
                <h3>Smarter Decisions</h3>
                <p>Turn routine footage into strategic insights that optimize operations and improve forecasting.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">✓</div>
              <div className="feature-content">
                <h3>Ready Out-of-the-Box</h3>
                <p>Fits effortlessly into your existing workflows—start getting value on day one.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="register-form" className="form-section">
        <div className="form-container">
          <h2 className="form-title">Ready to Unlock Your Visual Data?</h2>
          <p className="form-subtitle">
            Join our waitlist and be among the first to experience frictionless visual intelligence.
          </p>

          {submitSuccess ? (
            <div className="success-message">
              <div className="success-icon">✓</div>
              <h3>Thank You!</h3>
              <p>We've received your submission and will be in touch soon.</p>
              <button onClick={() => setSubmitSuccess(false)} className="reset-form-btn">
                Submit Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="interest-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Full Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="John Smith"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email Address *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company">Company Name *</label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleInputChange}
                    required
                    placeholder="Your Company Ltd"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+44 20 1234 5678"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="business_type">Business Type</label>
                <select
                  id="business_type"
                  name="business_type"
                  value={formData.business_type}
                  onChange={handleInputChange}
                >
                  <option value="">Select your industry...</option>
                  <option value="retail">Retail</option>
                  <option value="hospitality">Hospitality</option>
                  <option value="logistics">Logistics & Warehousing</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="message">Tell us about your needs (optional)</label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="What challenges are you facing with your current CCTV system?"
                />
              </div>

              {submitError && (
                <div className="error-message">{submitError}</div>
              )}

              <button type="submit" className="submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Register Interest'}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-section">
            <div className="footer-logo">
              <span className="logo-icon">≋</span>
              <span className="logo-text">Nigzsu</span>
            </div>
            <p className="footer-tagline">
              Democratising visual intelligence for everyone
            </p>
          </div>
          <div className="footer-section">
            <h4>Company</h4>
            <ul>
              <li><a href="#solution">Solution</a></li>
              <li><a href="#features">Features</a></li>
              <li><button onClick={() => navigate('/login')} className="footer-link-btn">Login</button></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Contact</h4>
            <p>United Kingdom</p>
            <p>info@nigzsu.com</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 Nigzsu. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
