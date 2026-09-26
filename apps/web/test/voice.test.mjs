import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PcmResampler, decodePcm, encodePcm } from '../src/voice/pcm.ts';
import { updateTranscript } from '../src/voice/protocol.ts';
import { PlaybackQueue } from '../src/voice/playback.ts';
import { VoiceSession } from '../src/voice/session.ts';

const credential = {
  token: 'temporary',
  sessionConfig: { system_prompt: 'test' },
};
function fixture(t, overrides = {}) {
  const sent = [];
  let frame, playback;
  const socket = {
    readyState: 0,
    bufferedAmount: 0,
    send(data) {
      sent.push(JSON.parse(data));
    },
    close() {
      this.readyState = 3;
    },
    open() {
      this.readyState = 1;
      this.onopen?.({});
    },
    event(data) {
      this.onmessage?.({ data: JSON.stringify(data) });
    },
  };
  const audio = {
    closed: 0,
    cleared: 0,
    played: 0,
    async start(callback) {
      frame = callback;
    },
    play() {
      this.played++;
      playback(true);
    },
    clear() {
      this.cleared++;
      playback(false);
    },
    close() {
      this.closed++;
    },
    mute() {},
  };
  const session = new VoiceSession(() => {}, {
    token: async () => credential,
    socket: () => socket,
    audio: (changed) => {
      playback = changed;
      return audio;
    },
    ...overrides,
  });
  t.after(() => session.dispose());
  return {
    session,
    socket,
    audio,
    sent,
    frame: (data) => frame(data),
    drain: () => playback(false),
  };
}

test('resampling preserves 24 kHz timing across fractional 44.1 kHz render blocks', () => {
  for (const rate of [44100, 48000, 96000]) {
    const frames = [];
    const resampler = new PcmResampler(rate, (frame) => frames.push(frame));
    const input = new Float32Array(rate).fill(0.5);
    for (let i = 0; i < input.length; i += 128)
      resampler.push(input.subarray(i, i + 128));
    assert.equal(frames.length, 50);
    assert.ok(frames.every((frame) => frame.length === 960));
    assert.equal(new DataView(frames[0].buffer).getInt16(0, true), 16384);
  }
  assert.deepEqual(
    [...decodePcm(encodePcm(new Uint8Array([0, 128, 255, 127])))],
    [-1, 32767 / 32768],
  );
  assert.throws(() => decodePcm('AA=='));
});
test('user deltas replace partial text and interrupted agent finals replace draft text', () => {
  let items = [];
  for (const text of ['Motor', 'Motor M-204', 'Motor M-204 stopped'])
    items = updateTranscript(items, {
      type: 'transcript.user.delta',
      item_id: 'u',
      text,
    });
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Motor M-204 stopped');
  items = updateTranscript(items, {
    type: 'transcript.agent.delta',
    item_id: 'a',
    reply_id: 'r',
    delta: 'Let',
  });
  items = updateTranscript(items, {
    type: 'transcript.agent.delta',
    item_id: 'a',
    reply_id: 'r',
    delta: 'me explain',
  });
  items = updateTranscript(items, {
    type: 'transcript.agent',
    item_id: 'a',
    reply_id: 'r',
    text: 'Let me',
    interrupted: true,
  });
  items = updateTranscript(items, {
    type: 'transcript.agent.delta',
    item_id: 'a',
    reply_id: 'r',
    delta: 'stale text',
  });
  assert.equal(items[1].text, 'Let me');
  assert.equal(items[1].interrupted, true);
});
test('interruption stops and disconnects every queued source and resets scheduling', () => {
  const sources = [],
    activity = [];
  const context = {
    currentTime: 2,
    destination: {},
    createBuffer(_channels, length, rate) {
      return {
        duration: length / rate,
        getChannelData() {
          return new Float32Array(length);
        },
      };
    },
    createBufferSource() {
      const source = {
        connect() {},
        disconnect() {
          this.disconnected = true;
        },
        stop() {
          this.stopped = true;
        },
        start(time) {
          this.started = time;
        },
      };
      sources.push(source);
      return source;
    },
  };
  const queue = new PlaybackQueue(context, (active) => activity.push(active));
  queue.enqueue(encodePcm(new Uint8Array(960)));
  queue.enqueue(encodePcm(new Uint8Array(960)));
  assert.equal(sources[1].started, 2.02);
  queue.clear();
  assert.ok(
    sources.every(
      (source) =>
        source.stopped && source.disconnected && source.onended === null,
    ),
  );
  assert.equal(activity.at(-1), false);
  context.currentTime = 5;
  queue.enqueue(encodePcm(new Uint8Array(960)));
  assert.equal(sources[2].started, 5);
  queue.clear();
});
test('audio waits for readiness, mute sends silence, and clean end releases resources once', async (t) => {
  const f = fixture(t);
  await f.session.connect();
  f.socket.open();
  f.frame(new Uint8Array([1, 2]));
  assert.equal(
    f.sent.filter((event) => event.type === 'input.audio').length,
    0,
  );
  f.socket.event({ type: 'session.ready', session_id: 'session' });
  f.frame(new Uint8Array([1, 2]));
  assert.equal(f.sent.at(-1).audio, 'AQI=');
  f.session.mute();
  f.frame(new Uint8Array([1, 2]));
  assert.equal(f.sent.at(-1).audio, 'AAA=');
  f.session.end();
  assert.equal(f.session.snapshot.status, 'ending');
  f.socket.event({ type: 'session.ended' });
  assert.equal(f.session.snapshot.status, 'disconnected');
  assert.equal(
    f.sent.filter((event) => event.type === 'session.end').length,
    1,
  );
  assert.ok(f.audio.closed > 0);
});
test('completed audio stays speaking until drained; interruptions flush stale audio', async (t) => {
  const f = fixture(t);
  await f.session.connect();
  f.socket.open();
  f.socket.event({ type: 'session.ready', session_id: 'session' });
  f.socket.event({ type: 'reply.started', reply_id: 'r' });
  f.socket.event({ type: 'reply.audio', data: 'AAA=' });
  f.socket.event({ type: 'reply.done', reply_id: 'r', status: 'completed' });
  assert.equal(f.session.snapshot.status, 'speaking');
  f.drain();
  assert.equal(f.session.snapshot.status, 'listening');
  f.socket.event({ type: 'reply.started', reply_id: 'r2' });
  f.socket.event({ type: 'reply.audio', data: 'AAA=' });
  f.socket.event({ type: 'reply.done', reply_id: 'r2', status: 'interrupted' });
  assert.equal(f.audio.cleared, 1);
  f.socket.event({ type: 'reply.audio', data: 'AAA=' });
  assert.equal(f.audio.played, 2);
});
test('cancelling token acquisition prevents late sockets and closes capture', async (t) => {
  let release, signal;
  const f = fixture(t, {
    token: (value) => {
      signal = value;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const connecting = f.session.connect();
  await new Promise(setImmediate);
  f.session.end();
  assert.equal(signal.aborted, true);
  release(credential);
  await connecting;
  assert.equal(f.session.snapshot.status, 'disconnected');
  assert.equal(f.socket.onopen, undefined);
  assert.ok(f.audio.closed > 0);
});
test('unexpected disconnect and audio backpressure fail visibly and close the microphone', async (t) => {
  const f = fixture(t);
  await f.session.connect();
  f.socket.open();
  f.socket.event({ type: 'session.ready', session_id: 'session' });
  f.socket.bufferedAmount = 200_000;
  f.frame(new Uint8Array(960));
  assert.equal(f.session.snapshot.status, 'error');
  assert.match(f.session.snapshot.error, /too slow/);
  assert.ok(f.audio.closed > 0);
});

test('tools wait for reply.done, execute once, and select only after delivery', async (t) => {
  let executions = 0,
    selected;
  const f = fixture(t, {
    executeTool: async () => {
      executions++;
      return {
        result: { matches: [{ id: 'asset' }] },
        isError: false,
        summary: 'Found asset',
        assetId: 'asset',
      };
    },
    assetFound: (id) => {
      selected = id;
    },
  });
  await f.session.connect();
  f.socket.open();
  f.socket.event({ type: 'session.ready', session_id: 'session' });
  f.socket.event({ type: 'reply.started', reply_id: 'fc-call' });
  const call = {
    type: 'tool.call',
    call_id: 'call',
    name: 'find_asset',
    arguments: { query: 'M204' },
  };
  f.socket.event(call);
  f.socket.event(call);
  await new Promise(setImmediate);
  assert.equal(executions, 1);
  assert.equal(selected, undefined);
  assert.equal(
    f.sent.filter((event) => event.type === 'tool.result').length,
    0,
  );
  f.socket.event({
    type: 'reply.done',
    reply_id: 'fc-call',
    status: 'completed',
  });
  assert.equal(f.sent.at(-1).call_id, 'call');
  assert.equal(typeof f.sent.at(-1).result, 'string');
  assert.equal(selected, 'asset');
  assert.equal(f.session.snapshot.tools[0].status, 'completed');
});

test('slow tools hold results during a new turn and drop results after interruption or end', async (t) => {
  for (const finish of ['completed', 'interrupted', 'end']) {
    let resolve, signal, selected;
    const f = fixture(t, {
      executeTool: (_name, _args, value) => {
        signal = value;
        return new Promise((done) => {
          resolve = done;
        });
      },
      assetFound: (id) => {
        selected = id;
      },
    });
    await f.session.connect();
    f.socket.open();
    f.socket.event({ type: 'session.ready', session_id: 'session' });
    f.socket.event({ type: 'reply.started', reply_id: 'fc-call' });
    f.socket.event({
      type: 'tool.call',
      call_id: 'call',
      name: 'find_asset',
      arguments: { query: 'M204' },
    });
    f.socket.event({
      type: 'reply.done',
      reply_id: 'fc-call',
      status: 'completed',
    });
    f.socket.event({ type: 'input.speech.started' });
    resolve({ result: {}, isError: false, summary: 'Found', assetId: 'asset' });
    await new Promise(setImmediate);
    assert.equal(
      f.sent.filter((event) => event.type === 'tool.result').length,
      0,
    );
    if (finish === 'end') f.session.end();
    else
      f.socket.event({ type: 'reply.done', reply_id: 'next', status: finish });
    if (finish === 'completed') assert.equal(selected, 'asset');
    else {
      assert.equal(selected, undefined);
      assert.equal(signal.aborted, true);
    }
  }
});

test('ending a lookup aborts the request and ignores late completion', async (t) => {
  let resolve, selected;
  const f = fixture(t, {
    executeTool: () =>
      new Promise((done) => {
        resolve = done;
      }),
    assetFound: (id) => {
      selected = id;
    },
  });
  await f.session.connect();
  f.socket.open();
  f.socket.event({ type: 'session.ready', session_id: 'session' });
  f.socket.event({
    type: 'tool.call',
    call_id: 'call',
    name: 'find_asset',
    arguments: { query: 'M204' },
  });
  f.session.end();
  resolve({ result: {}, isError: false, summary: 'Found', assetId: 'asset' });
  await new Promise(setImmediate);
  assert.equal(selected, undefined);
  assert.equal(
    f.sent.filter((event) => event.type === 'tool.result').length,
    0,
  );
});

test('asset executor validates arguments, rejects unknown tools and distinguishes empty, ambiguous and failed lookups', async () => {
  const { createToolExecutor } = await import('../src/voice/tools.ts');
  let calls = 0;
  let matches = [];
  const execute = createToolExecutor(async () => {
    calls++;
    return matches;
  });
  const signal = new AbortController().signal;
  for (const args of [
    { query: '' },
    { query: 'M204', extra: true },
    '{"query":"M204"}',
  ])
    assert.equal((await execute('find_asset', args, signal)).isError, true);
  assert.equal((await execute('delete_asset', {}, signal)).isError, true);
  assert.equal(calls, 0);
  assert.equal(
    (await execute('find_asset', { query: 'unknown' }, signal)).result
      .totalMatches,
    0,
  );
  matches = [{ id: 'motor', assetTag: 'M-204', name: 'Motor' }];
  assert.equal(
    (await execute('find_asset', { query: 'M204' }, signal)).assetId,
    'motor',
  );
  matches.push({ id: 'pump', assetTag: 'P-101', name: 'Pump' });
  assert.equal(
    (await execute('find_asset', { query: 'production' }, signal)).assetId,
    undefined,
  );
  const failing = createToolExecutor(async () => {
    throw new Error('private upstream details');
  });
  const result = await failing('find_asset', { query: 'M204' }, signal);
  assert.equal(result.isError, true);
  assert.equal(JSON.stringify(result).includes('private upstream'), false);
});
