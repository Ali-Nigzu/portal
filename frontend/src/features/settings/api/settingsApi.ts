import { fetchMe } from "../../auth/transport/me";
import type {
  AccessLevel,
  ManagedUser,
  PendingInvite,
  SettingsUser,
  UpdateMePayload,
} from "../types";

const notImplementedError = new Error("Not implemented yet");

export const getMe = async (): Promise<SettingsUser> => {
  const response = await fetchMe();
  if (!response.ok) {
    throw new Error("Unable to load account details");
  }
  return response.data.user;
};

export const verifyCurrentPassword = async (
  email: string,
  password: string,
): Promise<void> => {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });

  if (!response.ok) {
    throw new Error("Incorrect password");
  }
};

export const updateMe = async (_payload: UpdateMePayload): Promise<void> => {
  throw notImplementedError;
};

export const updatePassword = async (_password: string): Promise<void> => {
  throw notImplementedError;
};

export const getManagedUsers = async (): Promise<ManagedUser[]> => [];

export const getPendingInvites = async (): Promise<PendingInvite[]> => [];

export const inviteUser = async (_payload: {
  email: string;
  site: string;
  accessLevel: AccessLevel;
}): Promise<void> => {
  throw notImplementedError;
};

export const isNotImplementedError = (error: unknown) =>
  error instanceof Error && error.message === "Not implemented yet";
