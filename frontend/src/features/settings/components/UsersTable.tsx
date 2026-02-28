import React from "react";

import type { ManagedUser } from "../types";

type UsersTableProps = {
  users: ManagedUser[];
  currentUsername?: string;
  currentUserSite: string;
  onCurrentUserSiteChange: (site: string) => void;
};

const UsersTable: React.FC<UsersTableProps> = ({
  users,
  currentUsername,
  currentUserSite,
  onCurrentUserSiteChange,
}) => (
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
        {users.map((user) => {
          const isCurrentUser = Boolean(currentUsername) && user.username === currentUsername;
          return (
            <tr key={`${user.username}-${user.email}`}>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>
                {isCurrentUser ? (
                  <select
                    className="settings-select settings-site-select"
                    value={currentUserSite}
                    onChange={(event) => onCurrentUserSiteChange(event.target.value)}
                  >
                    <option value="all-sites">All Sites</option>
                  </select>
                ) : (
                  user.site
                )}
              </td>
              <td>{user.accessLevel}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default UsersTable;
