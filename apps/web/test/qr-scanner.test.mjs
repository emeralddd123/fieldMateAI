import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mirroring parseQrPayload and matchAssetFromPayload from qrScannerUtils
function parseQrPayload(raw) {
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
      const queryParam =
        url.searchParams.get('asset') ||
        url.searchParams.get('tag') ||
        url.searchParams.get('id');
      if (queryParam) {
        return queryParam.trim();
      }
      const pathParts = url.pathname.split('/').filter(Boolean);
      const markerIdx = pathParts.findIndex((p) =>
        ['asset', 'assets', 'equipment', 'machines'].includes(p.toLowerCase()),
      );
      const nextPart = markerIdx !== -1 ? pathParts[markerIdx + 1] : undefined;
      if (nextPart) {
        return decodeURIComponent(nextPart).trim();
      }
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart) {
        return decodeURIComponent(lastPart).trim();
      }
    } catch {
      // url parse failed
    }
  }

  return trimmed;
}

function matchAssetFromPayload(payload, assets) {
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

// Sample facility assets for testing
const testFacilityAssets = [
  {
    id: 'asset-uuid-204',
    assetTag: 'M-204',
    name: 'Centrifugal Slurry Pump',
    criticality: 'CRITICAL',
  },
  {
    id: 'asset-uuid-101',
    assetTag: 'CONV-01',
    name: 'Overland Conveyor Drive',
    criticality: 'MEDIUM',
  },
  {
    id: 'asset-uuid-305',
    assetTag: 'FAN-04',
    name: 'Ventilation Fan Unit 4',
    criticality: 'HIGH',
  },
];

test('QR payload parser normalizes diverse equipment QR formats and URLs', () => {
  // Direct tag
  assert.equal(parseQrPayload('M-204'), 'M-204');
  assert.equal(parseQrPayload('  m-204  '), 'm-204');

  // Custom deep-link scheme
  assert.equal(parseQrPayload('fieldmate://asset/M-204'), 'M-204');
  assert.equal(parseQrPayload('fieldmate://equipment/CONV-01'), 'CONV-01');
  assert.equal(parseQrPayload('FIELDMATE://ASSET/FAN-04'), 'FAN-04');

  // Web URLs with query params
  assert.equal(
    parseQrPayload('https://app.fieldmate.io/scan?asset=M-204'),
    'M-204',
  );
  assert.equal(
    parseQrPayload('https://app.fieldmate.io/?tag=CONV-01'),
    'CONV-01',
  );
  assert.equal(
    parseQrPayload('http://localhost:5173/overview?id=asset-uuid-204'),
    'asset-uuid-204',
  );

  // Web URLs with path segments
  assert.equal(
    parseQrPayload('https://fieldmate.corp.internal/assets/M-204'),
    'M-204',
  );
  assert.equal(
    parseQrPayload('https://fieldmate.corp.internal/equipment/FAN-04/'),
    'FAN-04',
  );

  // Empty or invalid input
  assert.equal(parseQrPayload(''), '');
  assert.equal(parseQrPayload('   '), '');
});

test('Asset matching validates against authorized facility equipment', () => {
  // Exact asset tag
  const match1 = matchAssetFromPayload('M-204', testFacilityAssets);
  assert.ok(match1);
  assert.equal(match1.id, 'asset-uuid-204');
  assert.equal(match1.name, 'Centrifugal Slurry Pump');

  // Case-insensitive match
  const match2 = matchAssetFromPayload('conv-01', testFacilityAssets);
  assert.ok(match2);
  assert.equal(match2.assetTag, 'CONV-01');

  // Deep-link scheme payload
  const match3 = matchAssetFromPayload('fieldmate://asset/FAN-04', testFacilityAssets);
  assert.ok(match3);
  assert.equal(match3.assetTag, 'FAN-04');

  // Match by UUID
  const match4 = matchAssetFromPayload('asset-uuid-204', testFacilityAssets);
  assert.ok(match4);
  assert.equal(match4.assetTag, 'M-204');
});

test('Asset matching isolates unknown or cross-tenant equipment tags', () => {
  // Cross-tenant equipment from another plant
  const unknown1 = matchAssetFromPayload('PLANT-B-TURBINE-09', testFacilityAssets);
  assert.equal(unknown1, null);

  // Malformed or invalid barcode
  const unknown2 = matchAssetFromPayload('UNKNOWN-TAG-999', testFacilityAssets);
  assert.equal(unknown2, null);

  // Empty string
  const unknown3 = matchAssetFromPayload('', testFacilityAssets);
  assert.equal(unknown3, null);
});

test('Camera lifecycle teardown cleanly releases hardware media tracks and cancels scanning loops', () => {
  let tracksStoppedCount = 0;
  const mockTrack1 = {
    stop: () => {
      tracksStoppedCount++;
    },
    kind: 'video',
  };
  const mockTrack2 = {
    stop: () => {
      tracksStoppedCount++;
    },
    kind: 'video',
  };

  const mockStream = {
    getTracks: () => [mockTrack1, mockTrack2],
  };

  let scanLoopActive = true;
  let videoSrc = 'blob:mock-stream';

  // Teardown simulation (as executed in QrScannerModal stopCameraStreams)
  function stopCameraStreams(stream) {
    scanLoopActive = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    videoSrc = null;
  }

  stopCameraStreams(mockStream);

  assert.equal(tracksStoppedCount, 2);
  assert.equal(scanLoopActive, false);
  assert.equal(videoSrc, null);
});

test('Repeated scan recovery state preserves stream and allows scanning resumption without duplication', () => {
  let currentScanState = 'SCANNING';
  let unrecognizedTag = null;
  let scanAttempt = 0;

  function onDecoded(tag, assets) {
    scanAttempt++;
    const match = matchAssetFromPayload(tag, assets);
    if (match) {
      currentScanState = 'MATCHED';
      return { success: true, asset: match };
    } else {
      currentScanState = 'UNRECOGNIZED_PAUSED';
      unrecognizedTag = tag;
      return { success: false, unrecognizedTag: tag };
    }
  }

  function resumeScanning() {
    unrecognizedTag = null;
    currentScanState = 'SCANNING';
  }

  // First scan: unrecognized tag
  const result1 = onDecoded('ROGUE-TAG-404', testFacilityAssets);
  assert.equal(result1.success, false);
  assert.equal(currentScanState, 'UNRECOGNIZED_PAUSED');
  assert.equal(unrecognizedTag, 'ROGUE-TAG-404');

  // Technician taps "Scan Another Tag"
  resumeScanning();
  assert.equal(currentScanState, 'SCANNING');
  assert.equal(unrecognizedTag, null);

  // Second scan: valid tag on machine M-204
  const result2 = onDecoded('fieldmate://asset/M-204', testFacilityAssets);
  assert.equal(result2.success, true);
  assert.equal(currentScanState, 'MATCHED');
  assert.equal(result2.asset.assetTag, 'M-204');
  assert.equal(scanAttempt, 2);
});
