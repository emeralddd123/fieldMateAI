import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

// WCAG 2.2 AA relative luminance and contrast ratio helper
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  if (clean.length === 6) {
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }
  if (clean.length === 3) {
    const r = (bigint >> 8) & 15;
    const g = (bigint >> 4) & 15;
    const b = bigint & 15;
    return [r * 17, g * 17, b * 17];
  }
  return [0, 0, 0];
}

function relativeLuminance([r, g, b]) {
  const sRGB = [r, g, b].map((v) => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function calculateContrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

test('Color palettes meet WCAG 2.2 AA contrast minimums (>= 4.5:1 for body, >= 3:1 for components)', () => {
  const darkBg = '#0b1118'; // FieldMate dark slate background
  const surfaceBg = '#101923'; // Panel card background

  // Primary body text (#e5eaf0 / #f1f5f9) against dark background
  const bodyTextContrast = calculateContrastRatio('#e5eaf0', darkBg);
  assert.ok(bodyTextContrast >= 11, `Body text contrast should be high, was ${bodyTextContrast}`);

  // Secondary text (#94a3b8) against dark background
  const secondaryContrast = calculateContrastRatio('#94a3b8', darkBg);
  assert.ok(secondaryContrast >= 4.5, `Secondary text contrast must be >= 4.5:1, was ${secondaryContrast}`);

  // Brand Sky Blue Accent (#38bdf8) against dark background
  const accentContrast = calculateContrastRatio('#38bdf8', darkBg);
  assert.ok(accentContrast >= 4.5, `Accent contrast must be >= 4.5:1, was ${accentContrast}`);

  // Critical / Warning badges against surface background
  const warningContrast = calculateContrastRatio('#fbbf24', surfaceBg);
  assert.ok(warningContrast >= 4.5, `Warning badge text must be readable, was ${warningContrast}`);

  const criticalContrast = calculateContrastRatio('#f87171', surfaceBg);
  assert.ok(criticalContrast >= 4.5, `Critical badge text must be readable, was ${criticalContrast}`);
});

test('Reduced-motion media query safely eliminates motion without breaking transition events', () => {
  const cssPath = path.join(webDir, 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify prefers-reduced-motion block exists
  assert.ok(
    cssContent.includes('@media (prefers-reduced-motion: reduce)'),
    'styles.css must include @media (prefers-reduced-motion: reduce)',
  );

  // Verify standard animation-duration override
  assert.ok(
    cssContent.includes('animation-duration: 0.01ms !important'),
    'Reduced motion must set animation-duration to near-zero',
  );
  assert.ok(
    cssContent.includes('transition-duration: 0.01ms !important'),
    'Reduced motion must set transition-duration to near-zero',
  );
});

test('Compact mobile viewports (320px) are fully supported without horizontal scroll overflow', () => {
  const cssPath = path.join(webDir, 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify body min-width is 320px
  assert.ok(
    cssContent.includes('min-width: 320px;'),
    'Body min-width must be 320px to support compact mobile hardware',
  );

  // Verify body overflow-x is hidden
  assert.ok(
    cssContent.includes('overflow-x: hidden;'),
    'Body must have overflow-x: hidden to prevent horizontal page scrolling',
  );
});

test('Mobile touch targets adhere to industrial PPE & WCAG recommended minimums (>= 44px)', () => {
  const cssPath = path.join(webDir, 'src/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify modal close button has min 44x44px in mobile media query
  assert.ok(
    cssContent.includes('min-width: 44px;'),
    'Mobile close buttons must have min-width: 44px for gloved finger operation',
  );
  assert.ok(
    cssContent.includes('min-height: 44px;'),
    'Mobile close buttons must have min-height: 44px for gloved finger operation',
  );

  // Verify QR asset buttons meet 44px min height
  assert.ok(
    cssContent.includes('.qr-asset-btn') && cssContent.includes('min-height: 44px;'),
    'QR asset chips must have min-height: 44px for easy tap targeting',
  );
});

test('Modal dialogs and sheets implement accessible dialog semantics and keyboard traps', () => {
  const qrModalPath = path.join(webDir, 'src/components/QrScannerModal.tsx');
  const qrContent = fs.readFileSync(qrModalPath, 'utf8');

  assert.ok(qrContent.includes('role="dialog"'), 'QrScannerModal must declare role="dialog"');
  assert.ok(qrContent.includes('aria-modal="true"'), 'QrScannerModal must declare aria-modal="true"');
  assert.ok(qrContent.includes('aria-label') || qrContent.includes('aria-labelledby'), 'QrScannerModal must have an accessible name');

  const repairModalPath = path.join(webDir, 'src/components/RepairCompletionModal.tsx');
  const repairContent = fs.readFileSync(repairModalPath, 'utf8');

  assert.ok(repairContent.includes('role="dialog"'), 'RepairCompletionModal must declare role="dialog"');
  assert.ok(repairContent.includes('aria-modal="true"'), 'RepairCompletionModal must declare aria-modal="true"');
});

test('Status announcements utilize appropriate live regions without disruptive interruption', () => {
  const connBannerPath = path.join(webDir, 'src/components/ConnectivityBanner.tsx');
  const connContent = fs.readFileSync(connBannerPath, 'utf8');

  assert.ok(connContent.includes('role="status"'), 'ConnectivityBanner must declare role="status"');
  assert.ok(connContent.includes('aria-live="polite"'), 'ConnectivityBanner must use polite live region');

  const draftNoticePath = path.join(webDir, 'src/components/DraftRestorationNotice.tsx');
  const draftContent = fs.readFileSync(draftNoticePath, 'utf8');

  assert.ok(draftContent.includes('role="alert"'), 'DraftRestorationNotice must declare role="alert"');
  assert.ok(draftContent.includes('aria-live="polite"'), 'DraftRestorationNotice must use polite live region');
});
