import { Construction, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';

export function ForbiddenPage() {
  return (
    <main className="auth-state-page">
      <ShieldX size={38} />
      <h1>Access not permitted</h1>
      <p>Your FieldMate role does not include this workspace.</p>
      <Link className="voice-button" to="/">
        Return to your workspace
      </Link>
    </main>
  );
}

export function AdminPlaceholder() {
  return (
    <div className="account-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          FieldMate<span className="brand-ai">AI</span>
        </Link>
        <UserMenu />
      </header>
      <main className="auth-state-page">
        <Construction size={38} />
        <span className="panel-kicker">ADMINISTRATION</span>
        <h1>Admin workspace foundation ready</h1>
        <p>User and resource management screens arrive in Phases 4–6.</p>
        <Link className="voice-button" to="/">
          Open maintenance workspace
        </Link>
      </main>
    </div>
  );
}
