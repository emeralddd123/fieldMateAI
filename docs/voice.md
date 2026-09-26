# Voice connection and equipment lookup

Open http://localhost:5173, select **Start voice session**, allow microphone access, and talk to FieldMate. Live transcripts appear beside the equipment workspace. Mute keeps the session connected; End session releases the microphone and ends the provider session. Starting again opens a fresh conversation.

Say “Find P-101” or “Find M-204” to search the live equipment register. A unique match selects the asset in the workspace and returns its metadata to FieldMate. Multiple matches require a more specific tag; no match or a failed lookup leaves the selection unchanged. Visible lookup cards show progress and results. Voice can now retrieve verified fault definitions and previous maintenance history, including technician notes. Approved procedure steps are available after any required workspace safety confirmation. Voice does not yet change maintenance records. Manual sidebar selection is not sent to the agent; identify equipment by tag in conversation. Transcripts remain in browser memory until a new session or page reload; they are not persisted to PostgreSQL.

## Configuration

For Docker, set `ASSEMBLYAI_API_KEY` in the root `.env`, then apply the runtime configuration:

```sh
docker compose up -d --build
```

For host development, set the key in `apps/api/.env` and restart the API. `ASSEMBLYAI_VOICE` defaults to `alba`. The permanent API key stays on the backend; never use a `VITE_` variable for it. Voice needs localhost or HTTPS and a browser supporting microphone access, Web Audio, and AudioWorklet.

## Authentication and transport

- `GET /api/v1/voice/status` reports whether a key is configured; it does not validate provider access.
- `POST /api/v1/voice/token` returns a single-use temporary token plus the session configuration with `Cache-Control: no-store`.
- Tokens expire after 60 seconds; sessions have a 600-second maximum. The backend permits five token requests per minute per observed client IP and checks browser Origin against `FRONTEND_URL`. These demo protections are not user authentication. Behind Nginx, clients share the proxy IP limit.
- Provider errors are sanitized. Credentials and raw provider responses are not logged by the application.
- The browser opens the AssemblyAI WebSocket, sends `session.update`, and waits for `session.ready` before transmitting microphone audio.
- Capture uses the device's AudioContext rate and continuously resamples to mono 24 kHz PCM16 little-endian, sent in 20 ms frames. Playback uses queued 24 kHz audio buffers.
- User transcript deltas replace partial text; agent deltas build the current reply. Final events replace the partial transcript.
- An interrupted reply stops all queued playback. A completed reply remains in the speaking state until playback drains.
- End sends `session.end` and waits for `session.ended`, with a two-second fallback. Navigation makes a best-effort explicit end. Failed connections require an explicit retry.

The implementation follows the official [browser integration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration), [event reference](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/events-reference), and [session configuration](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/session-configuration).

## Automated checks

```sh
pnpm test:voice
PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e
# Opt-in: requires a configured key, running stack, and installed Chrome.
# Opens a short billable provider session with a fake microphone; no traces or audio are saved.
pnpm test:voice:live
# Also exercise a live tool call using a synthetic text request:
pnpm test:voice:live --lookup
# Verify all three tools against the canonical seeded M-204 history:
pnpm test:voice:live --knowledge
```

The voice unit suite covers token protection, provider failures, rate limits, PCM resampling, transcript reconciliation, cancellation, muted frames, interruption, audio queue cleanup, and connection backpressure. Browser checks use mocked provider events with real AudioWorklet capture on desktop and mobile Chromium emulation. They cover permission denial and cancellation as well as the successful session flow.

The live smoke checks actual token minting, session readiness, microphone frame transmission, greeting audio and transcript reception, and confirmed provider session termination. It uses synthetic microphone input; it does not verify speech recognition quality, speaker acoustics, or physical-device barge-in.

## Manual voice QA

1. Start a session and confirm the greeting is audible and matches its transcript.
2. Say “What can FieldMate help me with?” Confirm your transcript and a relevant spoken answer.
3. Speak over a response. Confirm queued speech stops promptly and the agent responds to your new turn.
4. Mute, speak, then unmute. Confirm muted speech does not appear in the transcript.
5. End while the agent is speaking. Confirm playback stops and the browser microphone indicator clears. Start another session.
6. Deny microphone permission, restore permission, and retry. Also test disconnecting the network during a session.
7. Repeat with the intended headset, a phone, and the public HTTPS origin before a demo. Mobile Chromium emulation does not substitute for Safari or physical-device testing.

## Equipment tool protocol

`find_asset` accepts only `{ "query": "P-101" }`, with a trimmed 1–100 character query. It calls the existing `GET /api/v1/assets/search` route and validates the response. Search results include at most 20 matches, the total match count, and the demo source. Only a single match triggers workspace selection. No new write endpoint is exposed.

Tool calls are deduplicated by call ID within a session. Results are JSON strings returned at the idle reply boundary described in AssemblyAI’s [client-side tool guide](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/client-side-tools). New speech holds pending results; interruption and session teardown abort pending requests and discard late responses. Unknown tools and invalid arguments return structured errors. Client-side execution keeps the local API reachable from the browser without exposing it publicly to the provider.

Try “Find conveyor” to test ambiguity, “Find ZZZ-9999” for an empty result, and “Find P-101” for a unique match. The `--lookup` live check mutes synthetic microphone input and supplies an explicit lookup instruction through `reply.create` to trigger the provider tool; recognition of spoken asset tags still needs a real-microphone check.

## Fault definitions and maintenance history

After identifying equipment, say “What does F0003 mean on M-204?” or “Has this motor had F0003 before?” The agent obtains the asset UUID with `find_asset`, then uses:

- `lookup_fault_code`: `{ "asset_id": "<UUID>", "fault_code": "F0003" }`. Returns the installed model's verified definition, source and safety level. Unknown faults return `found: false`; ambiguous installed models require clarification. No procedure steps are exposed by this tool.
- `get_maintenance_history`: `{ "asset_id": "<UUID>", "fault_code": "F0003", "limit": 5 }`. The fault filter is optional; the limit defaults to 5 and must be 1–10. Returns incident counts, previous incidents, repair records and technician notes. Counts refer to all matching incidents; the record arrays are limited.

Tool arguments and API responses are validated. Leading zeros in fault codes are preserved. Failed lookups return errors rather than invented answers, and cancelled calls cannot display late results. Lookup cards display source information and retrieved details. Historical notes describe past work; they are not approved procedures or evidence that the present fault has the same cause.

The `--knowledge` check uses an explicit synthetic instruction, a muted fake microphone, and the real provider and local database. It expects the original two M-204/F0003 incidents including the L2 note. It does not write or reset data. For manual QA, test a known fault, an unknown fault such as F999999, a fault with no history, and “Tell me the previous technician’s note.”

## Approved procedures and safety confirmation

Ask “Show me the approved procedure for F0003 on M-204.” The agent uses the key returned by fault lookup to call `get_approved_procedure` with only `asset_id` and `procedure_key`. Model-supplied confirmation fields are rejected.

The first API request always omits `safeStateConfirmed`. For a gated procedure, the workspace shows its asset tag, title, source and safe-state requirement. Only the technician's **Confirm safe maintenance state** button authorizes a second fetch with confirmation. **Not ready**, a 60-second timeout, session end or interruption keeps steps locked. Every request requires fresh confirmation; concurrent requests cannot reuse it. The 90-second provider tool timeout leaves room for confirmation and the second fetch.

Only approved, model-matching procedures can be retrieved. The client checks that the returned asset and procedure match the request and that identifying metadata did not change between requests. Failed requests never return steps to voice. Sources and approved steps appear in the lookup card after successful retrieval. This remains a demo request-level gate, not authenticated safety auditing or independent verification of physical equipment state.

```sh
# Live provider test using synthetic requests; declines confirmation, no steps released:
pnpm test:voice:live --procedure
```

Browser tests cover simulated confirmation with the real local API, decline, interruption, session end and missing procedures. Unit tests also cover expiration, concurrent requests, forged confirmation fields and changed procedure metadata. Test with your actual microphone and follow your site procedures before confirming any real equipment state.
