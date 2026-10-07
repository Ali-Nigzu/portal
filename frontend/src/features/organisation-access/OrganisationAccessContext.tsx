import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import AccessDialog from "./AccessDialog";

type Value = {
  pending: PendingAccess;
  pendingLoading: boolean;
  pendingError: string | null;
  refreshAccess: () => Promise<void>;
  openCreate: () => void;
  openRequest: () => void;
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
      }}
    >
      {children}
      {dialog === "create" && (
        <CreateOrganisationDialog
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
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const valid = name.trim().length > 0 && name.trim().length <= 200;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setError("Enter an organisation name of 1–200 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    let id = createdId;
    try {
      if (!id) {
        id = (await createOrganisation(name.trim())).organisation.id;
        setCreatedId(id);
      }
      await onCreated(id);
    } catch (failure) {
      setError(
        id
          ? "Your organisation was created, but we couldn't refresh access. Try opening it again."
          : `${errorMessage(failure)} If the request reached camOS, the organisation may have been created. Check Manage Access before submitting again.`,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccessDialog
      title="Create organisation"
      description="This will create a new camOS organisation. You will become its Owner."
      onClose={onClose}
      busy={busy}
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
        {error && (
          <p
            id="create-organisation-error"
            className="settings-form-error"
            role="alert"
          >
            {error}
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
}: {
  onClose: () => void;
  onRequested: () => Promise<void>;
}) {
  const [id, setId] = useState(""),
    [resolved, setResolved] = useState<ResolvedOrganisation | null>(null);
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
    if (busy) return;
    if (!resolved && !valid) {
      setError("Enter a valid numeric Organisation ID.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!resolved) setResolved(await resolveOrganisation(id.trim()));
      else {
        await requestOrganisationAccess(resolved.organisation.id);
        setSent(true);
        await onRequested().catch(() =>
          setError(
            "Your request was sent. Pending access couldn't refresh; it will update when you return.",
          ),
        );
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
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
      onClose={onClose}
      busy={busy}
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
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="vrm-btn vrm-btn-primary"
              disabled={
                busy ||
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
