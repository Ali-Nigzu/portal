import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";
import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";
import { organisationPortalPath } from "../organisation-dashboard/authenticatedPortalRoutes";
import {
  pendingAccess,
  createOrganisation,
  resolveOrganisation,
  requestOrganisationAccess,
  errorMessage,
  type PendingAccess,
  type ResolvedOrganisation,
} from "./api";
import AccessDialog from "../../common/components/AccessDialog";
import { RequestFailure } from "../auth/transport/me";

type Value = {
  pending: PendingAccess;
  pendingLoading: boolean;
  pendingError: string | null;
  refreshAccess: () => Promise<void>;
  openCreate: () => void;
  openRequest: () => void;
  actionNotice: string | null;
};
const Context = createContext<Value | null>(null);

export function OrganisationAccessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { refreshOrganisations } = useAuthenticatedApplication();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAccess>({
    invitations: [],
    requests: [],
  });
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const revision = useRef(0);
  const [dialog, setDialog] = useState<"create" | "request" | null>(null);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const loadPending = useCallback(async (signal?: AbortSignal) => {
    const version = ++revision.current;
    try {
      const data = await pendingAccess(signal);
      if (version === revision.current && !signal?.aborted) {
        setPending({
          invitations: data.invitations ?? [],
          requests: data.requests ?? [],
        });
        setPendingError(null);
      }
    } catch (error) {
      if (!signal?.aborted && version === revision.current)
        setPendingError(errorMessage(error));
      throw error;
    } finally {
      if (!signal?.aborted && version === revision.current)
        setPendingLoading(false);
    }
  }, []);
  const refreshAccess = useCallback(async () => {
    const results = await Promise.allSettled([
      refreshOrganisations(),
      loadPending(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }, [refreshOrganisations, loadPending]);
  useEffect(() => {
    const abort = new AbortController();
    void loadPending(abort.signal).catch(() => {});
    const refresh = () => {
      if (document.visibilityState === "visible")
        void refreshAccess().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("camos:refresh-access", refresh);
    return () => {
      abort.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("camos:refresh-access", refresh);
    };
  }, [loadPending, refreshAccess]);
  return (
    <Context.Provider
      value={{
        pending,
        pendingLoading,
        pendingError,
        refreshAccess,
        openCreate: () => setDialog("create"),
        openRequest: () => setDialog("request"),
        actionNotice,
      }}
    >
      {children}
      {dialog === "create" && (
        <CreateOrganisationDialog
          uncertain={createUncertain}
          onUncertain={() => { setCreateUncertain(true); setActionNotice("Please check before trying again."); void refreshAccess().catch(() => {}); }}
          onClose={() => setDialog(null)}
          onCreated={async (id) => {
            await refreshAccess();
            setDialog(null);
            navigate(organisationPortalPath(id, "dashboard"));
          }}
        />
      )}
      {dialog === "request" && (
        <RequestAccessDialog
          onClose={() => setDialog(null)}
          onRequested={refreshAccess}
          onUncertain={() => { setActionNotice("Please check before trying again."); void refreshAccess().catch(() => {}); }}
        />
      )}
    </Context.Provider>
  );
}

export function useOrganisationAccess() {
  const value = useContext(Context);
  if (!value) throw new Error("Organisation access context required");
  return value;
}

function CreateOrganisationDialog({
  onClose,
  onCreated,
  uncertain,
  onUncertain,
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
  uncertain: boolean;
  onUncertain: () => void;
}) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const close = () => {
    if (operation.current && !createdId) onUncertain();
    operation.current?.abort();
    onClose();
  };
  const valid = name.trim().length > 0 && name.trim().length <= 200;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (operation.current || uncertain) return;
    if (!valid) {
      setError("Enter an organisation name of 1–200 characters.");
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    operation.current = controller;
    setError(null);
    let id = createdId;
    try {
      if (!id) {
        id = (await createOrganisation(name.trim(), controller.signal)).organisation.id;
        if (controller.signal.aborted) return;
        setCreatedId(id);
      }
      await onCreated(id);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (!id && failure instanceof RequestFailure && failure.uncertain) onUncertain();
      setError(
        id
          ? "Organisation created."
          : errorMessage(failure),
      );
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <AccessDialog
      title="Create organisation"
      description="This will create a new camOS organisation. You will become its Owner."
      onClose={close}
      busy={busy}
      cancelBusy
    >
      <form onSubmit={submit} className="settings-form-grid">
        <div className="settings-form-field">
          <label htmlFor="organisation-name" className="settings-form-label">
            Organisation name
          </label>
          <input
            data-autofocus
            id="organisation-name"
            className="settings-input"
            value={name}
            disabled={busy || !!createdId}
            maxLength={200}
            aria-invalid={!!error}
            aria-describedby={error ? "create-organisation-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
        </div>
        {(error || uncertain) && (
          <p
            id="create-organisation-error"
            className="settings-form-error"
            role="alert"
          >
            {error ?? "Please check before trying again."}
          </p>
        )}
        <div className="settings-form-actions">
          <button
            type="button"
            className="vrm-btn vrm-btn-secondary"
            onClick={close}
          >
            Cancel
          </button>
          <button className="vrm-btn vrm-btn-primary" disabled={busy || !valid || uncertain}>
            {busy
              ? "Creating…"
              : createdId
                ? "Open organisation"
                : "Create organisation"}
          </button>
        </div>
      </form>
    </AccessDialog>
  );
}

function RequestAccessDialog({
  onClose,
  onRequested,
  onUncertain,
}: {
  onClose: () => void;
  onRequested: () => Promise<void>;
  onUncertain: () => void;
}) {
  const [id, setId] = useState(""),
    [resolved, setResolved] = useState<ResolvedOrganisation | null>(null);
  const operation = useRef<AbortController | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => () => operation.current?.abort(), []);
  const close = () => { if (operation.current && resolved) onUncertain(); operation.current?.abort(); onClose(); };
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const stepFocus = useRef<
    HTMLInputElement | HTMLHeadingElement | HTMLButtonElement | null
  >(null);
  useEffect(() => {
    if (!busy) stepFocus.current?.focus();
  }, [resolved, sent, busy]);
  const valid =
    /^[1-9][0-9]*$/.test(id.trim()) &&
    (id.trim().length < 19 ||
      (id.trim().length === 19 && id.trim() <= "9223372036854775807"));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (operation.current || uncertain) return;
    if (!resolved && !valid) {
      setError("Enter a valid numeric Organisation ID.");
      return;
    }
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    operation.current = controller;
    try {
      if (!resolved) { const next = await resolveOrganisation(id.trim(), controller.signal); if (!controller.signal.aborted) setResolved(next); }
      else {
        await requestOrganisationAccess(resolved.organisation.id, controller.signal);
        if (controller.signal.aborted) return;
        setSent(true);
        await onRequested().catch(() =>
          setError(
            "Your request was sent. Pending access couldn't refresh; it will update when you return.",
          ),
        );
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof RequestFailure && failure.uncertain) { setUncertain(true); void onRequested().catch(() => {}); }
      setError(errorMessage(failure));
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const statusMessage =
    resolved?.relationship?.status === 1
      ? "You already belong to this organisation."
      : resolved?.relationship?.status === 2
        ? "You have an invitation to this organisation. Accept or decline it in Manage Access."
        : "Your request is already pending approval.";
  return (
    <AccessDialog
      title={sent ? "Request sent" : "Request access"}
      description={
        sent
          ? `Your request to ${resolved?.organisation.name} is pending approval.`
          : !resolved
            ? "Enter the Organisation ID shared with you by someone in the organisation."
            : undefined
      }
      onClose={close}
      busy={busy}
      cancelBusy
    >
      {sent ? (
        <>
          <p className="access-success" role="status">
            You'll see the organisation here once its Owner approves your
            request.
          </p>
          {error && (
            <p role="alert" className="settings-form-error">
              {error}
            </p>
          )}
          <div className="settings-form-actions">
            <button
              data-autofocus
              ref={(element) => {
                stepFocus.current = element;
              }}
              className="vrm-btn vrm-btn-primary"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="settings-form-grid">
          {!resolved ? (
            <div className="settings-form-field">
              <label
                className="settings-form-label"
                htmlFor="request-organisation-id"
              >
                Organisation ID
              </label>
              <input
                data-autofocus
                ref={(element) => {
                  stepFocus.current = element;
                }}
                id="request-organisation-id"
                className="settings-input"
                inputMode="numeric"
                maxLength={19}
                value={id}
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={error ? "request-access-error" : undefined}
                onChange={(event) => {
                  setId(event.target.value);
                  setError(null);
                }}
              />
            </div>
          ) : (
            <div className="access-confirmation">
              <h3
                tabIndex={-1}
                ref={(element) => {
                  stepFocus.current = element;
                }}
              >
                {resolved.organisation.name}
              </h3>
              <p className="access-description">
                Organisation ID {resolved.organisation.id}
              </p>
              <p>
                {resolved.can_request
                  ? "You're requesting access to this organisation."
                  : statusMessage}
              </p>
            </div>
          )}
          {error && (
            <p
              id="request-access-error"
              role="alert"
              className="settings-form-error"
            >
              {error}
            </p>
          )}
          <div className="settings-form-actions">
            {resolved && (
              <button
                type="button"
                className="vrm-btn vrm-btn-secondary"
                disabled={busy}
                onClick={() => {
                  setResolved(null);
                  setError(null);
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="vrm-btn vrm-btn-secondary"
              onClick={close}
            >
              Cancel
            </button>
            <button
              className="vrm-btn vrm-btn-primary"
              disabled={
                busy || uncertain ||
                (!resolved && !valid) ||
                (!!resolved && !resolved.can_request)
              }
            >
              {busy ? "Please wait…" : resolved ? "Request access" : "Continue"}
            </button>
          </div>
        </form>
      )}
    </AccessDialog>
  );
}
