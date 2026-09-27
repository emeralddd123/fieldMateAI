import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import {
  AdminInvitation,
  AdminUserListItem,
  AdminUserSite,
  fetchAdminInvitations,
  fetchAdminSites,
  fetchAdminUsers,
  inviteUser,
  resendInvitation,
  revokeInvitation,
  revokeUserSessions,
  updateAdminUser,
} from './adminApi';

export function AdminUsersPage() {
  const auth = useAuth();
  const currentUserId = auth.session?.user.id;

  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [siteFilter, setSiteFilter] = useState<string>('');

  // Modals state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'deactivate' | 'reactivate' | 'revoke_sessions' | 'revoke_invite';
    target: { id: string; name: string };
  } | null>(null);

  // Queries
  const usersQuery = useQuery({
    queryKey: ['admin', 'users', { search, roleFilter, statusFilter, siteFilter }],
    queryFn: () =>
      fetchAdminUsers({
        q: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        siteId: siteFilter || undefined,
        limit: 50,
      }),
  });

  const sitesQuery = useQuery({
    queryKey: ['admin', 'sites'],
    queryFn: fetchAdminSites,
  });

  const invitationsQuery = useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: fetchAdminInvitations,
  });

  const sites = sitesQuery.data ?? [];
  const users = usersQuery.data?.users ?? [];
  const invitations = invitationsQuery.data ?? [];

  return (
    <div className="admin-page-container">
      {/* Header */}
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">TEAM & ACCESS GOVERNANCE</span>
          <h1 className="admin-page-title">Users & Permissions</h1>
          <p className="admin-page-desc">
            Manage organization members, assign site access, configure roles, and inspect active sessions.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => setIsInviteModalOpen(true)}
          >
            <UserPlus size={16} />
            <span>Invite User</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs-row">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={16} />
          <span>Team Members</span>
          <span className="admin-tab-badge">{users.length}</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'invitations' ? 'active' : ''}`}
          onClick={() => setActiveTab('invitations')}
        >
          <Mail size={16} />
          <span>Pending Invitations</span>
          {invitations.length > 0 && (
            <span className="admin-tab-badge warning">{invitations.length}</span>
          )}
        </button>
      </div>

      {/* Filters bar */}
      <div className="admin-filters-bar">
        <div className="admin-search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="admin-search-input"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {activeTab === 'members' && (
          <>
            <div className="admin-filter-group">
              <select
                className="admin-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
              >
                <option value="">All Roles</option>
                <option value="technician">Technicians</option>
                <option value="supervisor">Supervisors</option>
                <option value="admin">Administrators</option>
              </select>
            </div>

            <div className="admin-filter-group">
              <select
                className="admin-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="admin-filter-group">
              <select
                className="admin-select"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                aria-label="Filter by site"
              >
                <option value="">All Sites</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} ({site.code})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {activeTab === 'members' ? (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Assigned Sites</th>
                <th>Active Sessions</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading ? (
                <tr>
                  <td colSpan={7} className="table-loading-cell">
                    <RefreshCw size={18} className="spin-icon" />
                    <span>Loading organization members...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty-cell">
                    <Users size={28} />
                    <p>No team members found matching your filters.</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const initials = user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className={`admin-avatar role-${user.role}`}>
                            {initials}
                          </div>
                          <div>
                            <div className="admin-user-name">
                              <strong>{user.name}</strong>
                              {isSelf && <span className="self-badge">You</span>}
                            </div>
                            <span className="admin-user-email">{user.email}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`admin-role-badge role-${user.role}`}>
                          {user.role === 'admin' && <Shield size={12} />}
                          {user.role === 'supervisor' && <ShieldCheck size={12} />}
                          {user.role === 'technician' && <UserCheck size={12} />}
                          <span style={{ textTransform: 'capitalize' }}>
                            {user.role}
                          </span>
                        </span>
                      </td>

                      <td>
                        <span
                          className={`admin-status-badge status-${user.status}`}
                        >
                          <span className="status-dot" />
                          <span style={{ textTransform: 'capitalize' }}>
                            {user.status}
                          </span>
                        </span>
                      </td>

                      <td>
                        <div className="admin-sites-cell">
                          {user.role === 'admin' ? (
                            <span className="all-sites-badge">All Sites</span>
                          ) : user.sites.length === 0 ? (
                            <span className="no-sites-text">None assigned</span>
                          ) : (
                            user.sites.map((site) => (
                              <span key={site.id} className="site-tag">
                                {site.code}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="session-count-badge">
                          <KeyRound size={12} />
                          <span>{user.activeSessionCount}</span>
                        </span>
                      </td>

                      <td>
                        <span className="timestamp-cell">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString(
                                undefined,
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )
                            : 'Never'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="row-action-btn"
                            title="Edit User & Permissions"
                            onClick={() => setEditingUser(user)}
                          >
                            <UserCog size={15} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className="row-action-btn warning"
                            title="Revoke active sessions"
                            onClick={() =>
                              setConfirmAction({
                                type: 'revoke_sessions',
                                target: { id: user.id, name: user.name },
                              })
                            }
                          >
                            <LogOut size={15} />
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              className={`row-action-btn ${
                                user.status === 'active' ? 'danger' : 'success'
                              }`}
                              title={
                                user.status === 'active'
                                  ? 'Deactivate User'
                                  : 'Reactivate User'
                              }
                              onClick={() =>
                                setConfirmAction({
                                  type:
                                    user.status === 'active'
                                      ? 'deactivate'
                                      : 'reactivate',
                                  target: { id: user.id, name: user.name },
                                })
                              }
                            >
                              {user.status === 'active' ? (
                                <UserX size={15} />
                              ) : (
                                <UserCheck size={15} />
                              )}
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
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Invited Recipient</th>
                <th>Assigned Role</th>
                <th>Permitted Sites</th>
                <th>Expires</th>
                <th>Invited By</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitationsQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="table-loading-cell">
                    <RefreshCw size={18} className="spin-icon" />
                    <span>Loading pending invitations...</span>
                  </td>
                </tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty-cell">
                    <Mail size={28} />
                    <p>No pending invitations.</p>
                  </td>
                </tr>
              ) : (
                invitations.map((invite) => {
                  const assignedSites = sites.filter((s) =>
                    invite.siteIds.includes(s.id),
                  );

                  return (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      assignedSites={assignedSites}
                      onRevoke={() =>
                        setConfirmAction({
                          type: 'revoke_invite',
                          target: { id: invite.id, name: invite.email },
                        })
                      }
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <InviteUserModal
          sites={sites}
          onClose={() => setIsInviteModalOpen(false)}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          sites={sites}
          isSelf={editingUser.id === currentUserId}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmActionDialog
          action={confirmAction}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function InviteRow({
  invite,
  assignedSites,
  onRevoke,
}: {
  invite: AdminInvitation;
  assignedSites: AdminUserSite[];
  onRevoke: () => void;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const resendMutation = useMutation({
    mutationFn: () => resendInvitation(invite.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    },
  });

  return (
    <tr>
      <td>
        <div className="admin-user-cell">
          <div className="admin-avatar role-technician">
            <Mail size={16} />
          </div>
          <div>
            <div className="admin-user-name">
              <strong>{invite.name}</strong>
            </div>
            <span className="admin-user-email">{invite.email}</span>
          </div>
        </div>
      </td>

      <td>
        <span className={`admin-role-badge role-${invite.role}`}>
          <span style={{ textTransform: 'capitalize' }}>{invite.role}</span>
        </span>
      </td>

      <td>
        <div className="admin-sites-cell">
          {invite.role === 'admin' ? (
            <span className="all-sites-badge">All Sites</span>
          ) : assignedSites.length === 0 ? (
            <span className="no-sites-text">None assigned</span>
          ) : (
            assignedSites.map((site) => (
              <span key={site.id} className="site-tag">
                {site.code}
              </span>
            ))
          )}
        </div>
      </td>

      <td>
        <span className="timestamp-cell">
          {new Date(invite.expiresAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </td>

      <td>
        <span className="timestamp-cell">{invite.createdBy.name}</span>
      </td>

      <td style={{ textAlign: 'right' }}>
        <div className="admin-row-actions">
          <button
            type="button"
            className="row-action-btn"
            title="Resend invitation and copy link"
            disabled={resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            {copied ? (
              <>
                <Check size={14} style={{ color: '#67d9ec' }} />
                <span style={{ color: '#67d9ec' }}>Copied!</span>
              </>
            ) : (
              <>
                <RefreshCw
                  size={14}
                  className={resendMutation.isPending ? 'spin-icon' : ''}
                />
                <span>Resend</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="row-action-btn danger"
            title="Revoke invitation"
            onClick={onRevoke}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function InviteUserModal({
  sites,
  onClose,
}: {
  sites: AdminUserSite[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'technician' | 'supervisor' | 'admin'>('technician');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    inviteUrl: string;
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: inviteUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      setCreatedResult({ inviteUrl: data.inviteUrl, email: data.invite.email });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to send invitation.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !name.trim()) {
      setError('Name and email are required.');
      return;
    }
    mutation.mutate({
      email: email.trim(),
      name: name.trim(),
      role,
      siteIds: role === 'admin' ? [] : selectedSiteIds,
    });
  };

  const handleCopyLink = () => {
    if (createdResult) {
      navigator.clipboard.writeText(createdResult.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId],
    );
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <UserPlus size={18} className="modal-icon" />
            <h2>Invite New Team Member</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {createdResult ? (
          <div className="invite-success-view">
            <div className="success-badge">
              <CheckCircle2 size={32} />
            </div>
            <h3>Invitation Created!</h3>
            <p>
              An invitation token was generated for <strong>{createdResult.email}</strong>.
              Share this link with them to activate their account and set their password:
            </p>

            <div className="copy-link-box">
              <input
                type="text"
                readOnly
                value={createdResult.inviteUrl}
                className="invite-url-input"
              />
              <button
                type="button"
                className="copy-btn"
                onClick={handleCopyLink}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="admin-primary-btn"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="admin-modal-form">
            {error && (
              <div className="admin-form-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="invite-name">Full Name</label>
              <input
                id="invite-name"
                type="text"
                className="admin-input"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="invite-email">Work Email</label>
              <input
                id="invite-email"
                type="email"
                className="admin-input"
                placeholder="e.g. john@factory.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="invite-role">Role & Permissions</label>
              <select
                id="invite-role"
                className="admin-select full-width"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'technician' | 'supervisor' | 'admin')
                }
              >
                <option value="technician">
                  Technician (Asset search, diagnostics, voice logging, repairs)
                </option>
                <option value="supervisor">
                  Supervisor (Incident triage, reviews, repair sign-off, assignments)
                </option>
                <option value="admin">
                  Administrator (Complete system, user, site, and resource governance)
                </option>
              </select>
            </div>

            {role !== 'admin' && (
              <div className="form-field">
                <label>Assigned Plant Sites</label>
                <p className="form-help-text">
                  Technicians and supervisors can only view and mutate assets located in their assigned sites.
                </p>
                <div className="sites-checkbox-grid">
                  {sites.map((site) => (
                    <label key={site.id} className="site-checkbox-item">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                      />
                      <span>
                        <strong>{site.name}</strong> ({site.code})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="admin-secondary-btn"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-primary-btn"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Generating...' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  sites,
  isSelf,
  onClose,
}: {
  user: AdminUserListItem;
  sites: AdminUserSite[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<'technician' | 'supervisor' | 'admin'>(user.role);
  const [status, setStatus] = useState<'active' | 'disabled'>(user.status);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(
    user.sites.map((s) => s.id),
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof updateAdminUser>[1]) =>
      updateAdminUser(user.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Failed to update user.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      name: name.trim(),
      role,
      status,
      siteIds: role === 'admin' ? [] : selectedSiteIds,
    });
  };

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId],
    );
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal-card">
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <UserCog size={18} className="modal-icon" />
            <h2>Edit User & Permissions</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-modal-form">
          {error && (
            <div className="admin-form-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="edit-email">Email (Immutable)</label>
            <input
              id="edit-email"
              type="email"
              className="admin-input disabled"
              value={user.email}
              disabled
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-name">Full Name</label>
            <input
              id="edit-name"
              type="text"
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="edit-role">Role</label>
            <select
              id="edit-role"
              className="admin-select full-width"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as 'technician' | 'supervisor' | 'admin')
              }
            >
              <option value="technician">Technician</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="edit-status">Account Status</label>
            <select
              id="edit-status"
              className="admin-select full-width"
              value={status}
              disabled={isSelf}
              onChange={(e) =>
                setStatus(e.target.value as 'active' | 'disabled')
              }
            >
              <option value="active">Active (Access Allowed)</option>
              <option value="disabled">Disabled (Immediate Revocation)</option>
            </select>
            {isSelf && (
              <p className="form-help-text">
                You cannot deactivate your own account.
              </p>
            )}
          </div>

          {role !== 'admin' && (
            <div className="form-field">
              <label>Assigned Plant Sites</label>
              <div className="sites-checkbox-grid">
                {sites.map((site) => (
                  <label key={site.id} className="site-checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedSiteIds.includes(site.id)}
                      onChange={() => toggleSite(site.id)}
                    />
                    <span>
                      <strong>{site.name}</strong> ({site.code})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="admin-secondary-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-primary-btn"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmActionDialog({
  action,
  onClose,
}: {
  action: {
    type: 'deactivate' | 'reactivate' | 'revoke_sessions' | 'revoke_invite';
    target: { id: string; name: string };
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (action.type === 'deactivate') {
        return updateAdminUser(action.target.id, { status: 'disabled' });
      }
      if (action.type === 'reactivate') {
        return updateAdminUser(action.target.id, { status: 'active' });
      }
      if (action.type === 'revoke_sessions') {
        return revokeUserSessions(action.target.id);
      }
      if (action.type === 'revoke_invite') {
        return revokeInvitation(action.target.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    },
  });

  const getTitle = () => {
    switch (action.type) {
      case 'deactivate':
        return `Deactivate ${action.target.name}?`;
      case 'reactivate':
        return `Reactivate ${action.target.name}?`;
      case 'revoke_sessions':
        return `Revoke all sessions for ${action.target.name}?`;
      case 'revoke_invite':
        return `Revoke invitation for ${action.target.name}?`;
    }
  };

  const getDescription = () => {
    switch (action.type) {
      case 'deactivate':
        return 'The user will immediately lose access to all FieldMate workspaces and all active browser sessions will be terminated.';
      case 'reactivate':
        return 'The user will regain access to their assigned workspaces with their current credentials.';
      case 'revoke_sessions':
        return 'All active browser sessions for this user will be invalidated immediately. They will have to sign in again.';
      case 'revoke_invite':
        return 'The invitation link will be invalidated immediately and cannot be used to register.';
    }
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal-card confirm-modal">
        <div className="admin-modal-header">
          <div className="modal-title-wrap">
            <ShieldAlert size={20} className="modal-icon warning" />
            <h2>{getTitle()}</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="confirm-body">
          <p>{getDescription()}</p>
          {error && (
            <div className="admin-form-error" style={{ marginTop: '12px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="admin-secondary-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`admin-primary-btn ${
              action.type === 'deactivate' || action.type === 'revoke_invite'
                ? 'danger'
                : ''
            }`}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Processing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
