export type Relationship = {
  user_id: string;
  organisation_id: string;
  role: 0 | 1;
  status: 0 | 1 | 2 | 3;
  created_at: string;
  status_changed_at: string | null;
};
export type PendingRelationship = Relationship & { organisation_name: string };
export type PendingAccess = {
  invitations: PendingRelationship[];
  requests: PendingRelationship[];
};
export type ManagedRelationship = Relationship & {
  username: string;
  email: string;
  user_enabled: boolean;
};
export type ManageAccess = {
  organisation: { id: string; name: string };
  actor_role: 0 | 1;
  can_manage: boolean;
  members: ManagedRelationship[];
  invitations: ManagedRelationship[];
  requests: ManagedRelationship[];
};
export type ResolvedOrganisation = {
  organisation: { id: string; name: string };
  relationship: Relationship | null;
  can_request: boolean;
};

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/portal${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      signal,
      headers:
        body === undefined
          ? undefined
          : { "Content-Type": "application/json", "X-Requested-With": "camOS" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccessError(
      "connection_unavailable",
      "Couldn't connect. Check your connection and try again.",
      0,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AccessError(
      data?.detail?.error ?? "request_failed",
      data?.detail?.message ??
        (response.status === 401
          ? "Please sign in again."
          : "Unable to complete this request. Please try again."),
      response.status,
    );
  }
  return data as T;
}

const org = (id: string) => `/organisations/${encodeURIComponent(id)}`;
export const pendingAccess = (signal?: AbortSignal) =>
  request<PendingAccess>("/me/memberships/pending", undefined, signal);
export const createOrganisation = (name: string) =>
  request<{ organisation: { id: string; name: string; role: 0; sites: [] } }>(
    "/organisations",
    { name },
  );
export const resolveOrganisation = (id: string) =>
  request<ResolvedOrganisation>(
    `/organisation-access/${encodeURIComponent(id)}`,
  );
export const requestOrganisationAccess = (id: string) =>
  request<{ membership: Relationship }>(
    `/organisation-access/${encodeURIComponent(id)}/requests`,
    {},
  );
export const getManageAccess = (id: string, signal?: AbortSignal) =>
  request<ManageAccess>(`${org(id)}/access`, undefined, signal);
export const inviteMember = (
  id: string,
  identifier_type: "email" | "username",
  identifier: string,
) =>
  request<{ membership: Relationship }>(`${org(id)}/invitations`, {
    identifier_type,
    identifier,
  });
export const decideInvitation = (
  relationship: Relationship,
  action: "accept" | "decline",
) =>
  request<{ membership: Relationship }>(
    `/me/invitations/${encodeURIComponent(relationship.organisation_id)}/${action}`,
    { expected_status_changed_at: relationship.status_changed_at },
  );
export const manageMembership = (
  relationship: Relationship,
  action: "withdraw" | "approve" | "decline" | "disable",
) => {
  const section =
    action === "withdraw"
      ? "invitations"
      : action === "disable"
        ? "members"
        : "requests";
  return request<{ membership: Relationship }>(
    `${org(relationship.organisation_id)}/${section}/${encodeURIComponent(relationship.user_id)}/${action}`,
    { expected_status_changed_at: relationship.status_changed_at },
  );
};

export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete this request. Please try again.";

export const disableOrganisation = (id: string) => request<{ organisation_id: string; enabled: false }>(`${org(id)}/disable`, {});
