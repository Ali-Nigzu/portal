interface Credentials {
  username?: string;
  password?: string;
}

export function determineOrgId(credentials: Credentials): string {
  const username = credentials?.username ?? "";
  if (username.startsWith("client")) {
    return username;
  }
  if (username && username !== "admin") {
    return username;
  }
  return "client0";
}
