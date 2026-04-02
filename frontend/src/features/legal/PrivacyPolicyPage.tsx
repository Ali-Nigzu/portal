import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import { useIsPhoneLayout } from "../auth/hooks/useIsPhoneLayout";
import LandingHeader from "../landing/components/LandingHeader";
import "./PrivacyPolicyPage.css";

const PRIVACY_POLICY_PARAGRAPHS = [
  "Camera Operating Systems Limited (“the Company”) is a company incorporated in England and Wales under registration number 16937639, with a registered address at 71-75 Shelton Street, Covent Garden, London, WC2H 9FD, England. The Company is registered with the Information Commissioner’s Office under registration number ZC113561. Enquiries regarding this Privacy Notice may be sent to [compliance@camos.app](mailto:compliance@camos.app).",
  "In this Privacy Notice, “UK GDPR” means the United Kingdom General Data Protection Regulation. The terms “personal data” and “sub-processor” have the meanings given to them in the UK GDPR.",
  "The Company primarily acts as a data processor within the meaning of the UK GDPR when processing personal data on behalf of customers. The Company processes personal data only pursuant to contract and on the instructions of customers. Customers are responsible for determining the purposes of processing and the lawful basis for such processing, which typically consists of legitimate interests.",
  "The Company provides automated data processing services using video supplied by customers. Processing is fully automated. No human review is performed.",
  "Processing may relate to members of the public present in areas monitored by camera systems operated by customers.",
  "The categories of personal data processed consist of video and associated metadata. Processing includes automated analysis such as detection of individuals, counting, and occupancy estimation. Audio data is not processed. Direct identifiers are not collected.",
  "All video processed by the Company is supplied by customers from camera systems they operate.",
  "Personal data is processed solely for the provision of services to customers.",
  "The Company does not perform biometric identification or facial recognition. The Company does not identify individuals and does not attempt to do so. Biometric templates or information intended to uniquely identify individuals are not created or stored.",
  "Video is retained for a maximum period of sixty days and deleted thereafter. Anonymised and aggregated analytical outputs may be retained by the Company. Such outputs do not identify individuals and do not constitute personal data under the UK GDPR.",
  "Personal data may be processed outside the United Kingdom. Where such processing occurs, appropriate safeguards are implemented in accordance with applicable data protection law, including the use of standard contractual clauses or other approved mechanisms. Further information regarding sub-processors, processing locations, and transfer safeguards is set out in the Sub-Processor Register maintained by the Company.",
  "Appropriate technical and organisational measures are applied to protect personal data.",
  "Individuals wishing to exercise data protection rights should contact the customer operating the relevant camera system. The Company assists customers in fulfilling such requests where required.",
  "Individuals have the right to lodge a complaint with the UK Information Commissioner’s Office.",
] as const;

const PrivacyPolicyPage: React.FC = () => {
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
    <div className="privacy-page">
      {isPhoneLayout ? (
        <AuthLogoHeader />
      ) : (
        <LandingHeader onLogin={goToLogin} onMenuToggle={() => undefined} />
      )}

      <main className="privacy-page__main" aria-label="Privacy Policy content">
        <section className="privacy-page__document">
          <button type="button" className="privacy-page__back-link" onClick={handleGoBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Go back</span>
          </button>

          <h1 className="privacy-page__title">Privacy Policy</h1>

          <div className="privacy-page__body">
            {PRIVACY_POLICY_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <p className="privacy-page__meta">Last updated: 01 April 2026</p>
        </section>
      </main>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default PrivacyPolicyPage;
