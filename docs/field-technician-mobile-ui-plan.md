# Field technician mobile UI implementation plan

## Goal

Make FieldMate practical on a phone or rugged handheld while a technician is
standing at equipment, wearing PPE, moving through a plant, using a headset,
and working with intermittent connectivity.

The mobile interface should make the current maintenance workflow faster and
safer:

1. Identify the machine.
2. Start or resume voice assistance.
3. Understand the current fault and recent history.
4. Review any proposed write or safety-gated procedure.
5. Save a reading, incident, note, escalation, or completed repair.
6. Confirm what was saved.

It should also provide a simplified **Work Mode** for technicians who are
walking between assets or whose hands are occupied. Work Mode reduces the
interface to essential context, spoken guidance, and a few large controls while
keeping safety-critical actions deliberate.

The responsive interface will use the existing React application, APIs,
authentication, and authorization rules. Layout and interaction variants will
adapt to the available viewport and input method.

## Current UI assessment

FieldMate already has responsive CSS, mobile browser tests, voice controls, QR
camera access, incident details, maintenance history, and status indicators.
The remaining mobile problems are structural:

- The technician workspace begins with a persistent 242-pixel equipment
  sidebar.
- The main workspace uses equipment and conversation columns designed for wide
  screens.
- The 88-pixel header contains several actions, plant identity, role
  navigation, and the user menu.
- Voice controls occupy a horizontal desktop bar instead of the phone's thumb
  zone.
- Write and safety confirmations appear in the document flow and can move out
  of view.
- Equipment detail gives visual space to the machine illustration before the
  most useful field actions.
- Incident drawers, detail dialogs, supervisor tables, and filters are dense on
  narrow screens.
- Some secondary text uses low-contrast gray and small 9–11 pixel labels.
- QR scanning opens the camera but does not decode camera frames.
- Connectivity, stale data, offline state, and pending local work are not
  visible.
- The app is not installable as a PWA and has no offline app shell.

## Field design principles

### One-handed operation

- Place frequent actions in the lower two-thirds of the screen.
- Use persistent bottom navigation and a central voice action.
- Use a 48-by-48-pixel minimum touch target; primary field controls should be
  56 pixels high.
- Keep at least 8 pixels between unrelated touch targets and 12 pixels around
  destructive actions.
- Avoid hover-only information and drag-only interactions.

### Voice-first with visible recovery

- Keep voice state, mute, end, and reconnect controls visible while a session
  is active.
- Show the live transcript and tool activity in a full-height conversation
  sheet.
- Preserve pending write reviews when the conversation sheet closes or a
  follow-up question is asked.
- Provide large touch alternatives for noisy spaces, microphone denial,
  headset failure, or speech-recognition errors.
- Show a clear last-heard state so technicians can catch a wrong asset tag,
  number, unit, or fault code before saving.

### Minimal-touch Work Mode

- Let the technician enter Work Mode from the voice action, equipment detail,
  or a spoken command.
- Replace normal navigation with a simplified screen containing the active
  machine, current task, one primary voice control, pause, repeat, and exit.
- Read short responses, warnings, and step transitions aloud while also showing
  large text on screen.
- Support a small, explicit voice-command vocabulary for navigation and task
  control rather than requiring technicians to learn exact phrases.
- Keep the screen awake only during an active task, subject to device and
  browser support, and clearly show when wake lock is unavailable.
- Never interpret silence, motion, or background speech as confirmation of a
  write or safety-critical step.
- Make it possible to stop speech, mute the microphone, pause the task, or exit
  the mode with one large touch.

### Glanceable equipment context

- Keep the active asset tag, name, location, operational state, and open
  incident count in a compact sticky header.
- Use icon, text, and shape together for equipment and incident status; color
  alone is insufficient.
- Put the current fault, critical specifications, active incident, and next
  action ahead of illustrations and long history.
- Collapse historical detail into expandable sections with useful summaries.

### Intentional safety actions

- Present procedure safe-state confirmation and maintenance writes as
  persistent bottom sheets or full-screen steps.
- Keep **Cancel**, **Not ready**, and **Confirm** visually separated.
- Require technicians to review the machine tag and affected values immediately
  above the confirmation control.
- Prevent double submission and display a durable success receipt with the
  incident or record number.
- Never submit an offline maintenance write automatically after connectivity
  returns. Restore it as a draft and require fresh confirmation.

### Industrial readability

- Use at least 16-pixel body text for primary field content and 14 pixels for
  secondary content.
- Reserve small uppercase labels for short metadata; keep them at 11 pixels or
  larger on phones.
- Meet WCAG AA contrast for text and controls in normal and high-contrast field
  themes.
- Support 200% text zoom without hiding voice, confirmation, or navigation
  controls.
- Respect reduced motion. Haptic feedback is an optional enhancement.

## Mobile information architecture

Use a bottom navigation bar on viewports below 768 pixels:

| Destination   | Purpose                                                    |
| ------------- | ---------------------------------------------------------- |
| **Equipment** | Search, recent machines, favorites, and current machine    |
| **Voice**     | Central primary action that opens the live voice workspace |
| **Incidents** | Assigned and active incidents with filters                 |
| **More**      | Account, site switcher, scanner, help, and sign out        |

Supervisors receive a **Queue** destination for pending escalations. Admin
management remains optimized for tablet and desktop first, while urgent account
and session actions remain usable on a phone.

Work Mode is launched from the central **Voice** action or the active equipment
screen. While it is active, it temporarily replaces bottom navigation with a
small task-control dock to prevent accidental destination changes.

Recommended responsive routes:

```text
/
/equipment
/equipment/:assetId
/voice
/work
/incidents
/incidents/:incidentId
/supervisor/queue
/more
/account
```

Desktop can keep the consolidated workspace. These routes still resolve on
desktop so deep links, QR links, notifications, and browser history work
consistently.

## Screen and interaction design

### Compact application header

- Use a 56-pixel header with the FieldMate mark, current plant, connectivity
  state, and overflow menu.
- Move role switching, account details, and sign out to **More**.
- Keep alerts as a badged icon and display their details in a bottom sheet.
- Collapse the header while scrolling down and restore it on upward scroll.

### Equipment home

- Start with a large search field that accepts asset tag, name, location, or
  fault code.
- Put **Scan equipment QR** beside or directly below search.
- Show the current machine first, followed by recent and favorite machines.
- Make each result a full-width card with asset tag, name, location, state, and
  active-incident count.
- Include useful empty, loading, offline, and no-permission states.

### Equipment detail

- Use a sticky equipment summary with status and an explicit **Change machine**
  action.
- Put **Ask FieldMate**, **Report incident**, and **Record reading** in the first
  viewport.
- Show current fault and active incidents before specifications and history.
- Convert maintenance history and specifications into expandable sections.
- Hide the decorative equipment illustration on narrow screens or move it
  below actionable content.

### Voice workspace

- Open voice as a full-height route or sheet with the active machine visible at
  the top.
- Put the microphone control in the bottom thumb zone and show listening,
  thinking, speaking, muted, reconnecting, and failed states in text.
- Let technicians switch between transcript and typed input without ending the
  session.
- Keep recent messages readable while reserving space for active controls and
  the device safe area.
- Pin outstanding write or safe-state reviews above the voice controls until
  completed or explicitly dismissed.
- Restore the same session and pending reviews after navigation or a transient
  reconnect.

### Work Mode

Work Mode is an optional, task-focused layer over the technician workflow. It
is suitable while walking between known locations, carrying tools, wearing
gloves, or following a procedure where frequent screen interaction is
impractical.

- Start with a short setup screen that confirms the active machine, audio
  output, microphone state, and whether spoken responses are appropriate in the
  current environment.
- Show one instruction or question at a time using large text, strong contrast,
  and a progress indicator such as **Step 2 of 5**.
- Keep only five persistent controls: **Talk/Stop**, **Repeat**, **Back**,
  **Pause**, and **Exit Work Mode**. Controls may be reduced further when the
  current task does not support going back.
- Accept natural variants of a limited command set, including “repeat,” “next,”
  “go back,” “pause,” “resume,” “show details,” “report a problem,” “cancel,”
  and “exit work mode.”
- Echo the recognized command before changing task state. For ambiguous or
  low-confidence speech, ask a short clarification and leave the current step
  unchanged.
- Use optional sound and haptic cues to distinguish listening, success,
  warning, and connection loss. Every cue must also have a visual equivalent.
- Keep the selected machine, current procedure or report draft, and pending
  review synchronized with the normal app so exiting Work Mode never loses
  progress.
- When a task needs detailed reading, typing, camera use, or a safety review,
  pause Work Mode and open the appropriate full-screen step. Return to Work
  Mode after completion.
- Require a visible review plus a deliberate confirmation for readings,
  incidents, escalation, repair completion, and safe-state acknowledgement.
  Voice can prepare these actions but cannot silently submit them.
- Avoid presenting long transcripts. Provide **What did you hear?** and **Show
  details** actions when the technician needs to inspect recognition or source
  information.
- Detect offline or voice disconnection immediately, pause the task, and offer
  retry, typed fallback, or return to the standard interface.

Work Mode does not assume indoor positioning or continuously track the
technician. A later site-navigation extension may display a route to an asset
when reliable plant map data and positioning are available. That extension
must make location collection visible, request permission at use time, and
provide manual directions when positioning is unavailable.

### Review and confirmation sheet

- Use one shared bottom-sheet component for readings, notes, incidents,
  escalations, repairs, and procedure confirmation.
- Show the operation, machine, entered values, units, fault code, severity, and
  safety implications in a consistent order.
- Validate locally before enabling confirmation and map API validation errors
  to the affected field.
- For an invalid fault code, explain that it is not recognized for the selected
  equipment and allow correction. Escalation can continue only as an
  unverified observed code when the API and permissions explicitly support
  that state; label it clearly in the resulting incident.
- Keep the sheet open on recoverable failure and retain all entered values.
- After success, replace the form with a receipt containing the record ID,
  timestamp, status, and next action.

### Incidents and repairs

- Default to assigned and open incidents, with severity and status chips large
  enough to scan quickly.
- Use filter chips in a horizontally scrollable row and provide a full filter
  sheet for secondary options.
- Open incident details as a full-screen mobile route rather than a narrow
  desktop drawer.
- Keep **Escalate**, **Add note**, and **Complete repair** in a sticky action
  area based on permissions and incident state.
- Use a short step flow for repair completion: diagnosis, work performed,
  parts/readings, review, and confirmation.

### Supervisor queue

- Replace the wide queue table with stacked incident cards on phones.
- Show priority, age, equipment, fault code, assignee, and acknowledgement in
  the card summary.
- Put assignment, priority, notes, and history in the escalation detail route.
- Preserve filters in the URL so supervisors can share and revisit queue views.

## QR and camera experience

- Decode QR codes from camera frames using `BarcodeDetector` where available.
- Add a maintained decoder fallback for supported browsers without
  `BarcodeDetector`.
- Request camera access only after the technician taps scan and explain why it
  is needed before the browser prompt.
- Prefer the rear camera and provide torch, camera switch, and manual asset-tag
  entry where supported.
- Draw a visible targeting frame and announce scan success with sound or
  vibration when allowed.
- Validate the decoded asset identifier before navigation and show a useful
  recovery path for unknown or cross-tenant assets.
- Stop all media tracks as soon as the scanner closes or navigation completes.

## Connectivity and PWA behavior

- Add an installable web-app manifest, application icons, theme colors, and
  standalone display configuration.
- Cache only the application shell, static assets, and safe read-only reference
  data needed to reopen the interface.
- Show **Online**, **Offline**, **Reconnecting**, and **Data may be stale** states
  in a consistent status component.
- Cache the last selected equipment summary and recent read-only history with a
  visible last-updated time.
- Save unfinished form input locally as an encrypted or short-lived draft where
  appropriate; clear it at sign out and tenant change.
- Do not cache authentication tokens in service-worker storage.
- Do not queue safety confirmations or maintenance mutations for automatic
  replay. A restored draft must be reviewed and manually submitted online.
- Reconnect voice explicitly and tell the technician whether the transcript and
  pending review were recovered.

## Component refactor map

| Existing area         | Planned change                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| `App` shell           | Responsive route shell with desktop sidebar and mobile bottom navigation     |
| Top bar               | Compact mobile header plus desktop variant                                   |
| Equipment sidebar     | Mobile equipment search/list route; retain desktop pane                      |
| `AssetOverview`       | Action-first responsive equipment detail                                     |
| `VoiceControls`       | Persistent mobile voice dock and explicit connection states                  |
| Work mode             | Minimal task screen, command interpreter, audio cues, and wake-lock handling |
| Conversation timeline | Full-height mobile voice route with retained pending reviews                 |
| Write/safety review   | Shared accessible bottom sheet with durable state                            |
| `QrScannerModal`      | Real frame decoding, permission recovery, torch, and manual entry            |
| Maintenance panel     | Expandable mobile sections and task-oriented primary actions                 |
| Incidents drawer      | Mobile detail route; desktop drawer remains available                        |
| Supervisor view       | Card queue on phones and table on larger screens                             |
| Status/error UI       | Shared loading, empty, offline, stale, error, and success receipt components |

Shared primitives should include `MobileHeader`, `BottomNavigation`,
`BottomSheet`, `StickyActionBar`, `StatusBanner`, `EquipmentSummary`,
`FieldActionCard`, `ConnectionStatus`, `WorkModeControls`, `SpokenPrompt`, and
`SuccessReceipt`.

## Responsive tokens and breakpoints

- **Compact:** below 768 pixels. Single-column routes, bottom navigation,
  full-screen dialogs, and sticky actions.
- **Medium:** 768–1023 pixels. Tablet split views where useful, larger sheets,
  and optional rail navigation.
- **Wide:** 1024 pixels and above. Existing multi-column workspace and tables.
- Use CSS custom properties for safe-area insets, header height, bottom-nav
  height, control height, spacing, type scale, and elevation.
- Prefer container queries inside reusable panels so they adapt when placed in
  a drawer or split view.
- Test widths down to 320 pixels and landscape heights down to 360 pixels.

## Implementation phases

### M1 — Mobile foundation and navigation

- Introduce responsive routes and preserve desktop behavior.
- Add the compact header, bottom navigation, safe-area spacing, and shared
  mobile tokens.
- Add mobile loading, empty, error, and authorization states.
- Make authentication screens, session expiry, and sign out work cleanly at
  320-pixel width.

**Exit criteria:** A technician can authenticate, switch between primary
destinations, and sign out using one hand without horizontal scrolling or
obscured controls.

### M2 — Equipment-first technician workspace

- Build equipment search, recent equipment, favorites, and scanner entry.
- Refactor equipment detail so active faults and primary actions appear first.
- Convert specifications and history to mobile sections.
- Keep the selected machine synchronized across equipment, voice, and incident
  routes.

**Exit criteria:** A technician can find or scan a machine and reach its current
fault and main actions in at most three deliberate interactions.

### M3 — Voice workspace and persistent reviews

- Build the full-height voice experience and mobile voice dock.
- Preserve conversation, active machine, and outstanding reviews across route
  changes and follow-up questions.
- Add typed fallback and explicit permission, headset, disconnect, retry, and
  recovery states.
- Move all tool and safe-state confirmation to the shared review sheet.

**Exit criteria:** Asking a follow-up question never removes an unsaved report
or confirmation, and technicians can recover from microphone or connection
failure without losing their work.

### M4 — Minimal-touch Work Mode

- Add Work Mode entry, setup, pause, resume, and exit flows.
- Build the simplified task screen and large task-control dock.
- Add the constrained voice-command interpreter with confidence handling,
  visual command echo, and typed/touch fallbacks.
- Add short spoken prompts, optional sound/haptic cues, and wake-lock handling.
- Synchronize the active machine, current task, report drafts, procedure step,
  and pending reviews with the standard interface.
- Route every write and safety action through the normal review and
  authorization path.

**Exit criteria:** A technician can identify a machine, ask for help, move
through a supported task, pause or repeat instructions, and prepare a report
with minimal touch. No maintenance write or safety confirmation can occur from
background speech, silence, or an ambiguous command.

### M5 — Incident, repair, and supervisor workflows

- Build mobile incident lists and detail routes.
- Add sticky, permission-aware incident actions.
- Add the stepped repair completion flow and success receipt.
- Convert the supervisor queue to mobile cards and responsive details.

**Exit criteria:** Technician and supervisor workflows can be completed on a
phone with the same validation and authorization as desktop.

### M6 — Production QR scanner

- Add frame decoding and browser fallback.
- Add camera permission guidance, torch/camera switching, manual entry, and
  unknown-asset handling.
- Test cleanup of camera resources and repeated scans.

**Exit criteria:** Supported physical devices can scan a printed equipment code
reliably in plant-like lighting and open only authorized equipment.

### M7 — Resilience and installability

- Add the PWA manifest and offline application shell.
- Add connectivity and stale-data indicators.
- Restore safe local drafts while requiring fresh confirmation for writes.
- Define cache versioning, logout cleanup, and tenant-switch cleanup.

**Exit criteria:** The interface reopens with useful context after signal loss,
never implies an unsent write was saved, and never replays a maintenance write
without user confirmation.

### M8 — Accessibility, performance, and field validation

- Complete keyboard, screen-reader, contrast, zoom, and reduced-motion checks.
- Profile startup, equipment navigation, scanner startup, and voice controls on
  mid-range Android hardware.
- Run observed field tasks with technicians wearing representative PPE.
- Resolve high-impact findings and document supported devices and browsers.

**Exit criteria:** Automated accessibility checks pass, critical workflows pass
the physical-device matrix, and field participants can complete the defined
tasks without facilitator help.

## Validation strategy

### Automated checks

- Unit tests for navigation state, pending-review persistence, input validation,
  connectivity state, and draft restoration.
- Unit tests for Work Mode state transitions, supported command variants,
  low-confidence speech, background-speech rejection, and confirmation guards.
- Component tests for focus trapping, focus return, touch target size, error
  association, and status announcements.
- End-to-end tests at 320×568, 360×800, 390×844, 412×915, 768×1024, and desktop
  viewports.
- End-to-end coverage for login, session expiry, role-based navigation,
  equipment selection, QR/manual lookup, voice fallback, every maintenance
  write, invalid fault code, escalation, repair completion, and supervisor
  review.
- End-to-end coverage for entering and leaving Work Mode, repeating and pausing
  a task, losing connectivity, switching to touch fallback, and completing a
  review without losing the active task.
- Visual regression coverage for the main mobile routes, sheets, offline state,
  large text, and dark/high-contrast variants if provided.
- Automated accessibility scans plus keyboard-only checks; automation does not
  replace screen-reader and physical-device testing.

### Physical-device matrix

Test at minimum:

- A current mid-range Android phone in Chrome.
- A lower-powered or older Android device representative of the field fleet.
- An iPhone in Safari.
- A rugged Android handheld if the organization plans to deploy one.
- Portrait and landscape orientation.
- Bare hand and representative glove/PPE use.
- Built-in microphone, wired headset, and Bluetooth headset.
- Bright outdoor light, dim plant light, loud ambient noise, slow network,
  dropped network, and denied camera/microphone permissions.

The field script should cover scanning a machine, checking a fault, asking a
follow-up, saving an incident, entering an invalid code, escalating, recording
a reading, and completing a repair. Repeat the supported Work Mode tasks while
walking in a safe test area, carrying tools, wearing representative gloves, and
using each supported headset. Measure false activations and the number of
touches required, and include a stationary noisy-background test to confirm
that nearby speech cannot approve an action.

## Accessibility requirements

- Meet WCAG 2.2 AA for the technician workflow.
- Maintain logical heading order, landmarks, labels, and accessible names.
- Announce voice state changes, validation errors, connection state, scan
  success, and successful writes without repeatedly interrupting the user.
- Trap focus in dialogs and sheets, return it to the triggering control, and
  provide an obvious close action.
- Make all actions available without gestures, voice, color perception, or
  precise pointer control.
- Keep controls usable at 200% browser zoom and with system text enlargement.

## Performance budgets

Measure on a throttled mid-range mobile profile:

- Initial route JavaScript: target at or below 200 KB gzip, with supervisor and
  admin areas loaded on demand.
- Largest Contentful Paint: under 2.5 seconds at the 75th percentile.
- Interaction to Next Paint: under 200 milliseconds at the 75th percentile.
- Cumulative Layout Shift: under 0.1.
- Equipment detail transition after cached shell load: under 1 second.
- Scanner usable after permission is granted: under 2 seconds.

Budgets should become CI warnings first and required checks after a stable
baseline is measured.

## Product success measures

- Median time from app open to identified equipment.
- Median time from voice request to confirmed incident or reading.
- Percentage of write reviews completed without correction or retry.
- Frequency of invalid asset tags, fault codes, and unit corrections.
- Voice session reconnect and typed-fallback rate.
- QR scan success rate and time to first successful scan.
- Abandoned incident and repair flows.
- Mobile error rate by device, browser, and connectivity state.
- Technician satisfaction and observed task-completion rate during field tests.

Telemetry must avoid storing raw microphone audio, credentials, or sensitive
free-text content unless the product has an explicit, documented requirement
and retention policy.

## Definition of done

The mobile improvement is complete when:

- Every technician workflow works from a 320-pixel viewport without horizontal
  scrolling.
- Critical controls meet touch-target, contrast, and zoom requirements.
- Pending reviews survive follow-up questions, navigation, and recoverable
  reconnects.
- Work Mode supports the defined technician tasks with large controls, spoken
  and visual feedback, reliable pause/exit behavior, and minimal touch.
- Ambiguous commands and background speech never advance a safety step or
  submit a maintenance write.
- Every mutation displays a clear review, submitting state, error recovery, and
  success receipt.
- Invalid fault codes and unauthorized resources cannot silently enter trusted
  maintenance records.
- QR scanning works on the supported physical-device matrix with manual entry
  available.
- Offline and stale states are obvious, and writes are never replayed without a
  fresh confirmation.
- Role restrictions match the API and do not depend on hidden mobile controls.
- Automated checks and the physical field script pass.
- Desktop technician, supervisor, and admin workflows remain functional.

## Recommended build order

Start with M1 and M2 because they establish the route structure and technician
context used by every later screen. Implement M3 next so voice and pending
reviews become reliable, then build Work Mode in M4 on those stable session and
confirmation rules. Complete the workflow and scanner work in M5 and M6. Add
PWA resilience in M7 only after mutation behavior is explicit, then use M8 to
tune the result on the devices and working conditions technicians actually
use.
