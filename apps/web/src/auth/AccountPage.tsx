import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { changePassword } from './api';
import { useAuth } from './AuthProvider';
import { UserMenu } from './UserMenu';

export function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const session = auth.session!;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setStatus('error');
      setMessage('The new passwords do not match.');
      return;
    }
    setStatus('saving');
    setMessage('');
    try {
      await changePassword(currentPassword, newPassword);
      await auth.refresh();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setStatus('saved');
      setMessage('Password changed. Your current session was rotated.');
    } catch (caught) {
      setStatus('error');
      setMessage(
        caught instanceof Error ? caught.message : 'Password change failed.',
      );
    }
  };

  return (
    <div className="account-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          FieldMate<span className="brand-ai">AI</span>
        </Link>
        <UserMenu />
      </header>
      <main className="account-main">
        <section className="account-summary">
          <ShieldCheck size={25} />
          <div>
            <span className="panel-kicker">ACCOUNT</span>
            <h1>{session.user.name}</h1>
            <p>{session.user.email}</p>
          </div>
        </section>
        <section className="account-card">
          <h2>
            <KeyRound size={19} /> Change password
          </h2>
          <p>
            Use at least 12 characters. Other signed-in sessions are revoked.
          </p>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>CURRENT PASSWORD</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label>
              <span>NEW PASSWORD</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                required
              />
            </label>
            <label>
              <span>CONFIRM NEW PASSWORD</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={12}
                required
              />
            </label>
            {message && (
              <p className={`auth-message ${status}`} role="status">
                {message}
              </p>
            )}
            <button className="voice-button" disabled={status === 'saving'}>
              {status === 'saving' ? 'Changing password…' : 'Change password'}
            </button>
          </form>
        </section>
        <section className="account-card account-danger-card">
          <h2>
            <LogOut size={19} /> Active sessions
          </h2>
          <p>Sign out this browser or revoke every session for your account.</p>
          <div className="account-actions">
            <button
              className="secondary-button"
              onClick={async () => {
                await auth.logout();
                navigate('/login', { replace: true });
              }}
            >
              Sign out
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                await auth.logout(true);
                navigate('/login', { replace: true });
              }}
            >
              Sign out everywhere
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
