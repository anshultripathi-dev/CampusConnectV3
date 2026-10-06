import { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { api, tokenKey } from './lib';
import type { User } from './types';
import { Console } from './Console';
import Login from './Login';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem(tokenKey)) {
      setChecking(false);
      return;
    }
    api<{ user: User }>('/api/v2/auth/me')
      .then((x) => setUser(x.user))
      .catch(() => localStorage.removeItem(tokenKey))
      .finally(() => setChecking(false));
  }, []);
  if (checking)
    return (
      <div className="authLoading">
        <LifeBuoy size={28} />
        Loading CampusConnect…
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Console
      user={user}
      onLogout={() => {
        api('/api/v2/auth/logout', { method: 'POST' }).catch(() => {});
        localStorage.removeItem(tokenKey);
        setUser(null);
      }}
    />
  );
}
