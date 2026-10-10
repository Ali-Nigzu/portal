import { Credentials } from "../types/credentials";

const DEFAULT_ORG_ID = "client1";
const USERNAME_TO_ORG_MAP: Record<string, string> = {
  client1: "client1",
  client2: "client2",
};

export const determineOrgId = (credentials?: Partial<Credentials>): string => {
  if (credentials?.orgId) {
    return credentials.orgId;
  }
  const username = credentials?.username?.trim() ?? "";
  if (username && USERNAME_TO_ORG_MAP[username]) {
    return USERNAME_TO_ORG_MAP[username];
  }
  if (username.startsWith("client")) {
    return username;
  }
  return DEFAULT_ORG_ID;
};
