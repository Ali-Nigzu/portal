import { determineOrgId, deriveOrgIdFromTableName } from './org';

describe('org utils', () => {
  it('prefers explicit orgId on credentials', () => {
    expect(determineOrgId({ orgId: 'client9', username: 'client1' })).toBe('client9');
  });

  it('maps client usernames to their configured orgs', () => {
    expect(determineOrgId({ username: 'client1' })).toBe('client1');
    expect(determineOrgId({ username: 'client2' })).toBe('client2');
  });

  it('falls back to default org for unknown usernames', () => {
    expect(determineOrgId({ username: 'random' })).toBe('client0');
  });

  it('derives orgId from a fully qualified table name', () => {
    expect(deriveOrgIdFromTableName('nigzsu.demodata0.client0')).toBe('client0');
    expect(deriveOrgIdFromTableName('client1')).toBe('client1');
    expect(deriveOrgIdFromTableName('')).toBeUndefined();
  });
});
