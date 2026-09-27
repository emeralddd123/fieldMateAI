# Supervisor workflow

Open [http://localhost:5173/supervisor](http://localhost:5173/supervisor) to view Plant Alpha from the supervisor perspective. The page refreshes assets and incidents every five seconds and provides plant KPIs, the pending escalation queue, equipment health, incident filtering, and incident drill-down.

## Review an escalation

1. Open an incident from **Supervisor attention** or the plant register.
2. Review its reported fault, measurements, notes, and escalation reason.
3. Optionally select an assignee and change priority.
4. Add routing instructions or a supervisor note.
5. Select **Acknowledge and save**.

The API performs the review atomically. It marks the pending escalation `acknowledged`, stores the review timestamp and seeded demo supervisor, applies assignment and priority changes, and creates a supervisor-authored incident note. The incident remains `escalated` and active until a technician completes the repair. Repair completion changes the escalation to `resolved`.

Acknowledged escalations leave the pending action queue but remain visible in the incident record and plant register. An incident without a pending escalation can still receive assignment, priority, or supervisor-note updates through **Save supervisor update**.

## API

Eligible demo users:

```http
GET /api/v1/users
```

Supervisor review:

```http
POST /api/v1/incidents/{incidentId}/supervisor-review
Content-Type: application/json

{
  "acknowledgeEscalation": true,
  "assignedToId": "00000000-0000-4000-8000-000000000003",
  "priority": "critical",
  "note": "Acknowledged. Grace to inspect before restart."
}
```

At least one review field is required. The incident must be active, the assignee must be a seeded technician or supervisor, and acknowledgement requires a pending escalation. Repeating acknowledgement after it has already succeeded returns `NO_PENDING_ESCALATION` rather than writing a second acknowledgement. Send `assignedToId: null`, or select **Unassigned** in the workspace, to clear the current owner.

## Demo security boundary

The current supervisor workspace uses seeded demo identities: Ibrahim Musa is the demo supervisor, while Demo Technician and Grace Okafor are technicians. The route does not yet implement login, session authentication, site tenancy, or production authorization. External notifications remain simulated. Do not treat the demo role switch as an access-control boundary.
