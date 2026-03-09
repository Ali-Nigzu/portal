import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { submitContact } from "./transport/contact";
import AuthPhoneField from "./components/AuthPhoneField";
import "./ContactPage.css";
import "./components/AuthPhoneField.css";

type FieldErrors = {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  attachments?: string;
};

type ContactField = "name" | "email" | "phone" | "message" | "attachments";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg"];

const ContactPage: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+44");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState<Record<ContactField, boolean>>({
    name: false,
    email: false,
    phone: false,
    message: false,
    attachments: false,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const phoneValue = useMemo(
    () => (phoneLocal.trim() ? `${phoneCountryCode}${phoneLocal.trim().replace(/^0+/, "")}` : ""),
    [phoneCountryCode, phoneLocal],
  );

  const errors = useMemo((): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!name.trim()) {
      nextErrors.name = "This field is required";
    }

    if (!email.trim()) {
      nextErrors.email = "This field is required";
    } else if (!EMAIL_RE.test(email.trim().toLowerCase())) {
      nextErrors.email = "Not a valid email address";
    }

    if (phoneValue && !PHONE_RE.test(phoneValue)) {
      nextErrors.phone = "Not a valid phone number";
    }

    if (!message.trim()) {
      nextErrors.message = "This field is required";
    }

    if (attachments.length > MAX_ATTACHMENTS) {
      nextErrors.attachments = `Upload up to ${MAX_ATTACHMENTS} files only.`;
    } else if (attachments.some((file) => file.size > MAX_FILE_BYTES)) {
      nextErrors.attachments = "Each file must be 10MB or smaller.";
    }

    return nextErrors;
  }, [attachments, email, message, name, phoneValue]);

  const visibleErrors = useMemo(() => {
    const next: FieldErrors = {};
    (Object.keys(errors) as ContactField[]).forEach((field) => {
      if ((submitAttempted || touched[field]) && errors[field]) {
        next[field] = errors[field];
      }
    });
    return next;
  }, [errors, submitAttempted, touched]);

  const attachmentSummary = useMemo(() => {
    if (attachments.length === 0) {
      return "No files selected";
    }
    return `${attachments.length} file${attachments.length > 1 ? "s" : ""} selected`;
  }, [attachments.length]);

  const markTouched = (field: ContactField) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const onFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setAttachments(selected);
    setSubmitError(null);
    setSubmitSuccess(null);
    markTouched("attachments");
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => {
      const next = prev.filter((_, index) => index !== indexToRemove);
      if (next.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return next;
    });
    setSubmitError(null);
    setSubmitSuccess(null);
    markTouched("attachments");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setTouched({ name: true, email: true, phone: true, message: true, attachments: true });
    setSubmitError(null);
    setSubmitSuccess(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitContact({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phoneValue,
        message: message.trim(),
        attachments,
      });

      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }

      setSubmitSuccess("Message sent");
      setName("");
      setEmail("");
      setPhoneCountryCode("+44");
      setPhoneLocal("");
      setMessage("");
      setAttachments([]);
      setSubmitAttempted(false);
      setTouched({ name: false, email: false, phone: false, message: false, attachments: false });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setShowSuccessModal(true);
    } catch {
      setSubmitError("Unable to send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="contact-page">
        <AuthTopBar />

        <form className="contact-shell" onSubmit={handleSubmit} noValidate>
          <section className="contact-left-pane" aria-label="Contact details panel">
            <div className="contact-content">
              <h1 className="contact-hero">Get in Touch</h1>

              <div className="contact-left-form">
                <div className="vrm-field contact-field">
                  <label className="vrm-label" htmlFor="contact-name">Name</label>
                  <input
                    id="contact-name"
                    className="vrm-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => markTouched("name")}
                    autoComplete="name"
                    aria-invalid={Boolean(visibleErrors.name)}
                    aria-describedby={visibleErrors.name ? "contact-name-error" : undefined}
                  />
                  <div className="contact-error-slot" aria-live="polite">
                    {visibleErrors.name && <div id="contact-name-error" className="contact-error">{visibleErrors.name}</div>}
                  </div>
                </div>

                <div className="vrm-field contact-field">
                  <label className="vrm-label" htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    className="vrm-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => markTouched("email")}
                    autoComplete="email"
                    aria-invalid={Boolean(visibleErrors.email)}
                    aria-describedby={visibleErrors.email ? "contact-email-error" : undefined}
                  />
                  <div className="contact-error-slot" aria-live="polite">
                    {visibleErrors.email && <div id="contact-email-error" className="contact-error">{visibleErrors.email}</div>}
                  </div>
                </div>

                <div className="vrm-field contact-field">
                  <label className="vrm-label" htmlFor="contact-country">Phone (optional)</label>
                  <div onBlur={() => markTouched("phone")}>
                    <AuthPhoneField
                      idPrefix="contact"
                      countryCode={phoneCountryCode}
                      localNumber={phoneLocal}
                      onCountryCodeChange={setPhoneCountryCode}
                      onLocalNumberChange={setPhoneLocal}
                      inputClassName="vrm-input"
                    />
                  </div>
                  <div className="contact-error-slot" aria-live="polite">
                    {visibleErrors.phone && <div id="contact-phone-error" className="contact-error">{visibleErrors.phone}</div>}
                  </div>
                </div>

                <p className="contact-under-cta">
                  Why not create an account? <Link to="/create-account" className="contact-inline-link">Create Account</Link>
                </p>
              </div>
            </div>
          </section>

          <section className="contact-right-pane" aria-label="Contact message panel">
            <div className="contact-right-content">
              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-message">Message</label>
                <textarea
                  id="contact-message"
                  className="vrm-input contact-message-input"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onBlur={() => markTouched("message")}
                  placeholder="Tell us what you need help with"
                  aria-invalid={Boolean(visibleErrors.message)}
                  aria-describedby={visibleErrors.message ? "contact-message-error" : undefined}
                />
                <div className="contact-error-slot" aria-live="polite">
                  {visibleErrors.message && <div id="contact-message-error" className="contact-error">{visibleErrors.message}</div>}
                </div>
              </div>

              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-attachments">Attachments (optional)</label>
                <input
                  id="contact-attachments"
                  className="vrm-input"
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  onChange={onFilesChange}
                  aria-invalid={Boolean(visibleErrors.attachments)}
                  aria-describedby={visibleErrors.attachments ? "contact-attachments-error" : undefined}
                />
                <p className="contact-attachment-hint">
                  {attachmentSummary}. Up to 3 files, 10MB each. Accepted: PDF, DOCX, XLSX, CSV, PNG, JPG.
                </p>
                {attachments.length > 0 && (
                  <ul className="contact-attachment-list" aria-label="Selected attachments">
                    {attachments.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}`} className="contact-attachment-item">
                        <span className="contact-attachment-name">{file.name}</span>
                        <button
                          type="button"
                          className="contact-attachment-remove"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => handleRemoveAttachment(index)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="contact-error-slot" aria-live="polite">
                  {visibleErrors.attachments && <div id="contact-attachments-error" className="contact-error">{visibleErrors.attachments}</div>}
                </div>
              </div>

              {submitError && (
                <div className="vrm-status vrm-status-warning contact-request-error" role="alert" aria-live="assertive">
                  {submitError}
                </div>
              )}

              {submitSuccess && (
                <div className="contact-success" role="status" aria-live="polite">
                  {submitSuccess}
                </div>
              )}

              <div className="contact-actions">
                <button type="submit" className="vrm-btn vrm-btn-primary contact-submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </section>
        </form>
      </div>
      {showSuccessModal ? (
        <div className="contact-success-modal-backdrop" role="presentation">
          <div className="contact-success-modal" role="dialog" aria-modal="true" aria-labelledby="contact-success-title">
            <button type="button" className="contact-success-close" onClick={() => setShowSuccessModal(false)} aria-label="Close success modal">×</button>
            <h2 id="contact-success-title">Message sent</h2>
            <p>Thanks for contacting camOS. Our team will get back to you within 24 Hours.</p>
            <div className="contact-success-modal-actions">
              <Link className="vrm-btn vrm-btn-secondary" to="/" onClick={() => setShowSuccessModal(false)}>Learn more about camOS</Link>
              <Link className="vrm-btn vrm-btn-primary" to="/create-account" onClick={() => setShowSuccessModal(false)}>Create Account</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ContactPage;
