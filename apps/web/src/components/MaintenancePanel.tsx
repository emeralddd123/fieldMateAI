import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { fetchMaintenance } from '../api';

const date = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export function MaintenancePanel({ assetId }: { assetId: string }) {
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
  return (
    <section className="maintenance-panel" aria-label="Equipment memory">
      <div className="maintenance-heading">
        <h2>
          <Wrench size={16} />
          Equipment memory
        </h2>
        <span>{history.totalMatchingIncidents} incidents</span>
      </div>
      {active.length > 0 && (
        <div className="active-incidents">
          <h3>Active incidents</h3>
          {active.map((incident) => (
            <article key={incident.id}>
              <div className="repair-meta">
                <strong>{incident.incidentNumber}</strong>
                <span>
                  {incident.priority} · {incident.status}
                </span>
              </div>
              <h4>{incident.title}</h4>
            </article>
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
          history.maintenanceRecords.map((record) => (
            <article key={record.id}>
              <div className="repair-meta">
                <time dateTime={record.performedAt}>
                  {date(record.performedAt)}
                </time>
                <span>{record.faultCode ?? 'Maintenance'}</span>
              </div>
              <h4>{record.rootCause}</h4>
              <p>{record.actionTaken}</p>
              <p className="verification">{record.verification}</p>
              <small>
                {record.technician?.name ?? 'Technician not recorded'}
              </small>
            </article>
          ))
        )}
      </div>
      {history.incidents.some((incident) => incident.notes.length > 0) && (
        <div className="maintenance-notes">
          <h3>Technician notes</h3>
          {history.incidents.flatMap((incident) =>
            incident.notes.map((note) => (
              <p key={note.id}>
                <strong>{incident.incidentNumber}</strong>
                {note.note}
              </p>
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
                <span>{measurement.measurementType.replaceAll('_', ' ')}</span>
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
      <p className="maintenance-source">
        Source: {history.assetTag} maintenance records
      </p>
    </section>
  );
}
