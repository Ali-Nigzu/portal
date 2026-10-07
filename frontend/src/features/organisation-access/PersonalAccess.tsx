import { useState } from "react";
import { useOrganisationAccess } from "./OrganisationAccessContext";
import {
  decideInvitation,
  errorMessage,
  type PendingRelationship,
} from "./api";

export function usePersonalAccess() {
  const { pending, pendingLoading, pendingError, refreshAccess } =
    useOrganisationAccess();
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
  const retry = () => {
    setError(null);
    void refreshAccess().catch((failure) => setError(errorMessage(failure)));
  };
  return {
    pending,
    pendingLoading,
    pendingError,
    busy,
    error,
    message,
    decide,
    retry,
  };
}

type Props = {
  kind: "invitations" | "requests";
  access: ReturnType<typeof usePersonalAccess>;
};

export default function PersonalAccess({ kind, access }: Props) {
  const { pending, pendingLoading, busy, decide } = access;
  if (pendingLoading)
    return (
      <p className="access-empty" role="status">
        {kind === "invitations" ? "Loading invitations…" : "Loading requests…"}
      </p>
    );
  if (!pending[kind].length) return null;
  return (
    <div className="vrm-card-body access-personal-body">
      {kind === "invitations" &&
        pending.invitations.map((item) => (
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
      {kind === "requests" &&
        pending.requests.map((item) => (
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
    </div>
  );
}
