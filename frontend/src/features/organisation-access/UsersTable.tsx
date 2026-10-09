import type { ManagedRelationship } from "./api";

type Props = {
  users: ManagedRelationship[];
  currentUserId: string;
  busy: boolean;
  onDisable: (member: ManagedRelationship) => void;
};

export default function UsersTable({
  users,
  currentUserId,
  busy,
  onDisable,
}: Props) {
  return (
    <div className="settings-table-wrap">
      <table className="vrm-table settings-table access-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Role</th>
            <th>
              <span className="access-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((member) => (
            <tr key={member.user_id}>
              <td>
                {member.username}
                {member.user_id === currentUserId && (
                  <span className="access-you">You</span>
                )}
              </td>
              <td>
                {member.email}
                {!member.user_enabled && (
                  <span className="access-you">Account disabled</span>
                )}
              </td>
              <td>{member.role === 0 ? "Owner" : "Member"}</td>
              <td className="access-table-actions">
                {member.user_id !== currentUserId && member.role === 1 && (
                  <button
                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                    disabled={busy}
                    onClick={() => onDisable(member)}
                    aria-label={`Disable ${member.username}`}
                  >
                    Disable
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
