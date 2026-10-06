import type { User } from './types';
export type { User };
export const tokenKey = 'campusconnect_token';
export const api = async <T>(url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem(tokenKey);
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const r = await fetch(url, { ...options, headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status, data: j });
  return j as T;
};
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export const fmt = (d: string) =>
  new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const titleCase = (x: string) => x.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
export const roleLabel = (role: string) =>
  role === 'FacilitiesHead' ? 'Facilities Head' : role === 'SecurityHead' ? 'Security Head' : role;
export const BOOKING_APPROVERS = ['FacilitiesHead', 'Admin', 'Supervisor'];
export const canApproveBookings = (role: string) => BOOKING_APPROVERS.includes(role);
export const canManageUsers = (role: string) => ['Admin', 'FacilitiesHead'].includes(role);
// ALL-CAPS statuses from the booking API read as words, not spaced-out letters.
export const statusLabel = (s: string) =>
  s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : titleCase(s);
export const isManagement = (role: string) =>
  ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'].includes(role);

// Mirrors the server's role → allowed command table (the server still enforces it).
export const ROLE_ACTIONS: Record<string, string[]> = {
  Student: [],
  Maintenance: ['assign', 'start', 'markDone', 'undo'],
  Security: ['assign', 'start', 'markDone', 'undo'],
  IT: ['assign', 'start', 'markDone', 'undo'],
  Supervisor: ['assign', 'start', 'markDone', 'approve', 'sendBack', 'resolve', 'reopen', 'undo'],
  FacilitiesHead: [
    'assign',
    'start',
    'markDone',
    'approve',
    'sendBack',
    'resolve',
    'reject',
    'reopen',
    'close',
    'undo',
  ],
  SecurityHead: [
    'assign',
    'start',
    'markDone',
    'approve',
    'sendBack',
    'resolve',
    'reject',
    'reopen',
    'close',
    'undo',
  ],
  Admin: [
    'assign',
    'start',
    'markDone',
    'approve',
    'sendBack',
    'resolve',
    'reject',
    'reopen',
    'close',
    'undo',
  ],
};
export const formatHours = (h: number) => {
  const a = Math.abs(h);
  return a >= 48
    ? `${Math.round(a / 24)}d`
    : a >= 1
      ? `${Math.round(a)}h`
      : `${Math.max(1, Math.round(a * 60))}m`;
};
