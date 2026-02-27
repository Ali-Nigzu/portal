import React from "react";

import type { ManagedUser } from "../types";

type UsersTableProps = {
  users: ManagedUser[];
};

const UsersTable: React.FC<UsersTableProps> = ({ users }) => (
  <div className="settings-table-wrap">
    <table className="vrm-table settings-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Site</th>
          <th>Access level</th>
        </tr>
      </thead>
      <tbody>
        {users.length === 0 ? (
          <tr>
            <td colSpan={4} className="settings-empty-row">
              <div className="settings-empty-title">No users yet</div>
              <div className="settings-empty-hint">Invite a user to grant access to a site.</div>
            </td>
          </tr>
        ) : (
          users.map((user) => (
            <tr key={`${user.username}-${user.site}`}>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.site}</td>
              <td>{user.accessLevel}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default UsersTable;
