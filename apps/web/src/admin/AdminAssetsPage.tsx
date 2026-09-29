import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  AdminAssetItem,
  archiveAdminAsset,
  createAdminAsset,
  fetchAdminAssets,
  fetchAdminSites,
  updateAdminAsset,
} from './adminApi';

export function AdminAssetsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AdminAssetItem | null>(null);
  const [archivingAsset, setArchivingAsset] = useState<AdminAssetItem | null>(
    null,
  );

  // Sites query for filter dropdown and modal
  const sitesQuery = useQuery({
    queryKey: ['admin', 'sites-dropdown'],
    queryFn: fetchAdminSites,
  });

  // Assets query
  const assetsQuery = useQuery({
    queryKey: [
      'admin',
      'assets',
      {
        search,
        siteFilter,
        statusFilter,
        equipmentTypeFilter,
        includeArchived,
        page,
      },
    ],
    queryFn: () =>
      fetchAdminAssets({
        q: search || undefined,
        siteId: siteFilter || undefined,
        status: statusFilter || undefined,
        equipmentType: equipmentTypeFilter || undefined,
        includeArchived,
        page,
        limit: 20,
      }),
  });

  const sites = sitesQuery.data ?? [];
  const assets = assetsQuery.data?.assets ?? [];
  const pagination = assetsQuery.data?.pagination ?? {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  const operationalCount = assets.filter(
    (a) => a.status === 'operational',
  ).length;
  const warningCount = assets.filter((a) => a.status === 'warning').length;
  const downCount = assets.filter((a) => a.status === 'down').length;
  const maintenanceCount = assets.filter(
    (a) => a.status === 'maintenance',
  ).length;

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">EQUIPMENT & SPECIFICATIONS</span>
          <h1 className="admin-page-title">Machines & Assets</h1>
          <p className="admin-page-desc">
            Register industrial machinery, configure electrical operating
            specifications, and manage nested assemblies.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={15} />
            <span>New Machine</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap asset-icon">
            <Cpu size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Registered Assets</span>
            <div className="admin-kpi-value">{pagination.total}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap security-icon">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Operational</span>
            <div className="admin-kpi-value">{operationalCount}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap invite-icon">
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Warning / Down</span>
            <div className="admin-kpi-value">{warningCount + downCount}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap proc-icon">
            <Wrench size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Under Maintenance</span>
            <div className="admin-kpi-value">{maintenanceCount}</div>
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
            placeholder="Search by asset tag, name, manufacturer, model..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          className="admin-filter-select"
          value={siteFilter}
          onChange={(e) => {
            setSiteFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Facilities</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>

        <select
          className="admin-filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="operational">Operational</option>
          <option value="warning">Warning</option>
          <option value="down">Down</option>
          <option value="maintenance">Maintenance</option>
        </select>

        <input
          type="text"
          className="admin-input"
          placeholder="Filter equipment type..."
          style={{ width: 170, height: 38 }}
          value={equipmentTypeFilter}
          onChange={(e) => {
            setEquipmentTypeFilter(e.target.value);
            setPage(1);
          }}
        />

        <label className="site-checkbox-item">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(1);
            }}
          />
          <span>Show archived</span>
        </label>

        <button
          type="button"
          className="admin-secondary-btn"
          onClick={() => assetsQuery.refetch()}
          title="Refresh list"
        >
          <RefreshCw
            size={14}
            className={assetsQuery.isFetching ? 'spin-icon' : ''}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        {assetsQuery.isLoading ? (
          <div className="admin-loading-view">
            <RefreshCw size={24} className="spin-icon" />
            <p>Loading equipment catalog...</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="admin-empty-view">
            <Cpu size={36} className="empty-icon" />
            <h3>No machines found</h3>
            <p>
              {search || siteFilter || statusFilter || equipmentTypeFilter
                ? 'No equipment matches the active filters. Try resetting criteria.'
                : 'No machines registered yet. Click "New Machine" to add your first asset.'}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Machine & Tag</th>
                <th>Site</th>
                <th>Type & Model</th>
                <th>Status</th>
                <th>Operating Specs</th>
                <th>Assemblies</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const isArchived = Boolean(asset.archivedAt);
                return (
                  <tr
                    key={asset.id}
                    className={isArchived ? 'admin-row-archived' : ''}
                  >
                    <td>
                      <div className="admin-user-cell">
                        <span className="site-tag" style={{ fontSize: 11 }}>
                          {asset.assetTag}
                        </span>
                        <div>
                          <span
                            className="admin-user-name"
                            style={{ marginLeft: 6 }}
                          >
                            {asset.name}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 11,
                              color: '#718395',
                              marginLeft: 6,
                            }}
                          >
                            {asset.location}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="site-tag" style={{ color: '#818cf8' }}>
                        {asset.site.name} ({asset.site.code})
                      </span>
                    </td>
                    <td>
                      <div>
                        <span
                          style={{
                            fontSize: 13,
                            color: '#e2ebf2',
                            fontWeight: 500,
                          }}
                        >
                          {asset.equipmentType}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11,
                            color: '#718395',
                          }}
                        >
                          {asset.manufacturer} • {asset.model}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={asset.status} />
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                        }}
                      >
                        {asset.nominalVoltageV !== null ? (
                          <span className="spec-badge">
                            <Zap size={11} />
                            {asset.nominalVoltageV} V
                          </span>
                        ) : null}
                        {asset.nominalCurrentA !== null ? (
                          <span className="spec-badge">
                            <Zap size={11} />
                            {asset.nominalCurrentA} A
                          </span>
                        ) : null}
                        {asset.nominalVoltageV === null &&
                          asset.nominalCurrentA === null && (
                            <span
                              style={{
                                fontSize: 11,
                                color: '#55697a',
                                fontStyle: 'italic',
                              }}
                            >
                              Unspecified
                            </span>
                          )}
                      </div>
                    </td>
                    <td>
                      <span className="session-count-badge">
                        <Cpu size={12} />
                        {asset.components.length} components
                      </span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="row-action-btn"
                          onClick={() => setEditingAsset(asset)}
                          title="Edit machine configuration"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        {!isArchived && (
                          <button
                            type="button"
                            className="row-action-btn danger"
                            onClick={() => setArchivingAsset(asset)}
                            title="Archive machine"
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

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="pagination-bar">
            <span>
              Showing {assets.length} of {pagination.total} machines
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </button>
              <span>
                Page {page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="pagination-btn"
                disabled={page >= pagination.totalPages}
                onClick={() =>
                  setPage((p) => Math.min(pagination.totalPages, p + 1))
                }
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Asset Modal */}
      {isCreateModalOpen && (
        <CreateAssetModal
          sites={sites}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'sites'] });
          }}
        />
      )}

      {/* Edit Asset Modal */}
      {editingAsset && (
        <EditAssetModal
          asset={editingAsset}
          sites={sites}
          onClose={() => setEditingAsset(null)}
          onSuccess={() => {
            setEditingAsset(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
          }}
        />
      )}

      {/* Archive Asset Confirmation Modal */}
      {archivingAsset && (
        <ArchiveAssetModal
          asset={archivingAsset}
          onClose={() => setArchivingAsset(null)}
          onSuccess={() => {
            setArchivingAsset(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'assets'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'sites'] });
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'operational':
      return (
        <span className="admin-status-badge status-active">
          <span className="status-dot" />
          Operational
        </span>
      );
    case 'warning':
      return (
        <span
          className="admin-status-badge"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#fbbf24',
            borderColor: 'rgba(245, 158, 11, 0.25)',
          }}
        >
          <span className="status-dot" />
          Warning
        </span>
      );
    case 'down':
      return (
        <span className="admin-status-badge status-disabled">
          <span className="status-dot" />
          Down
        </span>
      );
    case 'maintenance':
      return (
        <span
          className="admin-status-badge"
          style={{
            background: 'rgba(168, 85, 247, 0.1)',
            color: '#c084fc',
            borderColor: 'rgba(168, 85, 247, 0.25)',
          }}
        >
          <span className="status-dot" />
          Maintenance
        </span>
      );
    default:
      return <span>{status}</span>;
  }
}

function CreateAssetModal({
  sites,
  onClose,
  onSuccess,
}: {
  sites: { id: string; name: string; code: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id || '');
  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [location, setLocation] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState<
    'operational' | 'warning' | 'down' | 'maintenance'
  >('operational');
  const [description, setDescription] = useState('');
  const [nominalVoltageV, setNominalVoltageV] = useState('');
  const [nominalCurrentA, setNominalCurrentA] = useState('');
  const [commissionedAt, setCommissionedAt] = useState('');

  const [components, setComponents] = useState<
    {
      componentType: string;
      manufacturer: string;
      model: string;
      identifier?: string;
    }[]
  >([]);

  const [error, setError] = useState<string | null>(null);

  const addComponent = () => {
    setComponents((prev) => [
      ...prev,
      { componentType: '', manufacturer: '', model: '', identifier: '' },
    ]);
  };

  const removeComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: string, val: string) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: val } : c)),
    );
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminAsset({
        siteId,
        assetTag: assetTag.trim().toUpperCase(),
        name: name.trim(),
        equipmentType: equipmentType.trim(),
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        location: location.trim(),
        serialNumber: serialNumber.trim() || undefined,
        description: description.trim() || undefined,
        status,
        nominalVoltageV: nominalVoltageV ? Number(nominalVoltageV) : undefined,
        nominalCurrentA: nominalCurrentA ? Number(nominalCurrentA) : undefined,
        commissionedAt: commissionedAt
          ? new Date(commissionedAt).toISOString()
          : undefined,
        components: components.filter(
          (c) =>
            c.componentType.trim() && c.manufacturer.trim() && c.model.trim(),
        ),
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'ASSET_TAG_EXISTS') {
        setError(
          `Asset tag '${assetTag.trim().toUpperCase()}' is already in use.`,
        );
      } else {
        setError(err.message || 'Failed to create asset.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !siteId ||
      !assetTag.trim() ||
      !name.trim() ||
      !equipmentType.trim() ||
      !manufacturer.trim() ||
      !model.trim() ||
      !location.trim()
    ) {
      setError('Please fill in all required machine identification fields.');
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card wide-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <Cpu size={18} className="modal-icon" />
            <h2>Register Industrial Machine</h2>
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

          <div className="form-row-2">
            <div className="form-field">
              <label>Target Facility *</label>
              <select
                className="admin-input"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                required
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Asset Tag *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. GEN-02, PUMP-104"
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-field">
              <label>Machine Name *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Auxiliary Boiler Feed Pump"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Equipment Type *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Centrifugal Pump, Motor, VFD"
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-field">
              <label>Manufacturer *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Grundfos, Siemens"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Model *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. CR-32, 1LE1"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Initial Status</label>
              <select
                className="admin-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="operational">Operational</option>
                <option value="warning">Warning</option>
                <option value="down">Down</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-field">
              <label>Facility Location *</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Building B, Bay 2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Serial Number</label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. SN-883719"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Operating Specifications */}
          <div className="form-row-3">
            <div className="form-field">
              <label>Nominal Voltage (V)</label>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                placeholder="e.g. 400 or 415"
                value={nominalVoltageV}
                onChange={(e) => setNominalVoltageV(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Nominal Current (A)</label>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                placeholder="e.g. 32.5"
                value={nominalCurrentA}
                onChange={(e) => setNominalCurrentA(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Commissioned Date</label>
              <input
                type="date"
                className="admin-input"
                value={commissionedAt}
                onChange={(e) => setCommissionedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label>Description / Technical Notes</label>
            <textarea
              className="form-textarea"
              placeholder="Describe machine role, environment, or key operating precautions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Nested Components Builder */}
          <div className="components-builder">
            <div className="components-builder-header">
              <span>Sub-Assemblies & Components ({components.length})</span>
              <button
                type="button"
                className="admin-secondary-btn"
                style={{ padding: '4px 10px', height: 28, fontSize: 11 }}
                onClick={addComponent}
              >
                <Plus size={12} />
                <span>Add Component</span>
              </button>
            </div>

            {components.length === 0 ? (
              <p style={{ fontSize: 11, color: '#687e91', margin: '4px 0' }}>
                No sub-assemblies defined. Click &ldquo;Add Component&rdquo; to
                attach governors, VFDs, alternators, or sensors.
              </p>
            ) : (
              <div className="components-list">
                {components.map((comp, idx) => (
                  <div key={idx} className="component-card-edit">
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Type (e.g. VFD)"
                      value={comp.componentType}
                      onChange={(e) =>
                        updateComponent(idx, 'componentType', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Manufacturer"
                      value={comp.manufacturer}
                      onChange={(e) =>
                        updateComponent(idx, 'manufacturer', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Model"
                      value={comp.model}
                      onChange={(e) =>
                        updateComponent(idx, 'model', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Identifier (optional)"
                      value={comp.identifier || ''}
                      onChange={(e) =>
                        updateComponent(idx, 'identifier', e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn-delete"
                      onClick={() => removeComponent(idx)}
                      title="Remove component"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                  <span>Create Machine</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditAssetModal({
  asset,
  sites,
  onClose,
  onSuccess,
}: {
  asset: AdminAssetItem;
  sites: { id: string; name: string; code: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [siteId, setSiteId] = useState(asset.site.id);
  const [assetTag, setAssetTag] = useState(asset.assetTag);
  const [name, setName] = useState(asset.name);
  const [equipmentType, setEquipmentType] = useState(asset.equipmentType);
  const [manufacturer, setManufacturer] = useState(asset.manufacturer);
  const [model, setModel] = useState(asset.model);
  const [location, setLocation] = useState(asset.location);
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber || '');
  const [status, setStatus] = useState(asset.status);
  const [description, setDescription] = useState(asset.description || '');
  const [nominalVoltageV, setNominalVoltageV] = useState(
    asset.nominalVoltageV !== null ? String(asset.nominalVoltageV) : '',
  );
  const [nominalCurrentA, setNominalCurrentA] = useState(
    asset.nominalCurrentA !== null ? String(asset.nominalCurrentA) : '',
  );
  const [commissionedAt, setCommissionedAt] = useState(
    asset.commissionedAt ? asset.commissionedAt.split('T')[0] : '',
  );

  const [components, setComponents] = useState<
    {
      id?: string;
      componentType: string;
      manufacturer: string;
      model: string;
      identifier?: string;
    }[]
  >(
    asset.components.map((c) => ({
      id: c.id,
      componentType: c.componentType,
      manufacturer: c.manufacturer,
      model: c.model,
      identifier: c.identifier || '',
    })),
  );

  const [error, setError] = useState<string | null>(null);

  const addComponent = () => {
    setComponents((prev) => [
      ...prev,
      { componentType: '', manufacturer: '', model: '', identifier: '' },
    ]);
  };

  const removeComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: string, val: string) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: val } : c)),
    );
  };

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAdminAsset(asset.id, {
        siteId,
        assetTag: assetTag.trim().toUpperCase(),
        name: name.trim(),
        equipmentType: equipmentType.trim(),
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        location: location.trim(),
        serialNumber: serialNumber.trim() || undefined,
        description: description.trim() || undefined,
        status,
        nominalVoltageV: nominalVoltageV ? Number(nominalVoltageV) : undefined,
        nominalCurrentA: nominalCurrentA ? Number(nominalCurrentA) : undefined,
        commissionedAt: commissionedAt
          ? new Date(commissionedAt).toISOString()
          : undefined,
        components: components.filter(
          (c) =>
            c.componentType.trim() && c.manufacturer.trim() && c.model.trim(),
        ),
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === 'ASSET_TAG_EXISTS') {
        setError(
          `Asset tag '${assetTag.trim().toUpperCase()}' is already registered by another machine.`,
        );
      } else {
        setError(err.message || 'Failed to update asset.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !siteId ||
      !assetTag.trim() ||
      !name.trim() ||
      !equipmentType.trim() ||
      !manufacturer.trim() ||
      !model.trim() ||
      !location.trim()
    ) {
      setError('Please fill in all required machine identification fields.');
      return;
    }
    setError(null);
    updateMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card wide-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <Cpu size={18} className="modal-icon" />
            <h2>Edit Machine Specifications</h2>
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

          <div className="form-row-2">
            <div className="form-field">
              <label>Target Facility *</label>
              <select
                className="admin-input"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                required
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Asset Tag *</label>
              <input
                type="text"
                className="admin-input"
                value={assetTag}
                onChange={(e) => setAssetTag(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-field">
              <label>Machine Name *</label>
              <input
                type="text"
                className="admin-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Equipment Type *</label>
              <input
                type="text"
                className="admin-input"
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-field">
              <label>Manufacturer *</label>
              <input
                type="text"
                className="admin-input"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Model *</label>
              <input
                type="text"
                className="admin-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Machine Status</label>
              <select
                className="admin-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="operational">Operational</option>
                <option value="warning">Warning</option>
                <option value="down">Down</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-field">
              <label>Facility Location *</label>
              <input
                type="text"
                className="admin-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Serial Number</label>
              <input
                type="text"
                className="admin-input"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Operating Specifications */}
          <div className="form-row-3">
            <div className="form-field">
              <label>Nominal Voltage (V)</label>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                placeholder="e.g. 400"
                value={nominalVoltageV}
                onChange={(e) => setNominalVoltageV(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Nominal Current (A)</label>
              <input
                type="number"
                step="0.1"
                className="admin-input"
                placeholder="e.g. 12.5"
                value={nominalCurrentA}
                onChange={(e) => setNominalCurrentA(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Commissioned Date</label>
              <input
                type="date"
                className="admin-input"
                value={commissionedAt}
                onChange={(e) => setCommissionedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label>Description / Technical Notes</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Nested Components Builder */}
          <div className="components-builder">
            <div className="components-builder-header">
              <span>Sub-Assemblies & Components ({components.length})</span>
              <button
                type="button"
                className="admin-secondary-btn"
                style={{ padding: '4px 10px', height: 28, fontSize: 11 }}
                onClick={addComponent}
              >
                <Plus size={12} />
                <span>Add Component</span>
              </button>
            </div>

            {components.length === 0 ? (
              <p style={{ fontSize: 11, color: '#687e91', margin: '4px 0' }}>
                No sub-assemblies defined.
              </p>
            ) : (
              <div className="components-list">
                {components.map((comp, idx) => (
                  <div key={idx} className="component-card-edit">
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Type (e.g. VFD)"
                      value={comp.componentType}
                      onChange={(e) =>
                        updateComponent(idx, 'componentType', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Manufacturer"
                      value={comp.manufacturer}
                      onChange={(e) =>
                        updateComponent(idx, 'manufacturer', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Model"
                      value={comp.model}
                      onChange={(e) =>
                        updateComponent(idx, 'model', e.target.value)
                      }
                      required
                    />
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Identifier"
                      value={comp.identifier || ''}
                      onChange={(e) =>
                        updateComponent(idx, 'identifier', e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn-delete"
                      onClick={() => removeComponent(idx)}
                      title="Remove component"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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

function ArchiveAssetModal({
  asset,
  onClose,
  onSuccess,
}: {
  asset: AdminAssetItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminAsset(asset.id),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error & { code?: string }) => {
      setError(err.message || 'Failed to archive asset.');
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
            <h2>Confirm Machine Archival</h2>
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
            Are you sure you want to archive machine{' '}
            <strong>
              {asset.name} ({asset.assetTag})
            </strong>{' '}
            at site <strong>{asset.site.name}</strong>?
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: '#8899a8' }}>
            Archiving removes this machine from technician equipment lists and
            voice searches. All {asset.incidentCount} historical incident
            records and related work logs remain permanently preserved for
            maintenance compliance.
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
                  <span>Archive Machine</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
