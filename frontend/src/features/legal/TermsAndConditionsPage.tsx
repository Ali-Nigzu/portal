import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import { useIsPhoneLayout } from "../auth/hooks/useIsPhoneLayout";
import LandingHeader from "../landing/components/LandingHeader";
import "./TermsAndConditionsPage.css";

const TERMS_PARAGRAPHS_BEFORE_RESPONSIBILITIES = [
  "These Terms and Conditions (\"Terms\") govern the use of services provided by Camera Operating Systems Limited (\"the Company\", \"we\", \"us\", \"our\"). By accessing or using the services, the customer (\"Customer\", \"you\") agrees to these Terms.",
  "The Company provides automated video analytics services using video data supplied by the Customer. The services generate aggregated insights such as footfall, occupancy, and traffic patterns.",
] as const;

const TERMS_RESPONSIBILITIES = [
  "Operating camera systems lawfully",
  "Ensuring a valid lawful basis for processing personal data",
  "Providing appropriate notices to individuals where required",
  "Ensuring that video data supplied to the Company complies with applicable law",
] as const;

const TERMS_PARAGRAPHS_AFTER_RESPONSIBILITIES = [
  "The Company processes personal data on behalf of the Customer as a data processor under the UK GDPR. Processing is carried out solely to provide the services and in accordance with the Customer’s instructions.",
  "The Company does not identify individuals and does not perform facial recognition or biometric identification.",
  "The Company may generate anonymised and aggregated data derived from service usage. Such data does not identify individuals and may be used by the Company for analytics, service improvement, and commercial purposes.",
  "The services are provided on an \"as is\" and \"as available\" basis. The Company does not guarantee uninterrupted, secure, or error-free operation of the services.",
  "The core analytics service is provided free of charge unless otherwise agreed. The Company reserves the right to introduce paid features or services in the future.",
  "The Customer must not use the services in any way that is unlawful, infringes the rights of others, or interferes with the operation of the services.",
  "All intellectual property rights in the services remain the property of the Company. The Customer is granted a limited, non-exclusive, non-transferable right to use the services.",
  "To the fullest extent permitted by law, the Company shall not be liable for any indirect, incidental, or consequential loss, including loss of profits, revenue, or business opportunities.",
  "The Company’s total liability arising out of or in connection with the services shall not exceed £1,000.",
  "The Customer may stop using the services at any time. The Company may suspend or terminate access where necessary to protect the services, comply with law, or address misuse.",
  "The Company may update the services or these Terms from time to time. Continued use of the services constitutes acceptance of the updated Terms.",
  "These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the jurisdiction of the courts of England and Wales.",
  "Enquiries may be sent to compliance@camos.app.",
] as const;

const TermsAndConditionsPage: React.FC = () => {
  const navigate = useNavigate();
  const isPhoneLayout = useIsPhoneLayout();

  const goToLogin = () => {
    navigate("/login");
  };

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="terms-page">
      {isPhoneLayout ? (
        <AuthLogoHeader />
      ) : (
        <LandingHeader onLogin={goToLogin} onMenuToggle={() => undefined} />
      )}

      <main className="terms-page__main" aria-label="Terms and Conditions content">
        <section className="terms-page__document">
          <button type="button" className="terms-page__back-link" onClick={handleGoBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Go back</span>
          </button>

          <h1 className="terms-page__title">Terms and Conditions</h1>
          <div className="terms-page__body">
            {TERMS_PARAGRAPHS_BEFORE_RESPONSIBILITIES.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}

            <p>The Customer is responsible for:</p>
            <ul className="terms-page__list">
              {TERMS_RESPONSIBILITIES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            {TERMS_PARAGRAPHS_AFTER_RESPONSIBILITIES.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="terms-page__meta">Last updated: 01 April 2026</p>
        </section>
      </main>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default TermsAndConditionsPage;
