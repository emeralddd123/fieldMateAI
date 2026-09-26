import { useState, useEffect, useRef } from 'react';
import { QrCode, ScanLine, X, AlertCircle, Check } from 'lucide-react';
import type { Asset } from '@fieldmate/shared';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  onSelectAsset: (assetId: string) => void;
}

export function QrScannerModal({
  isOpen,
  onClose,
  assets,
  onSelectAsset,
}: QrScannerModalProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [detectedTag, setDetectedTag] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
          setCameraActive(true);
        })
        .catch((err) => {
          if (!active) return;
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera permission denied. Use test QR simulator below.'
              : 'Camera unavailable in this environment. Use test QR simulator below.',
          );
        });
    }

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectTag = (assetTag: string) => {
    const matched = assets.find(
      (a) => a.assetTag.toLowerCase() === assetTag.toLowerCase(),
    );
    if (matched) {
      setDetectedTag(matched.assetTag);
      setTimeout(() => {
        onSelectAsset(matched.id);
        onClose();
      }, 400);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    const clean = inputVal.replace(/^fieldmate:\/\/asset\//i, '').trim();
    handleSelectTag(clean);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-container qr-modal-container">
        <header className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge">
              <QrCode size={13} /> QR SCANNER
            </span>
            <h2 id="qr-modal-title">Scan Equipment Tag</h2>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close QR scanner"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          {/* Camera Viewfinder */}
          <div className="qr-viewfinder-container">
            {cameraActive ? (
              <div className="qr-video-wrapper">
                <video ref={videoRef} playsInline muted className="qr-video" />
                <div className="qr-scan-overlay">
                  <div className="qr-reticle" />
                  <div className="qr-scan-bar" />
                </div>
              </div>
            ) : (
              <div className="qr-camera-fallback">
                <ScanLine size={48} className="qr-fallback-icon" />
                {cameraError ? (
                  <p className="qr-err-text">
                    <AlertCircle size={14} /> {cameraError}
                  </p>
                ) : (
                  <p>Initializing camera scanner…</p>
                )}
              </div>
            )}
          </div>

          {detectedTag && (
            <div className="qr-detected-toast">
              <Check size={16} /> Asset <strong>{detectedTag}</strong>{' '}
              identified! Switching…
            </div>
          )}

          {/* Quick Tag Simulators for Live Demo */}
          <div className="qr-quick-tags-section">
            <label>SIMULATED MACHINE QR CODES</label>
            <div className="qr-tags-grid">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="qr-asset-btn"
                  onClick={() => handleSelectTag(asset.assetTag)}
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

          {/* Manual URI / Tag Input */}
          <form onSubmit={handleManualSubmit} className="qr-manual-form">
            <label htmlFor="qr-input">Or enter barcode / tag URL:</label>
            <div className="qr-input-group">
              <input
                id="qr-input"
                placeholder="e.g. fieldmate://asset/M-204"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
              />
              <button type="submit" className="primary-button">
                Identify
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
