import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACT_DIR = '/Users/usman/.gemini/antigravity-ide/brain/a89e6d52-e6d8-4645-ba28-7580817905de';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
  console.log('Launching browser for mobile recording...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 780, height: 1688 },
    },
  });

  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173/login');
  await page.waitForTimeout(1500);

  // 1. Authenticate as technician
  console.log('Logging in as demo technician...');
  await page.fill('input[type="email"]', 'technician@fieldmate.local');
  await page.fill('input[type="password"]', 'fieldmate-demo-2026');
  await page.waitForTimeout(500);
  await page.click('button.auth-submit, button[type="submit"]');

  console.log('Waiting for workspace navigation...');
  await page.waitForURL('http://localhost:5173/', { timeout: 15000 });
  console.log('Successfully arrived at workspace:', page.url());
  await page.waitForTimeout(2500);

  // 2. View mobile technician dashboard & active equipment
  console.log('Step 1: Viewing technician workspace for active equipment...');
  await page.waitForTimeout(2000);

  // 3. Open Mobile Equipment Sheet and switch machine
  console.log('Step 2: Opening Mobile Equipment Sheet...');
  const changeBtn = await page.$('.mobile-change-machine-btn, button:has-text("Change")');
  if (changeBtn) {
    await changeBtn.click();
    await page.waitForTimeout(2000);

    // Smoothly scroll equipment list in sheet
    await page.evaluate(() => {
      const el = document.querySelector('.sheet-equipment-list');
      if (el) el.scrollBy({ top: 160, behavior: 'smooth' });
    });
    await page.waitForTimeout(1500);

    // Select another machine
    console.log('Selecting next machine from equipment sheet...');
    const nextCard = await page.$('.sheet-equipment-list .equipment-card:not(.active-card)');
    if (nextCard) {
      await nextCard.click();
      await page.waitForTimeout(2000);
    }
  }

  // 4. Scroll through machine specs, fault procedures, and live telemetry
  console.log('Step 3: Inspecting machine specs, active fault guidance & telemetry...');
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' }));
  await page.waitForTimeout(2200);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(2200);

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);

  // 5. Open Plant Incidents Register
  console.log('Step 4: Opening Incidents Register Drawer...');
  const incidentsNavBtn = await page.$('.mobile-nav-item:has-text("Incidents"), button[aria-label*="Incident"], button:has-text("Incidents")');
  if (incidentsNavBtn) {
    await incidentsNavBtn.click();
    await page.waitForTimeout(2000);

    // Click first incident to view details modal with note cards
    const incidentCard = await page.$('.drawer-incident-card');
    if (incidentCard) {
      console.log('Opening Incident Detail Modal to inspect note cards...');
      await incidentCard.click();
      await page.waitForTimeout(2500);

      // Scroll inside modal to show formatted notes
      await page.evaluate(() => {
        const el = document.querySelector('.modal-body, .modal-scroll-area, .incident-modal-layout');
        if (el) el.scrollBy({ top: 300, behavior: 'smooth' });
      });
      await page.waitForTimeout(2000);

      // Close modal
      const closeBtn = await page.$('.modal-close-btn, button[aria-label="Close incident details"]');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Close incidents drawer
    const closeDrawerBtn = await page.$('.drawer-close-btn, button[aria-label="Close incidents register"]');
    if (closeDrawerBtn) {
      await closeDrawerBtn.click();
      await page.waitForTimeout(1500);
    }
  }

  // 6. Demonstrate Mobile Voice Copilot
  console.log('Step 5: Activating Mobile Voice Assistant...');
  const voiceNavBtn = await page.$('.mobile-nav-voice-btn');
  if (voiceNavBtn) {
    await voiceNavBtn.click();
    await page.waitForTimeout(3000);

    // Close voice sheet
    const closeVoiceBtn = await page.$('.voice-head-btn.close-btn, button[aria-label="Minimize voice session"]');
    if (closeVoiceBtn) {
      await closeVoiceBtn.click();
      await page.waitForTimeout(1800);
    }
  }

  // Wrap up view
  console.log('Wrapping up walkthrough...');
  await page.waitForTimeout(2000);

  const video = page.video();
  const videoPath = await video.path();

  await context.close();
  await browser.close();

  const finalVideoPath = path.join(ARTIFACT_DIR, 'fieldmate_mobile_technician_walkthrough.webm');
  if (fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, finalVideoPath);
    console.log('Walkthrough video successfully recorded at:', finalVideoPath);
  }
}

run().catch((err) => {
  console.error('Error during recording:', err);
  process.exit(1);
});
