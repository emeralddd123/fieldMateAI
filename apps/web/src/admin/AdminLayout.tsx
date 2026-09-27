import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Building2,
  Cpu,
  FileText,
  History,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { UserMenu } from '../auth/UserMenu';

export function AdminLayout() {
  const auth = useAuth();
  const membership = auth.session?.memberships[0];

  return (
    <div className="admin-shell">
      <header className="topbar admin-topbar">
        <div className="topbar-left">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Cpu size={22} />
            </span>
            <span>
              FieldMate<span className="brand-ai">AI</span>
              <small>ADMINISTRATION WORKSPACE</small>
            </span>
          </Link>

          <nav className="workspace-nav" aria-label="Workspace navigation">
            <Link to="/" className="workspace-tab">
              <Activity size={14} />
              <span>Technician</span>
            </Link>
            <Link to="/supervisor" className="workspace-tab">
              <ShieldCheck size={14} />
              <span>Supervisor</span>
            </Link>
            <Link to="/admin" className="workspace-tab active">
              <Users size={14} />
              <span>Administration</span>
            </Link>
          </nav>
        </div>

        <div className="topbar-right">
          {membership && (
            <div className="org-pill">
              <Building2 size={13} />
              <span>{membership.organization.name}</span>
            </div>
          )}
          <UserMenu />
        </div>
      </header>

      <div className="admin-subnav-bar">
        <div className="admin-subnav-inner">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <LayoutDashboard size={15} />
            <span>Overview</span>
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <Users size={15} />
            <span>Users & Access</span>
          </NavLink>
          <NavLink
            to="/admin/sites"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <Building2 size={15} />
            <span>Sites</span>
          </NavLink>
          <NavLink
            to="/admin/assets"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <Cpu size={15} />
            <span>Machines</span>
          </NavLink>
          <NavLink
            to="/admin/faults"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <AlertTriangle size={15} />
            <span>Fault Codes</span>
          </NavLink>
          <NavLink
            to="/admin/procedures"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <FileText size={15} />
            <span>Procedures</span>
          </NavLink>
          <NavLink
            to="/admin/audit"
            className={({ isActive }) =>
              `admin-subnav-link ${isActive ? 'active' : ''}`
            }
          >
            <History size={15} />
            <span>Audit Log</span>
          </NavLink>
        </div>
      </div>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
