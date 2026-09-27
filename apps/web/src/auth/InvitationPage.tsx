import { useState, type FormEvent } from 'react';
import { UserCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { acceptInvitation } from './api';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

export function InvitationPage() {
  const { token = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await acceptInvitation(token, password);
      await auth.refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Invitation setup failed.',
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout
      title="Activate your account"
      subtitle="Set a password to accept your FieldMate invitation."
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>NEW PASSWORD</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          <span>CONFIRM PASSWORD</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
        <button className="voice-button auth-submit" disabled={submitting}>
          <UserCheck size={17} />
          {submitting ? 'Activating…' : 'Activate account'}
        </button>
      </form>
    </AuthLayout>
  );
}
