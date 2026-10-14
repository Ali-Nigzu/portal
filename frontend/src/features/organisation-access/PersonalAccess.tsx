import { type PendingRelationship, decideInvitation, errorMessage } from "./api";
import { useEffect, useRef, useState } from "react";
import { useOrganisationAccess } from "./OrganisationAccessContext";

export function usePersonalAccess() {
  const { pending, pendingLoading, pendingError, refreshAccess } =
    useOrganisationAccess();
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const decide = async (
    item: PendingRelationship,
    action: "accept" | "decline",
  ) => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(item.organisation_id);
    setError(null);
    setMessage(null);
    try {
      await decideInvitation(item, action, controller.signal);
      if (controller.signal.aborted) return;
      setMessage(
        action === "accept"
          ? `You joined ${item.organisation_name}.`
          : `Invitation to ${item.organisation_name} declined.`,
      );
      void refreshAccess().catch(() => {});
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(errorMessage(failure));
      void refreshAccess().catch(() => {});
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(null);
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
