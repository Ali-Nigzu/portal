import { requestFetch, RequestFailure } from "../auth/transport/me";
import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  classifyOptionalPhoneInput,
  PHONE_OPTION_BY_ISO,
  inferIsoFromPhoneText,
  replaceDialCodeInPhoneText,
  sanitizePhoneText,
} from "../auth/countryPhoneData";
import { Link } from "react-router-dom";
import AuthBottomNav from "../../components/auth/AuthBottomNav";
import AuthLogoHeader from "../../components/auth/AuthLogoHeader";
import AuthTopBar from "../../components/auth/AuthTopBar";
import { useIsPhoneLayout } from "../../common/hooks/useIsPhoneLayout";
import AccessDialog from "../../common/components/AccessDialog";
import AuthPhoneField from "../auth/components/AuthPhoneField";
import "./ContactPage.css";
import "../auth/components/AuthPhoneField.css";

type FieldErrors = {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  attachments?: string;
};

const CONTACT_ENVELOPE_MESSAGE = "Attachments are too large to send together. Please use smaller files.";
function contactAttachmentBytes(files: Pick<File, 'size' | 'name' | 'type'>[]): number {
  const utf8 = new TextEncoder();
  return files.reduce((total, file) => total + 4 * Math.ceil(file.size / 3)
    + utf8.encode(file.name.trim() || 'attachment').length
    + utf8.encode(file.type || 'application/octet-stream').length + 1024, 0);
}
const CONTACT_ATTACHMENT_ENVELOPE_BYTES = 8_000_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
];

const ContactPage: React.FC = () => {
  const isPhoneLayout = useIsPhoneLayout();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phoneSelectedIso, setPhoneSelectedIso] = useState("GB");
  const [phoneText, setPhoneText] = useState("+44");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const submission = useRef<AbortController | null>(null);
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  useEffect(() => () => submission.current?.abort(), []);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const attachmentSummary = useMemo(() => {
    if (attachments.length === 0) {
      return "No files selected";
    }
    return `${attachments.length} file${attachments.length > 1 ? "s" : ""} selected`;
  }, [attachments.length]);

  const validate = (): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!name.trim()) {
      nextErrors.name = "This field is required";
    }

    if (!email.trim()) {
      nextErrors.email = "This field is required";
    } else if (!EMAIL_RE.test(email.trim().toLowerCase())) {
      nextErrors.email = "Not a valid email address";
    }

    const phoneState = classifyOptionalPhoneInput(phoneText, phoneSelectedIso);
    if (
      !phoneState.isEffectivelyEmpty &&
      !PHONE_RE.test(phoneState.effectivePhone)
    ) {
      nextErrors.phone = "Not a valid phone number";
    }

    if (!message.trim()) {
      nextErrors.message = "This field is required";
    }

    if (attachments.length > MAX_ATTACHMENTS) {
      nextErrors.attachments = `Upload up to ${MAX_ATTACHMENTS} files only.`;
    } else if (attachments.some((file) => file.size > MAX_FILE_BYTES)) {
      nextErrors.attachments = "Each file must be 10MB or smaller.";
    } else if (contactAttachmentBytes(attachments) > CONTACT_ATTACHMENT_ENVELOPE_BYTES) {
      nextErrors.attachments = CONTACT_ENVELOPE_MESSAGE;
    }

    return nextErrors;
  };

  const onFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    setAttachments(selected);
    setSubmitError(null);

    if (selected.length > MAX_ATTACHMENTS) {
      setErrors((prev) => ({
        ...prev,
        attachments: `Upload up to ${MAX_ATTACHMENTS} files only.`,
      }));
      return;
    }

    if (selected.some((file) => file.size > MAX_FILE_BYTES)) {
      setErrors((prev) => ({
        ...prev,
        attachments: "Each file must be 10MB or smaller.",
      }));
      return;
    }

    setErrors((prev) => ({ ...prev, attachments: contactAttachmentBytes(selected) > CONTACT_ATTACHMENT_ENVELOPE_BYTES ? CONTACT_ENVELOPE_MESSAGE : undefined }));
  };

  const closeConfirmation = () => {
    setShowSuccessModal(false);
    requestAnimationFrame(() => submitButtonRef.current?.focus());
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || uncertainSubmission) return;
    setSubmitError(null);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    inFlight.current = true;
    const controller = new AbortController();
    submission.current = controller;
    setSubmitting(true);
    try {
      const phoneState = classifyOptionalPhoneInput(
        phoneText,
        phoneSelectedIso,
      );
      const result = await submitContact({
        name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim().toLowerCase(),
        phone: phoneState.effectivePhone || undefined,
        message: message.trim(),
        pageUrl: window.location.href,
        attachments,
      }, controller.signal);
      if (controller.signal.aborted) return;

      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }

      setName("");
      setCompany("");
      setEmail("");
      setPhoneSelectedIso("GB");
      setPhoneText("+44");
      setMessage("");
      setAttachments([]);
      setErrors({});
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setShowSuccessModal(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      const uncertain = error instanceof RequestFailure && error.uncertain;
      setUncertainSubmission(uncertain);
      setSubmitError(uncertain ? "Please check before trying again." : "Couldn't send message. Try again.");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <>
      <div className="contact-page">
        {isPhoneLayout ? <AuthLogoHeader /> : <AuthTopBar />}

        <form className="contact-shell" onSubmit={handleSubmit}>
          <section
            className="contact-left-pane"
            aria-label="Contact details panel"
          >
            <div className="contact-content">
              <h1 className="contact-hero">Get in Touch</h1>

              <div className="contact-name-organisation">
                <div className="vrm-field contact-field">
                  <label className="vrm-label" htmlFor="contact-name">
                    Name
                  </label>
                  <input
                    id="contact-name"
                    className="vrm-input"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (errors.name)
                        setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={
                      errors.name ? "contact-name-error" : undefined
                    }
                  />
                  <div className="contact-error-slot" aria-live="polite">
                    {errors.name && (
                      <div id="contact-name-error" className="contact-error">
                        {errors.name}
                      </div>
                    )}
                  </div>
                </div>

                <div className="vrm-field contact-field">
                  <label className="vrm-label" htmlFor="contact-company">
                    Organisation (optional)
                  </label>
                  <input
                    id="contact-company"
                    className="vrm-input"
                    autoComplete="organization"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </div>
              </div>

              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-email">
                  Email
                </label>
                <input
                  id="contact-email"
                  className="vrm-input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (errors.email)
                      setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "contact-email-error" : undefined
                  }
                />
                <div className="contact-error-slot" aria-live="polite">
                  {errors.email && (
                    <div id="contact-email-error" className="contact-error">
                      {errors.email}
                    </div>
                  )}
                </div>
              </div>

              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-country">
                  Phone (optional)
                </label>
                <AuthPhoneField
                  idPrefix="contact"
                  selectedIso={phoneSelectedIso}
                  phoneText={phoneText}
                  onSelectedIsoChange={(value) => {
                    const option = PHONE_OPTION_BY_ISO.get(value);
                    if (!option) {
                      return;
                    }
                    setPhoneSelectedIso(value);
                    setPhoneText((prev) =>
                      replaceDialCodeInPhoneText(prev, option.dialCode),
                    );
                    if (errors.phone)
                      setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  onPhoneTextChange={(value) => {
                    const normalized = sanitizePhoneText(value);
                    setPhoneText(normalized);
                    const inferredIso = inferIsoFromPhoneText(normalized);
                    if (inferredIso) {
                      setPhoneSelectedIso(inferredIso);
                    }
                    if (errors.phone)
                      setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  inputClassName="vrm-input"
                />
                <div className="contact-error-slot" aria-live="polite">
                  {errors.phone && (
                    <div id="contact-phone-error" className="contact-error">
                      {errors.phone}
                    </div>
                  )}
                </div>
              </div>

              <p className="contact-under-cta contact-under-cta--desktop">
                Why not create an account?{" "}
                <Link to="/create-account" className="contact-inline-link">
                  Create Account
                </Link>
              </p>
            </div>
          </section>

          <section
            className="contact-right-pane"
            aria-label="Contact message panel"
          >
            <div className="contact-right-content">
              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  className="vrm-input contact-message-input"
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    if (errors.message)
                      setErrors((prev) => ({ ...prev, message: undefined }));
                  }}
                  placeholder="Tell us what you need help with"
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={
                    errors.message ? "contact-message-error" : undefined
                  }
                />
                <div className="contact-error-slot" aria-live="polite">
                  {errors.message && (
                    <div id="contact-message-error" className="contact-error">
                      {errors.message}
                    </div>
                  )}
                </div>
              </div>

              <div className="vrm-field contact-field">
                <label className="vrm-label" htmlFor="contact-attachments">
                  Attachments (optional)
                </label>
                <input
                  id="contact-attachments"
                  className="vrm-input"
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  onChange={onFilesChange}
                  aria-invalid={Boolean(errors.attachments)}
                  aria-describedby={
                    errors.attachments ? "contact-attachments-error" : undefined
                  }
                />
                <p className="contact-attachment-hint">
                  {attachmentSummary}. Up to 3 files, 10MB each. Accepted: PDF,
                  DOCX, XLSX, CSV, PNG, JPG.
                </p>
                {attachments.length > 0 && (
                  <ul
                    className="contact-attachment-list"
                    aria-label="Selected attachments"
                  >
                    {attachments.map((file) => (
                      <li key={`${file.name}-${file.lastModified}`}>
                        {file.name}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="contact-error-slot" aria-live="polite">
                  {errors.attachments && (
                    <div
                      id="contact-attachments-error"
                      className="contact-error"
                    >
                      {errors.attachments}
                    </div>
                  )}
                </div>
              </div>

              {submitError && (
                <div
                  className="vrm-status vrm-status-warning contact-request-error"
                  role="alert"
                  aria-live="assertive"
                >
                  {submitError}
                </div>
              )}

              <div className="contact-actions">
                <button
                  type="submit"
                  ref={submitButtonRef}
                  className="vrm-btn vrm-btn-primary contact-submit"
                  disabled={submitting || uncertainSubmission}
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>

              <p className="contact-under-cta contact-under-cta--phone">
                Why not create an account?{" "}
                <Link to="/create-account" className="contact-inline-link">
                  Create Account
                </Link>
              </p>
            </div>
          </section>
        </form>
        {isPhoneLayout ? <AuthBottomNav /> : null}
      </div>
      {showSuccessModal ? (
        <AccessDialog
          title="Message sent."
          className="contact-success-dialog"
          onClose={closeConfirmation}
        >
          <button
            type="button"
            className="contact-success-close"
            data-autofocus
            onClick={closeConfirmation}
            aria-label="Close confirmation"
          >
            ×
          </button>
          <div className="contact-success-actions">
            <Link
              className="vrm-btn vrm-btn-secondary"
              to="/home"
              onClick={closeConfirmation}
            >
              Learn about camOS
            </Link>
            <Link
              className="vrm-btn vrm-btn-primary"
              to="/create-account"
              onClick={closeConfirmation}
            >
              Create Account
            </Link>
          </div>
        </AccessDialog>
      ) : null}
    </>
  );
};

export default ContactPage;

type ContactPayload = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  pageUrl?: string;
  attachments: File[];
};

type ContactResult = { ok: true } | { ok: false; message: string };

const submitContact = async (
  payload: ContactPayload,
  signal: AbortSignal,
): Promise<ContactResult> => {
  const formData = new FormData();
  formData.append("name", payload.name);
  formData.append("email", payload.email);
  if (payload.phone?.trim()) {
    formData.append("phone", payload.phone.trim());
  }
  if (payload.company?.trim()) {
    formData.append("company", payload.company.trim());
  }
  formData.append("message", payload.message);
  if (payload.pageUrl?.trim()) {
    formData.append("page_url", payload.pageUrl.trim());
  }
  payload.attachments.forEach((file) => formData.append("attachments", file));

  const response = await requestFetch("/api/contact", {
    method: "POST",
    body: formData,
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.headers.get('X-camos-action-outcome') === 'unknown' || (response.status >= 500 && response.headers.get('X-camos-action-outcome') !== 'not_sent')) throw new RequestFailure(true);
    return {
      ok: false,
      message: "Couldn't send message. Try again.",
    };
  }
  if (typeof data?.message !== 'string') throw new RequestFailure(true);

  return { ok: true };
};
