import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Cpu,
  FileText,
  History,
  Mail,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { fetchAdminInvitations, fetchAdminSites, fetchAdminUsers } from './adminApi';

export function AdminOverviewPage() {
  const auth = useAuth();
  const membership = auth.session?.memberships[0];

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', 'overview'],
    queryFn: () => fetchAdminUsers({ limit: 1 }),
  });

  const sitesQuery = useQuery({
    queryKey: ['admin', 'sites'],
    queryFn: fetchAdminSites,
  });

  const invitesQuery = useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: fetchAdminInvitations,
  });

  const totalUsers = usersQuery.data?.pagination.total ?? 0;
  const totalSites = sitesQuery.data?.length ?? 0;
  const pendingInvites = invitesQuery.data?.length ?? 0;

  return (
    <div className="admin-page-container">
      <div className="admin-header-row">
        <div>
          <span className="panel-kicker">ADMINISTRATION OVERVIEW</span>
          <h1 className="admin-page-title">
            {membership?.organization.name ?? 'Organization'} Console
          </h1>
          <p className="admin-page-desc">
            Manage organization members, facility sites, equipment inventories, and security settings.
          </p>
        </div>
        <div className="admin-header-actions">
          <Link to="/admin/users" className="admin-primary-btn">
            <Users size={15} />
            <span>Manage Team</span>
          </Link>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap user-icon">
            <Users size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Team Members</span>
            <div className="admin-kpi-value">{totalUsers}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap site-icon">
            <Building2 size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Active Sites</span>
            <div className="admin-kpi-value">{totalSites}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap invite-icon">
            <Mail size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">Pending Invites</span>
            <div className="admin-kpi-value">{pendingInvites}</div>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon-wrap security-icon">
            <ShieldCheck size={20} />
          </div>
          <div>
            <span className="admin-kpi-label">RBAC Status</span>
            <div className="admin-kpi-value" style={{ fontSize: '18px', color: '#67d9ec' }}>
              Enforced
            </div>
          </div>
        </div>
      </div>

      <h2 className="admin-section-title">Administrative Sections</h2>
      <div className="admin-cards-grid">
        <Link to="/admin/users" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap user-icon">
              <Users size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>Users & Access Control</h3>
          <p>
            Invite team members, assign technician and supervisor roles, manage multi-site permissions, and revoke active sessions.
          </p>
          <div className="admin-card-tag">Phase 4 Active</div>
        </Link>

        <Link to="/admin/sites" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap site-icon">
              <Building2 size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>Manufacturing Sites</h3>
          <p>
            Configure physical plant locations, code identifiers, and regional operating boundaries.
          </p>
          <div className="admin-card-tag">Phase 5 Active</div>
        </Link>

        <Link to="/admin/assets" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap asset-icon">
              <Cpu size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>Machines & Equipment</h3>
          <p>
            Create and maintain critical production machinery, electrical nominal specs, VFDs, and components.
          </p>
          <div className="admin-card-tag">Phase 5 Active</div>
        </Link>

        <Link to="/admin/faults" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap fault-icon">
              <AlertTriangle size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>Fault Codes & Diagnostics</h3>
          <p>
            Standardize manufacturer diagnostics, symptoms, probable causes, and verified solutions.
          </p>
          <div className="admin-card-tag pending">Phase 6</div>
        </Link>

        <Link to="/admin/procedures" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap proc-icon">
              <FileText size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>SOPs & Safety Procedures</h3>
          <p>
            Draft, review, approve, and withdraw step-by-step guidance used by voice assistance.
          </p>
          <div className="admin-card-tag pending">Phase 6</div>
        </Link>

        <Link to="/admin/audit" className="admin-nav-card">
          <div className="admin-nav-card-header">
            <div className="admin-kpi-icon-wrap audit-icon">
              <History size={20} />
            </div>
            <ChevronRight size={18} className="chevron" />
          </div>
          <h3>Security & Audit Trail</h3>
          <p>
            Review immutable event records for authentications, role changes, deactivations, and mutations.
          </p>
          <div className="admin-card-tag pending">Phase 7</div>
        </Link>
      </div>
    </div>
  );
}
