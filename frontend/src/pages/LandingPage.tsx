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
            <img src="/company-logo.png" alt="camOS Logo" className="logo-image" />
            <span className="logo-text">camOS</span>
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
            Frictionless visual intelligence — hassle free, instant, and effortless.
          </p>
          <button onClick={scrollToForm} className="hero-cta-btn">
            Get Started
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
          <h2 className="section-title">You already have the cameras.</h2>
          <p className="section-description">
            They're watching your customers, your staff, your space — every hour of every day.<br />
            But right now, they're only protecting you from risk.<br />
            They're not helping you run your business better.
          </p>
          <p className="section-description" style={{ marginTop: '2rem' }}>
            camOS transforms your existing CCTV footage into real operational insight —<br />
            showing you things like:
          </p>
          <div className="insights-list">
            <div className="insight-item">
              <span className="insight-bullet">•</span>
              <span className="insight-text">When and where your business gets busiest</span>
            </div>
            <div className="insight-item">
              <span className="insight-bullet">•</span>
              <span className="insight-text">How long customers wait to be served</span>
            </div>
            <div className="insight-item">
              <span className="insight-bullet">•</span>
              <span className="insight-text">Which areas are underused or overstaffed</span>
            </div>
          </div>
          <p className="section-description" style={{ marginTop: '2rem', fontWeight: '600' }}>
            No new hardware. No technical setup.<br />
            Just plug in, and start seeing your business clearly.
          </p>
          <p className="section-description" style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>
            Your cameras can do more than watch — they can help you grow.
          </p>
        </div>
      </section>

      <section id="solution" className="solution-section">
        <div className="section-container">
          <h2 className="section-title">Meet camOS</h2>
          <p className="section-description">
            We transform raw CCTV footage into clear, actionable intelligence—without the hassle, 
            technical complexity, or cost.
          </p>
          <div className="solution-cards">
            <div className="solution-card">
              <div className="card-icon">[Icon]</div>
              <h3>Instant Clarity</h3>
              <p>Real-time processing delivers insights immediately—no waiting, no complexity.</p>
            </div>
            <div className="solution-card">
              <div className="card-icon">[Icon]</div>
              <h3>Effortless Integration</h3>
              <p>Secure API connects to your existing CCTV system. Zero setup costs, zero disruption.</p>
            </div>
            <div className="solution-card">
              <div className="card-icon">[Icon]</div>
              <h3>Customizable Dashboard</h3>
              <p>Intuitive interface tailored to your business needs—no technical expertise required.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="section-container">
          <h2 className="section-title">Built For Business Owners</h2>
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon">[Check]</div>
              <div className="feature-content">
                <h3>No Technical Expertise</h3>
                <p>Designed for decision-makers who don't have time to waste learning complex systems.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">[Check]</div>
              <div className="feature-content">
                <h3>1 Year Free Trial</h3>
                <p>Register your interest now for a limited time and get a full year completely free. Zero hidden fees or subscription traps—ever.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">[Check]</div>
              <div className="feature-content">
                <h3>Smarter Decisions</h3>
                <p>Turn routine footage into strategic insights that optimize operations and improve forecasting.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">[Check]</div>
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
              <div className="success-icon">[Check]</div>
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
              <img src="/company-logo.png" alt="camOS Logo" className="footer-logo-image" />
              <span className="logo-text">camOS</span>
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
            <p>hello@camOS.com</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 camOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
