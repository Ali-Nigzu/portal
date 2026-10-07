import { useState } from "react";
import { useOrganisationAccess } from "./OrganisationAccessContext";
import {
  decideInvitation,
  errorMessage,
  type PendingRelationship,
} from "./api";

export default function PersonalAccess() {
  const {
    pending,
    pendingLoading,
    pendingError,
    refreshAccess,
    openCreate,
    openRequest,
  } = useOrganisationAccess();
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const decide = async (
    item: PendingRelationship,
    action: "accept" | "decline",
  ) => {
    if (busy) return;
    setBusy(item.organisation_id);
    setError(null);
    setMessage(null);
    try {
      await decideInvitation(item, action);
      setMessage(
        action === "accept"
          ? `You joined ${item.organisation_name}.`
          : `Invitation to ${item.organisation_name} declined.`,
      );
      await refreshAccess();
    } catch (failure) {
      setError(errorMessage(failure));
      void refreshAccess().catch(() => {});
    } finally {
      setBusy(null);
    }
  };
  return (
    <section
      id="personal-access"
      className="vrm-card access-personal"
      aria-label="Your invitations and requests"
    >
      <div className="vrm-card-header">
        <h2 className="vrm-card-title">Your invitations and requests</h2>
      </div>
      <div className="vrm-card-body access-personal-body">
        {pendingLoading ? (
          <p className="access-description" role="status">
            Loading invitations and requests…
          </p>
        ) : (
          <>
            {pending.invitations.map((item) => (
              <div
                className="access-personal-row"
                key={`invitation:${item.organisation_id}`}
              >
                <div>
                  <strong>{item.organisation_name}</strong>
                  <p className="access-description">
                    Invited you to join · Organisation ID {item.organisation_id}
                  </p>
                </div>
                <div className="access-row-actions">
                  <button
                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                    disabled={!!busy}
                    onClick={() => void decide(item, "decline")}
                  >
                    Decline
                  </button>
                  <button
                    className="vrm-btn vrm-btn-primary vrm-btn-sm"
                    disabled={!!busy}
                    onClick={() => void decide(item, "accept")}
                  >
                    {busy === item.organisation_id ? "Please wait…" : "Accept"}
                  </button>
                </div>
              </div>
            ))}
            {pending.requests.map((item) => (
              <div
                className="access-personal-row"
                key={`request:${item.organisation_id}`}
              >
                <div>
                  <strong>{item.organisation_name}</strong>
                  <p className="access-description">
                    Organisation ID {item.organisation_id}
                  </p>
                </div>
                <span className="access-pending-badge">Pending approval</span>
              </div>
            ))}
            {!pending.invitations.length &&
              !pending.requests.length &&
              !pendingError && (
                <p className="access-description">
                  No pending invitations or requests. Create an organisation or
                  request access using an Organisation ID.
                </p>
              )}
          </>
        )}
        {(error || pendingError) && (
          <div className="access-feedback" role="alert">
            <p className="settings-form-error">{error || pendingError}</p>
            <button
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => {
                setError(null);
                void refreshAccess().catch((failure) =>
                  setError(errorMessage(failure)),
                );
              }}
            >
              Try again
            </button>
          </div>
        )}
        {message && (
          <p className="settings-form-message" role="status">
            {message}
          </p>
        )}
        <div className="access-row-actions">
          <button
            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
            onClick={openCreate}
          >
            + Add Organisation
          </button>
          <button
            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
            onClick={openRequest}
          >
            + Request Access
          </button>
        </div>
      </div>
    </section>
  );
}
