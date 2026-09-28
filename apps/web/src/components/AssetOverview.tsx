import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  AudioLines,
  Box,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Gauge,
  MapPin,
  Mic,
  RefreshCw,
  SlidersHorizontal,
  Wrench,
  Zap,
} from 'lucide-react';
import type { Asset } from '@fieldmate/shared';
import type { DashboardIncident } from '../api';

export interface AssetOverviewProps {
  asset: Asset;
  activeIncidents?: DashboardIncident[];
  onOpenEquipmentSheet?: () => void;
  onAskFieldMate?: () => void;
  onStartWorkMode?: () => void;
  onReportIncident?: () => void;
  onRecordReading?: () => void;
  onSelectIncident?: (incidentId: string) => void;
}

export function AssetOverview({
  asset,
  activeIncidents = [],
  onOpenEquipmentSheet,
  onAskFieldMate,
  onStartWorkMode,
  onReportIncident,
  onRecordReading,
  onSelectIncident,
}: AssetOverviewProps) {
  const [isDiagramOpen, setIsDiagramOpen] = useState(false);
  const [isSpecsOpen, setIsSpecsOpen] = useState(true);
  const [isComponentsOpen, setIsComponentsOpen] = useState(true);

  // Active incidents specifically for this machine
  const machineIncidents = activeIncidents.filter(
    (inc) =>
      inc.assetId === asset.id && !['resolved', 'closed'].includes(inc.status),
  );
  const primaryFault = machineIncidents[0];

  return (
    <section className="asset-overview" aria-labelledby="asset-heading">
      {/* Mobile Sticky Equipment Summary Bar */}
      <div className="mobile-equipment-bar">
        <div className="mobile-bar-info">
          <div className="mobile-bar-tag-row">
            <span className={`status-dot ${asset.status}`} />
            <strong className="mobile-bar-tag">{asset.assetTag}</strong>
            <span className={`status-pill ${asset.status}`}>{asset.status}</span>
            <span className="mobile-bar-time" title="Data freshness">
              <Clock size={10} /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <span className="mobile-bar-name">{asset.name}</span>
        </div>
        {onOpenEquipmentSheet && (
          <button
            type="button"
            className="mobile-change-machine-btn"
            onClick={onOpenEquipmentSheet}
            title="Switch active equipment"
            aria-label="Switch active equipment"
          >
            <RefreshCw size={13} />
            <span>Change</span>
          </button>
        )}
      </div>

      {/* Desktop Header */}
      <div className="section-eyebrow desktop-only-eyebrow">
        <span>ASSET OVERVIEW</span>
        <div className="eyebrow-right">
          <span className="mono">{asset.assetTag}</span>
          <span className="asset-synced-badge" title="Data freshness">
            <Clock size={11} /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {onOpenEquipmentSheet && (
            <button
              type="button"
              className="change-machine-desktop-btn"
              onClick={onOpenEquipmentSheet}
              title="Open equipment directory"
            >
              <RefreshCw size={12} />
              <span>Change machine</span>
            </button>
          )}
        </div>
      </div>

      <div className="asset-title-row">
        <div>
          <div className="asset-location">
            <MapPin size={13} />
            {asset.location}
          </div>
          <h2 id="asset-heading">{asset.name}</h2>
          <p>
            {asset.equipmentType} <span className="separator">/</span>{' '}
            {asset.manufacturer}
          </p>
        </div>
        <span className={`status-pill ${asset.status} desktop-status-pill`}>
          <span className="status-dot" />
          {asset.status}
        </span>
      </div>

      {/* Primary Mobile Action Buttons (Thumb Zone First Viewport) */}
      <div className="mobile-field-actions-grid">
        <button
          type="button"
          className="field-action-btn action-voice"
          onClick={onAskFieldMate}
          title="Start AI voice assistant for this machine"
        >
          <div className="field-action-icon voice-icon">
            <Mic size={18} />
          </div>
          <div className="field-action-text">
            <strong>Ask FieldMate</strong>
            <small>Voice troubleshooting</small>
          </div>
        </button>

        <button
          type="button"
          className="field-action-btn action-incident"
          onClick={onReportIncident}
          title="Log or escalate an issue for this machine"
        >
          <div className="field-action-icon incident-icon">
            <AlertTriangle size={18} />
          </div>
          <div className="field-action-text">
            <strong>Report Issue</strong>
            <small>Log fault or incident</small>
          </div>
        </button>

        <button
          type="button"
          className="field-action-btn action-reading"
          onClick={onRecordReading}
          title="Record telemetry measurement"
        >
          <div className="field-action-icon reading-icon">
            <Gauge size={18} />
          </div>
          <div className="field-action-text">
            <strong>Record Reading</strong>
            <small>Log telemetry metric</small>
          </div>
        </button>

        {onStartWorkMode && (
          <button
            type="button"
            className="field-action-btn action-work-mode"
            onClick={onStartWorkMode}
            title="Launch hands-free minimal-touch Work Mode"
          >
            <div className="field-action-icon work-mode-icon">
              <AudioLines size={18} />
            </div>
            <div className="field-action-text">
              <strong>Work Mode</strong>
              <small>Hands-free steps</small>
            </div>
          </button>
        )}
      </div>

      {/* Active Fault Alert if Machine is in trouble */}
      {primaryFault && (
        <div className="active-fault-banner" role="alert">
          <div className="fault-banner-header">
            <div className="fault-badge-wrap">
              <AlertTriangle size={16} />
              <span>ACTIVE INCIDENT DETECTED</span>
            </div>
            <span className="fault-count-badge">
              {machineIncidents.length} open
            </span>
          </div>
          <div className="fault-banner-content">
            <strong>{primaryFault.title}</strong>
            {primaryFault.faultCode && (
              <span className="fault-code-chip">
                {primaryFault.faultCode}
              </span>
            )}
            <p>{primaryFault.description}</p>
          </div>
          <div className="fault-banner-actions">
            {onStartWorkMode && (
              <button
                type="button"
                className="fault-work-mode-btn"
                onClick={onStartWorkMode}
              >
                <AudioLines size={14} />
                <span>Launch Diagnostic Work Mode</span>
              </button>
            )}
            {onSelectIncident && (
              <button
                type="button"
                className="fault-view-btn"
                onClick={() => onSelectIncident(primaryFault.id)}
              >
                <span>View incident details</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expandable Specifications Section */}
      <div className="expandable-section">
        <button
          type="button"
          className="section-collapse-header"
          onClick={() => setIsSpecsOpen(!isSpecsOpen)}
          aria-expanded={isSpecsOpen}
        >
          <div className="section-title-wrap">
            <Zap size={15} />
            <span>Specifications & Parameters</span>
          </div>
          <ChevronDown
            size={16}
            className={`collapse-chevron ${isSpecsOpen ? 'open' : ''}`}
          />
        </button>

        {isSpecsOpen && (
          <div className="spec-grid">
            <div>
              <Zap size={16} />
              <span>Nominal voltage</span>
              <strong>
                {asset.nominalVoltageV ?? '—'}
                <small>{asset.nominalVoltageV !== null ? 'V' : ''}</small>
              </strong>
            </div>
            <div>
              <Activity size={16} />
              <span>Nominal current</span>
              <strong>
                {asset.nominalCurrentA ?? '—'}
                <small>{asset.nominalCurrentA !== null ? 'A' : ''}</small>
              </strong>
            </div>
            <div>
              <Box size={16} />
              <span>Equipment model</span>
              <strong className="model-value">{asset.model}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Components Section */}
      <div className="expandable-section">
        <button
          type="button"
          className="section-collapse-header"
          onClick={() => setIsComponentsOpen(!isComponentsOpen)}
          aria-expanded={isComponentsOpen}
        >
          <div className="section-title-wrap">
            <Cpu size={15} />
            <span>Installed components ({asset.components.length})</span>
          </div>
          <ChevronDown
            size={16}
            className={`collapse-chevron ${isComponentsOpen ? 'open' : ''}`}
          />
        </button>

        {isComponentsOpen && (
          <div className="components-list-wrap">
            {asset.components.length ? (
              asset.components.map((component) => (
                <div className="component-card" key={component.id}>
                  <span className="component-icon">
                    <Cpu size={21} />
                  </span>
                  <div>
                    <h4>{component.componentType}</h4>
                    <p>{component.model}</p>
                  </div>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </div>
              ))
            ) : (
              <p className="muted empty-components">
                No installed components recorded for this asset.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Decorative Equipment Diagram (Collapsible on mobile) */}
      <div className="equipment-diagram-wrapper">
        <button
          type="button"
          className="diagram-toggle-btn mobile-only-toggle"
          onClick={() => setIsDiagramOpen(!isDiagramOpen)}
          aria-expanded={isDiagramOpen}
        >
          <SlidersHorizontal size={14} />
          <span>
            {isDiagramOpen ? 'Hide' : 'Show'} Equipment Diagram / Profile
          </span>
          <ChevronDown
            size={14}
            className={`collapse-chevron ${isDiagramOpen ? 'open' : ''}`}
          />
        </button>

        <div
          className={`equipment-stage ${isDiagramOpen ? 'show-mobile' : 'hide-mobile'}`}
          aria-hidden="true"
        >
          <div className="stage-grid" />
          <div className="stage-caption">
            <span className="tiny-square" /> EQUIPMENT PROFILE
            <span>01 / {asset.assetTag}</span>
          </div>
          <div className="equipment-outline">
            <div className="motor-foot" />
            <div className="motor-body">
              <div className="motor-cap" />
              <div className="motor-fins">
                {Array.from({ length: 9 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <div className="motor-face">
                <div className="motor-shaft" />
              </div>
              <div className="motor-terminal">
                <Zap size={20} />
              </div>
            </div>
          </div>
          <div className="stage-label">
            <span className="status-dot" />
            {asset.status.toUpperCase()}
            <span>SIMULATED ASSET</span>
          </div>
        </div>
      </div>

      <div className="source-note">
        <span className="tiny-square" />
        Source: Plant Alpha equipment register · Simulated demo data
      </div>
    </section>
  );
}
