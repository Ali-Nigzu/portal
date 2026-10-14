import { type ManagedRelationship, getManageAccess, disableOrganisation, inviteMember, manageMembership, errorMessage, type ManageAccess } from "./api";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { useAuthenticatedApplication } from "../../context/AuthenticatedApplicationContext";
import { useOrganisationAccess } from "./OrganisationAccessContext";
import PersonalAccess, {
  usePersonalAccess,
} from "./PersonalAccess";
import AccessDialog from "../../common/components/AccessDialog";

import InviteUserModal from "./InviteUserModal";
import PendingInvitesTable from "./PendingInvitesTable";
import AccessRequestsTable from "./AccessRequestsTable";
import UsersTable from "./UsersTable";
import SettingsFrame, { SettingsPageHeader } from "../../components/SettingsFrame";

import "../settings/SettingsPages.css";
import { RequestFailure } from "../auth/transport/me";

export default function ManageAccessPage() {
  const { organisations, user, accountSignal, favouritesCatalogueReady, catalogueError, refreshOrganisations, removeOrganisation } =
    useAuthenticatedApplication();
  const { refreshAccess, openCreate, openRequest, actionNotice } = useOrganisationAccess();
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
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const deleteController = useRef<AbortController | null>(null);
  const uncertainDeletes = useRef(new Set<string>());
  const decisionController = useRef<AbortController | null>(null);
  const closeDelete = () => {
    if (deleteController.current) {
      if (id) uncertainDeletes.current.add(id);
      setDeleteMessage("Please check before trying again.");
      deleteController.current.abort(); deleteController.current = null; setBusy(false);
      void refreshAccess().catch(() => {});
    }
    setDeletePassword(""); setDeleteOrganisation(false); setDeleteError(null);
  };
  useEffect(() => {
    const cancel = () => closeDelete();
    accountSignal?.addEventListener("abort", cancel, { once: true });
    return () => { accountSignal?.removeEventListener("abort", cancel); deleteController.current?.abort(); decisionController.current?.abort(); };
  }, [accountSignal]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null),
    [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError(null);
    if (favouritesCatalogueReady) setMessage(null);
    setCopied(false);
    setInvite(false);
    setConfirmation(null);
    closeDelete();
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
    if (busy || decisionController.current) return;
    const controller = new AbortController();
    decisionController.current = controller;
    setBusy(true);
    setError(null);
    setMessage(null);
    setConfirmError(null);
    try {
      const result = await manageMembership(member, action, controller.signal);
      if (controller.signal.aborted) return;
      if (currentId.current !== member.organisation_id) {
        await refreshAccess();
        return;
      }
      setConfirmation(null);
      setData(previous => previous ? {
        ...previous,
        members: [...previous.members.filter(item => item.user_id !== member.user_id), ...(result.membership.status === 1 ? [{ ...member, ...result.membership }] : [])],
        invitations: previous.invitations.filter(item => item.user_id !== member.user_id),
        requests: previous.requests.filter(item => item.user_id !== member.user_id),
      } : previous);
      setMessage(
        action === "approve"
          ? `${member.username} now has access.`
          : action === "decline"
            ? "Access request declined."
            : action === "withdraw"
              ? "Invitation withdrawn."
              : `${member.username}'s access is disabled.`,
      );
      void reload().catch(() => {});
    } catch (failure) {
      if (controller.signal.aborted) return;
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
      if (decisionController.current === controller) decisionController.current = null;
      if (!controller.signal.aborted) setBusy(false);
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
              {catalogueError ? <>Can't load organisations. <button className="vrm-btn vrm-btn-sm" onClick={() => void refreshOrganisations().catch(() => {})}>Retry</button></> : "Loading…"}
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
      {deleteMessage && <p role="status" className="settings-form-message">{deleteMessage}</p>}
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
      {actionNotice && <p className="settings-form-message" role="status">{actionNotice}</p>}
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
          <p>Delete access to this organisation.</p>
          <button className="vrm-btn access-danger-button" disabled={busy} onClick={() => { setDeleteError(null); setDeletePassword(""); setDeleteMessage(null); setDeleteOrganisation(true); }}>Delete Organisation</button>
        </section>
      )}
      {deleteOrganisation && data?.can_manage && id && (
        <AccessDialog title="Delete organisation" description={<>Deleting your organisation is irreversible after 7 days. If you change your mind, please <Link to="/contact">contact us</Link> within this period.</>} busy={busy} cancelBusy onClose={closeDelete}>
          {!user.has_password ? <p>Set a camOS account password in <Link to="/settings/account">Settings → My Account</Link> before deleting an organisation.</p> :
            <label className="settings-field-label">Current account password
              <input className="settings-input" required data-autofocus type="password" autoComplete="current-password" maxLength={1024}
                value={deletePassword} disabled={busy} onChange={event => setDeletePassword(event.target.value)} />
            </label>}
          {deleteError && <p role="alert" className="settings-form-error">{deleteError}</p>}
          <div className="settings-form-actions">
            <button className="vrm-btn vrm-btn-secondary" onClick={() => {
              closeDelete();
            }}>Cancel</button>
            <button className="vrm-btn access-danger-button" disabled={busy || !user.has_password || !deletePassword || accountSignal?.aborted || uncertainDeletes.current.has(id)} onClick={async () => {
              if (busy || deleteController.current || !user.has_password || !deletePassword || accountSignal?.aborted || uncertainDeletes.current.has(id)) return;
              const deletingId = id;
              const controller = new AbortController();
              deleteController.current = controller;
              setBusy(true); setDeleteError(null);
              try {
                await disableOrganisation(deletingId, deletePassword, controller.signal);
                if (controller.signal.aborted || currentId.current !== deletingId) return;
                setDeletePassword(""); setDeleteOrganisation(false); setData(null);
                removeOrganisation?.(deletingId);
                const next = new URLSearchParams(search); next.delete("organisation_id"); setSearch(next, { replace: true });
                setDeleteMessage("Organisation deleted.");
                void refreshAccess().catch(() => {});
              } catch (failure) {
                if (failure instanceof RequestFailure && failure.uncertain) { uncertainDeletes.current.add(deletingId); void refreshAccess().catch(() => {}); }
                if (!controller.signal.aborted && currentId.current === deletingId) setDeleteError(errorMessage(failure));
              } finally {
                if (deleteController.current === controller) { deleteController.current = null; setBusy(false); }
              }
            }}>{busy ? "Disabling…" : "Delete Organisation"}</button>
          </div>
        </AccessDialog>
      )}
      {invite && data?.can_manage && id && (
        <InviteUserModal
          onUncertain={() => { setMessage("Please check before trying again."); void reload().catch(() => {}); }}
          organisations={organisations}
          initialOrganisationId={id}
          onClose={() => setInvite(false)}
          onSubmitted={async (payload, signal) => {
            await inviteMember(
              payload.organisation_id,
              payload.identifier_type,
              payload.identifier,
              signal,
            );
            if (signal.aborted) return;
            if (currentId.current !== id) {
              void refreshAccess().catch(() => {});
              return;
            }
            setMessage("Invitation sent.");
            void reload().catch(() => {});
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
          onClose={() => { if (decisionController.current) { decisionController.current.abort(); decisionController.current = null; setBusy(false); setMessage("Please check before trying again."); void reload().catch(() => {}); } setConfirmation(null); }}
          busy={busy}
          cancelBusy
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
              onClick={() => { decisionController.current?.abort(); decisionController.current = null; setBusy(false); setConfirmation(null); void reload().catch(() => {}); }}
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
