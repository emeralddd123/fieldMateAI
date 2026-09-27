import { useState, type FormEvent } from 'react';
import { KeyRound, MailCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { requestPasswordReset, resetPassword } from './api';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string>();
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await requestPasswordReset(email);
      setResetToken(result.resetToken);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Request a single-use password reset link."
    >
      {sent ? (
        <div className="auth-complete">
          <MailCheck size={30} />
          <h3>Check your reset instructions</h3>
          <p>
            If that account exists, a reset request has been created. Contact
            your administrator while email delivery is being configured.
          </p>
          {resetToken && (
            <Link className="voice-button" to={`/reset-password/${resetToken}`}>
              Continue with development reset
            </Link>
          )}
          <Link className="auth-text-link" to="/login">
            Return to sign in
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>EMAIL</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          <button className="voice-button auth-submit" disabled={submitting}>
            <KeyRound size={17} />
            {submitting ? 'Creating request…' : 'Request password reset'}
          </button>
          <Link className="auth-text-link" to="/login">
            Return to sign in
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
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
      await resetPassword(token, password);
      await auth.refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reset failed.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="This reset link works once."
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
          <KeyRound size={17} />
          {submitting ? 'Saving password…' : 'Set new password'}
        </button>
      </form>
    </AuthLayout>
  );
}
