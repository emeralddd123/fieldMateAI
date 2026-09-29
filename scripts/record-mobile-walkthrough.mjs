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
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Check if we are on login page
  const emailInput = await page.$('input[type="email"], input[name="email"], input#email');
  if (emailInput) {
    console.log('Logging in as demo technician...');
    await emailInput.fill('technician@fieldmate.local');
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill('fieldmate-demo-2026');
    }
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    }
    await page.waitForTimeout(3000);
  }

  // 1. Initial view: Technician Workspace
  console.log('1. Viewing technician mobile workspace...');
  await page.waitForTimeout(2500);

  // 2. Change equipment using the Mobile Equipment Sheet
  console.log('2. Opening Mobile Equipment Sheet...');
  const changeBtn = await page.$('.mobile-change-machine-btn, button:has-text("Change")');
  if (changeBtn) {
    await changeBtn.click();
    await page.waitForTimeout(2000);

    // Scroll through the equipment list in the sheet
    const sheetList = await page.$('.sheet-asset-list, .asset-sheet-list, .mobile-sheet-content, .mobile-sheet-body');
    if (sheetList) {
      await sheetList.evaluate((el) => el.scrollBy({ top: 180, behavior: 'smooth' }));
      await page.waitForTimeout(1500);
    }

    // Select second asset (P-101)
    const secondAsset = await page.$('button:has-text("P-101"), .sheet-asset-item:nth-child(2)');
    if (secondAsset) {
      console.log('Selecting P-101 Slurry Feed Pump...');
      await secondAsset.click();
      await page.waitForTimeout(2000);
    }
  }

  // 3. Scroll through equipment overview, fault codes, telemetry, and procedures
  console.log('3. Inspecting equipment telemetry & specifications...');
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' }));
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(2000);

  // 4. Open Incidents Register
  console.log('4. Opening Incidents Register Drawer...');
  const incidentsNavBtn = await page.$('.mobile-nav-item:has-text("Incidents"), button[aria-label*="Incident"], button:has-text("Incidents")');
  if (incidentsNavBtn) {
    await incidentsNavBtn.click();
    await page.waitForTimeout(2000);

    // Click first incident to view details modal
    const incidentCard = await page.$('.drawer-incident-card, .incident-item, .incident-drawer-list button, button:has-text("INC-")');
    if (incidentCard) {
      console.log('Opening Incident Detail Modal & reviewing note cards...');
      await incidentCard.click();
      await page.waitForTimeout(2500);

      // Scroll inside modal to review notes
      const modalScroll = await page.$('.modal-body, .incident-detail-content, .incident-modal-content');
      if (modalScroll) {
        await modalScroll.evaluate((el) => el.scrollBy({ top: 300, behavior: 'smooth' }));
        await page.waitForTimeout(2000);
      }

      // Close modal
      const closeBtn = await page.$('.modal-close, button[aria-label="Close modal"], button[aria-label="Close"]');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(1500);
      }
    }

    // Close incidents drawer if still open
    const closeDrawerBtn = await page.$('.drawer-close, button[aria-label="Close drawer"], .drawer-header button');
    if (closeDrawerBtn) {
      await closeDrawerBtn.click();
      await page.waitForTimeout(1500);
    }
  }

  // 5. Scroll back up and demonstrate Mobile Voice Assistant
  console.log('5. Demonstrating Mobile Voice Assistant...');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);

  const voiceNavBtn = await page.$('.mobile-nav-voice-btn, button[aria-label*="voice"], button[aria-label*="Voice"]');
  if (voiceNavBtn) {
    await voiceNavBtn.click();
    await page.waitForTimeout(3000);

    // Close voice sheet
    const closeVoiceBtn = await page.$('.voice-sheet-close, button[aria-label="Close voice sheet"], .sheet-handle-bar, button[aria-label="Close"]');
    if (closeVoiceBtn) {
      await closeVoiceBtn.click();
      await page.waitForTimeout(1500);
    }
  }

  // Final view of the dashboard
  await page.waitForTimeout(2000);

  const video = page.video();
  const videoPath = await video.path();

  await context.close();
  await browser.close();

  const finalVideoPath = path.join(ARTIFACT_DIR, 'fieldmate_mobile_technician_walkthrough.webm');
  if (fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, finalVideoPath);
    console.log('Walkthrough video recorded successfully at:', finalVideoPath);
  }
}

run().catch((err) => {
  console.error('Error during recording:', err);
  process.exit(1);
});
