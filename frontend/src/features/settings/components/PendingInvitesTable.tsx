import React from "react";

import type { PendingInvite } from "../types";

type PendingInvitesTableProps = {
  invites: PendingInvite[];
};

const PendingInvitesTable: React.FC<PendingInvitesTableProps> = ({ invites }) => (
  <div style={{ overflowX: "auto" }}>
    <table className="vrm-table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Site</th>
          <th>Access level</th>
          <th>Invited</th>
        </tr>
      </thead>
      <tbody>
        {invites.length === 0 ? (
          <tr>
            <td colSpan={4} className="settings-empty-row">No pending invitations.</td>
          </tr>
        ) : (
          invites.map((invite) => (
            <tr key={`${invite.email}-${invite.site}`}>
              <td>{invite.email}</td>
              <td>{invite.site}</td>
              <td>{invite.accessLevel}</td>
              <td>{invite.invitedAt ?? "-"}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default PendingInvitesTable;
