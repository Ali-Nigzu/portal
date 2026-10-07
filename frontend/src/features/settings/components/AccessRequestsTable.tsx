import type { ManagedRelationship } from "../../organisation-access/api";
import { stateDate } from "./PendingInvitesTable";

type Props = {
  requests: ManagedRelationship[];
  busy: boolean;
  onDecision: (
    member: ManagedRelationship,
    action: "approve" | "decline",
  ) => void;
};
export default function AccessRequestsTable({
  requests,
  busy,
  onDecision,
}: Props) {
  if (!requests.length)
    return <p className="access-empty">No access requests</p>;
  return (
    <div className="settings-table-wrap">
      <table className="vrm-table settings-table access-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Requested</th>
            <th>
              <span className="access-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((member) => (
            <tr key={member.user_id}>
              <td>{member.username}</td>
              <td>{member.email}</td>
              <td>{stateDate(member.status_changed_at)}</td>
              <td className="access-table-actions">
                <div className="access-row-actions">
                  <button
                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                    disabled={busy}
                    onClick={() => onDecision(member, "decline")}
                    aria-label={`Decline request from ${member.username}`}
                  >
                    Decline
                  </button>
                  <button
                    className="vrm-btn vrm-btn-primary vrm-btn-sm"
                    disabled={busy || !member.user_enabled}
                    onClick={() => onDecision(member, "approve")}
                    aria-label={`Approve ${member.username}`}
                  >
                    Approve
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
