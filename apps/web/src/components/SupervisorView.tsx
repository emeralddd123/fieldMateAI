import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  ChevronRight,
  Clock,
  Factory,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { fetchAssets, fetchIncidents } from '../api';
import { IncidentDetailModal } from './IncidentDetailModal';
import { useAuth } from '../auth/AuthProvider';
import { UserMenu } from '../auth/UserMenu';

const activeStatuses = new Set(['open', 'investigating', 'escalated']);
const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export function SupervisorView() {
  const auth = useAuth();
  const membership = auth.session!.memberships[0];
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<
    'active' | 'escalated' | 'resolved' | 'all'
  >('active');
  const assets = useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
    refetchInterval: 5000,
  });
  const incidents = useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
    refetchInterval: 5000,
  });

  const allIncidents = incidents.data ?? [];
  const allAssets = assets.data ?? [];
  const active = allIncidents.filter((item) => activeStatuses.has(item.status));
  const escalated = allIncidents
    .filter((item) =>
      item.escalations.some((escalation) => escalation.status === 'pending'),
    )
    .sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] ||
        Date.parse(a.openedAt) - Date.parse(b.openedAt),
    );
  const down = allAssets.filter((asset) => asset.status === 'down');
  const resolved = allIncidents.filter((item) =>
    ['resolved', 'closed'].includes(item.status),
  );

  const needle = search.trim().toLowerCase();
  const visibleIncidents = allIncidents
    .filter((item) => {
      if (filter === 'active' && !activeStatuses.has(item.status)) return false;
      if (filter === 'escalated' && item.status !== 'escalated') return false;
      if (
        filter === 'resolved' &&
        !['resolved', 'closed'].includes(item.status)
      )
        return false;
      return !needle
        ? true
        : `${item.incidentNumber} ${item.title} ${item.description} ${item.faultCode ?? ''} ${item.asset?.assetTag ?? ''}`
            .toLowerCase()
            .includes(needle);
    })
    .sort(
      (a, b) =>
        priorityRank[a.priority] - priorityRank[b.priority] ||
        Date.parse(b.openedAt) - Date.parse(a.openedAt),
    );

  const refresh = () => {
    void assets.refetch();
    void incidents.refetch();
  };
  const pending = assets.isPending || incidents.isPending;
  const failed = assets.isError || incidents.isError;

  return (
    <div className="supervisor-shell">
      <header className="topbar supervisor-topbar">
        <a
          href="/supervisor"
          className="brand"
          aria-label="FieldMate AI supervisor home"
        >
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            FieldMate<span className="brand-ai">AI</span>
            <small>MAINTENANCE INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          <ShieldAlert size={15} /> Supervisor workspace
        </div>
        <div className="topbar-right">
          <a className="topbar-action-btn supervisor-role-link" href="/">
            <Wrench size={14} /> Technician view
          </a>
          <span className="plant">
            <Factory size={15} />
            {membership?.sites[0]?.name ?? membership?.organization.name}
          </span>
          <UserMenu />
        </div>
      </header>

      <main className="supervisor-main">
        <section className="supervisor-hero">
          <div>
            <div className="breadcrumb">
              OPERATIONS <ChevronRight size={11} /> SUPERVISOR
            </div>
            <h1>Plant maintenance overview</h1>
            <p>
              Review escalations, equipment health, and the current incident
              workload across Plant Alpha.
            </p>
          </div>
          <button
            className="secondary-action-btn"
            onClick={refresh}
            disabled={assets.isFetching || incidents.isFetching}
          >
            <RefreshCw
              size={15}
              className={
                assets.isFetching || incidents.isFetching ? 'spin' : ''
              }
            />
            Refresh data
          </button>
        </section>

        {pending ? (
          <section className="state-card supervisor-state" role="status">
            <RefreshCw className="spin" size={28} />
            <h2>Loading plant operations</h2>
          </section>
        ) : failed ? (
          <section className="state-card supervisor-state" role="alert">
            <AlertTriangle size={28} />
            <h2>Supervisor data is unavailable</h2>
            <p>Check the API connection and try again.</p>
            <button className="secondary-button" onClick={refresh}>
              Retry
            </button>
          </section>
        ) : (
          <>
            <section className="supervisor-kpis" aria-label="Plant summary">
              <article className="supervisor-kpi kpi-attention">
                <span>
                  <ShieldAlert size={17} /> ESCALATIONS
                </span>
                <strong>{escalated.length}</strong>
                <small>Awaiting supervisor review</small>
              </article>
              <article className="supervisor-kpi">
                <span>
                  <AlertTriangle size={17} /> ACTIVE INCIDENTS
                </span>
                <strong>{active.length}</strong>
                <small>
                  {active.filter((item) => item.priority === 'critical').length}{' '}
                  critical priority
                </small>
              </article>
              <article className="supervisor-kpi kpi-down">
                <span>
                  <Clock size={17} /> EQUIPMENT DOWN
                </span>
                <strong>{down.length}</strong>
                <small>
                  {down.length
                    ? down.map((asset) => asset.assetTag).join(', ')
                    : 'No equipment down'}
                </small>
              </article>
              <article className="supervisor-kpi kpi-resolved">
                <span>
                  <CheckCircle2 size={17} /> RESOLVED
                </span>
                <strong>{resolved.length}</strong>
                <small>Captured in equipment memory</small>
              </article>
            </section>

            <div className="supervisor-grid">
              <section className="supervisor-panel escalation-queue">
                <header className="supervisor-panel-heading">
                  <div>
                    <span className="panel-kicker">ACTION QUEUE</span>
                    <h2>Supervisor attention</h2>
                  </div>
                  <span className="count-pill">{escalated.length} pending</span>
                </header>
                {escalated.length ? (
                  <div className="supervisor-card-list">
                    {escalated.map((incident) => (
                      <button
                        className="supervisor-escalation-card"
                        key={incident.id}
                        onClick={() => setSelectedIncident(incident.id)}
                      >
                        <div className="supervisor-card-top">
                          <span className="incident-num-tag">
                            {incident.incidentNumber}
                          </span>
                          <span
                            className={`priority-pill priority-${incident.priority}`}
                          >
                            {incident.priority}
                          </span>
                        </div>
                        <h3>{incident.title}</h3>
                        <p>
                          {incident.escalations[0]?.reason ??
                            'Supervisor review requested.'}
                        </p>
                        <footer>
                          <span>
                            {incident.asset?.assetTag ?? 'Asset'} ·{' '}
                            {incident.asset?.location ?? 'Location unavailable'}
                          </span>
                          <span>{formatDate(incident.openedAt)}</span>
                        </footer>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="supervisor-empty">
                    <CheckCircle2 size={26} />
                    <h3>No escalations waiting</h3>
                    <p>The supervisor queue is clear.</p>
                  </div>
                )}
              </section>

              <section className="supervisor-panel asset-health-panel">
                <header className="supervisor-panel-heading">
                  <div>
                    <span className="panel-kicker">FLEET STATUS</span>
                    <h2>Equipment health</h2>
                  </div>
                  <Activity size={19} />
                </header>
                <div className="supervisor-asset-list">
                  {allAssets.map((asset) => {
                    const count = active.filter(
                      (incident) => incident.assetId === asset.id,
                    ).length;
                    return (
                      <article key={asset.id} className="supervisor-asset-row">
                        <span className={`status-dot ${asset.status}`} />
                        <div>
                          <strong>{asset.assetTag}</strong>
                          <small>{asset.name}</small>
                        </div>
                        <span className={`status-pill status-${asset.status}`}>
                          {asset.status}
                        </span>
                        <span className="asset-incident-count">
                          {count} active
                        </span>
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="supervisor-panel incident-register-panel">
              <header className="supervisor-panel-heading register-heading">
                <div>
                  <span className="panel-kicker">PLANT REGISTER</span>
                  <h2>Maintenance incidents</h2>
                </div>
                <div className="supervisor-register-controls">
                  <div className="supervisor-filter-tabs">
                    {(['active', 'escalated', 'resolved', 'all'] as const).map(
                      (value) => (
                        <button
                          key={value}
                          className={filter === value ? 'active' : ''}
                          onClick={() => setFilter(value)}
                        >
                          {value}
                        </button>
                      ),
                    )}
                  </div>
                  <label className="supervisor-search">
                    <Search size={15} />
                    <input
                      aria-label="Search supervisor incidents"
                      placeholder="Search number, asset, fault…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>
              </header>
              <div className="supervisor-table-wrap">
                <table className="supervisor-table">
                  <thead>
                    <tr>
                      <th>Incident</th>
                      <th>Equipment</th>
                      <th>Fault</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Opened</th>
                      <th aria-label="Open incident" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleIncidents.map((incident) => (
                      <tr key={incident.id}>
                        <td>
                          <strong>{incident.incidentNumber}</strong>
                          <small>{incident.title}</small>
                        </td>
                        <td>
                          {incident.asset?.assetTag ?? '—'}
                          <small>{incident.asset?.name}</small>
                        </td>
                        <td>{incident.faultCode ?? '—'}</td>
                        <td>
                          <span
                            className={`priority-pill priority-${incident.priority}`}
                          >
                            {incident.priority}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-pill status-${incident.status}`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td>{formatDate(incident.openedAt)}</td>
                        <td>
                          <button
                            aria-label={`Open ${incident.incidentNumber}`}
                            onClick={() => setSelectedIncident(incident.id)}
                          >
                            <ChevronRight size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleIncidents.length === 0 && (
                  <div className="supervisor-empty register-empty">
                    <LayoutDashboard size={24} />
                    <h3>No matching incidents</h3>
                    <p>Change the filter or search terms.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <IncidentDetailModal
        incidentId={selectedIncident}
        onClose={() => setSelectedIncident(null)}
        supervisorMode
        onSupervisorUpdated={refresh}
      />
    </div>
  );
}
