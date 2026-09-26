import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceService } from '../dist/voice/voice.service.js';

const settings = {
  apiKey: 'private-test-key',
  voice: 'alba',
  frontendOrigin: 'http://localhost:5173',
};
test('mints a bounded single-use credential without exposing the permanent key', async () => {
  let captured;
  const service = new VoiceService(settings, async (url, options) => {
    captured = { url, options };
    return Response.json({ token: 'temporary-test-token' });
  });
  const result = await service.mint(settings.frontendOrigin, 'test');
  assert.equal(result.token, 'temporary-test-token');
  assert.equal(result.maxSessionDurationSeconds, 600);
  assert.equal(captured.url.origin, 'https://agents.assemblyai.com');
  assert.equal(captured.url.searchParams.get('expires_in_seconds'), '60');
  assert.equal(
    captured.url.searchParams.get('max_session_duration_seconds'),
    '600',
  );
  assert.equal(
    captured.options.headers.Authorization,
    'Bearer private-test-key',
  );
  assert.equal(JSON.stringify(result).includes(settings.apiKey), false);
  assert.deepEqual(
    result.sessionConfig.tools.map((tool) => tool.name),
    [
      'find_asset',
      'lookup_fault_code',
      'get_maintenance_history',
      'get_approved_procedure',
      'record_measurement',
      'create_incident',
      'resolve_incident',
      'escalate_incident',
      'add_incident_note',
    ],
  );
  assert.match(
    result.sessionConfig.system_prompt,
    /call resolve_incident with the active incident_id/,
  );
});
test('missing credentials and disallowed browser origins never contact the provider', async () => {
  let calls = 0;
  const request = async () => {
    calls++;
    throw new Error('Should not run');
  };
  const absent = new VoiceService({ ...settings, apiKey: '' }, request);
  assert.deepEqual(absent.status(), { enabled: false });
  await assert.rejects(
    absent.mint(undefined, 'test'),
    (error) => error.getResponse().code === 'VOICE_NOT_CONFIGURED',
  );
  const service = new VoiceService(settings, request);
  await assert.rejects(
    service.mint('https://another-origin.example', 'test'),
    (error) => error.getStatus() === 403,
  );
  assert.equal(calls, 0);
});
test('provider failures and malformed responses are sanitized', async () => {
  for (const request of [
    async () => new Response(settings.apiKey, { status: 401 }),
    async () => Response.json({ unexpected: settings.apiKey }),
    async () => {
      throw new Error(settings.apiKey);
    },
  ]) {
    const service = new VoiceService(settings, request);
    await assert.rejects(service.mint(undefined, 'test'), (error) => {
      assert.equal(error.getResponse().code, 'VOICE_PROVIDER_UNAVAILABLE');
      assert.equal(
        JSON.stringify(error.getResponse()).includes(settings.apiKey),
        false,
      );
      return true;
    });
  }
});
test('limits repeated mint requests', async () => {
  let calls = 0;
  const service = new VoiceService(settings, async () => {
    calls++;
    return Response.json({ token: 'temporary' });
  });
  for (let i = 0; i < 5; i++) await service.mint(undefined, 'same-client');
  await assert.rejects(
    service.mint(undefined, 'same-client'),
    (error) => error.getStatus() === 429,
  );
  assert.equal(calls, 5);
});
