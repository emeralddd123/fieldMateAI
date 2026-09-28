import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  FileCheck,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
  X,
} from 'lucide-react';
import {
  submitCompleteRepair,
  type CompleteRepairPayload,
  type IncidentDetail,
} from '../api';

export interface RepairCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: IncidentDetail;
  onCompleted?: () => void;
}

export function RepairCompletionModal({
  isOpen,
  onClose,
  incident,
  onCompleted,
}: RepairCompletionModalProps) {
  const queryClient = useQueryClient();

  // Wizard Step: 1 (Diagnosis) | 2 (Action) | 3 (Verification & Reading) | 4 (Equipment Status) | 5 (Success Receipt)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form fields
  const [rootCause, setRootCause] = useState(incident.rootCause ?? '');
  const [actionTaken, setActionTaken] = useState(incident.actionTaken ?? '');
  const [verificationSummary, setVerificationSummary] = useState('');
  const [includeMeasurement, setIncludeMeasurement] = useState(false);
  const [measurementType, setMeasurementType] = useState('line_voltage');
  const [measurementValue, setMeasurementValue] = useState<string>('400');
  const [measurementUnit, setMeasurementUnit] = useState('V');
  const [measurementNotes, setMeasurementNotes] = useState('');
  const [assetStatus, setAssetStatus] = useState<
    'operational' | 'warning' | 'maintenance' | 'down'
  >('operational');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<{
    recordId: string;
    incidentNumber: string;
    status: string;
    timestamp: string;
  } | null>(null);

  if (!isOpen) return null;

  const quickRootCauses = [
    'Loose terminal connection causing intermittent phase loss',
    'Bearing lubrication degradation and friction heating',
    'Air intake filter restricted with dust accumulation',
    'Incoming line voltage sag during facility peak load',
    'Mechanical seal wear and gland packing weeping',
  ];

  const quickActions = [
    'Cleaned and torqued terminal connections to manufacturer specification',
    'Purged old grease and lubricated with synthetic ISO VG 220 grease',
    'Replaced cooling air filters and inspected fan rotation',
    'Verified incoming supply and reset drive parameters',
    'Adjusted seal gland and cleaned catch basin',
  ];

  const quickVerifications = [
    'Test run at full speed for 15 minutes; zero alarms or trips',
    'Bearing temperatures normalized under 65°C across 30 min run',
    'Line voltages balanced within 1.5% across all 3 phases',
    'Equipment returned to service and accepted by shift operator',
  ];

  const handleNext = () => {
    setSubmitError(null);
    if (step === 1 && !rootCause.trim()) {
      setSubmitError('Please document the diagnosed root cause.');
      return;
    }
    if (step === 2 && !actionTaken.trim()) {
      setSubmitError('Please specify the maintenance action taken.');
      return;
    }
    if (step === 3 && !verificationSummary.trim()) {
      setSubmitError('Please provide post-repair verification details.');
      return;
    }
    if (step < 4) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleBack = () => {
    setSubmitError(null);
    if (step > 1 && step < 5) {
      setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const payload: CompleteRepairPayload = {
      assetId: incident.assetId,
      rootCause: rootCause.trim(),
      actionTaken: actionTaken.trim(),
      verificationSummary: verificationSummary.trim(),
      assetStatus,
    };

    if (includeMeasurement && measurementValue.trim()) {
      const val = parseFloat(measurementValue);
      if (!isNaN(val)) {
        payload.verificationMeasurement = {
          measurementType: measurementType.trim(),
          value: val,
          unit: measurementUnit.trim(),
          notes: measurementNotes.trim() || undefined,
        };
      }
    }

    try {
      const result = await submitCompleteRepair(incident.id, payload);
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      await queryClient.invalidateQueries({ queryKey: ['incident-detail', incident.id] });
      await queryClient.invalidateQueries({ queryKey: ['assets'] });

      setSuccessReceipt({
        recordId: result.maintenanceRecord.id,
        incidentNumber: result.incident.incidentNumber,
        status: result.incident.status,
        timestamp: new Date().toISOString(),
      });
      setStep(5);
      onCompleted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to record repair completion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop repair-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Stepped repair completion workflow"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 5) onClose();
      }}
    >
      <div className="repair-completion-modal">
        {/* Header */}
        <header className="repair-modal-header">
          <div className="repair-header-title-wrap">
            <span className="repair-badge">
              <Wrench size={13} /> COMPLETE REPAIR & RESOLUTION
            </span>
            <h2>{incident.incidentNumber} · {incident.title}</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close repair workflow"
          >
            <X size={18} />
          </button>
        </header>

        {/* Stepper Indicator */}
        {step < 5 && (
          <div className="repair-stepper">
            <div className={`stepper-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
              <span className="step-num">{step > 1 ? <Check size={12} /> : '1'}</span>
              <span className="step-name">Diagnosis</span>
            </div>
            <div className="stepper-line" />
            <div className={`stepper-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
              <span className="step-num">{step > 2 ? <Check size={12} /> : '2'}</span>
              <span className="step-name">Work Done</span>
            </div>
            <div className="stepper-line" />
            <div className={`stepper-step ${step >= 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}>
              <span className="step-num">{step > 3 ? <Check size={12} /> : '3'}</span>
              <span className="step-name">Verification</span>
            </div>
            <div className="stepper-line" />
            <div className={`stepper-step ${step >= 4 ? 'active' : ''}`}>
              <span className="step-num">4</span>
              <span className="step-name">Confirm</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {submitError && (
          <div className="repair-error-banner" role="alert">
            <AlertTriangle size={16} />
            <span>{submitError}</span>
          </div>
        )}

        {/* Body Content by Step */}
        <div className="repair-modal-body">
          {/* Step 1: Diagnosis & Root Cause */}
          {step === 1 && (
            <div className="repair-step-pane">
              <label className="repair-input-label">
                <strong>Diagnosed Root Cause:</strong>
                <small>What underlying condition triggered this incident?</small>
              </label>
              <textarea
                className="repair-textarea"
                rows={3}
                placeholder="Describe the diagnosed failure mechanism or fault cause…"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                autoFocus
              />
              <div className="quick-pill-section">
                <span className="quick-pill-label">COMMON CAUSES (TAP TO INSERT):</span>
                <div className="quick-pills-row">
                  {quickRootCauses.map((cause, i) => (
                    <button
                      key={i}
                      type="button"
                      className="quick-pill"
                      onClick={() => setRootCause(cause)}
                    >
                      {cause}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Work Performed & Action Taken */}
          {step === 2 && (
            <div className="repair-step-pane">
              <label className="repair-input-label">
                <strong>Corrective Action Performed:</strong>
                <small>Detail the maintenance steps, part replacements, or adjustments made.</small>
              </label>
              <textarea
                className="repair-textarea"
                rows={3}
                placeholder="Describe parts replaced, fasteners tightened, calibrations performed…"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                autoFocus
              />
              <div className="quick-pill-section">
                <span className="quick-pill-label">COMMON ACTIONS (TAP TO INSERT):</span>
                <div className="quick-pills-row">
                  {quickActions.map((act, i) => (
                    <button
                      key={i}
                      type="button"
                      className="quick-pill"
                      onClick={() => setActionTaken(act)}
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Verification & Telemetry Reading */}
          {step === 3 && (
            <div className="repair-step-pane">
              <label className="repair-input-label">
                <strong>Post-Repair Verification Summary:</strong>
                <small>How did you verify the equipment is functioning safely?</small>
              </label>
              <textarea
                className="repair-textarea"
                rows={3}
                placeholder="e.g. 15-minute load test completed, acoustic and vibration levels normal…"
                value={verificationSummary}
                onChange={(e) => setVerificationSummary(e.target.value)}
                autoFocus
              />
              <div className="quick-pill-section">
                <span className="quick-pill-label">COMMON VERIFICATIONS:</span>
                <div className="quick-pills-row">
                  {quickVerifications.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      className="quick-pill"
                      onClick={() => setVerificationSummary(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Telemetry Measurement Attachment */}
              <div className="telemetry-attach-section">
                <label className="telemetry-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeMeasurement}
                    onChange={(e) => setIncludeMeasurement(e.target.checked)}
                  />
                  <span>Attach quantitative verification measurement (multimeter, vibration, temp)</span>
                </label>

                {includeMeasurement && (
                  <div className="telemetry-fields-grid">
                    <div className="field-group">
                      <label>Measurement Type</label>
                      <select
                        value={measurementType}
                        onChange={(e) => setMeasurementType(e.target.value)}
                      >
                        <option value="line_voltage">Line Voltage (V)</option>
                        <option value="operating_current">Operating Current (A)</option>
                        <option value="bearing_temperature">Bearing Temperature (°C)</option>
                        <option value="vibration_rms">Vibration RMS (mm/s)</option>
                        <option value="pressure">Pressure (bar)</option>
                      </select>
                    </div>

                    <div className="field-group">
                      <label>Recorded Value</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 400"
                        value={measurementValue}
                        onChange={(e) => setMeasurementValue(e.target.value)}
                      />
                    </div>

                    <div className="field-group">
                      <label>Unit</label>
                      <input
                        type="text"
                        placeholder="V, A, °C, mm/s"
                        value={measurementUnit}
                        onChange={(e) => setMeasurementUnit(e.target.value)}
                      />
                    </div>

                    <div className="field-group full-width">
                      <label>Measurement Notes (Optional)</label>
                      <input
                        type="text"
                        placeholder="Measured at L1-L2 under 100% nominal speed"
                        value={measurementNotes}
                        onChange={(e) => setMeasurementNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Final Equipment Status & Confirmation */}
          {step === 4 && (
            <div className="repair-step-pane">
              <label className="repair-input-label">
                <strong>Equipment Operating Status:</strong>
                <small>Select the return-to-service status for {incident.asset?.assetTag ?? 'this asset'}.</small>
              </label>

              <div className="status-selection-cards">
                <button
                  type="button"
                  className={`status-select-card ${assetStatus === 'operational' ? 'selected operational' : ''}`}
                  onClick={() => setAssetStatus('operational')}
                >
                  <span className="status-dot operational" />
                  <div>
                    <strong>Operational</strong>
                    <small>Normal production operation restored without restrictions</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`status-select-card ${assetStatus === 'warning' ? 'selected warning' : ''}`}
                  onClick={() => setAssetStatus('warning')}
                >
                  <span className="status-dot warning" />
                  <div>
                    <strong>Warning / Monitored</strong>
                    <small>Operational with monitoring required on next shift</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`status-select-card ${assetStatus === 'maintenance' ? 'selected maintenance' : ''}`}
                  onClick={() => setAssetStatus('maintenance')}
                >
                  <span className="status-dot maintenance" />
                  <div>
                    <strong>Scheduled Maintenance</strong>
                    <small>Follow-up overhaul or part delivery scheduled</small>
                  </div>
                </button>
              </div>

              {/* Review Summary Card */}
              <div className="repair-summary-card">
                <div className="summary-header">
                  <ShieldCheck size={16} />
                  <strong>Review Resolution Summary</strong>
                </div>
                <div className="summary-row">
                  <span>Root Cause:</span>
                  <p>{rootCause}</p>
                </div>
                <div className="summary-row">
                  <span>Action Taken:</span>
                  <p>{actionTaken}</p>
                </div>
                <div className="summary-row">
                  <span>Verification:</span>
                  <p>{verificationSummary}</p>
                </div>
                {includeMeasurement && (
                  <div className="summary-row">
                    <span>Reading:</span>
                    <p>{measurementValue} {measurementUnit} ({measurementType})</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Success Receipt */}
          {step === 5 && successReceipt && (
            <div className="repair-receipt-pane">
              <div className="receipt-success-badge">
                <CheckCircle2 size={40} />
              </div>
              <h2>Repair Completed & Verified</h2>
              <p>The incident has been resolved and logged in the plant equipment memory.</p>

              <div className="receipt-card">
                <div className="receipt-row">
                  <span>Incident:</span>
                  <strong>{successReceipt.incidentNumber}</strong>
                </div>
                <div className="receipt-row">
                  <span>Status:</span>
                  <span className="status-pill status-resolved">RESOLVED</span>
                </div>
                <div className="receipt-row">
                  <span>Maintenance Record ID:</span>
                  <code>{successReceipt.recordId.slice(0, 12)}…</code>
                </div>
                <div className="receipt-row">
                  <span>Timestamp:</span>
                  <small>{new Date(successReceipt.timestamp).toLocaleString()}</small>
                </div>
              </div>

              <button
                type="button"
                className="receipt-done-btn"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {step < 5 && (
          <footer className="repair-modal-footer">
            {step > 1 ? (
              <button
                type="button"
                className="repair-secondary-btn"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                className="repair-secondary-btn"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            )}

            {step < 4 ? (
              <button
                type="button"
                className="repair-primary-btn"
                onClick={handleNext}
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="repair-submit-btn"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Recording repair…</span>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Confirm & Complete Repair</span>
                  </>
                )}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
