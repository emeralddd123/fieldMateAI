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

