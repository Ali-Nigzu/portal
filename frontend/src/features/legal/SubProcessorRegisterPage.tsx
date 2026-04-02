import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import { useIsPhoneLayout } from "../auth/hooks/useIsPhoneLayout";
import LandingHeader from "../landing/components/LandingHeader";
import "./SubProcessorRegisterPage.css";

const REGISTER_INTRO_PARAGRAPHS = [
  "This Sub-Processor Register identifies the sub-processors engaged by Camera Operating Systems Limited (“the Company”) in connection with the processing of personal data on behalf of customers.",
  "The Company engages sub-processors solely to support the provision of its services. Sub-processors are contractually required to process personal data only on the Company’s instructions and in accordance with applicable data protection law.",
  "Sub-processors may process personal data only to the extent necessary to provide the services described below.",
  "The Company may update this Register from time to time to reflect changes to its sub-processing arrangements.",
] as const;

const REGISTER_HEADERS = [
  "Sub-Processor",
  "Legal Entity",
  "Processing Activities",
  "Categories of Personal Data",
  "Processing Locations",
  "International Transfers",
  "Transfer Safeguards",
] as const;

const REGISTER_ROW = {
  subProcessor: "Google Cloud Platform",
  legalEntity: "Google LLC and affiliated entities",
  processingActivities: "Provision of cloud infrastructure services, including hosting, processing, and storage",
  categoriesOfPersonalData: "Video and associated metadata",
  processingLocations: "United Kingdom, European Economic Area, United States",
  internationalTransfers: "Yes",
  transferSafeguards: "Standard Contractual Clauses or other approved transfer mechanisms",
} as const;

const MOBILE_FIELDS = [
  { label: "Sub-Processor", value: REGISTER_ROW.subProcessor },
  { label: "Legal Entity", value: REGISTER_ROW.legalEntity },
  { label: "Processing Activities", value: REGISTER_ROW.processingActivities },
  { label: "Categories of Personal Data", value: REGISTER_ROW.categoriesOfPersonalData },
  { label: "Processing Locations", value: REGISTER_ROW.processingLocations },
  { label: "International Transfers", value: REGISTER_ROW.internationalTransfers },
  { label: "Transfer Safeguards", value: REGISTER_ROW.transferSafeguards },
] as const;

const SubProcessorRegisterPage: React.FC = () => {
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

    navigate("/privacy-policy", { replace: true });
  };

  return (
    <div className="subprocessor-page">
      {isPhoneLayout ? (
        <AuthLogoHeader />
      ) : (
        <LandingHeader onLogin={goToLogin} />
      )}

      <main className="subprocessor-page__main" aria-label="Sub-Processor Register content">
        <section className="subprocessor-page__document">
          <button type="button" className="subprocessor-page__back-link" onClick={handleGoBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Go back</span>
          </button>

          <h1 className="subprocessor-page__title">Sub-Processor Register</h1>

          <div className="subprocessor-page__body">
            {REGISTER_INTRO_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}

            <p className="subprocessor-page__meta">Last updated: 01 April 2026</p>

            <h2 className="subprocessor-page__subtitle">Sub-Processors</h2>

            {isPhoneLayout ? (
              <table className="subprocessor-page__mobile-table" aria-label="Sub-Processor Register entry">
                <tbody>
                  {MOBILE_FIELDS.map((field) => (
                    <tr key={field.label}>
                      <th scope="row">{field.label}</th>
                      <td>{field.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="subprocessor-page__table">
                <thead>
                  <tr>
                    {REGISTER_HEADERS.map((header) => (
                      <th key={header} scope="col">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{REGISTER_ROW.subProcessor}</td>
                    <td>{REGISTER_ROW.legalEntity}</td>
                    <td>{REGISTER_ROW.processingActivities}</td>
                    <td>{REGISTER_ROW.categoriesOfPersonalData}</td>
                    <td>{REGISTER_ROW.processingLocations}</td>
                    <td>{REGISTER_ROW.internationalTransfers}</td>
                    <td>{REGISTER_ROW.transferSafeguards}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {isPhoneLayout ? <AuthBottomNav /> : null}
    </div>
  );
};

export default SubProcessorRegisterPage;
