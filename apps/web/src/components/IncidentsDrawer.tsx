import { useState, useMemo } from 'react';
import { ChevronRight, Layers, Search, X } from 'lucide-react';
import type { DashboardIncident } from '../api';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

interface IncidentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: DashboardIncident[];
  onSelectIncident: (incidentId: string) => void;
}

export function IncidentsDrawer({
  isOpen,
  onClose,
  incidents,
  onSelectIncident,
}: IncidentsDrawerProps) {
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'escalated' | 'resolved'
  >('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesSearch =
        `${inc.incidentNumber} ${inc.title} ${inc.faultCode ?? ''} ${inc.description}`
          .toLowerCase()
          .includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filterStatus === 'active') {
        return !['resolved', 'closed'].includes(inc.status);
      }
      if (filterStatus === 'escalated') {
        return inc.status === 'escalated';
      }
      if (filterStatus === 'resolved') {
        return inc.status === 'resolved' || inc.status === 'closed';
      }
      return true;
    });
  }, [incidents, filterStatus, search]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incidents-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-container">
        <header className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge">PLANT INCIDENTS</span>
            <h2 id="incidents-drawer-title">Maintenance Incident Register</h2>
            <span className="count-pill">{incidents.length} total</span>
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close incident register"
          >
            <X size={18} />
          </button>
        </header>

        <div className="drawer-controls">
          <div className="filter-tabs">
            <button
              className={`filter-tab ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All ({incidents.length})
            </button>
            <button
              className={`filter-tab ${filterStatus === 'active' ? 'active' : ''}`}
              onClick={() => setFilterStatus('active')}
            >
              Active (
              {
                incidents.filter(
                  (i) => !['resolved', 'closed'].includes(i.status),
                ).length
              }
              )
            </button>
            <button
              className={`filter-tab ${filterStatus === 'escalated' ? 'active' : ''}`}
              onClick={() => setFilterStatus('escalated')}
            >
              ⚠️ Escalated (
              {incidents.filter((i) => i.status === 'escalated').length})
            </button>
            <button
              className={`filter-tab ${filterStatus === 'resolved' ? 'active' : ''}`}
              onClick={() => setFilterStatus('resolved')}
            >
              Resolved (
              {
                incidents.filter((i) =>
                  ['resolved', 'closed'].includes(i.status),
                ).length
              }
              )
            </button>
          </div>

          <label className="drawer-search-box">
            <Search size={15} />
            <input
              placeholder="Search incidents by number, fault, or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="drawer-incident-list">
          {filtered.length === 0 ? (
            <div className="state-card">
              <Layers size={24} />
              <h3>No matching incidents</h3>
              <p>Try adjusting your search query or filter.</p>
            </div>
          ) : (
            filtered.map((inc) => (
              <button
                key={inc.id}
                className={`drawer-incident-card status-${inc.status}`}
                onClick={() => {
                  onSelectIncident(inc.id);
                }}
              >
                <div className="drawer-card-top">
                  <span className="incident-num-tag">{inc.incidentNumber}</span>
                  <div className="drawer-card-badges">
                    <span className={`status-pill status-${inc.status}`}>
                      {inc.status === 'escalated' ? '⚠️ Escalated' : inc.status}
                    </span>
                    <span className={`priority-pill priority-${inc.priority}`}>
                      {inc.priority}
                    </span>
                  </div>
                </div>

                <h4 className="drawer-card-title">{inc.title}</h4>
                <p className="drawer-card-desc">{inc.description}</p>

                <div className="drawer-card-footer">
                  <span className="drawer-card-date">
                    {formatDate(inc.openedAt)}
                  </span>
                  {inc.faultCode && (
                    <span className="drawer-fault-pill">
                      Fault: {inc.faultCode}
                    </span>
                  )}
                  {inc.actionTaken && (
                    <span className="drawer-action-pill">✓ Resolved</span>
                  )}
                  <ChevronRight size={14} className="drawer-card-arrow" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
