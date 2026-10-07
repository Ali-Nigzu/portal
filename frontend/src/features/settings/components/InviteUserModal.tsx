import { useState } from "react";
import { Link } from "react-router-dom";
import AccessDialog from "../../organisation-access/AccessDialog";
import { AccessError, errorMessage } from "../../organisation-access/api";
import type { AuthenticatedOrganisation } from "../../auth/transport/organisations";

type Props = {
  organisations: AuthenticatedOrganisation[];
  initialOrganisationId: string;
  onClose: () => void;
  onSubmitted: (payload: {
    organisation_id: string;
    identifier_type: "email" | "username";
    identifier: string;
  }) => Promise<void>;
};

export default function InviteUserModal({
  organisations,
  initialOrganisationId,
  onClose,
  onSubmitted,
}: Props) {
  const ownerOrganisations = organisations.filter(
    (organisation) => organisation.role === 0,
  );
  const [organisationId, setOrganisationId] = useState(initialOrganisationId);
  const validOrganisation = ownerOrganisations.some(
    (organisation) => organisation.id === organisationId,
  );
  const [type, setType] = useState<"email" | "username">("email");
  const [identifier, setIdentifier] = useState(""),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [support, setSupport] = useState(false);
  const valid =
    validOrganisation &&
    identifier.trim().length > 0 &&
    identifier.trim().length <= 320 &&
    (type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim()));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setError(
        validOrganisation
          ? `Enter a valid ${type}.`
          : "Select an organisation you own.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setSupport(false);
    try {
      await onSubmitted({
        organisation_id: organisationId,
        identifier_type: type,
        identifier: identifier.trim(),
      });
      onClose();
    } catch (failure) {
      const hasSupport =
        failure instanceof AccessError &&
        ["invite_target_unavailable", "invite_target_disabled"].includes(
          failure.code,
        );
      setSupport(hasSupport);
      setError(
        hasSupport
          ? errorMessage(failure).replace(/contact us\.$/, "")
          : errorMessage(failure),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccessDialog
      title="Invite member"
      description="The user must already have a camOS account. They'll receive access after accepting your invitation."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="settings-form-grid" noValidate>
        <div className="settings-form-field">
          <label className="settings-form-label" htmlFor="invite-organisation">
            Organisation
          </label>
          <select
            id="invite-organisation"
            className="settings-select"
            value={validOrganisation ? organisationId : ""}
            disabled={busy}
            aria-invalid={!!error && !validOrganisation}
            aria-describedby={
              error && !validOrganisation
                ? "invite-organisation-error"
                : undefined
            }
            onChange={(event) => {
              setOrganisationId(event.target.value);
              setError(null);
              setSupport(false);
            }}
          >
            {!validOrganisation && (
              <option value="" disabled>
                Select an organisation
              </option>
            )}
            {ownerOrganisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </select>
          {error && !validOrganisation && (
            <p
              id="invite-organisation-error"
              className="settings-form-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <fieldset className="access-identifier-choice" disabled={busy}>
          <legend className="settings-form-label">Find by</legend>
          {(["email", "username"] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="identifier-type"
                checked={type === value}
                onChange={() => {
                  setType(value);
                  setIdentifier("");
                  setError(null);
                }}
              />
              {value === "email" ? "Email" : "Username"}
            </label>
          ))}
        </fieldset>
        <div className="settings-form-field">
          <label className="settings-form-label" htmlFor="invite-identifier">
            {type === "email" ? "Email" : "Username"}
          </label>
          <input
            data-autofocus
            id="invite-identifier"
            className="settings-input"
            type={type === "email" ? "email" : "text"}
            autoComplete="off"
            maxLength={320}
            value={identifier}
            disabled={busy}
            aria-invalid={!!error && validOrganisation}
            aria-describedby={error && validOrganisation ? "invite-error" : undefined}
            onChange={(event) => {
              setIdentifier(event.target.value);
              setError(null);
            }}
          />
        </div>
        {error && validOrganisation && (
          <p id="invite-error" className="settings-form-error" role="alert">
            {error}
            {support && (
              <>
                <Link to="/contact" onClick={onClose}>
                  contact us
                </Link>
                .
              </>
            )}
          </p>
        )}
        <div className="settings-form-actions">
          <button
            type="button"
            className="vrm-btn vrm-btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="vrm-btn vrm-btn-primary" disabled={busy || !valid}>
            {busy ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </AccessDialog>
  );
}
