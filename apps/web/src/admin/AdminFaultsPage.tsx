import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FileText,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdminFaultDefinitionItem,
  AdminProcedureItem,
  archiveAdminFault,
  createAdminFault,
  fetchAdminFaults,
  fetchAdminProcedures,
  updateAdminFault,
} from './adminApi';

export function AdminFaultsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingFault, setEditingFault] =
    useState<AdminFaultDefinitionItem | null>(null);
  const [archivingFault, setArchivingFault] =
    useState<AdminFaultDefinitionItem | null>(null);

  // Procedures query for dropdown
  const proceduresQuery = useQuery({
    queryKey: ['admin', 'procedures-selector'],
    queryFn: () => fetchAdminProcedures({ limit: 100 }),
  });

  // Faults query
  const faultsQuery = useQuery({
    queryKey: [
      'admin',
      'faults',
      { search, manufacturerFilter, modelFilter, includeArchived, page },
    ],
    queryFn: () =>
      fetchAdminFaults({
        q: search || undefined,
        manufacturer: manufacturerFilter || undefined,
        model: modelFilter || undefined,
        includeArchived,
        page,
        limit: 20,
      }),
  });

  const availableProcedures = proceduresQuery.data?.procedures ?? [];
  const faults = faultsQuery.data?.faults ?? [];
  const pagination = faultsQuery.data?.pagination ?? {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  const highCriticalCount = faults.filter(
    (f) => f.safetyLevel === 'critical' || f.safetyLevel === 'high',
  ).length;
  const linkedCount = faults.filter((f) => f.procedureId).length;
  const unlinkedCount = faults.filter((f) => !f.procedureId).length;

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">KNOWLEDGE & DIAGNOSTICS</span>
          <h1 className="admin-page-title">Fault Codes & Diagnostics</h1>
          <p className="admin-page-desc">
            Define equipment error codes, manufacturer diagnostics, symptoms,
            and link verified SOP procedures.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            <span>New Fault Code</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap fault-icon">
            <AlertTriangle size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Total Fault Codes</span>
            <div className="admin-kpi-value">{pagination.total}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div
            className="admin-kpi-icon-wrap"
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">High / Critical</span>
            <div className="admin-kpi-value" style={{ color: '#f87171' }}>
              {highCriticalCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap proc-icon">
            <FileText size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Linked to Procedures</span>
            <div className="admin-kpi-value" style={{ color: '#c084fc' }}>
              {linkedCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div
            className="admin-kpi-icon-wrap"
            style={{
              background: 'rgba(100, 116, 139, 0.15)',
              color: '#94a3b8',
            }}
          >
            <LinkIcon size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Unlinked (No SOP)</span>
            <div className="admin-kpi-value" style={{ color: '#94a3b8' }}>
              {unlinkedCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="admin-filters-bar">
        <div className="admin-search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by code, title, description..."
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
            >
              <X size={14} />
            </button>
          )}
        </div>

        <input
          type="text"
          className="admin-input"
          style={{ width: '180px', height: '38px' }}
          placeholder="Filter Manufacturer..."
          value={manufacturerFilter}
          onChange={(e) => {
            setManufacturerFilter(e.target.value);
            setPage(1);
          }}
        />

        <input
          type="text"
          className="admin-input"
          style={{ width: '160px', height: '38px' }}
          placeholder="Filter Model..."
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setPage(1);
          }}
        />

        <label
          className="admin-checkbox-label"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#8899aa',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked);
              setPage(1);
            }}
          />
          Show Archived
        </label>
      </div>

      {/* Faults Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fault Code</th>
              <th>Make & Model</th>
              <th>Title & Diagnostics</th>
              <th>Safety Level</th>
              <th>Linked SOP</th>
              <th>Registered</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {faultsQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="table-loading-cell">
                  <RefreshCw size={18} className="spin-icon" />
                  <span>Loading fault definitions...</span>
                </td>
              </tr>
            ) : faults.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty-cell">
                  <AlertTriangle size={36} />
                  <p>No fault definitions match your filters.</p>
                </td>
              </tr>
            ) : (
              faults.map((fault) => {
                const isArchived = Boolean(fault.archivedAt);
                const safetyClass =
                  fault.safetyLevel === 'critical' ||
                  fault.safetyLevel === 'high'
                    ? 'safety-critical'
                    : fault.safetyLevel === 'warning' ||
                        fault.safetyLevel === 'medium'
                      ? 'safety-warning'
                      : 'safety-standard';

                return (
                  <tr
                    key={fault.id}
                    style={isArchived ? { opacity: 0.55 } : undefined}
                  >
                    <td>
                      <div className="fault-code-badge">
                        <AlertTriangle size={13} />
                        <span>{fault.faultCode}</span>
                      </div>
                      {isArchived && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#f87171',
                            display: 'block',
                            marginTop: '4px',
                          }}
                        >
                          (Archived)
                        </span>
                      )}
                    </td>
                    <td>
                      <strong style={{ color: '#e2e8f0', display: 'block' }}>
                        {fault.manufacturer}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#7e92a4' }}>
                        {fault.model}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 600,
                          color: '#f1f5f9',
                          marginBottom: '2px',
                        }}
                      >
                        {fault.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#8b9bb4',
                          maxWidth: '380px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fault.description}
                      </div>
                    </td>
                    <td>
                      <span className={`safety-badge ${safetyClass}`}>
                        {fault.safetyLevel}
                      </span>
                    </td>
                    <td>
                      {fault.procedure ? (
                        <div
                          className="linked-proc-badge"
                          title={`SOP Key: ${fault.procedure.key}`}
                        >
                          <FileText size={12} />
                          <span>{fault.procedure.title}</span>
                          {!fault.procedure.approved && (
                            <span
                              style={{
                                color: '#fbbf24',
                                marginLeft: '4px',
                                fontSize: '10px',
                              }}
                            >
                              ({fault.procedure.status})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#64748b',
                            fontStyle: 'italic',
                          }}
                        >
                          Unlinked
                        </span>
                      )}
                    </td>
                    <td className="timestamp-cell">
                      {new Date(fault.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="row-action-btn"
                          title="Edit fault code"
                          onClick={() => setEditingFault(fault)}
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        {!isArchived && (
                          <button
                            type="button"
                            className="row-action-btn danger"
                            title="Archive fault code"
                            onClick={() => setArchivingFault(fault)}
                          >
                            <Trash2 size={13} />
                            <span>Archive</span>
                          </button>
                        )}
                      </div>
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

      {/* Create Modal */}
      {isCreateModalOpen && (
        <FaultFormModal
          availableProcedures={availableProcedures}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'faults'] });
          }}
        />
      )}

      {/* Edit Modal */}
      {editingFault && (
        <FaultFormModal
          initialData={editingFault}
          availableProcedures={availableProcedures}
          onClose={() => setEditingFault(null)}
          onSuccess={() => {
            setEditingFault(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'faults'] });
          }}
        />
      )}

      {/* Archive Modal */}
      {archivingFault && (
        <ArchiveFaultModal
          fault={archivingFault}
          onClose={() => setArchivingFault(null)}
          onSuccess={() => {
            setArchivingFault(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'faults'] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// FAULT FORM MODAL (CREATE / EDIT)
// ---------------------------------------------------------

interface FaultFormModalProps {
  initialData?: AdminFaultDefinitionItem;
  availableProcedures: AdminProcedureItem[];
  onClose: () => void;
  onSuccess: () => void;
}

function FaultFormModal({
  initialData,
  availableProcedures,
  onClose,
  onSuccess,
}: FaultFormModalProps) {
  const isEditing = Boolean(initialData);

  const [manufacturer, setManufacturer] = useState(
    initialData?.manufacturer ?? '',
  );
  const [model, setModel] = useState(initialData?.model ?? '');
  const [faultCode, setFaultCode] = useState(initialData?.faultCode ?? '');
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(
    initialData?.description ?? '',
  );
  const [safetyLevel, setSafetyLevel] = useState(
    initialData?.safetyLevel ?? 'warning',
  );
  const [source, setSource] = useState(initialData?.source ?? 'manual');
  const [procedureId, setProcedureId] = useState(
    initialData?.procedureId ?? '',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        faultCode: faultCode.trim().toUpperCase(),
        title: title.trim(),
        description: description.trim(),
        safetyLevel,
        source: source.trim() || undefined,
        procedureId: procedureId ? procedureId : null,
      };

      if (isEditing && initialData) {
        return updateAdminFault(initialData.id, payload);
      }
      return createAdminFault({
        ...payload,
        procedureId: procedureId ? procedureId : undefined,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error & { code?: string }) => {
      setFormError(err.message || 'Failed to save fault definition.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!manufacturer.trim()) return setFormError('Manufacturer is required.');
    if (!model.trim()) return setFormError('Model is required.');
    if (!faultCode.trim()) return setFormError('Fault code is required.');
    if (!title.trim()) return setFormError('Fault title is required.');
    if (!description.trim()) return setFormError('Description is required.');

    // Compatibility check warning if procedure chosen has different make/model
    if (procedureId) {
      const chosen = availableProcedures.find((p) => p.id === procedureId);
      if (chosen) {
        if (
          chosen.manufacturer &&
          chosen.manufacturer.toLowerCase() !==
            manufacturer.trim().toLowerCase()
        ) {
          return setFormError(
            `Selected procedure specifies manufacturer "${chosen.manufacturer}", which does not match "${manufacturer.trim()}".`,
          );
        }
        if (
          chosen.model &&
          chosen.model.toLowerCase() !== model.trim().toLowerCase()
        ) {
          return setFormError(
            `Selected procedure specifies model "${chosen.model}", which does not match "${model.trim()}".`,
          );
        }
      }
    }

    saveMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card wide-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <AlertTriangle size={18} className="modal-icon" />
            <h2>
              {isEditing ? 'Edit Fault Definition' : 'Register Fault Code'}
            </h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal-form">
          {formError && (
            <div className="admin-form-error">
              <AlertCircle size={15} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-row-3">
            <div className="form-field">
              <label htmlFor="manufacturer">Manufacturer *</label>
              <input
                id="manufacturer"
                type="text"
                className="admin-input"
                placeholder="e.g. Siemens"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="model">Model *</label>
              <input
                id="model"
                type="text"
                className="admin-input"
                placeholder="e.g. S7-1500"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="faultCode">Fault Code *</label>
              <input
                id="faultCode"
                type="text"
                className="admin-input"
                placeholder="e.g. E-01"
                value={faultCode}
                onChange={(e) => setFaultCode(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="title">Fault Title *</label>
            <input
              id="title"
              type="text"
              className="admin-input"
              placeholder="e.g. DC Bus Overvoltage Tripped"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="description">Diagnostic Symptoms & Causes *</label>
            <textarea
              id="description"
              className="form-textarea"
              style={{ minHeight: '84px' }}
              placeholder="Detail symptom manifestations, error condition triggers, and recommended root-cause diagnostics..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-row-3">
            <div className="form-field">
              <label htmlFor="safetyLevel">Safety Level</label>
              <select
                id="safetyLevel"
                className="admin-select full-width"
                value={safetyLevel}
                onChange={(e) => setSafetyLevel(e.target.value)}
              >
                <option value="standard">Standard (Low)</option>
                <option value="warning">Warning (Medium)</option>
                <option value="critical">Critical (High / Lockout)</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="source">Source</label>
              <input
                id="source"
                type="text"
                className="admin-input"
                placeholder="e.g. OEM Manual Rev 3"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="procedureId">Linked SOP Procedure</label>
              <select
                id="procedureId"
                className="admin-select full-width"
                value={procedureId}
                onChange={(e) => setProcedureId(e.target.value)}
              >
                <option value="">None (Unlinked)</option>
                {availableProcedures.map((proc) => (
                  <option key={proc.id} value={proc.id}>
                    {proc.title} ({proc.key}){' '}
                    {!proc.approved ? `[${proc.status}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="form-help-text">
            Linking a procedure ensures voice assistants immediately guide the
            field technician with verified resolution steps.
          </p>

          <div className="modal-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={onClose}
              disabled={saveMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-primary-btn"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <RefreshCw size={14} className="spin-icon" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>
                  {isEditing ? 'Save Changes' : 'Register Fault Code'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// ARCHIVE CONFIRMATION MODAL
// ---------------------------------------------------------

interface ArchiveFaultModalProps {
  fault: AdminFaultDefinitionItem;
  onClose: () => void;
  onSuccess: () => void;
}

function ArchiveFaultModal({
  fault,
  onClose,
  onSuccess,
}: ArchiveFaultModalProps) {
  const [error, setError] = useState<string | null>(null);

  const archiveMutation = useMutation({
    mutationFn: () => archiveAdminFault(fault.id),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error & { code?: string }) => {
      setError(err.message || 'Failed to archive fault definition.');
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
            <Archive size={18} className="modal-icon warning" />
            <h2>Archive Fault Code</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="confirm-body">
          {error && (
            <div className="admin-form-error" style={{ marginBottom: '16px' }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
          <p>
            Are you sure you want to archive fault code{' '}
            <strong style={{ color: '#fbbf24' }}>{fault.faultCode}</strong> (
            {fault.manufacturer} {fault.model})?
          </p>
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#7e92a4' }}>
            Archiving soft-deletes this fault definition. Field technicians will
            no longer be matched with this diagnostic code.
          </p>
        </div>

        <div className="modal-actions" style={{ padding: '0 24px 20px' }}>
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
              <span>Archive Definition</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
