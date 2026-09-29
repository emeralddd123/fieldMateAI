/* global document */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.DEMO_WEB_URL || 'http://localhost:55173';
const outputDir = path.resolve(
  process.env.DEMO_VIDEO_DIR || 'artifacts/demo-video',
);
const chromePath =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function titleCard(page, eyebrow, title, copy, accent = '#35c7dc') {
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box} body{margin:0;width:100vw;height:100vh;overflow:hidden;background:
      radial-gradient(circle at 75% 20%, ${accent}24, transparent 34%),
      linear-gradient(135deg,#081018 0%,#101d28 62%,#0d1720 100%);color:#edf6fb;
      font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{height:100%;display:flex;align-items:center;padding:90px 120px;position:relative}
    main:before{content:"";position:absolute;left:64px;top:64px;bottom:64px;width:4px;border-radius:4px;background:${accent}}
    .mark{display:flex;align-items:center;gap:14px;position:absolute;top:68px;left:120px;font-weight:750;font-size:22px}
    .mark i{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:${accent};color:#071118;font-style:normal}
    .mark span span{color:${accent}}
    .copy{max-width:820px}.eyebrow{text-transform:uppercase;letter-spacing:.2em;color:${accent};font-size:15px;font-weight:750}
    h1{font-size:58px;line-height:1.04;letter-spacing:-.035em;margin:20px 0 22px;max-width:900px}
    p{font-size:22px;line-height:1.55;color:#9fb3c2;max-width:780px;margin:0}
    .chapter{position:absolute;right:76px;bottom:68px;color:#6f8798;font-size:14px;letter-spacing:.12em;text-transform:uppercase}
  </style></head><body><main><div class="mark"><i>FM</i><span>FieldMate<span>AI</span></span></div>
    <div class="copy"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>
    <div class="chapter">Maintenance intelligence, from field to office</div></main></body></html>`);
  await sleep(2800);
}

async function addCaption(page, label, title, copy) {
  await page.evaluate(
    ({ label, title, copy }) => {
      document.querySelector('[data-demo-caption]')?.remove();
      const el = document.createElement('aside');
      el.dataset.demoCaption = 'true';
      el.innerHTML = `<span>${label}</span><strong>${title}</strong><p>${copy}</p>`;
      Object.assign(el.style, {
        position: 'fixed',
        left: '28px',
        bottom: '28px',
        zIndex: '2147483647',
        width: '390px',
        padding: '15px 18px',
        borderRadius: '12px',
        color: '#eaf6fb',
        background: 'rgba(7,16,24,.94)',
        border: '1px solid #315063',
        boxShadow: '0 18px 45px rgba(0,0,0,.42)',
        backdropFilter: 'blur(12px)',
        fontFamily:
          'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      });
      const tag = el.querySelector('span');
      Object.assign(tag.style, {
        display: 'block',
        color: '#43c8e6',
        fontSize: '10px',
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        marginBottom: '5px',
      });
      const heading = el.querySelector('strong');
      Object.assign(heading.style, {
        display: 'block',
        fontSize: '16px',
        marginBottom: '4px',
      });
      const paragraph = el.querySelector('p');
      Object.assign(paragraph.style, {
        margin: '0',
        color: '#9fb4c3',
        fontSize: '12px',
        lineHeight: '1.5',
      });
      document.body.append(el);
    },
    { label, title, copy },
  );
  await sleep(2400);
}

async function removeCaption(page) {
  await page.evaluate(() =>
    document.querySelector('[data-demo-caption]')?.remove(),
  );
}

async function login(page, context, email, password, viewport) {
  await context.clearCookies();
  await page.setViewportSize(viewport);
  const response = await context.request.post(`${baseUrl}/api/v1/auth/login`, {
    headers: { Origin: baseUrl },
    data: { email, password },
  });
  if (!response.ok())
    throw new Error(`Sign-in failed for ${email}: ${response.status()}`);
  const target = email.startsWith('admin@')
    ? '/admin'
    : email.startsWith('supervisor@')
      ? '/supervisor'
      : '/';
  await page.goto(`${baseUrl}${target}`, { waitUntil: 'networkidle' });
}

async function mobileStage(page, context) {
  await context.clearCookies();
  const response = await context.request.post(`${baseUrl}/api/v1/auth/login`, {
    headers: { Origin: baseUrl },
    data: {
      email: 'technician@fieldmate.local',
      password: 'fieldmate-test-user',
    },
  });
  if (!response.ok())
    throw new Error(`Technician sign-in failed: ${response.status()}`);
  const assetsResponse = await context.request.get(`${baseUrl}/api/v1/assets`);
  const assetsBody = await assetsResponse.json();
  const motor = assetsBody.data.find((asset) => asset.assetTag === 'M-204');
  const incidentsResponse = await context.request.get(
    `${baseUrl}/api/v1/incidents`,
  );
  const incidentsBody = await incidentsResponse.json();
  if (
    motor &&
    !incidentsBody.data.some((incident) => incident.status === 'escalated')
  ) {
    const createdResponse = await context.request.post(
      `${baseUrl}/api/v1/incidents`,
      {
        headers: { Origin: baseUrl },
        data: {
          assetId: motor.id,
          title: 'Recurring F0003 undervoltage trip',
          description:
            'Drive tripped again during production startup. Incoming voltage is unstable.',
          faultCode: 'F0003',
          priority: 'high',
        },
      },
    );
    if (!createdResponse.ok())
      throw new Error(
        `Demo incident creation failed: ${createdResponse.status()}`,
      );
    const created = (await createdResponse.json()).data;
    const escalationResponse = await context.request.post(
      `${baseUrl}/api/v1/incidents/${created.id}/escalate`,
      {
        headers: { Origin: baseUrl },
        data: {
          reason:
            'Repeated undervoltage requires supervisor coordination before restart.',
          severity: 'supervisor_review',
        },
      },
    );
    if (!escalationResponse.ok())
      throw new Error(`Demo escalation failed: ${escalationResponse.status()}`);
  }
  // Establish the presentation page on the same origin before embedding the app.
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('.app-shell').waitFor({ timeout: 20_000 });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box} body{margin:0;width:100vw;height:100vh;overflow:hidden;background:
      radial-gradient(circle at 83% 18%,#173a492b,transparent 33%),linear-gradient(135deg,#071018,#0e1b25);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#edf6fb}
    .story{position:absolute;left:58px;top:62px;width:520px}.brand{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:750}.brand i{font-style:normal;background:#27bad1;color:#051016;padding:7px;border-radius:8px}.brand em{font-style:normal;color:#33c7df}
    .story h1{font-size:42px;line-height:1.06;letter-spacing:-.035em;margin:120px 0 16px;max-width:480px}.story p{font-size:17px;line-height:1.55;color:#91a8b8;max-width:430px}
    .phone{position:absolute;right:72px;top:20px;width:430px;height:680px;padding:10px;border-radius:34px;background:#05090d;border:1px solid #345064;box-shadow:0 28px 70px #0009,0 0 0 6px #17242e}
    .phone:before{content:"";position:absolute;z-index:2;left:50%;top:10px;transform:translateX(-50%);width:105px;height:18px;border-radius:0 0 12px 12px;background:#05090d}
    iframe{width:100%;height:100%;display:block;border:0;border-radius:25px;background:#0b1118}
  </style></head><body><section class="story"><div class="brand"><i>FM</i>FieldMate<em>AI</em></div><h1>The technician workspace, built for the field.</h1><p>Live plant context stays in view while the technician identifies equipment, reviews incidents, and reuses repair knowledge.</p></section><div class="phone"><iframe src="${baseUrl}/"></iframe></div></body></html>`);
  const frame = page.frameLocator('iframe');
  await frame.locator('.app-shell').waitFor({ timeout: 20_000 });
  return frame;
}

async function technicianChapter(page, context) {
  await titleCard(
    page,
    'Chapter 01 · Technician',
    'Work from the machine, not from a desk.',
    'Identify equipment, understand plant conditions, inspect repair memory, and follow active incidents from a mobile workspace.',
  );
  const mobile = await mobileStage(page, context);
  await addCaption(
    page,
    'Mobile technician',
    'A field-ready plant overview',
    'The technician sees current incidents, equipment health, and repair activity at a glance.',
  );
  await mobile.locator('.metrics-grid').scrollIntoViewIfNeeded();
  await sleep(1800);

  await removeCaption(page);
  const selector = mobile.locator('.mobile-equipment-toggle');
  await selector.scrollIntoViewIfNeeded();
  await selector.click();
  await addCaption(
    page,
    'Equipment context',
    'Switch machines without losing place',
    'The compact selector expands only when needed and keeps the chosen asset visible.',
  );
  await sleep(1200);
  const otherAsset = mobile
    .locator('#equipment-options .asset-button:not(.selected)')
    .first();
  if (await otherAsset.count()) await otherAsset.click();
  await sleep(1800);

  await removeCaption(page);
  const memory = mobile.getByRole('region', { name: 'Equipment memory' });
  await memory.scrollIntoViewIfNeeded();
  await addCaption(
    page,
    'Institutional memory',
    'Every repair becomes reusable knowledge',
    'Actions, verification readings, technicians, and linked incidents stay attached to the machine.',
  );
  await sleep(2200);
  const graph = memory.getByRole('button', { name: 'Knowledge Graph' });
  if (await graph.count()) {
    await graph.click();
    await sleep(2200);
    await memory.getByRole('button', { name: 'Timeline' }).click();
  }

  await removeCaption(page);
  const incidentButton = mobile
    .locator('.mobile-nav-item')
    .filter({ hasText: 'Incidents' });
  await incidentButton.click();
  await addCaption(
    page,
    'Incident register',
    'Field context stays connected',
    'Technicians can review active work, priority, notes, and the complete diagnostic record.',
  );
  await sleep(2500);
  const incidentCard = mobile.locator('.drawer-incident-card').first();
  if (await incidentCard.count()) {
    await incidentCard.click();
    await sleep(2500);
  }
}

async function supervisorChapter(page, context) {
  await titleCard(
    page,
    'Chapter 02 · Supervisor',
    'Turn field escalations into coordinated work.',
    'See plant health, prioritize the queue, open the diagnostic record, and keep ownership visible across the team.',
    '#f3ad4b',
  );
  await login(
    page,
    context,
    'supervisor@fieldmate.local',
    'fieldmate-test-user',
    { width: 1280, height: 720 },
  );
  await page.goto(`${baseUrl}/supervisor`, { waitUntil: 'networkidle' });
  await addCaption(
    page,
    'Supervisor workspace',
    'Plant health and workload in one view',
    'KPIs surface active incidents, equipment down, pending escalations, and completed repairs.',
  );
  await sleep(2500);

  await removeCaption(page);
  const escalation = page
    .locator(
      '.supervisor-escalation-card, .supervisor-queue-card, [class*="escalation-card"]',
    )
    .first();
  if (await escalation.count()) {
    await escalation.scrollIntoViewIfNeeded();
    await addCaption(
      page,
      'Escalation queue',
      'Urgent work rises to the top',
      'Supervisors can inspect the reason, priority, equipment, and current assignment before acting.',
    );
    await sleep(2300);
    await escalation.click();
  } else {
    const firstIncident = page
      .locator('button, article')
      .filter({ hasText: /INC-/ })
      .first();
    if (await firstIncident.count()) await firstIncident.click();
  }
  await sleep(2300);

  const modal = page.locator('[role="dialog"]');
  if (await modal.count()) {
    await addCaption(
      page,
      'Supervisor review',
      'One record, complete operational context',
      'Assignment, priority, escalation history, readings, notes, and repair evidence stay together.',
    );
    await sleep(2800);
    await page.keyboard.press('Escape');
  }
}

async function adminChapter(page, context) {
  await titleCard(
    page,
    'Chapter 03 · Administrator',
    'Govern people, equipment, and approved knowledge.',
    'Control access, maintain plant inventory, curate fault definitions and procedures, and review the audit trail.',
    '#8bd47d',
  );
  await login(page, context, 'admin@fieldmate.test', 'fieldmate-test-admin', {
    width: 1280,
    height: 720,
  });
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
  await addCaption(
    page,
    'Administration',
    'One console for the operating model',
    'Manage team members, sites, machines, procedures, fault codes, and security records.',
  );
  await sleep(2600);

  await removeCaption(page);
  await page
    .getByRole('link', { name: /Users & Access/i })
    .first()
    .click();
  await page.waitForLoadState('networkidle');
  await addCaption(
    page,
    'Role-based access',
    'Put the right people at the right sites',
    'Invite users, assign roles and site access, suspend membership, and revoke sessions.',
  );
  await sleep(2800);

  await removeCaption(page);
  await page.getByRole('link', { name: /^Machines$/i }).click();
  await page.waitForLoadState('networkidle');
  await addCaption(
    page,
    'Asset governance',
    'Keep the equipment register trustworthy',
    'Administrators maintain machine identity, specifications, components, status, and lifecycle.',
  );
  await sleep(2600);

  await removeCaption(page);
  await page.getByRole('link', { name: /^Procedures$/i }).click();
  await page.waitForLoadState('networkidle');
  await addCaption(
    page,
    'Approved procedures',
    'Safety knowledge stays controlled',
    'Draft, approve, withdraw, and archive the procedures technicians rely on in the field.',
  );
  await sleep(2800);

  await removeCaption(page);
  await page.getByRole('link', { name: /Audit/i }).click();
  await page.waitForLoadState('networkidle');
  await addCaption(
    page,
    'Audit trail',
    'Every sensitive action remains accountable',
    'Authentication and administrative changes are recorded with actor, target, time, and request context.',
  );
  await sleep(3000);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    console.error('Browser page error:', error.message),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.error('Browser console:', message.text());
  });
  const video = page.video();

  await titleCard(
    page,
    'FieldMate AI',
    'Talk to your machines. Remember every repair.',
    'A role-based maintenance workflow for technicians in the field, supervisors coordinating operations, and administrators governing plant knowledge.',
  );
  await technicianChapter(page, context);
  await supervisorChapter(page, context);
  await adminChapter(page, context);
  await titleCard(
    page,
    'FieldMate AI',
    'From fault to fix—and ready for the next shift.',
    'Faster field decisions. Coordinated supervision. Controlled institutional knowledge.',
    '#48d6b1',
  );

  await page.close();
  const source = await video.path();
  await context.close();
  await browser.close();
  const finalPath = path.join(outputDir, 'fieldmate-role-workflow-demo.webm');
  await fs.rename(source, finalPath);
  console.log(finalPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
