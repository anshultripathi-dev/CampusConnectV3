import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Search, Users as UsersIcon } from 'lucide-react';
import { api, roleLabel } from '../lib';
import type { ManagedUser, User } from '../types';
import { Empty, Panel } from '../components/common';

type Directory = { users: ManagedUser[]; roles: string[]; departments: { id: string; name: string }[] };
const DEPT_REQUIRED = ['Maintenance', 'Security', 'IT'];
const ROLE_HINT: Record<string, string> = {
  Student: 'Reports issues and books spaces',
  Maintenance: 'Works the Maintenance queue',
  Security: 'Works the Security queue',
  IT: 'Works the IT queue',
  Supervisor: 'Approves work and bookings',
  FacilitiesHead: 'Full management, bookings and users',
  SecurityHead: 'Management for safety incidents',
  Admin: 'Full management, bookings and users',
};
const post = (url: string, body?: object) =>
  api<any>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

export function UsersPage({ user, onToast }: { user: User; onToast: (m: string) => void }) {
  const [dir, setDir] = useState<Directory | null>(null);
  const [draft, setDraft] = useState<Record<string, { role: string; departmentId: string }>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);

  const load = () =>
    api<Directory>('/api/v2/users')
      .then(setDir)
      .catch((e) => onToast(e.message));
  useEffect(() => {
    load();
  }, []);
  const rows = useMemo(
    () =>
      (dir?.users || []).filter((u) =>
        `${u.name} ${u.email} ${u.role} ${u.department || ''}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [dir, query],
  );
  const current = (u: ManagedUser) => draft[u.id] || { role: u.role, departmentId: u.departmentId || '' };
  const dirty = (u: ManagedUser) =>
    current(u).role !== u.role || current(u).departmentId !== (u.departmentId || '');
  const set = (u: ManagedUser, patch: Partial<{ role: string; departmentId: string }>) =>
    setDraft((d) => {
      const next = { ...current(u), ...patch };
      if (patch.role === 'Student') next.departmentId = '';
      return { ...d, [u.id]: next };
    });

  const save = async (u: ManagedUser) => {
    setBusy(u.id);
    try {
      await post(`/api/v2/users/${u.id}/role`, current(u));
      onToast(`${u.name} is now ${roleLabel(current(u).role)}`);
      setDraft(({ [u.id]: _, ...rest }) => rest);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not update user');
    } finally {
      setBusy(null);
    }
  };
  const reset = async (u: ManagedUser) => {
    if (!window.confirm(`Reset the password for ${u.name}? They will be signed out everywhere.`)) return;
    setBusy(u.id);
    try {
      const r = await post(`/api/v2/users/${u.id}/reset-password`);
      setTemp({ name: u.name, password: r.temporaryPassword });
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not reset password');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="page">
      <div className="pageHead">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Users &amp; roles</h1>
          <p>Decide who can do what. Changes apply immediately and are written to the audit log.</p>
        </div>
        <div className="heroBadge">
          <UsersIcon size={16} /> {dir?.users.length ?? 0} accounts
        </div>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, role or department…"
          />
        </div>
      </div>
      <Panel title={`${rows.length} users`} icon={<UsersIcon size={17} />}>
        <div className="userTable">
          <div className="userRow th">
            <span>Person</span>
            <span>Role</span>
            <span>Department</span>
            <span>Sign-in</span>
            <span />
          </div>
          {rows.map((u) => {
            const me = u.id === user.id;
            const c = current(u);
            return (
              <div className="userRow" key={u.id}>
                <span>
                  <b>
                    {u.name} {me && <em className="youTag">You</em>}
                  </b>
                  <small>{u.email}</small>
                </span>
                <span>
                  <select
                    value={c.role}
                    disabled={me}
                    onChange={(e) => set(u, { role: e.target.value })}
                    aria-label={`Role for ${u.name}`}
                  >
                    {dir?.roles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                  <small>{ROLE_HINT[c.role]}</small>
                </span>
                <span>
                  <select
                    value={c.departmentId}
                    disabled={me || c.role === 'Student'}
                    onChange={(e) => set(u, { departmentId: e.target.value })}
                    aria-label={`Department for ${u.name}`}
                  >
                    <option value="">{DEPT_REQUIRED.includes(c.role) ? 'Choose…' : 'Campus-wide'}</option>
                    {dir?.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="signIns">
                  {u.signIn.length ? (
                    u.signIn.map((s) => (
                      <em key={s} className="chip">
                        {s === 'google' ? 'Google' : 'Password'}
                      </em>
                    ))
                  ) : (
                    <em className="chip">None</em>
                  )}
                </span>
                <span className="rowActions">
                  <button
                    className="primary"
                    disabled={
                      !dirty(u) || busy === u.id || (DEPT_REQUIRED.includes(c.role) && !c.departmentId)
                    }
                    onClick={() => save(u)}
                  >
                    Save
                  </button>
                  <button
                    className="secondary"
                    disabled={me || busy === u.id}
                    onClick={() => reset(u)}
                    title="Issue a temporary password"
                  >
                    <KeyRound size={14} /> Reset
                  </button>
                </span>
              </div>
            );
          })}
          {!rows.length && <Empty text="No users match your search" />}
        </div>
      </Panel>
      {temp && (
        <div className="overlay centered" onMouseDown={(e) => e.currentTarget === e.target && setTemp(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Temporary password">
            <span className="eyebrow">PASSWORD RESET</span>
            <h2>Temporary password for {temp.name}</h2>
            <p>Share it privately. It is shown only once, and they should change it after signing in.</p>
            <div className="secretBox">
              <code>{temp.password}</code>
              <button
                className="secondary"
                onClick={() => navigator.clipboard?.writeText(temp.password).then(() => onToast('Copied'))}
              >
                <Copy size={14} /> Copy
              </button>
            </div>
            <div className="dialogBtns">
              <button className="primary" onClick={() => setTemp(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
