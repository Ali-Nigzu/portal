import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  getManagedUsers,
  getMe,
  getPendingInvites,
  inviteUser,
  isNotImplementedError,
} from "../api/settingsApi";
import InviteUserModal from "../components/InviteUserModal";
import PendingInvitesTable from "../components/PendingInvitesTable";
import SettingsFrame from "../components/SettingsFrame";
import SettingsPageHeader from "../components/SettingsPageHeader";
import UsersTable from "../components/UsersTable";
import type { AccessLevel, ManagedUser, PendingInvite, SettingsUser } from "../types";
import "../SettingsPages.css";

const ManageAccessPage: React.FC = () => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [currentUser, setCurrentUser] = useState<SettingsUser | null>(null);
  const [baselineCurrentUserSites, setBaselineCurrentUserSites] = useState<string[]>(["all-sites"]);
  const [currentUserSites, setCurrentUserSites] = useState<string[]>(["all-sites"]);
  const [currentUserSitesError, setCurrentUserSitesError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const inviteButtonRef = useRef<HTMLButtonElement | null>(null);

  const siteOptions = [
    { id: "all-sites", label: "All Sites" },
  ];

  const isDirty = useMemo(() => {
    const left = [...baselineCurrentUserSites].sort().join("|");
    const right = [...currentUserSites].sort().join("|");
    return left !== right;
  }, [baselineCurrentUserSites, currentUserSites]);

  useEffect(() => {
    const load = async () => {
      const [me, loadedUsers, loadedInvites] = await Promise.all([
        getMe(),
        getManagedUsers(),
        getPendingInvites(),
      ]);

      setCurrentUser(me);
      const currentUserRow: ManagedUser = {
        username: me.name,
        email: me.email,
        site: "All Sites",
        accessLevel: "Admin",
      };

      setUsers([currentUserRow, ...loadedUsers]);
      setInvites(loadedInvites);
      setBaselineCurrentUserSites(["all-sites"]);
      setCurrentUserSites(["all-sites"]);
    };

    load();
  }, []);

  const handleCurrentUserSitesChange = (sites: string[]) => {
    setCurrentUserSites(sites);
    setSaveMessage(null);
    if (sites.length > 0) {
      setCurrentUserSitesError(null);
    }
  };

  const handleCurrentUserSitesSave = () => {
    if (currentUserSites.length === 0) {
      setCurrentUserSitesError("Sites required");
      return;
    }
    setCurrentUserSitesError(null);
    setBaselineCurrentUserSites(currentUserSites);
    setSaveMessage("Access settings saved.");
  };

  const handleInviteSubmit = async (payload: {
    email: string;
    site: string;
    accessLevel: AccessLevel;
  }) => {
    try {
      await inviteUser(payload);
    } catch (error) {
      if (isNotImplementedError(error)) {
        throw new Error("Not implemented yet");
      }
      throw error;
    }
  };

  const handleCloseModal = () => {
    setIsInviteOpen(false);
    window.setTimeout(() => inviteButtonRef.current?.focus(), 0);
  };

  return (
    <SettingsFrame>
      <SettingsPageHeader
        title="Manage Access"
        action={
          <button
            ref={inviteButtonRef}
            className="vrm-btn vrm-btn-primary vrm-btn-sm"
            onClick={() => setIsInviteOpen(true)}
          >
            Invite Users
          </button>
        }
      />

      <div className="vrm-card">
        <div className="vrm-card-header settings-users-card-header">
          <h2 className="vrm-card-title">Users</h2>
          <button
            type="button"
            className={`vrm-btn vrm-btn-sm ${isDirty ? "vrm-btn-primary settings-save-cta--active" : "vrm-btn-secondary settings-save-cta--inactive"}`}
            onClick={handleCurrentUserSitesSave}
          >
            Save
          </button>
        </div>
        <div className="vrm-card-body settings-table-card-body">
          <UsersTable
            users={users}
            currentUsername={currentUser?.name}
            currentUserSites={currentUserSites}
            currentUserSitesError={currentUserSitesError}
            onCurrentUserSitesChange={handleCurrentUserSitesChange}
            siteOptions={siteOptions}
          />
          {saveMessage ? <div className="settings-form-message settings-manage-access-save-message">{saveMessage}</div> : null}
        </div>
      </div>

      <div className="vrm-card">
        <div className="vrm-card-header">
          <h2 className="vrm-card-title">Pending invitations</h2>
        </div>
        <div className="vrm-card-body settings-table-card-body">
          <PendingInvitesTable invites={invites} />
        </div>
      </div>

      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={handleCloseModal}
        onSubmitted={handleInviteSubmit}
      />
    </SettingsFrame>
  );
};

export default ManageAccessPage;
