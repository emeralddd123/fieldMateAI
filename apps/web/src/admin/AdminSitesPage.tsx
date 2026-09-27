import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  Building2,
  CheckCircle2,
  Cpu,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  AdminSiteItem,
  archiveAdminSite,
  createAdminSite,
  fetchAdminSitesList,
  updateAdminSite,
} from './adminApi';

export function AdminSitesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<AdminSiteItem | null>(null);
  const [archivingSite, setArchivingSite] = useState<AdminSiteItem | null>(null);

  // Queries
  const sitesQuery = useQuery({
    queryKey: ['admin', 'sites', { search, includeArchived }],
    queryFn: () =>
      fetchAdminSitesList({
        q: search || undefined,
        includeArchived,
      }),
  });

  const sites = sitesQuery.data ?? [];
  const activeCount = sites.filter((s) => !s.archivedAt).length;
  const archivedCount = sites.filter((s) => s.archivedAt).length;

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">INFRASTRUCTURE & LOCATIONS</span>
          <h1 className="admin-page-title">Sites Administration</h1>
          <p className="admin-page-desc">
            Register and manage operating facilities, monitor machine density, and configure site scoping.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={15} />
            <span>New Site</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap site-icon">
            <Building2 size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Active Facilities</span>
            <div className="admin-kpi-value">{activeCount}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap asset-icon">
            <Cpu size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Total Active Machines</span>
            <div className="admin-kpi-value">
              {sites.reduce((acc, s) => acc + (s.activeAssetCount || 0), 0)}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap user-icon">
            <Users size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Personnel Assignments</span>
            <div className="admin-kpi-value">
              {sites.reduce((acc, s) => acc + (s.assignedUserCount || 0), 0)}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap audit-icon">
            <Archive size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Archived Sites</span>
            <div className="admin-kpi-value">{archivedCount}</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="admin-filters-bar">
        <div className="admin-search-wrap">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by facility name, code, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <label className="site-checkbox-item" style={{ marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          <span>Include archived sites</span>
        </label>

        <button
          type="button"
          className="admin-secondary-btn"
          onClick={() => sitesQuery.refetch()}
          title="Refresh list"
        >
          <RefreshCw
            size={14}
            className={sitesQuery.isFetching ? 'spin-icon' : ''}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {sitesQuery.isLoading ? (
          <div className="admin-loading-view">
            <RefreshCw size={24} className="spin-icon" />
            <p>Loading sites catalog...</p>
          </div>
        ) : sites.length === 0 ? (
          <div className="admin-empty-view">
            <Building2 size={36} className="empty-icon" />
            <h3>No facilities found</h3>
            <p>
              {search
                ? `No sites match "${search}". Try adjusting your filters.`
                : 'No sites registered yet. Create your first facility to get started.'}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Site Code & Name</th>
                <th>Location</th>
                <th>Active Machines</th>
                <th>Assigned Staff</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const isArchived = Boolean(site.archivedAt);
                return (
                  <tr
                    key={site.id}
                    className={isArchived ? 'admin-row-archived' : ''}
                  >
                    <td>
                      <div className="admin-user-cell">
                        <span className="site-tag" style={{ fontSize: 11 }}>
                          {site.code}
                        </span>
                        <span className="admin-user-name" style={{ marginLeft: 6 }}>
                          {site.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#c5d4e0' }}>
                        {site.location}
                      </span>
                    </td>
                    <td>
                      <span className="session-count-badge">
                        <Cpu size={13} />
                        {site.activeAssetCount ?? 0} machines
                      </span>
                    </td>
                    <td>
                      <span className="session-count-badge">
                        <Users size={13} />
                        {site.assignedUserCount ?? 0} members
                      </span>
                    </td>
                    <td>
                      {isArchived ? (
                        <span className="admin-status-badge status-disabled">
                          <span className="status-dot" />
                          Archived
                        </span>
                      ) : (
                        <span className="admin-status-badge status-active">
                          <span className="status-dot" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="timestamp-cell">
                      {new Date(site.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="row-action-btn"
                          onClick={() => setEditingSite(site)}
                          title="Edit facility details"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        {!isArchived && (
                          <button
                            type="button"
                            className="row-action-btn danger"
                            onClick={() => setArchivingSite(site)}
                            title="Archive facility"
                          >
                            <Archive size={13} />
                            <span>Archive</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Site Modal */}
      {isCreateModalOpen && (
        <CreateSiteModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'sites'] });
          }}
        />
      )}

      {/* Edit Site Modal */}
      {editingSite && (
        <EditSiteModal
          site={editingSite}
          onClose={() => setEditingSite(null)}
          onSuccess={() => {
            setEditingSite(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'sites'] });
          }}
        />
      )}

      {/* Archive Confirmation Modal */}
      {archivingSite && (
        <ArchiveSiteModal
          site={archivingSite}
          onClose={() => setArchivingSite(null)}
          onSuccess={() => {
            setArchivingSite(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'sites'] });
          }}
        />
      )}
    </div>
  );
}

function CreateSiteModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminSite({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        location: location.trim(),
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      if (err.code === 'SITE_CODE_EXISTS') {
        setError(`Site code '${code.trim().toUpperCase()}' is already in use.`);
      } else {
        setError(err.message || 'Failed to create site.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !location.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <Building2 size={18} className="modal-icon" />
            <h2>Register New Facility</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal-form">
          {error && (
            <div className="admin-form-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-field">
            <label>Facility Name *</label>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. Plant Alpha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Site Code *</label>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. PLANT-A"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <p className="form-help-text">
              Unique identifier used in machine tags, reports, and site scoping. Automatically converted to uppercase.
            </p>
          </div>

          <div className="form-field">
            <label>Physical Location / Campus *</label>
            <input
              type="text"
              className="admin-input"
              placeholder="e.g. Sector 4, North Industrial Park"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={onClose}
              disabled={createMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-primary-btn"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <RefreshCw size={14} className="spin-icon" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Create Site</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditSiteModal({
  site,
  onClose,
  onSuccess,
}: {
  site: AdminSiteItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(site.name);
  const [code, setCode] = useState(site.code);
  const [location, setLocation] = useState(site.location);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAdminSite(site.id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        location: location.trim(),
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      if (err.code === 'SITE_CODE_EXISTS') {
        setError(`Site code '${code.trim().toUpperCase()}' is already registered by another facility.`);
      } else {
        setError(err.message || 'Failed to update site.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !location.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    updateMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <Building2 size={18} className="modal-icon" />
            <h2>Edit Facility Details</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal-form">
          {error && (
            <div className="admin-form-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-field">
            <label>Facility Name *</label>
            <input
              type="text"
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Site Code *</label>
            <input
              type="text"
              className="admin-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <p className="form-help-text">
              Unique uppercase code. Modifying this affects future resource assignments.
            </p>
          </div>

          <div className="form-field">
            <label>Physical Location / Campus *</label>
            <input
              type="text"
              className="admin-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-primary-btn"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <RefreshCw size={14} className="spin-icon" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchiveSiteModal({
  site,
  onClose,
  onSuccess,
}: {
  site: AdminSiteItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminSite(site.id),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to archive site.');
    },
  });

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <AlertCircle size={18} className="modal-icon warning" />
            <h2>Confirm Facility Archival</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="confirm-body">
          {error && (
            <div className="admin-form-error" style={{ marginBottom: 12 }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <p>
            Are you sure you want to archive facility{' '}
            <strong>{site.name} ({site.code})</strong>?
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: '#8899a8' }}>
            Archiving removes this site and its {site.activeAssetCount ?? 0} machines
            from technician work queues and voice search. All historical incidents,
            measurements, and maintenance work logs are permanently retained for compliance.
          </p>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={onClose}
              disabled={archiveMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-primary-btn danger"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? (
                <>
                  <RefreshCw size={14} className="spin-icon" />
                  <span>Archiving...</span>
                </>
              ) : (
                <>
                  <Archive size={14} />
                  <span>Archive Facility</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
