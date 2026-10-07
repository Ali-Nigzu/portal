import type { ManagedRelationship } from "../../organisation-access/api";

export function stateDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
}
type Props = {
  invites: ManagedRelationship[];
  busy: boolean;
  onWithdraw: (member: ManagedRelationship) => void;
};

export default function PendingInvitesTable({
  invites,
  busy,
  onWithdraw,
}: Props) {
  if (!invites.length)
    return <p className="access-empty">No pending invitations</p>;
  return (
    <div className="settings-table-wrap">
      <table className="vrm-table settings-table access-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Invited</th>
            <th>
              <span className="access-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invites.map((member) => (
            <tr key={member.user_id}>
              <td>{member.username}</td>
              <td>{member.email}</td>
              <td>{stateDate(member.status_changed_at)}</td>
              <td className="access-table-actions">
                <button
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  disabled={busy}
                  onClick={() => onWithdraw(member)}
                  aria-label={`Withdraw invitation for ${member.username}`}
                >
                  Withdraw
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
