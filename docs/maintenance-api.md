# Maintenance API and demo

Use [Swagger](http://localhost:3000/docs) for interactive requests. All JSON fields use **camelCase**. Successful requests return `{ "data": ... }`; errors return `{ "error": { "code", "message" } }`. UUIDs are used in URLs; `INC-1048` is a display number. Lists default to 50 items and accept `limit=1..100`.

## Canonical workflow

1. `GET /api/v1/assets/search?q=M-204` → copy `data[0].id` as `assetId`.
2. `GET /api/v1/assets/{assetId}/faults/F0003` → approved model-specific definition and source.
3. `GET /api/v1/assets/{assetId}/history?faultCode=F0003` → two seeded incidents, including the L2 note.
4. `GET /api/v1/procedures/vfd-undervoltage-check?assetId={assetId}` → confirmation required, no steps yet. Only after the required safe-state confirmation, request the same URL with `&safeStateConfirmed=true`.
5. `POST /api/v1/measurements` with:

```json
{
  "assetId": "<asset UUID>",
  "measurementType": "line_voltage",
  "value": 347,
  "unit": "V",
  "notes": "Measured at drive input"
}
```

6. Copy the measurement ID and `POST /api/v1/incidents`:

```json
{
  "assetId": "<asset UUID>",
  "title": "VFD F0003 undervoltage fault",
  "description": "Motor stopped during production and drive reported F0003.",
  "faultCode": "F0003",
  "priority": "high",
  "measurementIds": ["<measurement UUID>"]
}
```

7. Copy the incident UUID and `POST /api/v1/incidents/{id}/complete-repair`:

```json
{
  "assetId": "<asset UUID>",
  "rootCause": "Loose L2 terminal",
  "actionTaken": "Tightened L2 terminal connection",
  "verificationSummary": "Motor running normally at 12.4 A",
  "verificationMeasurement": {
    "measurementType": "motor_current",
    "value": 12.4,
    "unit": "A"
  },
  "assetStatus": "operational",
  "source": "manual"
}
```

The response contains the saved incident, maintenance record, readings, and actual asset status. Query history again to retrieve the new repair. The dashboard refreshes equipment and history every five seconds.

For an automated simulated run (requires Node.js 24 on the host), use `pnpm demo:api`. This writes real records into the selected demo database. Set `FIELDMATE_API_URL` to choose a different API origin. The script's safe-state confirmation is simulated and must not be used as authorization for physical maintenance.

## Additional endpoints

| Operation           | Endpoint                                        | Body / query                                                             |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| List incidents      | `GET /api/v1/incidents`                         | Optional `assetId`, `status`, `limit`                                    |
| Incident detail     | `GET /api/v1/incidents/{id}`                    | Includes notes, readings, record, and escalations                        |
| Update incident     | `PATCH /api/v1/incidents/{id}`                  | `title`, `description`, `priority`, `assignedToId`, or allowed `status`  |
| Add note            | `POST /api/v1/incidents/{id}/notes`             | `note`, optional `source` (`manual` or `voice`)                          |
| Resolve             | `POST /api/v1/incidents/{id}/resolve`           | Same contract and transaction as `complete-repair`                       |
| Escalate            | `POST /api/v1/incidents/{id}/escalate`          | `reason`, optional `severity` (`supervisor_review` or `urgent`)          |
| List assignees      | `GET /api/v1/users`                             | Demo technicians and supervisors eligible for assignment                 |
| Supervisor review   | `POST /api/v1/incidents/{id}/supervisor-review` | `acknowledgeEscalation`, optional `assignedToId`, `priority`, and `note` |
| Read measurements   | `GET /api/v1/assets/{id}/measurements`          | Optional `limit`                                                         |
| Read repair records | `GET /api/v1/assets/{id}/maintenance-records`   | Optional `limit`                                                         |
| Create work log     | `POST /api/v1/maintenance-records`              | Completion fields plus `symptom`; optional `incidentId`, `faultCode`     |

## Integrity rules

- Human-readable incident numbers come from a PostgreSQL sequence; gaps after rejected transactions are normal.
- A reading attached to an incident must belong to the same asset. `measurementIds` only links previously unassigned readings.
- Electrical voltage readings use `V` and current readings use `A`, both nonnegative. Numeric strings, nonfinite values, excessive precision, unknown fields, and invalid UUIDs are rejected.
- Repair completion is atomic. Identical completion retries return the original record without duplicate readings. Conflicting completion retries return HTTP 409.
- All writes for an asset acquire the same database row lock. Completing one incident cannot mark the asset operational while another incident is active.
- `investigating` is allowed from `open`; `closed` is allowed after `resolved`. Resolution always uses the completion transaction. Escalated incidents can be resolved. Closed incidents cannot be edited.
- A linked maintenance-record request uses the repair transaction and the incident's original symptom. Standalone records document work without resolving incidents or changing asset status.
- Unknown fault codes never fall back to another model or gain guessed leading zeros. Unapproved or mismatched procedures return `found: false`. Safety confirmation is a request-level gate; authenticated safety auditing is future work.
- Escalation stores a pending review record and changes incident status. A supervisor review can atomically acknowledge it, record the demo supervisor and timestamp, assign an eligible user, change priority, and add a supervisor-authored note. Acknowledgement does not resolve the incident. Completing the incident resolves pending or acknowledged escalations.
- Supervisor routes use seeded demo identities and do not provide authentication or production authorization. Notifications are simulated; no message is sent externally.
- Normal seeding is idempotent and preserves existing work. The initial two histories and all procedures are labeled simulated demo references.

## Reset demo data

Reset deletes work associated with the five canonical assets in Plant Alpha and recreates the original demo state. It preserves other assets and sites. Stop active demo clients first. The explicit `--confirm` flag and a development/test environment are required.

```sh
# Host development (apps/api/.env must contain APP_ENV=development):
pnpm --filter @fieldmate/api seed:reset --confirm

# Local Compose demo only; explicitly opt this command into development mode:
docker compose exec -e APP_ENV=development api pnpm seed:reset --confirm
```

There is no publicly exposed reset endpoint. Do not run reset against real maintenance data.
