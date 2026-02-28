import React, { useEffect, useRef, useState } from "react";

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
  const [currentUserSite, setCurrentUserSite] = useState("all-sites");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const inviteButtonRef = useRef<HTMLButtonElement | null>(null);

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
    };

    load();
  }, []);

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
            Invite user
          </button>
        }
      />

      <div className="vrm-card">
        <div className="vrm-card-header">
          <h2 className="vrm-card-title">Users</h2>
        </div>
        <div className="vrm-card-body settings-table-card-body">
          <UsersTable
            users={users}
            currentUsername={currentUser?.name}
            currentUserSite={currentUserSite}
            onCurrentUserSiteChange={setCurrentUserSite}
          />
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
