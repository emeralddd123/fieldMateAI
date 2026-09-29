import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

function landingPath(roles: string[]) {
  if (roles.includes('admin')) return '/admin';
  if (roles.includes('supervisor')) return '/supervisor';
  return '/';
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.session) return;
    const requested = (location.state as { from?: string } | null)?.from;
    navigate(
      requested ??
        landingPath(auth.session.memberships.map((item) => item.role)),
      { replace: true },
    );
  }, [auth.session, location.state, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const session = await auth.login(email, password);
      const requested = (location.state as { from?: string } | null)?.from;
      navigate(
        requested ?? landingPath(session.memberships.map((item) => item.role)),
        { replace: true },
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Sign in was unsuccessful.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Use your FieldMate account to continue."
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>EMAIL</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={320}
          />
        </label>
        <label>
          <span>PASSWORD</span>
          <span className="password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="voice-button auth-submit" disabled={submitting}>
          <LogIn size={17} /> {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <Link className="auth-text-link" to="/forgot-password">
          Forgot your password?
        </Link>
      </form>
    </AuthLayout>
  );
}
