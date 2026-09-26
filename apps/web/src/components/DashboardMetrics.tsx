import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  ShieldAlert,
} from 'lucide-react';
import type { Asset } from '@fieldmate/shared';
import type { DashboardIncident } from '../api';

interface DashboardMetricsProps {
  assets: Asset[];
  incidents: DashboardIncident[];
  onSelectAsset?: (assetId: string) => void;
}

export function DashboardMetrics({
  assets,
  incidents,
  onSelectAsset,
}: DashboardMetricsProps) {
  const activeIncidents = incidents.filter((i) =>
    ['open', 'investigating', 'escalated'].includes(i.status),
  );
  const escalatedIncidents = incidents.filter((i) => i.status === 'escalated');
  const downAssets = assets.filter((a) => a.status === 'down');
  const resolvedCount = incidents.filter((i) => i.status === 'resolved').length;

  // Detect recurring faults (e.g. M-204 with F0003)
  const faultGroups: Record<string, { count: number; assetTag: string }> = {};
  for (const inc of incidents) {
    if (inc.faultCode) {
      const asset = assets.find((a) => a.id === inc.assetId);
      const tag = asset?.assetTag ?? 'Asset';
      const key = `${tag} · ${inc.faultCode}`;
      if (!faultGroups[key]) faultGroups[key] = { count: 0, assetTag: tag };
      faultGroups[key].count++;
    }
  }

  const topRecurring = Object.entries(faultGroups).sort(
    (a, b) => b[1].count - a[1].count,
  )[0];

  return (
    <div className="metrics-container">
      {escalatedIncidents.length > 0 && (
        <aside
          className="escalation-alert-banner"
          role="alert"
          aria-live="polite"
        >
          <div className="escalation-alert-content">
            <span className="escalation-pulse-icon">
              <ShieldAlert size={20} />
            </span>
            <div>
              <strong>
                Supervisor Attention Required ({escalatedIncidents.length})
              </strong>
              <p>
                {escalatedIncidents.map((inc) => (
                  <span key={inc.id} className="escalation-item">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onSelectAsset?.(inc.assetId)}
                    >
                      {inc.incidentNumber}
                    </button>
                    : {inc.escalations?.[0]?.reason ?? inc.title}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </aside>
      )}

      <div className="metrics-grid">
        <article
          className={`metric-card ${activeIncidents.length > 0 ? 'metric-warn' : ''}`}
        >
          <div className="metric-header">
            <span>ACTIVE INCIDENTS</span>
            <AlertTriangle size={16} />
          </div>
          <div className="metric-value">{activeIncidents.length}</div>
          <div className="metric-subtext">
            {escalatedIncidents.length > 0
              ? `${escalatedIncidents.length} pending supervisor review`
              : activeIncidents.length > 0
                ? `${activeIncidents.filter((i) => i.priority === 'high' || i.priority === 'critical').length} high priority`
                : 'No active downtime'}
          </div>
        </article>

        <article
          className={`metric-card ${downAssets.length > 0 ? 'metric-down' : ''}`}
        >
          <div className="metric-header">
            <span>EQUIPMENT DOWN</span>
            <Clock size={16} />
          </div>
          <div className="metric-value">{downAssets.length}</div>
          <div className="metric-subtext">
            {downAssets.length > 0
              ? downAssets.map((a) => a.assetTag).join(', ')
              : 'All assets operational or standby'}
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-header">
            <span>RESOLVED REPAIRS</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="metric-value">{resolvedCount}</div>
          <div className="metric-subtext">Captured to institutional memory</div>
        </article>

        <article className="metric-card">
          <div className="metric-header">
            <span>RECURRING FAULTS</span>
            <History size={16} />
          </div>
          <div className="metric-value metric-value-sm">
            {topRecurring ? topRecurring[0] : 'None detected'}
          </div>
          <div className="metric-subtext">
            {topRecurring
              ? `${topRecurring[1].count} incidents logged in register`
              : 'No repeated fault patterns'}
          </div>
        </article>
      </div>
    </div>
  );
}
