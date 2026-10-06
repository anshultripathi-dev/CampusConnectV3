import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  Loader2,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  Workflow,
} from 'lucide-react';
import { api, tokenKey, User } from './lib';

type AuthResult = { token: string; user: User };
type AuthConfig = { googleClientId: string | null; demoMode: boolean };
const loginKey = 'campusconnect_last_login';
const themeKey = 'campusconnect_theme';

const demoAccounts = [
  { id: 'student@campusconnect.local', role: 'Student', detail: 'Report issues, book spaces' },
  { id: 'u-101', role: 'Maintenance', detail: 'Field work queue' },
  { id: 'u-102', role: 'Supervisor', detail: 'SLA & approvals' },
  { id: 'u-201', role: 'Security', detail: 'Safety response' },
  { id: 'u-103', role: 'Facilities Head', detail: 'Campus governance' },
];
const features = [
  {
    icon: Radio,
    title: 'Live operations',
    text: 'Incidents, bookings and alerts stream to every workspace in real time.',
  },
  {
    icon: Workflow,
    title: 'Rules-based routing',
    text: 'Reports reach the right team automatically, with SLA tracking and an audit trail.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-safe access',
    text: 'Students, crews and leadership each see only what their role allows.',
  },
];

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [config, setConfig] = useState<AuthConfig>({ googleClientId: null, demoMode: false });
  const [login, setLogin] = useState(() => {
    try {
      return localStorage.getItem(loginKey) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState<'' | 'password' | 'google'>('');
  const [error, setError] = useState('');
  const [googleOffline, setGoogleOffline] = useState(false);
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains('dark') || localStorage.getItem(themeKey) === 'dark',
  );
  const googleBtn = useRef<HTMLDivElement>(null);
  const loginInput = useRef<HTMLInputElement>(null);
  const finishRef = useRef<(r: AuthResult) => void>(() => {});

  finishRef.current = (r: AuthResult) => {
    try {
      localStorage.setItem(tokenKey, r.token);
    } catch {}
    onLogin(r.user);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(themeKey, dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);

  useEffect(() => {
    api<AuthConfig>('/api/v2/auth/config')
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!config.googleClientId) return;
    let cancelled = false;
    const init = () => {
      const g = (window as any).google?.accounts?.id;
      const host = googleBtn.current;
      if (cancelled || !g || !host) return;
      g.initialize({
        client_id: config.googleClientId,
        callback: async (resp: { credential: string }) => {
          setBusy('google');
          setError('');
          try {
            finishRef.current(
              await api<AuthResult>('/api/v2/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: resp.credential }),
              }),
            );
          } catch (x) {
            setError(x instanceof Error ? x.message : 'Google sign-in failed');
            setBusy('');
          }
        },
      });
      host.innerHTML = '';
      g.renderButton(host, {
        theme: dark ? 'filled_black' : 'outline',
        size: 'large',
        width: Math.min(host.offsetWidth || 360, 400),
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
      });
    };
    if ((window as any).google?.accounts?.id) {
      init();
    } else {
      let script = document.getElementById('gsi-script') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'gsi-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onerror = () => setGoogleOffline(true);
        document.body.appendChild(script);
      }
      script.addEventListener('load', init);
      // On networks that silently drop packets the script neither loads nor errors; give up after a few seconds.
      const timer = setTimeout(() => {
        if (!(window as any).google?.accounts?.id) setGoogleOffline(true);
      }, 4000);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        script?.removeEventListener('load', init);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [config.googleClientId, dark]);

  const signIn = async (id: string, pw: string) => {
    setBusy('password');
    setError('');
    try {
      const r = await api<AuthResult>('/api/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: id, password: pw }),
      });
      try {
        remember ? localStorage.setItem(loginKey, id) : localStorage.removeItem(loginKey);
      } catch {}
      finishRef.current(r);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Sign-in failed');
      setBusy('');
      loginInput.current?.focus();
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError('Enter your campus ID or email and your password.');
      return;
    }
    signIn(login.trim(), password);
  };
  const demo = async (id: string) => {
    setLogin(id);
    setError('');
    try {
      const d = await api<{ password: string }>('/api/v2/auth/demo-users');
      setPassword(d.password);
      signIn(id, d.password);
    } catch {
      setError('Demo accounts are not available.');
    }
  };
  const working = busy !== '';

  return (
    <div className="lg">
      <aside className="lgHero" aria-hidden={false}>
        <div className="lgHeroInner">
          <div className="lgBrand">
            <span className="lgMark">
              <LifeBuoy size={22} />
            </span>
            <div>
              <b>CampusConnect</b>
              <small>Campus Operations OS</small>
            </div>
          </div>
          <div className="lgPitch">
            <span className="lgTag">
              <span className="lgPulse" />
              All systems operational
            </span>
            <h1>
              Every campus issue,
              <br />
              resolved in <em>real time</em>.
            </h1>
            <p>
              One command center for incidents, room bookings and campus health — built for the people who
              keep campus running.
            </p>
          </div>
          <ul className="lgFeatures">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="lgFeatIcon">
                  <Icon size={17} />
                </span>
                <div>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="lgStats">
            <div>
              <strong>23</strong>
              <span>GoF patterns</span>
            </div>
            <div>
              <strong>8</strong>
              <span>Role workspaces</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>SLA tracking</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="lgPanel">
        <button
          type="button"
          className="lgTheme"
          onClick={() => setDark((d) => !d)}
          aria-label={dark ? 'Use light theme' : 'Use dark theme'}
          title={dark ? 'Light theme' : 'Dark theme'}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="lgCard">
          <div className="lgMobileBrand">
            <span className="lgMark">
              <LifeBuoy size={20} />
            </span>
            <b>CampusConnect</b>
          </div>
          <div className="lgHead">
            <h2>Welcome back</h2>
            <p>Sign in to open your workspace.</p>
          </div>

          {config.googleClientId && googleOffline && (
            <p className="lgOfflineNote">
              Google sign-in needs an internet connection — use your campus ID below.
            </p>
          )}
          {config.googleClientId && !googleOffline && (
            <>
              <div
                className={`googleBtn${busy === 'google' ? ' busy' : ''}`}
                ref={googleBtn}
                aria-label="Continue with Google"
              />
              <div className="authDivider">
                <span>or use your campus ID</span>
              </div>
            </>
          )}

          <form className="lgForm" onSubmit={submit} noValidate>
            <label htmlFor="lg-login">
              <span>Campus ID or email</span>
              <input
                id="lg-login"
                ref={loginInput}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="u-101 or you@campus.edu"
                autoFocus={!login}
                aria-invalid={!!error}
              />
            </label>
            <label htmlFor="lg-password">
              <span>Password</span>
              <span className="pwField">
                <input
                  id="lg-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
                  onBlur={() => setCaps(false)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  autoFocus={!!login}
                  aria-invalid={!!error}
                />
                <button
                  type="button"
                  className="pwToggle"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
              {caps && (
                <small className="lgCaps">
                  <AlertTriangle size={12} />
                  Caps Lock is on
                </small>
              )}
            </label>
            <div className="lgRow">
              <label className="lgCheck">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Remember my ID</span>
              </label>
              <span className="lgHelp">Forgot password? Contact campus IT.</span>
            </div>
            {error && (
              <div className="lgError" role="alert">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}
            <button className="lgSubmit" disabled={working}>
              {busy === 'password' ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <KeyRound size={16} />
                  Sign in
                  <ArrowRight size={16} className="lgArrow" />
                </>
              )}
            </button>
          </form>

          {config.demoMode && (
            <section className="lgDemo" aria-label="Demo workspaces">
              <div className="lgDemoHead">
                <span>Try a demo workspace</span>
                <small>One click, no password</small>
              </div>
              <div className="lgDemoGrid">
                {demoAccounts.map((a) => (
                  <button type="button" key={a.id} onClick={() => demo(a.id)} disabled={working}>
                    <Building2 size={14} />
                    <span>
                      <b>{a.role}</b>
                      <small>{a.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="lgFoot">
            <ShieldCheck size={13} />
            Sessions are encrypted in transit and expire after 8 hours.
          </div>
        </div>
      </section>
    </div>
  );
}
