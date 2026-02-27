import React, { useEffect, useState } from "react";

import {
  getManagedUsers,
  getPendingInvites,
  inviteUser,
  isNotImplementedError,
} from "../api/settingsApi";
import PendingInvitesTable from "../components/PendingInvitesTable";
import UsersTable from "../components/UsersTable";
import type { AccessLevel, ManagedUser, PendingInvite } from "../types";
import "../SettingsPages.css";

const ManageAccessPage: React.FC = () => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSite, setInviteSite] = useState("");
  const [inviteAccessLevel, setInviteAccessLevel] = useState<AccessLevel>("Viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [loadedUsers, loadedInvites] = await Promise.all([
        getManagedUsers(),
        getPendingInvites(),
      ]);
      setUsers(loadedUsers);
      setInvites(loadedInvites);
    };
    load();
  }, []);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviteError(null);

    if (!inviteEmail.trim() || !inviteSite.trim()) {
      setInviteError("Email, site, and access level are required");
      return;
    }

    try {
      await inviteUser({
        email: inviteEmail.trim(),
        site: inviteSite.trim(),
        accessLevel: inviteAccessLevel,
      });
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteSite("");
      setInviteAccessLevel("Viewer");
    } catch (error) {
      if (isNotImplementedError(error)) {
        setInviteError("Not implemented yet");
        return;
      }
      setInviteError(error instanceof Error ? error.message : "Unable to send invite");
    }
  };

  return (
    <section className="settings-page">
      <div className="vrm-card">
        <div className="vrm-card-header settings-title-row">
          <h2 className="vrm-card-title">Manage Access</h2>
          <button className="vrm-btn vrm-btn-sm" onClick={() => setShowInviteForm(true)}>
            Invite user
          </button>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <UsersTable users={users} />
        </div>
      </div>

      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Pending invitations</h3>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <PendingInvitesTable invites={invites} />
        </div>
      </div>

      {showInviteForm && (
        <div className="settings-modal-backdrop">
          <div className="vrm-card settings-modal">
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Invite user</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleInvite} className="settings-form-grid">
                <div className="settings-form-field">
                  <label className="settings-form-label">Email</label>
                  <input
                    className="settings-input"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </div>
                <div className="settings-form-field">
                  <label className="settings-form-label">Site</label>
                  <input
                    className="settings-input"
                    type="text"
                    value={inviteSite}
                    onChange={(event) => setInviteSite(event.target.value)}
                    placeholder="Enter site"
                  />
                </div>
                <div className="settings-form-field">
                  <label className="settings-form-label">Access level</label>
                  <select
                    className="settings-select"
                    value={inviteAccessLevel}
                    onChange={(event) => setInviteAccessLevel(event.target.value as AccessLevel)}
                  >
                    <option value="Viewer">Viewer</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                {inviteError && <div className="settings-form-error">{inviteError}</div>}
                <div className="settings-form-actions">
                  <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => setShowInviteForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn vrm-btn-sm">Send invite</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ManageAccessPage;
