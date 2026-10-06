import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { api, roleLabel } from '../lib';
import type { User } from '../types';

export function AccountDialog({
  user,
  onClose,
  onToast,
}: {
  user: User;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== again) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api('/api/v2/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      onToast('Password changed. Other devices were signed out.');
      onClose();
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay centered" onMouseDown={(e) => e.currentTarget === e.target && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="My account"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <button className="iconBtn dialogClose" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
        <span className="eyebrow">MY ACCOUNT</span>
        <h2>{user.name}</h2>
        <p>
          {user.email} · {roleLabel(user.role)}
          {user.department ? ` · ${user.department}` : ''}
        </p>
        <form className="form" onSubmit={submit}>
          <label>
            Current password
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <small>At least 8 characters.</small>
          </label>
          <label>
            Repeat new password
            <input
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <div className="formError">{error}</div>}
          <div className="dialogBtns">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              <KeyRound size={15} /> {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
