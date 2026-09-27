import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function UserMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const session = auth.session!;
  const membership = session.memberships[0];
  const initials = session.user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <div className="user-menu">
      <span className="user-menu-identity">
        <span className="avatar" title={session.user.name}>
          {initials}
        </span>
        <span>
          <strong>{session.user.name}</strong>
          <small>{membership?.role ?? 'user'}</small>
        </span>
      </span>
      <Link className="topbar-icon-link" to="/account" title="Account settings">
        <Settings size={15} />
      </Link>
      {auth.hasRole('admin') && (
        <Link className="topbar-icon-link" to="/admin" title="Administration">
          <ShieldCheck size={15} />
        </Link>
      )}
      <button
        className="topbar-icon-link"
        title="Sign out"
        onClick={async () => {
          await auth.logout();
          navigate('/login', { replace: true });
        }}
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}
