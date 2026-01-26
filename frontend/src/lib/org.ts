import { Credentials } from '../types/credentials';

const DEFAULT_ORG_ID = 'client1';
const USERNAME_TO_ORG_MAP: Record<string, string> = {
  client1: 'client1',
  client2: 'client2',
  admin: 'client1',
};

export const deriveOrgIdFromTableName = (tableName?: string | null): string | undefined => {
  if (!tableName) {
    return undefined;
  }
  const trimmed = tableName.trim();
  if (!trimmed) {
    return undefined;
  }
  const segments = trimmed.split('.');
  const slug = segments[segments.length - 1]?.trim();
  if (!slug) {
    return undefined;
  }
  return slug || undefined;
};

export const determineOrgId = (credentials?: Partial<Credentials>): string => {
  if (credentials?.orgId) {
    return credentials.orgId;
  }
  const username = credentials?.username?.trim() ?? '';
  if (username && USERNAME_TO_ORG_MAP[username]) {
    return USERNAME_TO_ORG_MAP[username];
  }
  if (username.startsWith('client')) {
    return username;
  }
  return DEFAULT_ORG_ID;
};

export const USERNAME_TO_ORG = USERNAME_TO_ORG_MAP;
