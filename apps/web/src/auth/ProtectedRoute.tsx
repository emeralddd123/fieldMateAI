import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { RefreshCw, ShieldX } from 'lucide-react';
import { useAuth } from './AuthProvider';
import type { UserRole } from './api';

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isPending)
    return (
      <main className="auth-state-page" role="status">
        <RefreshCw className="spin" size={30} />
        <h1>Loading your workspace</h1>
      </main>
    );
  if (auth.isError)
    return (
      <main className="auth-state-page" role="alert">
        <ShieldX size={32} />
        <h1>Authentication service unavailable</h1>
        <button className="voice-button" onClick={() => void auth.refresh()}>
          Try again
        </button>
      </main>
    );
  if (!auth.session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !auth.hasRole(...roles))
    return <Navigate to="/forbidden" replace />;
  return (
    <Outlet
      key={`${auth.session.user.id}:${auth.session.memberships[0]?.organization.id}`}
    />
  );
}
