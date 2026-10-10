import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";
import { useOrganisationAccess } from "./OrganisationAccessContext";
import PersonalAccess, {
  usePersonalAccess,
} from "./PersonalAccess";
import AccessDialog from "./AccessDialog";
import {
  getManageAccess,
  disableOrganisation,
  inviteMember,
  manageMembership,
  errorMessage,
  type ManageAccess,
  type ManagedRelationship,
} from "./api";
import InviteUserModal from "./InviteUserModal";
import PendingInvitesTable from "./PendingInvitesTable";
import AccessRequestsTable from "./AccessRequestsTable";
import UsersTable from "./UsersTable";
import SettingsFrame from "../settings/components/SettingsFrame";
import SettingsPageHeader from "../settings/components/SettingsPageHeader";
import "../settings/SettingsPages.css";

export default function ManageAccessPage() {
  const { organisations, user, favouritesCatalogueReady } =
    useAuthenticatedApplication();
  const { refreshAccess, openCreate, openRequest } = useOrganisationAccess();
  const personal = usePersonalAccess();
  const [search, setSearch] = useSearchParams();
  const selected = search.get("organisation_id");
  const id =
    selected ?? (organisations.length === 1 ? organisations[0].id : null);
  const eligible = organisations.some((organisation) => organisation.id === id);
  const [loadedData, setData] = useState<ManageAccess | null>(null),
    [loading, setLoading] = useState(false);
  const data = loadedData?.organisation.id === id ? loadedData : null;
  const scopedAccessReady = !eligible || data !== null;
  const sentInvitations = data?.can_manage ? data.invitations : [];
  const receivedRequests = data?.can_manage ? data.requests : [];
  const currentId = useRef(id);
  currentId.current = id;
  const [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0),
    [invite, setInvite] = useState(false),
    [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    member: ManagedRelationship;
    action: "disable" | "withdraw";
  } | null>(null);
  const [deleteOrganisation, setDeleteOrganisation] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError(null);
    setMessage(null);
    setCopied(false);
    setInvite(false);
    setConfirmation(null);
    setDeleteOrganisation(false);
    setDeleteError(null);
    if (!id || !eligible) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getManageAccess(id, abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) setData(next);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(errorMessage(failure));
          window.dispatchEvent(new Event("camos:refresh-access"));
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, eligible, revision]);
  const reload = async () => {
    if (!id) return;
    const next = await getManageAccess(id);
    if (currentId.current === id) setData(next);
    await refreshAccess();
  };
  const decision = async (
    member: ManagedRelationship,
    action: "approve" | "decline" | "withdraw" | "disable",
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setConfirmError(null);
    try {
      await manageMembership(member, action);
      if (currentId.current !== member.organisation_id) {
        await refreshAccess();
        return;
      }
      setConfirmation(null);
      setMessage(
        action === "approve"
          ? `${member.username} now has access.`
          : action === "decline"
            ? "Access request declined."
            : action === "withdraw"
              ? "Invitation withdrawn."
              : `${member.username}'s access is disabled.`,
      );
      await reload();
    } catch (failure) {
      if (currentId.current !== member.organisation_id) return;
      if (confirmation) setConfirmError(errorMessage(failure));
      else setError(errorMessage(failure));
      if (id)
        void getManageAccess(id)
          .then((next) => {
            if (currentId.current === id) setData(next);
          })
          .catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy the ID. You can select and copy it below.");
    }
  };
  return (
    <SettingsFrame>
      <SettingsPageHeader
        title="Manage Access"
        action={
          data?.can_manage ? (
            <button
              className="vrm-btn vrm-btn-primary vrm-btn-sm access-primary-cta"
              onClick={() => setInvite(true)}
              disabled={busy}
            >
              Invite member
            </button>
          ) : undefined
        }
      />
      <div className="vrm-card access-organisation-card">
        <div className="vrm-card-body access-organisation-body">
          {organisations.length > 1 ||
          (!!selected && !eligible && organisations.length > 0) ? (
            <div className="settings-form-field">
              <label
                htmlFor="access-organisation"
                className="settings-form-label"
              >
                Organisation
              </label>
              <select
                id="access-organisation"
                className="settings-select access-organisation-select"
                value={eligible ? id! : ""}
                disabled={busy}
                onChange={(event) => {
                  const next = new URLSearchParams(search);
                  next.set("organisation_id", event.target.value);
                  setSearch(next);
                }}
              >
                <option value="" disabled>
                  Select an organisation
                </option>
                {organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </div>
          ) : eligible ? (
            <h2 className="vrm-card-title">
              {
                organisations.find((organisation) => organisation.id === id)
                  ?.name
              }
            </h2>
          ) : null}
          {eligible && (
            <div className="access-organisation-id">
              <span>
                Organisation ID <strong>{id}</strong>
              </span>
              <button
                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                aria-label="Copy Organisation ID"
                onClick={() => void copy()}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy ID"}
              </button>
              <span className="access-sr-only" role="status">
                {copied ? "Organisation ID copied" : ""}
              </span>
            </div>
          )}
          {!favouritesCatalogueReady ? (
            <p className="access-description">
              The organisation catalogue is unavailable. Try refreshing access
              below.
            </p>
          ) : !organisations.length ? (
            <p className="access-description">
              You don't belong to an organisation yet. Your invitations and
              requests are below.
            </p>
          ) : !eligible ? (
            <p className="access-description">
              {selected
                ? "That organisation is no longer available. Select an organisation to manage access."
                : "Select an organisation to view access."}
            </p>
          ) : null}
        </div>
      </div>
      {loading && (
        <p role="status" className="access-description">
          Loading organisation access…
        </p>
      )}
      {error && (
        <div className="access-feedback" role="alert">
          <p className="settings-form-error">{error}</p>
          <button
            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="settings-form-message">
          {message}
        </p>
      )}
      {data && data.can_manage && (
        <>
          <section
            className="vrm-card settings-manage-access-card"
            aria-label="Members"
          >
            <div className="vrm-card-header">
              <h2 className="vrm-card-title">Members</h2>
            </div>
            <UsersTable
              users={data.members}
              currentUserId={user.id}
              busy={busy}
              onDisable={(member) => {
                setConfirmError(null);
                setConfirmation({ member, action: "disable" });
              }}
            />
          </section>
        </>
      )}
      {data && !data.can_manage && (
        <div className="vrm-card">
          <div className="vrm-card-body">
            <p className="access-description">
              You are a Member of {data.organisation.name}. An organisation
              Owner manages invitations, requests and member access.
            </p>
          </div>
        </div>
      )}
      <section
        id="personal-access"
        className="vrm-card settings-manage-access-card"
        aria-label="Pending invitations"
      >
        <div className="vrm-card-header">
          <h2 className="vrm-card-title">Pending invitations</h2>
        </div>
        {!!sentInvitations.length && (
          <>
            {!!personal.pending.invitations.length && (
              <h3 className="access-perspective-label">
                Sent for {data?.organisation.name}
              </h3>
            )}
            <PendingInvitesTable
              invites={sentInvitations}
              busy={busy}
              onWithdraw={(member) => {
                setConfirmError(null);
                setConfirmation({ member, action: "withdraw" });
              }}
            />
          </>
        )}
        {!!sentInvitations.length && !!personal.pending.invitations.length && (
          <h3 className="access-perspective-label">Invitations for you</h3>
        )}
        <PersonalAccess kind="invitations" access={personal} />
        {!personal.pendingLoading &&
          scopedAccessReady &&
          !personal.pendingError &&
          !sentInvitations.length &&
          !personal.pending.invitations.length && (
            <p className="access-empty">No pending invitations</p>
          )}
      </section>
      <section
        className="vrm-card settings-manage-access-card"
        aria-label="Access requests"
      >
        <div className="vrm-card-header">
          <h2 className="vrm-card-title">Access requests</h2>
        </div>
        {!!receivedRequests.length && (
          <>
            {!!personal.pending.requests.length && (
              <h3 className="access-perspective-label">
                Requests to {data?.organisation.name}
              </h3>
            )}
            <AccessRequestsTable
              requests={receivedRequests}
              busy={busy}
              onDecision={(member, action) => void decision(member, action)}
            />
          </>
        )}
        {!!receivedRequests.length && !!personal.pending.requests.length && (
          <h3 className="access-perspective-label">Your requests</h3>
        )}
        <PersonalAccess kind="requests" access={personal} />
        {!personal.pendingLoading &&
          scopedAccessReady &&
          !personal.pendingError &&
          !receivedRequests.length &&
          !personal.pending.requests.length && (
            <p className="access-empty">No access requests</p>
          )}
      </section>
      {(personal.error || personal.pendingError) && (
        <div className="access-feedback" role="alert">
          <p className="settings-form-error">
            {personal.error || personal.pendingError}
          </p>
          <button
            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
            onClick={personal.retry}
          >
            Try again
          </button>
        </div>
      )}
      {personal.message && (
        <p className="settings-form-message" role="status">
          {personal.message}
        </p>
      )}
      <div className="access-row-actions access-page-actions">
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
      {data?.can_manage && (
        <section className="access-organisation-danger" aria-label="Delete Organisation">
          <p>Disable customer access to this organisation while keeping its data.</p>
          <button className="vrm-btn access-danger-button" disabled={busy} onClick={() => { setDeleteError(null); setDeleteOrganisation(true); }}>Delete Organisation</button>
        </section>
      )}
      {deleteOrganisation && data?.can_manage && id && (
        <AccessDialog title="Delete Organisation" description={`Delete ${data.organisation.name}? Customer access will stop. Sites, devices and all other data remain. Internal camOS Admin can re-enable it.`} busy={busy} onClose={() => setDeleteOrganisation(false)}>
          {deleteError && <p role="alert" className="settings-form-error">{deleteError}</p>}
          <div className="settings-form-actions">
            <button data-autofocus className="vrm-btn vrm-btn-secondary" disabled={busy} onClick={() => setDeleteOrganisation(false)}>Cancel</button>
            <button className="vrm-btn access-danger-button" disabled={busy} onClick={async () => {
              if (busy) return;
              const deletingId = id;
              setBusy(true); setDeleteError(null);
              try {
                await disableOrganisation(deletingId);
                setDeleteOrganisation(false); setData(null);
                const next = new URLSearchParams(search); next.delete("organisation_id"); setSearch(next, { replace: true });
                setMessage("Organisation deleted. Its data has been kept.");
                try { await refreshAccess(); } catch { setError("Organisation deleted, but access refresh failed. Refresh access to update navigation."); }
              } catch (failure) { if (currentId.current === deletingId) setDeleteError(errorMessage(failure)); }
              finally { setBusy(false); }
            }}>{busy ? "Deleting…" : "Delete Organisation"}</button>
          </div>
        </AccessDialog>
      )}
      {invite && data?.can_manage && id && (
        <InviteUserModal
          organisations={organisations}
          initialOrganisationId={id}
          onClose={() => setInvite(false)}
          onSubmitted={async (payload) => {
            await inviteMember(
              payload.organisation_id,
              payload.identifier_type,
              payload.identifier,
            );
            if (currentId.current !== id) {
              await refreshAccess();
              return;
            }
            setMessage(
              `Invitation sent for ${organisations.find((organisation) => organisation.id === payload.organisation_id)?.name ?? "the organisation"}. The member will have access after accepting.`,
            );
            await reload();
          }}
        />
      )}
      {confirmation && (
        <AccessDialog
          title={
            confirmation.action === "disable"
              ? "Disable member access"
              : "Withdraw invitation"
          }
          description={
            confirmation.action === "disable"
              ? `${confirmation.member.username} will no longer have access to ${data?.organisation.name}. You can invite them again later.`
              : `Withdraw ${confirmation.member.username}'s invitation to ${data?.organisation.name}?`
          }
          onClose={() => setConfirmation(null)}
          busy={busy}
        >
          {confirmError && (
            <p role="alert" className="settings-form-error">
              {confirmError}
            </p>
          )}
          <div className="settings-form-actions">
            <button
              data-autofocus
              className="vrm-btn vrm-btn-secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </button>
            <button
              className="vrm-btn vrm-btn-primary"
              disabled={busy}
              onClick={() =>
                void decision(confirmation.member, confirmation.action)
              }
            >
              {busy
                ? "Please wait…"
                : confirmation.action === "disable"
                  ? "Disable access"
                  : "Withdraw invitation"}
            </button>
          </div>
        </AccessDialog>
      )}
    </SettingsFrame>
  );
}
