import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost/unused';
const { AuthService } = await import('../dist/auth/auth.service.js');

function fixture(existing, passwordMatches = false) {
  const calls = [];
  const invite = {
    id: 'invite',
    email: 'existing@example.test',
    name: 'Invited name',
    organizationId: 'other-org',
    role: 'technician',
    siteIds: [],
    expiresAt: new Date(Date.now() + 60000),
  };
  const tx = {
    userInvite: {
      findUnique: async () => invite,
      updateMany: async () => ({ count: 1 }),
    },
    user: {
      findFirst: async () => existing,
      update: async () => {
        throw new Error('Existing accounts must never be overwritten');
      },
      create: async ({ data }) => {
        calls.push(['create', data]);
        return { id: 'new-user', ...data };
      },
    },
    organizationMembership: {
      upsert: async (args) => {
        calls.push(['membership', args]);
        return { id: 'membership' };
      },
    },
    membershipSiteAccess: { deleteMany: async () => {} },
    site: { findMany: async () => [] },
    auditEvent: { createMany: async () => {} },
  };
  const service = new AuthService(
    { $transaction: (fn) => fn(tx) },
    { hash: async () => 'new-hash', verify: async () => passwordMatches },
    {
      create: async (id) => {
        calls.push(['session', id]);
        return { token: 'session' };
      },
      authenticate: async () => ({}),
    },
  );
  return { service, calls, tx };
}
const request = { header: () => undefined };

test('an invite issuer cannot replace another organization member’s password', async () => {
  const { service, calls } = fixture({
    id: 'victim',
    status: 'active',
    passwordHash: 'original',
  });
  await assert.rejects(
    service.acceptInvitation('token', 'attacker-password', request),
    (error) =>
      error.getResponse().code === 'EXISTING_ACCOUNT_PASSWORD_REQUIRED',
  );
  assert.deepEqual(calls, []);
});

test('existing account owners can accept membership without changing global credentials', async () => {
  const { service, calls } = fixture(
    { id: 'owner', status: 'active', passwordHash: 'original' },
    true,
  );
  await service.acceptInvitation('token', 'original-password', request);
  assert.deepEqual(
    calls.map(([name]) => name),
    ['membership', 'session'],
  );
  assert.equal(calls[0][1].create.userId, 'owner');
});

test('new invitees can still create an account', async () => {
  const { service, calls } = fixture(null);
  await service.acceptInvitation('token', 'new-password', request);
  assert.equal(calls[0][0], 'create');
  assert.equal(calls[0][1].passwordHash, 'new-hash');
});

test('an invitation consumed concurrently cannot issue a session', async () => {
  const { service, calls, tx } = fixture(
    { id: 'owner', status: 'active', passwordHash: 'original' },
    true,
  );
  tx.userInvite.updateMany = async () => ({ count: 0 });
  await assert.rejects(service.acceptInvitation('token', 'password', request));
  assert.equal(
    calls.some(([name]) => name === 'session'),
    false,
  );
});
