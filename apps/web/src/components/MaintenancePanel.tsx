import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, ListFilter, Wrench } from 'lucide-react';
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

  return (
    <section className="maintenance-panel" aria-label="Equipment memory">
      <div className="maintenance-heading">
        <div className="panel-title-with-tabs">
          <h2>
            <Wrench size={16} />
            Equipment memory
          </h2>
          <div className="panel-sub-tabs">
            <button
              className={`sub-tab ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
              title="Show chronological repair timeline"
            >
              <ListFilter size={13} />
              Timeline
            </button>
            <button
              className={`sub-tab ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
              title="Show institutional memory relationship graph"
            >
              <GitBranch size={13} />
              Knowledge Graph
            </button>
          </div>
        </div>
        <span>{history.totalMatchingIncidents} incidents</span>
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
            <h3>Repair history</h3>
            {history.maintenanceRecords.length === 0 ? (
              <p className="maintenance-empty">
                No repairs recorded for this asset yet.
              </p>
            ) : (
              history.maintenanceRecords.map((record, index) => {
                const linkedInc = history.incidents.find(
                  (i) => i.faultCode === record.faultCode,
                );
                return (
                  <article
                    key={record.id}
                    className={`repair-card ${index === 0 ? 'repair-card-latest' : ''}`}
                    onClick={() => {
                      if (linkedInc && onSelectIncident) {
                        onSelectIncident(linkedInc.id);
                      }
                    }}
                    style={{ cursor: linkedInc ? 'pointer' : 'default' }}
                    title={
                      linkedInc
                        ? 'Click to inspect incident history'
                        : undefined
                    }
                  >
                    <div className="repair-meta">
                      <time dateTime={record.performedAt}>
                        {date(record.performedAt)}
                      </time>
                      <div className="repair-tags">
                        {index === 0 && (
                          <span className="latest-repair-badge">
                            LATEST REPAIR
                          </span>
                        )}
                        <span>{record.faultCode ?? 'Maintenance'}</span>
                      </div>
                    </div>
                    <h4>{record.rootCause}</h4>
                    <p>{record.actionTaken}</p>
                    <p className="verification">{record.verification}</p>

                    <small>
                      {record.technician?.name ?? 'Technician not recorded'}
                    </small>
                  </article>
                );
              })
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
