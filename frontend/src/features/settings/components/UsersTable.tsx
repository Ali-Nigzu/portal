import React from "react";
import SiteMultiSelect from "./SiteMultiSelect";

import type { ManagedUser } from "../types";

type UsersTableProps = {
  users: ManagedUser[];
  currentUsername?: string;
  currentUserSites: string[];
  currentUserSitesError?: string | null;
  onCurrentUserSitesChange: (sites: string[]) => void;
  siteOptions: Array<{ id: string; label: string }>;
};

const UsersTable: React.FC<UsersTableProps> = ({
  users,
  currentUsername,
  currentUserSites,
  currentUserSitesError,
  onCurrentUserSitesChange,
  siteOptions,
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
                  <SiteMultiSelect
                    options={siteOptions}
                    selectedSites={currentUserSites}
                    onChange={onCurrentUserSitesChange}
                    placeholder="Select sites"
                    error={currentUserSitesError}
                  />
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
