export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

export type AccessLevel = "Admin" | "Manager" | "Viewer";

export type ManagedUser = {
  username: string;
  email: string;
  site: string;
  accessLevel: AccessLevel;
};

export type PendingInvite = {
  email: string;
  site: string;
  accessLevel: AccessLevel;
  invitedAt?: string;
};

export type UpdateMePayload = {
  name?: string;
  email?: string;
  phone?: string;
};
