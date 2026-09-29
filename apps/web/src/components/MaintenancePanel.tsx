import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCheck,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  GitBranch,
  ListFilter,
  UserRound,
  Wrench,
} from 'lucide-react';
import { fetchMaintenance } from '../api';
import { MemoryGraph } from './MemoryGraph';

const date = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

interface MaintenancePanelProps {
  assetId: string;
  onSelectIncident?: (incidentId: string) => void;
}

export function MaintenancePanel({
  assetId,
  onSelectIncident,
}: MaintenancePanelProps) {
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'graph'>('timeline');

  const query = useQuery({
    queryKey: ['maintenance', assetId],
    queryFn: () => fetchMaintenance(assetId),
    refetchInterval: 5000,
  });
  if (query.isPending)
    return (
      <section className="maintenance-panel" role="status">
        Loading equipment memory…
      </section>
    );
  if (query.isError)
    return (
      <section className="maintenance-panel" role="alert">
        <p>{query.error.message}</p>
        <button
          className="secondary-button"
          onClick={() => void query.refetch()}
        >
          Retry maintenance records
        </button>
      </section>
    );
  const { history, measurements } = query.data;
  const active = history.incidents.filter(
    (incident) => !['resolved', 'closed'].includes(incident.status),
  );
  const latestMeasurement = measurements[0] ?? null;
  const expanded = expandedAssetId === assetId;
  const records = history.maintenanceRecords;
  const visibleRecords = expanded ? records : records.slice(0, 3);

  return (
    <section className="maintenance-panel" aria-label="Equipment memory">
      <div className="maintenance-heading">
        <div className="panel-title-with-tabs">
          <div className="memory-heading-copy">
            <span className="memory-heading-icon">
              <Wrench size={19} />
            </span>
            <div>
              <h2>Equipment memory</h2>
              <p>Past repairs. Better decisions.</p>
            </div>
          </div>
          <div
            className="panel-sub-tabs"
            role="group"
            aria-label="Equipment memory view"
          >
            <button
              className={`sub-tab ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
              aria-pressed={viewMode === 'timeline'}
              title="Show chronological repair timeline"
            >
              <ListFilter size={13} />
              Timeline
            </button>
            <button
              className={`sub-tab ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
              aria-pressed={viewMode === 'graph'}
              title="Show institutional memory relationship graph"
            >
              <GitBranch size={13} />
              Knowledge Graph
            </button>
          </div>
        </div>
        <span className="memory-incident-count">
          <Clock3 size={13} />
          {history.totalMatchingIncidents}{' '}
          {history.totalMatchingIncidents === 1 ? 'incident' : 'incidents'}
        </span>
      </div>

      {viewMode === 'graph' ? (
        <MemoryGraph
          assetTag={history.assetTag}
          records={history.maintenanceRecords}
          incidents={history.incidents}
          latestMeasurement={latestMeasurement}
          onSelectIncident={onSelectIncident}
        />
      ) : (
        <>
          {active.length > 0 && (
            <div className="active-incidents">
              <h3>Active incidents</h3>
              {active.map((incident) => (
                <button
                  type="button"
                  key={incident.id}
                  className={`incident-click-card ${
                    incident.status === 'escalated' ? 'incident-escalated' : ''
                  }`}
                  onClick={() => onSelectIncident?.(incident.id)}
                  title="Click to view full incident details and diagnostic history"
                >
                  <div className="repair-meta">
                    <strong>{incident.incidentNumber}</strong>
                    <span className={`status-pill status-${incident.status}`}>
                      {incident.status === 'escalated'
                        ? '⚠️ Supervisor Review'
                        : `${incident.priority} · ${incident.status}`}
                    </span>
                  </div>
                  <h4>{incident.title}</h4>
                  <small className="click-hint">View details ↗</small>
                </button>
              ))}
            </div>
          )}
          <div className="repair-list">
            <div className="repair-section-heading">
              <h3>
                Repair history <span>{records.length}</span>
              </h3>
              <span>Most recent first</span>
            </div>
            {records.length === 0 ? (
              <div className="memory-empty-state">
                <Wrench size={22} />
                <p>No repairs recorded for this asset yet.</p>
                <span>
                  Completed repairs will build this equipment’s history.
                </span>
              </div>
            ) : (
              <ol className="repair-timeline">
                {visibleRecords.map((record, index) => (
                  <li
                    key={record.id}
                    className={
                      index === 0
                        ? 'timeline-entry is-latest'
                        : 'timeline-entry'
                    }
                  >
                    <div className="repair-date">
                      <span className="timeline-dot" />
                      <CalendarDays size={13} aria-hidden="true" />
                      <time dateTime={record.performedAt}>
                        {date(record.performedAt)}
                      </time>
                      {index === 0 && (
                        <span className="repair-date-caption">
                          Latest activity
                        </span>
                      )}
                    </div>
                    <article
                      className={`repair-card ${index === 0 ? 'repair-card-latest' : ''}`}
                    >
                      <div className="repair-card-heading">
                        <div className="repair-card-title">
                          <h4>{record.rootCause}</h4>
                          <span className="repair-fault-code">
                            {record.faultCode ?? 'Maintenance'}
                          </span>
                        </div>
                        {index === 0 && (
                          <span className="latest-repair-badge">
                            Latest repair
                          </span>
                        )}
                      </div>
                      <div className="repair-detail-grid">
                        <div className="repair-action">
                          <span className="repair-field-label">
                            <Wrench size={12} />
                            Action taken
                          </span>
                          <p>{record.actionTaken}</p>
                        </div>
                        <div className="repair-verification">
                          <span className="repair-field-label">
                            <CheckCheck size={13} />
                            Verification
                          </span>
                          <p>{record.verification}</p>
                        </div>
                      </div>
                      <div className="repair-card-footer">
                        {record.incidentId && onSelectIncident && (
                          <button
                            type="button"
                            className="repair-open-button"
                            onClick={() => onSelectIncident(record.incidentId!)}
                            aria-label={`View incident for ${record.rootCause}, ${date(record.performedAt)}`}
                          >
                            View incident
                            <ArrowUpRight size={14} />
                          </button>
                        )}
                        <span className="repair-technician">
                          <span className="repair-technician-icon">
                            <UserRound size={16} aria-hidden="true" />
                          </span>
                          <span>
                            <span className="repair-technician-label">
                              Technician
                            </span>
                            <span className="repair-technician-name">
                              {record.technician?.name ?? 'Not recorded'}
                            </span>
                          </span>
                        </span>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            )}
            {records.length > 3 && (
              <button
                type="button"
                className="repair-expand-button"
                aria-expanded={expanded}
                onClick={() => setExpandedAssetId(expanded ? null : assetId)}
              >
                {expanded
                  ? 'Show fewer repairs'
                  : `Show ${records.length - 3} older repairs`}
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
          {history.incidents.some((incident) => incident.notes.length > 0) && (
            <div className="maintenance-notes">
              <h3>Technician notes</h3>
              {history.incidents.flatMap((incident) =>
                incident.notes.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    className="note-card-btn"
                    onClick={() => onSelectIncident?.(incident.id)}
                    title="View parent incident"
                  >
                    <strong>{incident.incidentNumber}</strong>
                    <span>{note.note}</span>
                  </button>
                )),
              )}
            </div>
          )}
          <div className="readings">
            <h3>Recent readings</h3>
            {measurements.length === 0 ? (
              <p className="maintenance-empty">No measurements recorded yet.</p>
            ) : (
              <div className="reading-grid">
                {measurements.map((measurement) => (
                  <div key={measurement.id}>
                    <span>
                      {measurement.measurementType.replaceAll('_', ' ')}
                    </span>
                    <strong>
                      {measurement.value} <small>{measurement.unit}</small>
                    </strong>
                    <time dateTime={measurement.recordedAt}>
                      {date(measurement.recordedAt)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <p className="maintenance-source">
        Source: {history.assetTag} maintenance records
      </p>
    </section>
  );
}
