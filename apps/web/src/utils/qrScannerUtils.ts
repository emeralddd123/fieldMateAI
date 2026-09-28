import type { Asset } from '@fieldmate/shared';

/**
 * Normalizes and extracts asset tag or identifier from raw QR code text or URIs.
 * Supports:
 * - Direct tags: "M-204", "m-204"
 * - Custom scheme: "fieldmate://asset/M-204", "fieldmate://equipment/M-204"
 * - Web URLs: "https://fieldmate.app/assets/M-204", "https://app.fieldmate.io/?asset=M-204", "https://app.fieldmate.io/?tag=M-204"
 * - Raw JSON or UUIDs
 */
export function parseQrPayload(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Custom scheme: fieldmate://asset/TAG or fieldmate://equipment/TAG
  const schemeMatch = trimmed.match(/^fieldmate:\/\/(?:asset|equipment)\/([^/?#]+)/i);
  if (schemeMatch && schemeMatch[1]) {
    return decodeURIComponent(schemeMatch[1]).trim();
  }

  // Web URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      // Query parameters: ?asset=M-204 or ?tag=M-204 or ?id=...
      const queryParam = url.searchParams.get('asset') || url.searchParams.get('tag') || url.searchParams.get('id');
      if (queryParam) {
        return queryParam.trim();
      }
      // Path segments: /assets/M-204 or /equipment/M-204 or /asset/M-204
      const pathParts = url.pathname.split('/').filter(Boolean);
      const markerIdx = pathParts.findIndex((p) =>
        ['asset', 'assets', 'equipment', 'machines'].includes(p.toLowerCase()),
      );
      const nextPart = markerIdx !== -1 ? pathParts[markerIdx + 1] : undefined;
      if (nextPart) {
        return decodeURIComponent(nextPart).trim();
      }
      // Last segment fallback if path exists
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart) {
        return decodeURIComponent(lastPart).trim();
      }
    } catch {
      // If URL parsing fails, proceed with cleaned raw
    }
  }

  return trimmed;
}

/**
 * Validates extracted tag against authorized facility assets.
 * Returns the matching Asset or null if not found.
 */
export function matchAssetFromPayload(
  payload: string,
  assets: Asset[],
): Asset | null {
  const clean = parseQrPayload(payload).toLowerCase();
  if (!clean) return null;

  return (
    assets.find(
      (a) =>
        a.assetTag.toLowerCase() === clean ||
        a.id.toLowerCase() === clean ||
        a.name.toLowerCase() === clean,
    ) ?? null
  );
}

/**
 * Checks if the browser natively supports BarcodeDetector with qr_code format.
 */
export async function isBarcodeDetectorSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return false;
  }
  try {
    const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: { getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector;
    if (typeof BarcodeDetectorClass?.getSupportedFormats === 'function') {
      const formats = await BarcodeDetectorClass.getSupportedFormats();
      return formats.includes('qr_code');
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Emits an audible confirmation chime upon successful equipment scan.
 * Uses Web Audio API without requiring external sound files.
 */
export function playScanSuccessAudio(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Two-tone rising confirmation beep: 880Hz to 1320Hz
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 200);
  } catch {
    // AudioContext blocked or not supported - silently ignore
  }
}

/**
 * Triggers short haptic pulse on mobile devices where vibration API is allowed.
 */
export function triggerScanHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 30, 40]);
    }
  } catch {
    // Vibration ignored
  }
}
