import type { ReactNode } from 'react';
import { AudioLines, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link
          to="/"
          className="brand auth-brand"
          aria-label="FieldMate AI home"
        >
          <span className="brand-mark">
            <AudioLines size={26} />
          </span>
          <span>
            FieldMate<span className="brand-ai">AI</span>
            <small>MAINTENANCE INTELLIGENCE</small>
          </span>
        </Link>
        <div>
          <span className="panel-kicker">SECURE PLANT ACCESS</span>
          <h1>Every machine. Every repair. The right people.</h1>
          <p>
            Sign in to reach the maintenance workspace assigned to your team and
            site.
          </p>
        </div>
        <small className="auth-safety-copy">
          <ShieldCheck size={15} /> Sessions are revocable and credentials stay
          on the server.
        </small>
      </section>
      <section className="auth-form-panel">
        <div className="auth-card">
          <header>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </header>
          {children}
        </div>
      </section>
    </main>
  );
}
