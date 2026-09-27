import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
  FileCheck2,
  FileText,
  FileX2,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdminProcedureItem,
  AdminProcedureStep,
  approveAdminProcedure,
  archiveAdminProcedure,
  createAdminProcedure,
  fetchAdminProcedures,
  updateAdminProcedure,
  withdrawAdminProcedure,
} from './adminApi';

interface EditableStep {
  text: string;
  type: string;
  confirmationRequired: boolean;
}

export function AdminProceduresPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<AdminProcedureItem | null>(null);
  const [previewingProcedure, setPreviewingProcedure] = useState<AdminProcedureItem | null>(null);
  const [approvingProcedure, setApprovingProcedure] = useState<AdminProcedureItem | null>(null);
  const [withdrawingProcedure, setWithdrawingProcedure] = useState<AdminProcedureItem | null>(null);
  const [archivingProcedure, setArchivingProcedure] = useState<AdminProcedureItem | null>(null);

  // Procedures query
  const proceduresQuery = useQuery({
    queryKey: [
      'admin',
      'procedures',
      { search, statusFilter, assetTypeFilter, includeArchived, page },
    ],
    queryFn: () =>
      fetchAdminProcedures({
        q: search || undefined,
        status: statusFilter || undefined,
        assetType: assetTypeFilter || undefined,
        includeArchived,
        page,
        limit: 20,
      }),
  });

  const procedures = proceduresQuery.data?.procedures ?? [];
  const pagination = proceduresQuery.data?.pagination ?? {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  const approvedCount = procedures.filter((p) => p.status === 'approved').length;
  const draftCount = procedures.filter((p) => p.status === 'draft').length;
  const withdrawnCount = procedures.filter((p) => p.status === 'withdrawn').length;

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">SAFETY & STANDARD OPERATING PROCEDURES</span>
          <h1 className="admin-page-title">SOPs & Safety Procedures</h1>
          <p className="admin-page-desc">
            Author and review standard maintenance procedures. Only approved procedures are exposed to technician voice workflows.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            <span>New Procedure Draft</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap proc-icon">
            <FileText size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Total Procedures</span>
            <div className="admin-kpi-value">{pagination.total}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <FileCheck2 size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Approved & Active</span>
            <div className="admin-kpi-value" style={{ color: '#34d399' }}>
              {approvedCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <HelpCircle size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Draft Reviews</span>
            <div className="admin-kpi-value" style={{ color: '#fbbf24' }}>
              {draftCount}
            </div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
            <FileX2 size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Withdrawn SOPs</span>
            <div className="admin-kpi-value" style={{ color: '#f87171' }}>
              {withdrawnCount}
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
            placeholder="Search by key, title, summary..."
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

        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="draft">Draft</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <input
          type="text"
          className="admin-input"
          style={{ width: '180px', height: '38px' }}
          placeholder="Filter Equipment Type..."
          value={assetTypeFilter}
          onChange={(e) => {
            setAssetTypeFilter(e.target.value);
            setPage(1);
          }}
        />

        <label className="admin-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8899aa', cursor: 'pointer' }}>
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

      {/* Procedures Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Procedure Key</th>
              <th>Title & Overview</th>
              <th>Compatibility</th>
              <th>Safety Level</th>
              <th>Status</th>
              <th>Steps</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {proceduresQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="table-loading-cell">
                  <RefreshCw size={18} className="spin-icon" />
                  <span>Loading procedure registry...</span>
                </td>
              </tr>
            ) : procedures.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty-cell">
                  <FileText size={36} />
                  <p>No procedures found matching your criteria.</p>
                </td>
              </tr>
            ) : (
              procedures.map((proc) => {
                const isArchived = Boolean(proc.archivedAt);
                const statusClass = `status-${proc.status}`;
                const safetyClass =
                  proc.safetyLevel === 'critical' || proc.safetyLevel === 'high'
                    ? 'safety-critical'
                    : proc.safetyLevel === 'warning' || proc.safetyLevel === 'medium'
                    ? 'safety-warning'
                    : 'safety-standard';

                return (
                  <tr key={proc.id} style={isArchived ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="spec-badge" title="Unique Key">
                        {proc.key}
                      </div>
                      {isArchived && (
                        <span style={{ fontSize: '10px', color: '#f87171', display: 'block', marginTop: '4px' }}>
                          (Archived)
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '2px' }}>
                        {proc.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#8b9bb4',
                          maxWidth: '340px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {proc.summary}
                      </div>
                    </td>
                    <td>
                      {proc.assetType || proc.manufacturer || proc.model ? (
                        <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                          {proc.assetType && <div>Type: {proc.assetType}</div>}
                          {(proc.manufacturer || proc.model) && (
                            <div style={{ color: '#718395', fontSize: '11px' }}>
                              {[proc.manufacturer, proc.model].filter(Boolean).join(' ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                          Universal SOP
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={`safety-badge ${safetyClass}`}>
                          {proc.safetyLevel}
                        </span>
                        {proc.safetyConfirmationRequired && (
                          <span style={{ fontSize: '10px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <ShieldAlert size={10} /> Confirmation Req
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`admin-status-badge ${statusClass}`}>
                        <span className="status-dot" />
                        <span style={{ textTransform: 'capitalize' }}>{proc.status}</span>
                      </span>
                      {proc.approvedBy && (
                        <span style={{ fontSize: '10px', color: '#718395', display: 'block', marginTop: '4px' }}>
                          By: {proc.approvedBy.name}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                        {proc.steps?.length ?? 0}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}> steps</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="row-action-btn"
                          title="Preview procedure steps"
                          onClick={() => setPreviewingProcedure(proc)}
                        >
                          <Eye size={13} />
                          <span>Preview</span>
                        </button>

                        {proc.status !== 'approved' && !isArchived && (
                          <button
                            type="button"
                            className="row-action-btn success"
                            title="Approve procedure for field use"
                            onClick={() => setApprovingProcedure(proc)}
                          >
                            <ShieldCheck size={13} />
                            <span>Approve</span>
                          </button>
                        )}

                        {proc.status === 'approved' && !isArchived && (
                          <button
                            type="button"
                            className="row-action-btn warning"
                            title="Withdraw procedure from voice access"
                            onClick={() => setWithdrawingProcedure(proc)}
                          >
                            <FileX2 size={13} />
                            <span>Withdraw</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="row-action-btn"
                          title="Edit procedure"
                          onClick={() => setEditingProcedure(proc)}
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>

                        {!isArchived && (
                          <button
                            type="button"
                            className="row-action-btn danger"
                            title="Archive procedure"
                            onClick={() => setArchivingProcedure(proc)}
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
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
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
        <ProcedureFormModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'procedures'] });
          }}
        />
      )}

      {/* Edit Modal */}
      {editingProcedure && (
        <ProcedureFormModal
          initialData={editingProcedure}
          onClose={() => setEditingProcedure(null)}
          onSuccess={() => {
            setEditingProcedure(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'procedures'] });
          }}
        />
      )}

      {/* Preview Modal */}
      {previewingProcedure && (
        <ProcedurePreviewModal
          procedure={previewingProcedure}
          onClose={() => setPreviewingProcedure(null)}
        />
      )}

      {/* Approve Confirmation Modal */}
      {approvingProcedure && (
        <ConfirmActionModal
          title="Approve Procedure"
          icon={<ShieldCheck size={18} className="modal-icon" />}
          message={
            <>
              Are you sure you want to approve SOP{' '}
              <strong style={{ color: '#34d399' }}>{approvingProcedure.title}</strong> ({approvingProcedure.key})?
              <br />
              <br />
              Once approved, field technicians and the voice intelligence system will immediately have access to this procedure.
            </>
          }
          actionLabel="Approve SOP"
          actionVariant="primary"
          onClose={() => setApprovingProcedure(null)}
          onConfirm={async () => {
            await approveAdminProcedure(approvingProcedure.id);
            setApprovingProcedure(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'procedures'] });
          }}
        />
      )}

      {/* Withdraw Confirmation Modal */}
      {withdrawingProcedure && (
        <ConfirmActionModal
          title="Withdraw Procedure"
          icon={<AlertTriangle size={18} className="modal-icon warning" />}
          message={
            <>
              Are you sure you want to withdraw SOP{' '}
              <strong style={{ color: '#fbbf24' }}>{withdrawingProcedure.title}</strong> ({withdrawingProcedure.key})?
              <br />
              <br />
              Withdrawn procedures are immediately restricted from technician voice lookup and maintenance execution.
            </>
          }
          actionLabel="Withdraw SOP"
          actionVariant="warning"
          onClose={() => setWithdrawingProcedure(null)}
          onConfirm={async () => {
            await withdrawAdminProcedure(withdrawingProcedure.id);
            setWithdrawingProcedure(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'procedures'] });
          }}
        />
      )}

      {/* Archive Modal */}
      {archivingProcedure && (
        <ConfirmActionModal
          title="Archive Procedure"
          icon={<Archive size={18} className="modal-icon warning" />}
          message={
            <>
              Are you sure you want to archive SOP{' '}
              <strong style={{ color: '#f87171' }}>{archivingProcedure.title}</strong>?
              <br />
              <br />
              Archiving soft-deletes this SOP and permanently removes it from diagnostic matching.
            </>
          }
          actionLabel="Archive SOP"
          actionVariant="danger"
          onClose={() => setArchivingProcedure(null)}
          onConfirm={async () => {
            await archiveAdminProcedure(archivingProcedure.id);
            setArchivingProcedure(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'procedures'] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// PROCEDURE FORM MODAL (CREATE / EDIT)
// ---------------------------------------------------------

interface ProcedureFormModalProps {
  initialData?: AdminProcedureItem;
  onClose: () => void;
  onSuccess: () => void;
}

function ProcedureFormModal({
  initialData,
  onClose,
  onSuccess,
}: ProcedureFormModalProps) {
  const isEditing = Boolean(initialData);

  const [key, setKey] = useState(initialData?.key ?? '');
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [assetType, setAssetType] = useState(initialData?.assetType ?? '');
  const [manufacturer, setManufacturer] = useState(initialData?.manufacturer ?? '');
  const [model, setModel] = useState(initialData?.model ?? '');
  const [safetyLevel, setSafetyLevel] = useState(initialData?.safetyLevel ?? 'standard');
  const [safetyConfirmationRequired, setSafetyConfirmationRequired] = useState(
    initialData?.safetyConfirmationRequired ?? false,
  );
  const [summary, setSummary] = useState(initialData?.summary ?? '');
  const [source, setSource] = useState(initialData?.source ?? 'manual');

  // Convert initial steps to editable format
  const [steps, setSteps] = useState<EditableStep[]>(() => {
    if (!initialData?.steps || initialData.steps.length === 0) {
      return [{ text: '', type: 'action', confirmationRequired: false }];
    }
    return initialData.steps.map((s) => {
      if (typeof s === 'string') {
        return { text: s, type: 'action', confirmationRequired: false };
      }
      return {
        text: s.text ?? '',
        type: s.type ?? 'action',
        confirmationRequired: Boolean(s.confirmationRequired),
      };
    });
  });

  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        key: key.trim().toLowerCase(),
        title: title.trim(),
        assetType: assetType.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        model: model.trim() || undefined,
        safetyLevel,
        safetyConfirmationRequired,
        summary: summary.trim(),
        source: source.trim() || undefined,
        steps: steps.map((s, idx) => ({
          order: idx + 1,
          text: s.text.trim(),
          type: s.type,
          confirmationRequired: s.confirmationRequired,
        })),
      };

      if (isEditing && initialData) {
        return updateAdminProcedure(initialData.id, payload);
      }
      return createAdminProcedure(payload);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to save procedure.');
    },
  });

  const handleAddStep = () => {
    setSteps([...steps, { text: '', type: 'action', confirmationRequired: false }]);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const current = steps[index];
    const target = steps[targetIndex];
    if (!current || !target) return;
    const copy = [...steps];
    copy[index] = target;
    copy[targetIndex] = current;
    setSteps(copy);
  };

  const handleStepChange = (index: number, field: keyof EditableStep, value: any) => {
    const current = steps[index];
    if (!current) return;
    const copy = [...steps];
    copy[index] = { ...current, [field]: value };
    setSteps(copy);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!key.trim()) return setFormError('Procedure key is required.');
    if (!title.trim()) return setFormError('Procedure title is required.');
    if (!summary.trim()) return setFormError('Procedure summary is required.');

    const emptyStep = steps.some((s) => !s.text.trim());
    if (emptyStep) return setFormError('All procedure steps must have instructions text.');

    saveMutation.mutate();
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card wide-modal"
        style={{ maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <FileText size={18} className="modal-icon" />
            <h2>{isEditing ? 'Edit Procedure' : 'Author SOP Procedure Draft'}</h2>
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

          <div className="form-row-2">
            <div className="form-field">
              <label htmlFor="procKey">Procedure Unique Key *</label>
              <input
                id="procKey"
                type="text"
                className="admin-input"
                placeholder="e.g. dc-bus-discharge"
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
              />
              <span className="form-help-text">Lowercase slug, e.g. e01-overvoltage-troubleshoot</span>
            </div>

            <div className="form-field">
              <label htmlFor="procTitle">Procedure Title *</label>
              <input
                id="procTitle"
                type="text"
                className="admin-input"
                placeholder="e.g. DC Bus Safe Discharge Procedure"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-field">
              <label htmlFor="procAssetType">Equipment Type</label>
              <input
                id="procAssetType"
                type="text"
                className="admin-input"
                placeholder="e.g. VFD Drive"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="procManufacturer">Manufacturer Compatibility</label>
              <input
                id="procManufacturer"
                type="text"
                className="admin-input"
                placeholder="e.g. Siemens (optional)"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="procModel">Model Compatibility</label>
              <input
                id="procModel"
                type="text"
                className="admin-input"
                placeholder="e.g. S7-1500 (optional)"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="procSummary">Objective & Overview *</label>
            <textarea
              id="procSummary"
              className="form-textarea"
              style={{ minHeight: '64px' }}
              placeholder="State the objective, personal protective equipment (PPE) requirements, and preconditions..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="form-row-3">
            <div className="form-field">
              <label htmlFor="procSafetyLevel">Safety Classification</label>
              <select
                id="procSafetyLevel"
                className="admin-select full-width"
                value={safetyLevel}
                onChange={(e) => setSafetyLevel(e.target.value)}
              >
                <option value="standard">Standard (Routine)</option>
                <option value="warning">Warning (Hazard Present)</option>
                <option value="critical">Critical (LOTO / High Voltage)</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="procSource">Origin Source</label>
              <input
                id="procSource"
                type="text"
                className="admin-input"
                placeholder="e.g. Plant Safety Board"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            <div className="form-field" style={{ justifyContent: 'center' }}>
              <label className="step-checkbox-label" style={{ marginTop: '16px' }}>
                <input
                  type="checkbox"
                  checked={safetyConfirmationRequired}
                  onChange={(e) => setSafetyConfirmationRequired(e.target.checked)}
                />
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Require Safety Confirmation Gate</span>
              </label>
              <span className="form-help-text">Technician must explicitly acknowledge hazard before steps start.</span>
            </div>
          </div>

          {/* Steps Builder */}
          <div className="steps-builder">
            <div className="steps-builder-header">
              <span>Standard Operating Steps ({steps.length})</span>
              <button
                type="button"
                className="row-action-btn"
                onClick={handleAddStep}
              >
                <Plus size={13} />
                <span>Add Step</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {steps.map((step, idx) => (
                <div key={idx} className="step-card-edit">
                  <div className="step-order-badge">{idx + 1}</div>

                  <input
                    type="text"
                    className="admin-input"
                    placeholder={`Step ${idx + 1} action or instruction...`}
                    value={step.text}
                    onChange={(e) => handleStepChange(idx, 'text', e.target.value)}
                  />

                  <select
                    className="admin-select"
                    value={step.type}
                    onChange={(e) => handleStepChange(idx, 'type', e.target.value)}
                    style={{ height: '32px', fontSize: '11px', padding: '0 8px' }}
                  >
                    <option value="action">Action</option>
                    <option value="warning">Warning</option>
                    <option value="inspection">Inspection</option>
                    <option value="lockout">Lockout</option>
                  </select>

                  <label className="step-checkbox-label">
                    <input
                      type="checkbox"
                      checked={step.confirmationRequired}
                      onChange={(e) =>
                        handleStepChange(idx, 'confirmationRequired', e.target.checked)
                      }
                    />
                    <span>Verify</span>
                  </label>

                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      type="button"
                      className="icon-btn-delete"
                      disabled={idx === 0}
                      onClick={() => handleMoveStep(idx, 'up')}
                      title="Move step up"
                      style={{ color: idx === 0 ? '#334155' : '#94a3b8' }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn-delete"
                      disabled={idx === steps.length - 1}
                      onClick={() => handleMoveStep(idx, 'down')}
                      title="Move step down"
                      style={{ color: idx === steps.length - 1 ? '#334155' : '#94a3b8' }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn-delete"
                      onClick={() => handleRemoveStep(idx)}
                      title="Remove step"
                      disabled={steps.length <= 1}
                      style={{ color: steps.length <= 1 ? '#334155' : '#f87171' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
                <span>{isEditing ? 'Save Changes' : 'Save Procedure Draft'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// PROCEDURE PREVIEW MODAL
// ---------------------------------------------------------

interface ProcedurePreviewModalProps {
  procedure: AdminProcedureItem;
  onClose: () => void;
}

function ProcedurePreviewModal({ procedure, onClose }: ProcedurePreviewModalProps) {
  const safetyClass =
    procedure.safetyLevel === 'critical' || procedure.safetyLevel === 'high'
      ? 'safety-critical'
      : procedure.safetyLevel === 'warning' || procedure.safetyLevel === 'medium'
      ? 'safety-warning'
      : 'safety-standard';

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-card procedure-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <Eye size={18} className="modal-icon" />
            <h2>Technician View: {procedure.title}</h2>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="procedure-preview-content">
          <div className="preview-meta-grid">
            <div className="preview-meta-item">
              <span className="preview-meta-label">Unique Key</span>
              <span className="preview-meta-value">{procedure.key}</span>
            </div>
            <div className="preview-meta-item">
              <span className="preview-meta-label">Status</span>
              <span className="preview-meta-value" style={{ textTransform: 'capitalize' }}>
                {procedure.status}
              </span>
            </div>
            <div className="preview-meta-item">
              <span className="preview-meta-label">Safety Level</span>
              <span className={`safety-badge ${safetyClass}`}>
                {procedure.safetyLevel}
              </span>
            </div>
            <div className="preview-meta-item">
              <span className="preview-meta-label">Equipment</span>
              <span className="preview-meta-value">
                {procedure.assetType || 'Universal'}
              </span>
            </div>
          </div>

          <div className="preview-summary-card">
            <strong>Summary & Objective:</strong>
            <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>{procedure.summary}</p>
          </div>

          {procedure.safetyConfirmationRequired && (
            <div className="preview-safety-alert">
              <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Mandatory Safety Gate:</strong>
                <p style={{ margin: '4px 0 0' }}>
                  Field technicians must explicitly confirm safety precautions and LOTO protocols before voice guidance proceeds.
                </p>
              </div>
            </div>
          )}

          <div>
            <h4 style={{ fontSize: '13px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Execution Sequence ({procedure.steps?.length ?? 0} Steps)
            </h4>

            <div className="preview-steps-list">
              {procedure.steps?.map((step, idx) => {
                const stepText = typeof step === 'string' ? step : step.text;
                const stepType = typeof step === 'string' ? 'action' : step.type ?? 'action';
                const confirmReq = typeof step === 'string' ? false : step.confirmationRequired;

                return (
                  <div key={idx} className="preview-step-card">
                    <div className="preview-step-number">{idx + 1}</div>
                    <div className="preview-step-text">
                      <div>{stepText}</div>
                      <div className="preview-step-tags">
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#1e293b',
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                          }}
                        >
                          {stepType}
                        </span>
                        {confirmReq && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <CheckCircle2 size={10} /> Explicit Check Required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid #1e293b' }}>
          <button type="button" className="admin-primary-btn" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// CONFIRM ACTION MODAL (APPROVE / WITHDRAW / ARCHIVE)
// ---------------------------------------------------------

interface ConfirmActionModalProps {
  title: string;
  icon: React.ReactNode;
  message: React.ReactNode;
  actionLabel: string;
  actionVariant?: 'primary' | 'warning' | 'danger';
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function ConfirmActionModal({
  title,
  icon,
  message,
  actionLabel,
  actionVariant = 'primary',
  onClose,
  onConfirm,
}: ConfirmActionModalProps) {
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: onConfirm,
    onError: (err: any) => {
      setError(err.message || 'Operation failed.');
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
            {icon}
            <h2>{title}</h2>
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
          <p>{message}</p>
        </div>

        <div className="modal-actions" style={{ padding: '0 24px 20px' }}>
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`admin-primary-btn ${actionVariant === 'danger' ? 'danger' : ''}`}
            style={
              actionVariant === 'warning'
                ? { background: '#f59e0b', borderColor: '#d97706', color: '#000' }
                : undefined
            }
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <RefreshCw size={14} className="spin-icon" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{actionLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
