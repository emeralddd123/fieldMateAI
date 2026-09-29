import { useState, useEffect, useRef, useCallback } from 'react';
import {
  QrCode,
  ScanLine,
  X,
  AlertCircle,
  Check,
  Camera,
  SwitchCamera,
  Zap,
  ZapOff,
  AlertTriangle,
  RotateCcw,
  Keyboard,
  ShieldCheck,
} from 'lucide-react';
import type { Asset } from '@fieldmate/shared';
import jsQR from 'jsqr';
import {
  parseQrPayload,
  matchAssetFromPayload,
  isBarcodeDetectorSupported,
  playScanSuccessAudio,
  triggerScanHaptic,
} from '../utils/qrScannerUtils';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  onSelectAsset: (assetId: string) => void;
}

type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function QrScannerModal(props: QrScannerModalProps) {
  return props.isOpen ? <QrScannerSession {...props} /> : null;
}

function QrScannerSession({
  isOpen,
  onClose,
  assets,
  onSelectAsset,
}: QrScannerModalProps) {
  // Permission & camera states
  const [permissionState, setPermissionState] = useState<PermissionStatus>(
    () => {
      try {
        return localStorage.getItem('fieldmate_camera_granted') === 'true' &&
          Boolean(navigator.mediaDevices?.getUserMedia)
          ? 'granted'
          : 'prompt';
      } catch {
        return 'prompt';
      }
    },
  );
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment',
  );
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Scan detection & feedback states
  const [detectedAsset, setDetectedAsset] = useState<Asset | null>(null);
  const [unrecognizedTag, setUnrecognizedTag] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [decoderType, setDecoderType] = useState<
    'BarcodeDetector' | 'jsQR' | null
  >(null);
  const [showManualForm, setShowManualForm] = useState(false);

  // DOM & stream references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const isScanningRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<unknown>(null);

  // Clean up all camera hardware & media stream resources
  const stopCameraStreams = useCallback(() => {
    isScanningRef.current = false;
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
  }, []);

  // Handle successful match of an equipment asset
  const handleMatchedAsset = useCallback(
    (matched: Asset) => {
      isScanningRef.current = false;
      setDetectedAsset(matched);
      setUnrecognizedTag(null);
      playScanSuccessAudio();
      triggerScanHaptic();

      // Stop camera stream immediately to save resources
      stopCameraStreams();

      // Brief delay so user sees visual confirmation badge before route navigation
      setTimeout(() => {
        onSelectAsset(matched.id);
        onClose();
      }, 550);
    },
    [onClose, onSelectAsset, stopCameraStreams],
  );

  // Process raw decoded QR text
  const processDecodedString = useCallback(
    (rawString: string) => {
      if (!rawString || detectedAsset) return;
      const cleanTag = parseQrPayload(rawString);
      if (!cleanTag) return;

      const matched = matchAssetFromPayload(cleanTag, assets);
      if (matched) {
        handleMatchedAsset(matched);
      } else {
        // Unknown or cross-tenant asset detected
        isScanningRef.current = false;
        setUnrecognizedTag(cleanTag);
        triggerScanHaptic();
      }
    },
    [assets, detectedAsset, handleMatchedAsset],
  );

  // Frame decoding loop (supporting native BarcodeDetector with jsQR canvas fallback)
  const runFrameDecodeLoop = useCallback(
    function decodeFrame() {
      if (!isScanningRef.current) return;

      const video = videoRef.current;
      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        scanLoopRef.current = requestAnimationFrame(decodeFrame);
        return;
      }

      const now = performance.now();
      // Throttle decoding to every ~90ms to conserve mobile CPU & battery
      if (now - lastScanTimeRef.current >= 90) {
        lastScanTimeRef.current = now;

        // 1. Primary: Native BarcodeDetector
        if (barcodeDetectorRef.current) {
          const detector = barcodeDetectorRef.current as {
            detect: (
              source: HTMLVideoElement,
            ) => Promise<Array<{ rawValue: string }>>;
          };
          detector
            .detect(video)
            .then((barcodes) => {
              const firstBarcode = barcodes?.[0];
              if (firstBarcode?.rawValue && isScanningRef.current) {
                processDecodedString(firstBarcode.rawValue);
              }
            })
            .catch(() => {
              // Fall back to jsQR if detector fails
            });
        } else {
          // 2. Secondary Fallback: jsQR via offscreen canvas
          const canvas = canvasRef.current || document.createElement('canvas');
          if (!canvasRef.current) canvasRef.current = canvas;

          // Downscale to maximum 640px width to ensure fast real-time processing
          const scale = Math.min(1, 640 / video.videoWidth);
          const targetWidth = Math.floor(video.videoWidth * scale);
          const targetHeight = Math.floor(video.videoHeight * scale);

          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const code = jsQR(imageData.data, targetWidth, targetHeight, {
              inversionAttempts: 'attemptBoth',
            });
            if (code && code.data && isScanningRef.current) {
              processDecodedString(code.data);
            }
          }
        }
      }

      if (isScanningRef.current) {
        scanLoopRef.current = requestAnimationFrame(decodeFrame);
      }
    },
    [processDecodedString],
  );

  // Start media stream and initialize decoders
  const startCamera = useCallback(async () => {
    stopCameraStreams();
    setCameraError(null);
    setUnrecognizedTag(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unsupported');
      setCameraError(
        'Camera API is not supported on this browser or connection.',
      );
      return;
    }

    try {
      // Check available cameras to enable camera flip button
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch {
        // Device enumeration failed, default to single camera
      }

      // Initialize BarcodeDetector if available
      const nativeSupported = await isBarcodeDetectorSupported();
      if (nativeSupported) {
        try {
          const DetectorClass = (
            window as unknown as {
              BarcodeDetector: new (opts: { formats: string[] }) => unknown;
            }
          ).BarcodeDetector;
          barcodeDetectorRef.current = new DetectorClass({
            formats: ['qr_code'],
          });
          setDecoderType('BarcodeDetector');
        } catch {
          barcodeDetectorRef.current = null;
          setDecoderType('jsQR');
        }
      } else {
        barcodeDetectorRef.current = null;
        setDecoderType('jsQR');
      }

      // Request camera stream with preferred facing mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setPermissionState('granted');
      localStorage.setItem('fieldmate_camera_granted', 'true');

      // Check torch / flashlight capability on active track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (
          videoTrack as unknown as {
            getCapabilities?: () => { torch?: boolean };
          }
        ).getCapabilities?.();
        setIsTorchSupported(Boolean(capabilities?.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        isScanningRef.current = true;
        scanLoopRef.current = requestAnimationFrame(runFrameDecodeLoop);
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      stopCameraStreams();
      if (
        error?.name === 'NotAllowedError' ||
        error?.name === 'PermissionDeniedError'
      ) {
        setPermissionState('denied');
        setCameraError(
          'Camera permission was denied in your browser settings.',
        );
      } else if (
        error?.name === 'NotFoundError' ||
        error?.name === 'DevicesNotFoundError'
      ) {
        setPermissionState('unsupported');
        setCameraError('No video camera was found on your device.');
      } else {
        setPermissionState('denied');
        setCameraError(
          error?.message ||
            'Unable to access camera hardware. Enter tag manually below.',
        );
      }
    }
  }, [facingMode, runFrameDecodeLoop, stopCameraStreams]);

  // Toggle torch / flashlight on supported mobile devices
  const toggleTorch = async () => {
    if (!streamRef.current || !isTorchSupported) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const nextState = !isTorchOn;
      await (
        videoTrack as unknown as {
          applyConstraints: (c: {
            advanced: Array<{ torch: boolean }>;
          }) => Promise<void>;
        }
      ).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch {
      // Torch toggle failed
    }
  };

  // Switch between rear and front cameras
  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Re-start camera when facingMode changes or permission is granted
  useEffect(() => {
    if (isOpen && permissionState === 'granted') {
      void startCamera();
    }
    return () => {
      stopCameraStreams();
    };
  }, [isOpen, permissionState, facingMode, startCamera, stopCameraStreams]);

  // Restart scanning after unrecognized tag warning
  const resumeScanning = () => {
    setUnrecognizedTag(null);
    if (isCameraActive && videoRef.current) {
      isScanningRef.current = true;
      scanLoopRef.current = requestAnimationFrame(runFrameDecodeLoop);
    } else {
      void startCamera();
    }
  };

  // Handle manual input submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const clean = parseQrPayload(manualInput);
    if (!clean) {
      setManualError('Please enter an equipment tag or URL.');
      return;
    }

    const matched = matchAssetFromPayload(clean, assets);
    if (matched) {
      handleMatchedAsset(matched);
    } else {
      setManualError(
        `Equipment "${clean}" was not found in your authorized facility.`,
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCameraStreams();
          onClose();
        }
      }}
    >
      <div className="modal-container qr-modal-container">
        {/* Modal Header */}
        <header className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge">
              <QrCode size={13} /> EQUIPMENT SCANNER
            </span>
            <h2 id="qr-modal-title">Scan Equipment QR Tag</h2>
          </div>
          <button
            className="modal-close-btn"
            onClick={() => {
              stopCameraStreams();
              onClose();
            }}
            aria-label="Close QR scanner"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body qr-modal-body">
          {/* 1. Camera Viewfinder or Pre-Permission Screen */}
          <div className="qr-viewfinder-container">
            {/* Pre-permission Explainer */}
            {permissionState === 'prompt' && !isCameraActive && (
              <div className="qr-permission-guidance-pane">
                <div className="qr-guidance-icon-wrap">
                  <Camera size={40} className="qr-guidance-icon" />
                </div>
                <h3>Camera Access Required</h3>
                <p>
                  FieldMate scans equipment QR tags to pull up real-time
                  telemetry, schematics, and active work orders.
                </p>
                <div className="qr-privacy-pill">
                  <ShieldCheck size={14} />
                  <span>
                    On-device processing — no video is recorded or stored.
                  </span>
                </div>
                <div className="qr-permission-actions">
                  <button
                    type="button"
                    className="primary-button qr-enable-btn"
                    onClick={() => {
                      setPermissionState('granted');
                    }}
                  >
                    <Camera size={16} /> Enable Camera & Scan
                  </button>
                  <button
                    type="button"
                    className="qr-ghost-btn"
                    onClick={() => setShowManualForm(true)}
                  >
                    <Keyboard size={15} /> Enter Tag Manually
                  </button>
                </div>
              </div>
            )}

            {/* Permission Denied Recovery Pane */}
            {permissionState === 'denied' && (
              <div className="qr-permission-denied-pane">
                <AlertCircle size={36} className="qr-denied-icon" />
                <h3>Camera Permission Denied</h3>
                <p>
                  {cameraError || 'Camera access was blocked by your browser.'}
                </p>
                <div className="qr-permission-steps">
                  <div className="qr-step-row">
                    <span className="qr-step-num">1</span>
                    <span>
                      Tap the lock/settings icon in your browser URL bar.
                    </span>
                  </div>
                  <div className="qr-step-row">
                    <span className="qr-step-num">2</span>
                    <span>Allow camera access for this application.</span>
                  </div>
                  <div className="qr-step-row">
                    <span className="qr-step-num">3</span>
                    <span>
                      Tap &quot;Retry Camera&quot; below or enter the tag
                      manually.
                    </span>
                  </div>
                </div>
                <div className="qr-permission-actions">
                  <button
                    type="button"
                    className="primary-button qr-retry-btn"
                    onClick={() => startCamera()}
                  >
                    <RotateCcw size={15} /> Retry Camera
                  </button>
                  <button
                    type="button"
                    className="qr-ghost-btn"
                    onClick={() => setShowManualForm(true)}
                  >
                    <Keyboard size={15} /> Enter Tag Manually
                  </button>
                </div>
              </div>
            )}

            {/* Unsupported Camera Pane */}
            {permissionState === 'unsupported' && (
              <div className="qr-unsupported-pane">
                <ScanLine size={40} className="qr-fallback-icon" />
                <h3>Camera Unavailable</h3>
                <p>
                  No active video input was detected. Please enter the equipment
                  asset tag manually.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowManualForm(true)}
                >
                  <Keyboard size={16} /> Enter Tag Manually
                </button>
              </div>
            )}

            {/* Active Video Stream & Viewfinder */}
            {permissionState === 'granted' && isCameraActive && (
              <div className="qr-video-wrapper">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="qr-video"
                />

                {/* High-Contrast Target Reticle */}
                <div
                  className={`qr-scan-overlay ${detectedAsset ? 'is-detected' : ''}`}
                >
                  <div className="qr-reticle">
                    <div className="reticle-corner corner-top-left" />
                    <div className="reticle-corner corner-top-right" />
                    <div className="reticle-corner corner-bottom-left" />
                    <div className="reticle-corner corner-bottom-right" />
                    {!detectedAsset && !unrecognizedTag && (
                      <div className="qr-scan-bar" />
                    )}
                  </div>
                </div>

                {/* Viewfinder Controls Bar (Torch & Camera Switch) */}
                <div className="qr-viewfinder-controls">
                  {isTorchSupported && (
                    <button
                      type="button"
                      className={`qr-control-pill ${isTorchOn ? 'active' : ''}`}
                      onClick={toggleTorch}
                      aria-label={
                        isTorchOn ? 'Turn torch off' : 'Turn torch on'
                      }
                    >
                      {isTorchOn ? <Zap size={14} /> : <ZapOff size={14} />}
                      <span>{isTorchOn ? 'Torch On' : 'Torch'}</span>
                    </button>
                  )}

                  {hasMultipleCameras && (
                    <button
                      type="button"
                      className="qr-control-pill"
                      onClick={toggleCameraFacing}
                      aria-label="Flip camera direction"
                    >
                      <SwitchCamera size={14} />
                      <span>
                        {facingMode === 'environment' ? 'Rear' : 'Front'}
                      </span>
                    </button>
                  )}

                  {decoderType && (
                    <span className="qr-decoder-badge">
                      {decoderType === 'BarcodeDetector'
                        ? 'HW ACCEL'
                        : 'JS ENGINE'}
                    </span>
                  )}
                </div>

                {/* Status Guidance Banner */}
                {!detectedAsset && !unrecognizedTag && (
                  <div className="qr-viewfinder-instruction">
                    Point camera at equipment QR code
                  </div>
                )}
              </div>
            )}

            {/* Unrecognized / Cross-Tenant Asset Overlay */}
            {unrecognizedTag && (
              <div className="qr-unrecognized-overlay">
                <div className="qr-unrecognized-card">
                  <div className="qr-unrecognized-header">
                    <AlertTriangle size={22} className="qr-warn-icon" />
                    <h4>Unrecognized Equipment Tag</h4>
                  </div>
                  <p className="qr-unrecognized-desc">
                    Scanned code is not assigned to your authorized facility:
                  </p>
                  <div className="qr-unrecognized-pill">{unrecognizedTag}</div>
                  <div className="qr-unrecognized-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={resumeScanning}
                    >
                      <RotateCcw size={15} /> Scan Another
                    </button>
                    <button
                      type="button"
                      className="qr-ghost-btn"
                      onClick={() => {
                        setUnrecognizedTag(null);
                        setShowManualForm(true);
                      }}
                    >
                      <Keyboard size={15} /> Enter Tag Manually
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Success Identification Banner */}
            {detectedAsset && (
              <div className="qr-detected-banner">
                <Check size={20} className="qr-detected-check" />
                <div className="qr-detected-info">
                  <strong>{detectedAsset.assetTag}</strong>
                  <span>{detectedAsset.name} identified! Opening…</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Simulation Machines for Demo / Plant Testing */}
          <div className="qr-quick-tags-section">
            <div className="qr-quick-header">
              <label>AUTHORIZED FACILITY EQUIPMENT</label>
              <button
                type="button"
                className="qr-toggle-manual-btn"
                onClick={() => setShowManualForm(!showManualForm)}
              >
                <Keyboard size={13} />
                {showManualForm ? 'Hide manual entry' : 'Manual entry'}
              </button>
            </div>

            <div className="qr-tags-grid">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="qr-asset-btn"
                  onClick={() => handleMatchedAsset(asset)}
                >
                  <QrCode size={16} />
                  <span>
                    <strong>{asset.assetTag}</strong>
                    <small>{asset.name}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Tag Entry Form */}
          {showManualForm && (
            <form onSubmit={handleManualSubmit} className="qr-manual-form">
              <label htmlFor="qr-input">
                Enter Barcode, Asset Tag, or URL:
              </label>
              <div className="qr-input-group">
                <input
                  id="qr-input"
                  placeholder="e.g. M-204 or fieldmate://asset/M-204"
                  value={manualInput}
                  onChange={(e) => {
                    setManualInput(e.target.value);
                    if (manualError) setManualError(null);
                  }}
                  autoFocus
                />
                <button type="submit" className="primary-button qr-submit-btn">
                  Identify
                </button>
              </div>
              {manualError && (
                <div className="qr-manual-error">
                  <AlertCircle size={14} /> {manualError}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
