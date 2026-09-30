import { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  AudioLines,
  Check,
  CheckCircle2,
  Cpu,
  Ear,
  Eye,
  FileCheck,
  Gauge,
  HardHat,
  Lock,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipBack,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import type { Asset } from '@fieldmate/shared';
import type { DashboardIncident } from '../api';
import type { VoiceControlsState } from './VoiceControls';

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: {
    results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
  }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  abort: () => void;
}

export interface WorkModeStep {
  id: string | number;
  order: number;
  title: string;
  instruction: string;
  type: 'safety' | 'action' | 'measurement' | 'verification';
  safetyLevel?: 'none' | 'mechanical' | 'electrical' | 'chemical';
  safetyNote?: string;
  acceptanceCriteria?: string;
  requiresConfirmation?: boolean;
}

export interface WorkModeProcedure {
  key: string;
  title: string;
  summary: string;
  source: string;
  safetyLevel?: string;
  safetyConfirmationRequired?: boolean;
  steps: WorkModeStep[];
}

export interface WorkModeViewProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  activeIncidents?: DashboardIncident[];
  voice: VoiceControlsState;
  onRecordReading?: (readingType: string, value: number, unit: string) => void;
  onReportIncident?: (title: string, description: string) => void;
  onResolveIncident?: (incidentId: string) => void;
}

// Built-in verified maintenance protocols for common plant equipment
const DEFAULT_PROCEDURES: Record<string, WorkModeProcedure> = {
  'vfd-undervoltage-check': {
    key: 'vfd-undervoltage-check',
    title: 'VFD Undervoltage Diagnostic Check',
    summary:
      'Approved procedure for investigating fault F0003 undervoltage trip on variable frequency drives.',
    source: 'Demo SINAMICS G120 maintenance reference — simulated',
    safetyLevel: 'electrical',
    safetyConfirmationRequired: true,
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: 'Safe Isolation & Lockout Verification',
        instruction:
          'Confirm drive disconnect switch is OPEN. Apply personal lockout padlock and verify zero energy with a calibrated multimeter before opening enclosure.',
        type: 'safety',
        safetyLevel: 'electrical',
        safetyNote:
          'Arc-flash rated PPE, face shield, and Class 0 insulated gloves (1000V) required.',
        requiresConfirmation: true,
        acceptanceCriteria:
          'Multimeter confirms 0.0V between L1-L2, L2-L3, L1-L3, and Phase-Ground.',
      },
      {
        id: 'step-2',
        order: 2,
        title: 'Line Supply & Incoming Voltage Measurement',
        instruction:
          'Re-energize test feed under controlled procedure. Measure incoming 3-phase line voltage across terminals L1, L2, and L3.',
        type: 'measurement',
        safetyLevel: 'electrical',
        safetyNote: 'Maintain safe boundary. High voltage present.',
        acceptanceCriteria:
          'Line-to-line voltage must be 400V ± 10% (360V – 440V) with phase imbalance under 2%.',
      },
      {
        id: 'step-3',
        order: 3,
        title: 'Terminal Tightness & Connection Inspection',
        instruction:
          'De-energize drive. Inspect terminal lugs for heat discoloration, pitting, or loose torques on incoming and DC link connections.',
        type: 'action',
        safetyLevel: 'mechanical',
        acceptanceCriteria:
          'Terminals torqued to 4.5 Nm per OEM specification without signs of thermal stress.',
      },
      {
        id: 'step-4',
        order: 4,
        title: 'Cooling Airflow & Heatsink Verification',
        instruction:
          'Inspect heatsink cooling fan free rotation and clean air intake filters on cabinet door.',
        type: 'verification',
        safetyLevel: 'none',
        acceptanceCriteria:
          'Fan rotates freely without bearing friction; filter mesh free of dust accumulation.',
      },
      {
        id: 'step-5',
        order: 5,
        title: 'Controlled Restart & Verification',
        instruction:
          'Close and secure cabinet doors. Clear lockout and initiate controlled test run at 25% motor nominal speed.',
        type: 'verification',
        safetyLevel: 'electrical',
        acceptanceCriteria:
          'Drive reaches ready status with no fault trip or abnormal noise.',
      },
    ],
  },
  'routine-inspection': {
    key: 'routine-inspection',
    title: 'Daily Machine Operational Inspection',
    summary:
      'Standard pre-shift visual, thermal, and acoustic verification protocol.',
    source: 'Plant Alpha Standard Operating Procedure (SOP-014)',
    safetyLevel: 'mechanical',
    safetyConfirmationRequired: false,
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: 'Visual Enclosure & Foundation Inspection',
        instruction:
          'Inspect machine frame, anchor bolts, and guard assemblies for cracks, loose fasteners, or excessive vibration movement.',
        type: 'verification',
        safetyLevel: 'mechanical',
        acceptanceCriteria:
          'All 4 anchor bolts intact and secured; guards firmly mounted.',
      },
      {
        id: 'step-2',
        order: 2,
        title: 'Shaft Seal & Leakage Check',
        instruction:
          'Check mechanical shaft seal and gland packing for abnormal liquid leakage or slurry weeping.',
        type: 'verification',
        safetyLevel: 'none',
        acceptanceCriteria:
          'No continuous dripping or slurry buildup in catch basin.',
      },
      {
        id: 'step-3',
        order: 3,
        title: 'Bearing Temperature & Thermal Survey',
        instruction:
          'Take non-contact infrared thermal reading at drive-end (DE) and non-drive-end (NDE) bearing housings.',
        type: 'measurement',
        safetyLevel: 'mechanical',
        acceptanceCriteria:
          'Bearing temperature must be under 75°C (167°F). Record temperature in log.',
      },
      {
        id: 'step-4',
        order: 4,
        title: 'Acoustic & Vibration Assessment',
        instruction:
          'Listen for cavitation, gear mesh whining, or irregular metallic scraping during running operation.',
        type: 'verification',
        safetyLevel: 'none',
        acceptanceCriteria:
          'Acoustic signature smooth and continuous without cyclic knocking.',
      },
      {
        id: 'step-5',
        order: 5,
        title: 'Log Reading & Clear For Production',
        instruction:
          'Record operational hour meter and confirm equipment is cleared for regular production shift.',
        type: 'action',
        safetyLevel: 'none',
        acceptanceCriteria: 'Shift supervisor log updated and signed off.',
      },
    ],
  },
  'bearing-lubrication': {
    key: 'bearing-lubrication',
    title: 'Bearing Grease Service & Purge',
    summary: 'Preventative lubrication procedure with safe purge discharge.',
    source: 'Maintenance Manual Section 7 — Lubrication Standards',
    safetyLevel: 'mechanical',
    safetyConfirmationRequired: true,
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: 'Verify Safe Machine State',
        instruction:
          'Stop drive and lock out main switch. Ensure moving parts have come to complete rest before approaching grease fittings.',
        type: 'safety',
        safetyLevel: 'mechanical',
        safetyNote:
          'Rotating shaft hazard. Never grease unshielded rotating coupling.',
        requiresConfirmation: true,
        acceptanceCriteria: 'Equipment tagged and zero rotation confirmed.',
      },
      {
        id: 'step-2',
        order: 2,
        title: 'Clean Zerk Fittings & Relief Port',
        instruction:
          'Wipe grease nipple clean with a lint-free cloth. Remove grease relief drain plug to allow old oxidized grease to escape.',
        type: 'action',
        safetyLevel: 'none',
        acceptanceCriteria:
          'Fitting clean and free of abrasive grit; purge port unobstructed.',
      },
      {
        id: 'step-3',
        order: 3,
        title: 'Inject Specified Synthetic Grease',
        instruction:
          'Attach calibrated grease gun with ISO VG 220 synthetic grease. Pump 6 to 8 strokes (approx. 25 grams) slowly into housing.',
        type: 'action',
        safetyLevel: 'none',
        acceptanceCriteria:
          'Specified grease grade only. Fresh grease emerges from purge port.',
      },
      {
        id: 'step-4',
        order: 4,
        title: 'Clean Up & Reinstall Purge Plug',
        instruction:
          'Wipe excess purged grease. Reinstall drain plug finger-tight. Clear tools and return machine to service.',
        type: 'verification',
        safetyLevel: 'none',
        acceptanceCriteria: 'Surrounding area clean; drain plug secured.',
      },
    ],
  },
};

export function WorkModeView({
  isOpen,
  onClose,
  asset,
  voice,
  activeIncidents = [],
  onRecordReading,
  onReportIncident,
  onResolveIncident,
}: WorkModeViewProps) {
  // Mode setup state vs active task state
  const [isSetupOpen, setIsSetupOpen] = useState(true);
  const [selectedProcKey, setSelectedProcKey] = useState<string>(
    'vfd-undervoltage-check',
  );
  const [audioFeedbackEnabled, setAudioFeedbackEnabled] = useState(true);
  const [isNoisyPlantMode, setIsNoisyPlantMode] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // Active task step state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>(
    {},
  );
  const [isTaskPaused, setIsTaskPaused] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isSpeakingStep, setIsSpeakingStep] = useState(false);
  const [isProcedureComplete, setIsProcedureComplete] = useState(false);

  // Constrained command recognition feedback
  const [lastRecognizedCommand, setLastRecognizedCommand] = useState<{
    text: string;
    confidence: number;
    intent: string;
    timestamp: number;
    isAmbiguous?: boolean;
  } | null>(null);

  // Wake lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Select appropriate procedure
  const procedure =
    DEFAULT_PROCEDURES[selectedProcKey] ??
    DEFAULT_PROCEDURES['routine-inspection']!;
  const steps = procedure.steps;
  const currentStep = steps[currentStepIndex] ?? steps[0]!;
  const isLastStep = currentStepIndex === steps.length - 1;
  const activeIncident = activeIncidents.find(
    (incident) =>
      incident.assetId === asset.id &&
      !['resolved', 'closed'].includes(incident.status),
  );
  const progressPercent = Math.round(
    ((currentStepIndex + 1) / steps.length) * 100,
  );

  // Request screen wake-lock
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch {
        // Wake lock can fail in low battery mode or background tab
        setWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Haptic feedback helper
  const triggerHaptic = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignored if user hasn't interacted
      }
    }
  };

  // Text to speech helper
  const speakInstruction = useCallback(
    (text: string) => {
      if (
        !audioFeedbackEnabled ||
        typeof window === 'undefined' ||
        !('speechSynthesis' in window)
      ) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.onstart = () => setIsSpeakingStep(true);
        utterance.onend = () => setIsSpeakingStep(false);
        utterance.onerror = () => setIsSpeakingStep(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeakingStep(false);
      }
    },
    [audioFeedbackEnabled],
  );

  // Stop speech
  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeakingStep(false);
    }
  }, []);

  // Step advancement handlers
  const handleNextStep = useCallback(() => {
    stopSpeech();
    triggerHaptic([30, 20, 30]);

    setCompletedSteps((prev) => ({ ...prev, [currentStepIndex]: true }));
    if (currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      const nextStep = steps[nextIdx];
      if (nextStep) {
        speakInstruction(
          `Step ${nextIdx + 1}. ${nextStep.title}. ${nextStep.instruction}`,
        );
      }
    } else {
      triggerHaptic([60, 40, 60]);
      setIsProcedureComplete(true);
      setIsTaskPaused(false);
      releaseWakeLock();
      speakInstruction('Work mode procedure completed. All steps verified.');
    }
  }, [currentStepIndex, releaseWakeLock, steps, speakInstruction, stopSpeech]);

  const handlePrevStep = useCallback(() => {
    stopSpeech();
    triggerHaptic(40);
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      const prevStep = steps[prevIdx];
      if (prevStep) {
        speakInstruction(
          `Step ${prevIdx + 1}. ${prevStep.title}. ${prevStep.instruction}`,
        );
      }
    }
  }, [currentStepIndex, steps, speakInstruction, stopSpeech]);

  const handleRepeatStep = useCallback(() => {
    triggerHaptic(30);
    speakInstruction(
      `Step ${currentStepIndex + 1}. ${currentStep.title}. ${currentStep.instruction}`,
    );
  }, [currentStepIndex, currentStep, speakInstruction]);

  const handleTogglePause = useCallback(() => {
    triggerHaptic(50);
    setIsTaskPaused((prev) => {
      const next = !prev;
      if (next) {
        stopSpeech();
        speakInstruction('Work mode paused.');
      } else {
        speakInstruction(
          `Work mode resumed. Step ${currentStepIndex + 1}. ${currentStep.title}.`,
        );
      }
      return next;
    });
  }, [currentStepIndex, currentStep, speakInstruction, stopSpeech]);

  // Constrained command interpreter
  const interpretVoiceCommand = useCallback(
    (spokenText: string, confidence: number) => {
      const clean = spokenText.trim().toLowerCase();

      // Guard: Low confidence or background noise
      if (confidence < 0.65) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'unknown',
          timestamp: Date.now(),
          isAmbiguous: true,
        });
        triggerHaptic(80);
        speakInstruction('Say repeat, next, or back.');
        return;
      }

      // Check for supported commands
      if (
        clean.includes('next') ||
        clean.includes('done') ||
        clean.includes('complete') ||
        clean.includes('advance') ||
        clean.includes('finished') ||
        clean.includes('step done')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'next',
          timestamp: Date.now(),
        });
        handleNextStep();
      } else if (
        clean.includes('repeat') ||
        clean.includes('again') ||
        clean.includes('say again') ||
        clean.includes('what did you say')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'repeat',
          timestamp: Date.now(),
        });
        handleRepeatStep();
      } else if (
        clean.includes('back') ||
        clean.includes('previous') ||
        clean.includes('go back')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'back',
          timestamp: Date.now(),
        });
        handlePrevStep();
      } else if (
        clean.includes('pause') ||
        clean.includes('wait') ||
        clean.includes('hold on')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'pause',
          timestamp: Date.now(),
        });
        handleTogglePause();
      } else if (
        clean.includes('resume') ||
        clean.includes('continue') ||
        clean.includes('start again')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'resume',
          timestamp: Date.now(),
        });
        if (isTaskPaused) handleTogglePause();
      } else if (
        clean.includes('exit') ||
        clean.includes('quit') ||
        clean.includes('leave')
      ) {
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'exit',
          timestamp: Date.now(),
        });
        setShowExitConfirm(true);
      } else {
        // Unknown or conversational query
        setLastRecognizedCommand({
          text: spokenText,
          confidence,
          intent: 'unrecognized',
          timestamp: Date.now(),
          isAmbiguous: true,
        });
      }
    },
    [
      handleNextStep,
      handlePrevStep,
      handleRepeatStep,
      handleTogglePause,
      isTaskPaused,
      speakInstruction,
    ],
  );

  // Setup Web Speech recognition for hands-free command interpretation
  useEffect(() => {
    if (!isOpen || isSetupOpen || isTaskPaused || isProcedureComplete) return;

    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => BrowserSpeechRecognition;
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string; confidence: number }>
        >;
      }) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && lastResult[0]) {
          const transcript = lastResult[0].transcript;
          const confidence = lastResult[0].confidence ?? 0;
          interpretVoiceCommand(transcript, confidence);
        }
      };

      recognition.onerror = () => {
        // Restart on silence
      };

      recognition.onend = () => {
        // Auto-restart if Work Mode is still active
        if (isOpen && !isSetupOpen && !isTaskPaused && !isProcedureComplete) {
          try {
            recognition.start();
          } catch {
            // Ignored
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // Ignored
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = () => {};
          recognitionRef.current.abort();
        } catch {
          // Ignored
        }
        recognitionRef.current = null;
      }
    };
  }, [
    isOpen,
    isProcedureComplete,
    isSetupOpen,
    isTaskPaused,
    interpretVoiceCommand,
  ]);

  // Request Wake Lock on start
  useEffect(() => {
    if (isOpen && !isSetupOpen) {
      // The wake-lock promise and release event report external device state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
    };
  }, [isOpen, isSetupOpen, requestWakeLock, releaseWakeLock]);

  // Handle initial step speech when starting
  const handleStartTask = () => {
    setIsSetupOpen(false);
    setCurrentStepIndex(0);
    setCompletedSteps({});
    setIsTaskPaused(false);
    setIsProcedureComplete(false);
    triggerHaptic([40, 20, 40]);
    speakInstruction(
      `Starting work mode for ${asset.assetTag}. Step 1. ${currentStep.title}. ${currentStep.instruction}`,
    );
  };

  const handleExitClean = () => {
    stopSpeech();
    releaseWakeLock();
    setIsSetupOpen(true);
    setShowExitConfirm(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`work-mode-fullscreen-view ${isNoisyPlantMode ? 'noisy-plant-contrast' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Hands-free work mode"
    >
      {/* Setup Modal Screen */}
      {isSetupOpen ? (
        <div className="work-mode-setup-container">
          <div className="work-mode-setup-header">
            <div className="setup-badge">
              <AudioLines size={20} />
              <span>HANDS-FREE WORK MODE SETUP</span>
            </div>
            <button
              type="button"
              className="setup-close-btn"
              onClick={onClose}
              aria-label="Cancel and close work mode setup"
            >
              <X size={20} />
            </button>
          </div>

          <div className="work-mode-setup-body">
            <div className="setup-asset-card">
              <div className="asset-tag-badge">
                <Cpu size={14} />
                <span>{asset.assetTag}</span>
              </div>
              <h3>{asset.name}</h3>
              <p>
                {asset.location} · {asset.equipmentType}
              </p>
            </div>

            <div className="setup-section">
              <label className="setup-label">
                Select Maintenance Task / Protocol
              </label>
              <div className="setup-procedure-options">
                {Object.entries(DEFAULT_PROCEDURES).map(([key, proc]) => (
                  <button
                    key={key}
                    type="button"
                    className={`setup-proc-card ${selectedProcKey === key ? 'selected' : ''}`}
                    onClick={() => setSelectedProcKey(key)}
                  >
                    <div className="proc-card-top">
                      <strong>{proc.title}</strong>
                      {proc.safetyLevel === 'electrical' && (
                        <span className="safety-level-chip electrical">
                          <Zap size={11} /> High Voltage
                        </span>
                      )}
                      {proc.safetyLevel === 'mechanical' && (
                        <span className="safety-level-chip mechanical">
                          <Wrench size={11} /> Mechanical
                        </span>
                      )}
                    </div>
                    <p>{proc.summary}</p>
                    <div className="proc-steps-count">
                      <FileCheck size={12} />
                      <span>{proc.steps.length} verified steps</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-section">
              <label className="setup-label">
                Audio & Environmental Configuration
              </label>
              <div className="setup-toggles-grid">
                <button
                  type="button"
                  className={`setup-toggle-card ${audioFeedbackEnabled ? 'enabled' : ''}`}
                  onClick={() => setAudioFeedbackEnabled((v) => !v)}
                >
                  <div className="toggle-icon">
                    {audioFeedbackEnabled ? (
                      <Volume2 size={20} />
                    ) : (
                      <VolumeX size={20} />
                    )}
                  </div>
                  <div>
                    <strong>Spoken Voice Guidance</strong>
                    <small>Reads each step instruction aloud</small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`setup-toggle-card ${isNoisyPlantMode ? 'enabled' : ''}`}
                  onClick={() => setIsNoisyPlantMode((v) => !v)}
                >
                  <div className="toggle-icon">
                    <Ear size={20} />
                  </div>
                  <div>
                    <strong>Noisy Plant Mode</strong>
                    <small>Maximum text contrast & haptic pulse</small>
                  </div>
                </button>
              </div>
            </div>

            <div className="setup-safety-checklist">
              <div className="safety-checklist-header">
                <HardHat size={16} />
                <strong>Pre-Task PPE & Site Requirements</strong>
              </div>
              <ul>
                <li>Safety boots and high-visibility vest required.</li>
                <li>
                  Verify lock-out tags before mechanical or electrical work.
                </li>
                <li>Qualified personnel required for 400V measurements.</li>
              </ul>
            </div>
          </div>

          <div className="work-mode-setup-footer">
            <button
              type="button"
              className="setup-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="setup-start-btn"
              onClick={handleStartTask}
            >
              <Play size={18} />
              <span>Begin Work Mode</span>
            </button>
          </div>
        </div>
      ) : (
        /* Active Minimal-Touch Task View */
        <div className="work-mode-active-container">
          {/* Top Bar */}
          <header className="work-mode-topbar">
            <div className="topbar-asset-info">
              <span className="work-mode-asset-pill">
                <Cpu size={12} />
                {asset.assetTag}
              </span>
              <span className="work-mode-proc-title">{procedure.title}</span>
            </div>

            <div className="topbar-status-badges">
              {wakeLockActive && (
                <span className="wake-lock-pill" title="Screen will stay awake">
                  <Eye size={12} /> Awake
                </span>
              )}
              {isSpeakingStep && (
                <span className="speaking-pill">
                  <Volume2 size={12} className="spin" /> Audio
                </span>
              )}
              <button
                type="button"
                className="work-mode-exit-btn"
                onClick={() => setShowExitConfirm(true)}
                title="Exit Work Mode"
              >
                <X size={16} />
                <span>Exit</span>
              </button>
            </div>
          </header>

          {/* Progress Segment Bar */}
          <div className="work-mode-progress-wrap">
            <div className="progress-labels">
              <span className="step-counter">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="percent-counter">
                {progressPercent}% complete
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Command Recognition Echo Banner */}
          {lastRecognizedCommand && (
            <div
              className={`voice-command-echo-bar ${lastRecognizedCommand.isAmbiguous ? 'echo-ambiguous' : 'echo-success'}`}
              role="status"
            >
              <div className="echo-inner">
                {lastRecognizedCommand.isAmbiguous ? (
                  <AlertTriangle size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                <span>
                  {lastRecognizedCommand.isAmbiguous
                    ? `Low confidence ("${lastRecognizedCommand.text}"). Say: "Next", "Repeat", or "Back".`
                    : `Recognized: "${lastRecognizedCommand.text}" (${Math.round(lastRecognizedCommand.confidence * 100)}% match)`}
                </span>
              </div>
            </div>
          )}

          {/* Main Large Step Card */}
          <main className="work-mode-main-step">
            {isProcedureComplete ? (
              <div className="work-mode-complete-card" role="status">
                <span className="work-mode-complete-icon">
                  <CheckCircle2 size={40} />
                </span>
                <span className="work-mode-complete-label">
                  Procedure complete
                </span>
                <h2>{procedure.title}</h2>
                <p>
                  All {steps.length} steps have been completed for{' '}
                  {asset.assetTag}. Voice commands and the screen wake lock are
                  now off.
                </p>
                <div className="work-mode-complete-actions">
                  {activeIncident && onResolveIncident && (
                    <button
                      type="button"
                      className="complete-repair-handoff-btn"
                      onClick={() => {
                        handleExitClean();
                        onResolveIncident(activeIncident.id);
                      }}
                    >
                      <Wrench size={17} />
                      Complete Repair · {activeIncident.incidentNumber}
                    </button>
                  )}
                  <button
                    type="button"
                    className="return-workspace-btn"
                    onClick={handleExitClean}
                  >
                    Return to Workspace
                  </button>
                </div>
              </div>
            ) : isTaskPaused ? (
              <div className="task-paused-card">
                <Pause size={44} />
                <h2>Work Mode Paused</h2>
                <p>
                  Voice commands and step timers are on hold while you inspect
                  the equipment.
                </p>
                <button
                  type="button"
                  className="resume-task-btn"
                  onClick={handleTogglePause}
                >
                  <Play size={20} />
                  <span>Resume Task</span>
                </button>
              </div>
            ) : (
              <div className="step-instruction-card">
                <div className="step-header">
                  <div className="step-type-pill-wrap">
                    <span className={`step-type-pill type-${currentStep.type}`}>
                      {currentStep.type.toUpperCase()}
                    </span>
                    {currentStep.requiresConfirmation && (
                      <span className="safety-gate-chip">
                        <Lock size={12} /> Safety Gate
                      </span>
                    )}
                  </div>
                  <h2 className="step-headline">{currentStep.title}</h2>
                </div>

                <p className="step-instruction-text">
                  {currentStep.instruction}
                </p>

                {/* Safety Warning Box */}
                {currentStep.safetyNote && (
                  <div className="step-safety-alert">
                    <ShieldAlert size={20} className="safety-icon" />
                    <div>
                      <strong>Hazard Precaution:</strong>
                      <p>{currentStep.safetyNote}</p>
                    </div>
                  </div>
                )}

                {/* Acceptance Criteria */}
                {currentStep.acceptanceCriteria && (
                  <div className="step-criteria-box">
                    <CheckCircle2 size={16} className="criteria-icon" />
                    <div>
                      <span className="criteria-label">
                        VERIFICATION CRITERIA:
                      </span>
                      <p>{currentStep.acceptanceCriteria}</p>
                    </div>
                  </div>
                )}

                {/* Step Actions Shortcuts */}
                <div className="step-quick-actions">
                  <button
                    type="button"
                    className="step-action-chip"
                    onClick={() => {
                      if (['disconnected', 'error'].includes(voice.status)) {
                        voice.connect();
                      }
                      onRecordReading?.(
                        currentStep.type === 'measurement'
                          ? 'line_voltage'
                          : 'vibration_rms',
                        400,
                        'V',
                      );
                    }}
                  >
                    <Gauge size={14} />
                    <span>Log Measurement</span>
                  </button>

                  <button
                    type="button"
                    className="step-action-chip"
                    onClick={() => {
                      if (['disconnected', 'error'].includes(voice.status)) {
                        voice.connect();
                      }
                      onReportIncident?.(
                        `Issue on ${asset.assetTag}: ${currentStep.title}`,
                        `Observed abnormal condition during ${currentStep.title} in Work Mode.`,
                      );
                    }}
                  >
                    <AlertTriangle size={14} />
                    <span>Report Anomaly</span>
                  </button>
                </div>
              </div>
            )}
          </main>

          {/* Large 5-Button Thumb Dock (Min 56px - 64px tap targets) */}
          {!isProcedureComplete && (
            <nav
              className="work-mode-thumb-dock"
              aria-label="Work mode step controls"
            >
              {/* 1. Back Button */}
              <button
                type="button"
                className="dock-ctrl-btn dock-back-btn"
                onClick={handlePrevStep}
                disabled={currentStepIndex === 0 || isTaskPaused}
                aria-label="Go to previous step"
              >
                <SkipBack size={22} />
                <span>Back</span>
              </button>

              {/* 2. Repeat Button */}
              <button
                type="button"
                className="dock-ctrl-btn dock-repeat-btn"
                onClick={handleRepeatStep}
                disabled={isTaskPaused}
                aria-label="Repeat current step audio"
              >
                <RotateCcw size={22} />
                <span>Repeat</span>
              </button>

              {/* 3. Central Listening / Voice Push-To-Talk Button */}
              <button
                type="button"
                className={`dock-ctrl-btn dock-voice-central ${isSpeakingStep ? 'is-speaking' : 'is-listening'}`}
                onClick={() => {
                  if (isSpeakingStep) {
                    stopSpeech();
                  } else {
                    handleRepeatStep();
                  }
                }}
                aria-label="Voice guidance status"
              >
                <div className="voice-pulse-ring" />
                <div className="voice-central-inner">
                  {isSpeakingStep ? <Volume2 size={28} /> : <Mic size={28} />}
                </div>
                <span className="voice-central-label">
                  {isSpeakingStep ? 'Speaking' : 'Listening'}
                </span>
              </button>

              {/* 4. Done / Next Step Button */}
              <button
                type="button"
                className={`dock-ctrl-btn dock-next-btn ${isLastStep ? 'is-finish' : ''}`}
                onClick={handleNextStep}
                disabled={isTaskPaused}
                aria-label={
                  isLastStep
                    ? 'Complete procedure'
                    : 'Mark step done and advance'
                }
              >
                <Check size={26} />
                <span>{isLastStep ? 'Complete' : 'Done'}</span>
              </button>

              {/* 5. Pause / Resume Button */}
              <button
                type="button"
                className={`dock-ctrl-btn dock-pause-btn ${isTaskPaused ? 'is-paused' : ''}`}
                onClick={handleTogglePause}
                aria-label={
                  isTaskPaused ? 'Resume procedure' : 'Pause procedure'
                }
              >
                {isTaskPaused ? <Play size={22} /> : <Pause size={22} />}
                <span>{isTaskPaused ? 'Resume' : 'Pause'}</span>
              </button>
            </nav>
          )}
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      {showExitConfirm && (
        <div
          className="mobile-sheet-backdrop exit-confirm-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-label="Exit Work Mode confirmation"
        >
          <div className="exit-confirm-sheet">
            <div className="exit-confirm-icon">
              <ShieldAlert size={28} />
            </div>
            <h3>Exit Work Mode?</h3>
            <p>
              You have completed {Object.keys(completedSteps).length} of{' '}
              {steps.length} steps on {asset.assetTag}. Exiting will preserve
              your recorded measurements and return you to the standard
              workspace.
            </p>
            <div className="exit-confirm-actions">
              <button
                type="button"
                className="exit-cancel-btn"
                onClick={() => setShowExitConfirm(false)}
              >
                Keep Working
              </button>
              <button
                type="button"
                className="exit-proceed-btn"
                onClick={handleExitClean}
              >
                Exit to Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
