import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  History,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdminAuditEventItem,
  AdminCleanupResult,
  fetchAdminAuditActions,
  fetchAdminAuditEvents,
  triggerAdminCleanup,
} from './adminApi';

export function AdminAuditPage() {
  const queryClient = useQueryClient();

  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // Selected event for JSON details modal
  const [inspectingEvent, setInspectingEvent] =
    useState<AdminAuditEventItem | null>(null);
  const [cleanupResult, setCleanupResult] = useState<AdminCleanupResult | null>(
    null,
  );
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Actions list for filter dropdown
  const actionsQuery = useQuery({
    queryKey: ['admin', 'audit-actions'],
    queryFn: fetchAdminAuditActions,
  });

  // Events query
  const eventsQuery = useQuery({
    queryKey: [
      'admin',
      'audit',
      { actionFilter, resourceTypeFilter, startDate, endDate, page },
    ],
    queryFn: () =>
      fetchAdminAuditEvents({
        action: actionFilter || undefined,
        resourceType: resourceTypeFilter || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate
          ? new Date(`${endDate}T23:59:59.999Z`).toISOString()
          : undefined,
        page,
        limit: 25,
      }),
  });

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: triggerAdminCleanup,
    onSuccess: (data) => {
      setCleanupResult(data);
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
    },
  });

  const actions = actionsQuery.data ?? [];
  const events = eventsQuery.data?.events ?? [];
  const pagination = eventsQuery.data?.pagination ?? {
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  };

  const authEventsCount = events.filter((e) =>
    e.action.startsWith('auth.'),
  ).length;
  const adminMutationsCount = events.filter(
    (e) => !e.action.startsWith('auth.'),
  ).length;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">IMMUTABLE SECURITY AUDIT TRAIL</span>
          <h1 className="admin-page-title">Security & Audit Log</h1>
          <p className="admin-page-desc">
            Chronological, immutable audit record of all authentication events,
            administrative mutations, and security operations.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={() => setIsCleanupModalOpen(true)}
          >
            <Trash2 size={15} />
            <span>Purge Expired Sessions</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap audit-icon">
            <History size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Logged Audit Events</span>
            <div className="admin-kpi-value">{pagination.total}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div
            className="admin-kpi-icon-wrap"
            style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}
          >
            <KeyRound size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Auth & Access Events</span>
            <div className="admin-kpi-value" style={{ color: '#38bdf8' }}>
              {authEventsCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div
            className="admin-kpi-icon-wrap"
            style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}
          >
            <Activity size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Resource Mutations</span>
            <div className="admin-kpi-value" style={{ color: '#c084fc' }}>
              {adminMutationsCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap security-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Integrity Status</span>
            <div
              className="admin-kpi-value"
              style={{ fontSize: '18px', color: '#34d399' }}
            >
              Append-Only
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="admin-filters-bar" style={{ flexWrap: 'wrap' }}>
        <select
          className="admin-select"
          style={{ minWidth: '220px' }}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Action Types</option>
          {actions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>

        <select
          className="admin-select"
          value={resourceTypeFilter}
          onChange={(e) => {
            setResourceTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Resource Types</option>
          <option value="auth">auth</option>
          <option value="user">user</option>
          <option value="site">site</option>
          <option value="asset">asset</option>
          <option value="fault_definition">fault_definition</option>
          <option value="procedure">procedure</option>
          <option value="system">system</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>From:</span>
          <input
            type="date"
            className="admin-input"
            style={{ width: '150px', height: '38px', fontSize: '12px' }}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>To:</span>
          <input
            type="date"
            className="admin-input"
            style={{ width: '150px', height: '38px', fontSize: '12px' }}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {(actionFilter || resourceTypeFilter || startDate || endDate) && (
          <button
            type="button"
            className="row-action-btn"
            onClick={() => {
              setActionFilter('');
              setResourceTypeFilter('');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
          >
            <X size={14} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Actor</th>
              <th>Role</th>
              <th>IP / Request</th>
              <th style={{ textAlign: 'right' }}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {eventsQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="table-loading-cell">
                  <RefreshCw size={18} className="spin-icon" />
                  <span>Loading audit trail events...</span>
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty-cell">
                  <History size={36} />
                  <p>No audit events match your selected filters.</p>
                </td>
              </tr>
            ) : (
              events.map((event) => {
                const dateObj = new Date(event.createdAt);

                return (
                  <tr key={event.id}>
                    <td>
                      <div
                        style={{
                          fontWeight: 600,
                          color: '#f1f5f9',
                          fontSize: '12px',
                        }}
                      >
                        {dateObj.toLocaleDateString()}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#718395',
                          fontFamily: 'monospace',
                        }}
                      >
                        {dateObj.toLocaleTimeString()}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`spec-badge`}
                        style={{ fontWeight: 700 }}
                      >
                        {event.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        <strong>{event.resourceType}</strong>
                      </div>
                      {event.resourceId && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#64748b',
                            fontFamily: 'monospace',
                            display: 'block',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={event.resourceId}
                        >
                          {event.resourceId}
                        </span>
                      )}
                    </td>
                    <td>
                      {event.actor ? (
                        <div
                          style={{ display: 'flex', flexDirection: 'column' }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: '#f1f5f9',
                              fontSize: '12px',
                            }}
                          >
                            {event.actor.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#718395' }}>
                            {event.actor.email}
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#64748b',
                            fontStyle: 'italic',
                          }}
                        >
                          System / Anonymous
                        </span>
                      )}
                    </td>
                    <td>
                      {event.membership?.role ? (
                        <span
                          className={`admin-role-badge role-${event.membership.role}`}
                        >
                          {event.membership.role}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          -
                        </span>
                      )}
                    </td>
                    <td>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#8899aa',
                          fontFamily: 'monospace',
                        }}
                      >
                        {event.ipAddress || 'unknown ip'}
                      </div>
                      {event.requestId && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#556677',
                            fontFamily: 'monospace',
                            display: 'block',
                          }}
                        >
                          req: {event.requestId.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={() => setInspectingEvent(event)}
                        title="View event payload details"
                      >
                        <Code size={13} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="pagination-bar">
          <div>
            Showing page {pagination.page} of {pagination.totalPages} (
            {pagination.total} total)
          </div>
          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Event Details JSON Modal */}
      {inspectingEvent && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setInspectingEvent(null)}
        >
          <div
            className="admin-modal-card wide-modal"
            style={{ maxWidth: '720px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div className="modal-title-wrap">
                <Code size={18} className="modal-icon" />
                <h2>Audit Event: {inspectingEvent.action}</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInspectingEvent(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div className="preview-meta-grid">
                <div className="preview-meta-item">
                  <span className="preview-meta-label">Event ID</span>
                  <span
                    className="preview-meta-value"
                    style={{ fontFamily: 'monospace', fontSize: '11px' }}
                  >
                    {inspectingEvent.id}
                  </span>
                </div>
                <div className="preview-meta-item">
                  <span className="preview-meta-label">Recorded At</span>
                  <span className="preview-meta-value">
                    {inspectingEvent.createdAt}
                  </span>
                </div>
                <div className="preview-meta-item">
                  <span className="preview-meta-label">Resource</span>
                  <span className="preview-meta-value">
                    {inspectingEvent.resourceType} (
                    {inspectingEvent.resourceId || 'N/A'})
                  </span>
                </div>
                <div className="preview-meta-item">
                  <span className="preview-meta-label">IP & User Agent</span>
                  <span
                    className="preview-meta-value"
                    style={{ fontSize: '11px' }}
                  >
                    {inspectingEvent.ipAddress || 'None'}
                  </span>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#9bb0c2',
                    }}
                  >
                    EVENT DETAILS & PAYLOAD
                  </span>
                  <button
                    type="button"
                    className="row-action-btn"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(inspectingEvent.details, null, 2),
                      )
                    }
                  >
                    {copiedJson ? (
                      <>
                        <CheckCircle2 size={13} style={{ color: '#34d399' }} />
                        <span style={{ color: '#34d399' }}>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>

                <pre
                  style={{
                    background: '#090f15',
                    border: '1px solid #1f2e3d',
                    borderRadius: '8px',
                    padding: '14px',
                    color: '#67d9ec',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    lineHeight: '1.5',
                  }}
                >
                  {JSON.stringify(inspectingEvent.details, null, 2)}
                </pre>
              </div>
            </div>

            <div
              className="modal-actions"
              style={{ padding: '16px 24px', borderTop: '1px solid #1f2e3d' }}
            >
              <button
                type="button"
                className="admin-primary-btn"
                onClick={() => setInspectingEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Cleanup Confirmation Modal */}
      {isCleanupModalOpen && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setIsCleanupModalOpen(false)}
        >
          <div
            className="admin-modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div className="modal-title-wrap">
                <Trash2 size={18} className="modal-icon warning" />
                <h2>Purge Expired Sessions & Tokens</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setIsCleanupModalOpen(false);
                  setCleanupResult(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="confirm-body">
              {cleanupResult ? (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#34d399',
                      marginBottom: '14px',
                    }}
                  >
                    <CheckCircle2 size={20} />
                    <strong>Cleanup Execution Completed</strong>
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '20px',
                      color: '#cbd5e1',
                      fontSize: '13px',
                      lineHeight: '1.8',
                    }}
                  >
                    <li>
                      Expired auth sessions purged:{' '}
                      <strong>{cleanupResult.purgedSessions}</strong>
                    </li>
                    <li>
                      Expired password reset tokens purged:{' '}
                      <strong>{cleanupResult.purgedResetTokens}</strong>
                    </li>
                    <li>
                      Expired unaccepted invites purged:{' '}
                      <strong>{cleanupResult.purgedInvites}</strong>
                    </li>
                  </ul>
                  <p
                    style={{
                      marginTop: '14px',
                      fontSize: '11px',
                      color: '#64748b',
                    }}
                  >
                    Completed at:{' '}
                    {new Date(cleanupResult.timestamp).toLocaleString()}
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    Are you sure you want to trigger an immediate database
                    cleanup?
                  </p>
                  <p
                    style={{
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#7e92a4',
                    }}
                  >
                    This safely deletes all session cookies that have passed
                    their expiration timestamp, expired single-use password
                    reset tokens, and expired unaccepted invitation records.
                  </p>
                </>
              )}
            </div>

            <div className="modal-actions" style={{ padding: '0 24px 20px' }}>
              <button
                type="button"
                className="admin-secondary-btn"
                onClick={() => {
                  setIsCleanupModalOpen(false);
                  setCleanupResult(null);
                }}
                disabled={cleanupMutation.isPending}
              >
                {cleanupResult ? 'Close' : 'Cancel'}
              </button>

              {!cleanupResult && (
                <button
                  type="button"
                  className="admin-primary-btn"
                  onClick={() => cleanupMutation.mutate()}
                  disabled={cleanupMutation.isPending}
                >
                  {cleanupMutation.isPending ? (
                    <>
                      <RefreshCw size={14} className="spin-icon" />
                      <span>Purging...</span>
                    </>
                  ) : (
                    <span>Execute Cleanup</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
