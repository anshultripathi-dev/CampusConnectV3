import { useEffect, useState } from 'react';
import { api, tokenKey } from './lib';
import type { StaffMember } from './types';

// Fetches an auth-protected image and exposes it as an object URL (an <img> tag
// cannot send the Bearer token itself).
export function useAuthedImage(url: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('bad response'))))
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return { src, failed };
}

export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// id → display name for staff, fetched once per session and shared by every component.
let staffNames: Promise<Record<string, string>> | null = null;
export function useStaffNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    staffNames ||= api<StaffMember[]>('/api/v2/staff')
      .then((list) => Object.fromEntries(list.map((s) => [s.id, s.name])))
      .catch(() => ((staffNames = null), {}));
    staffNames.then(setNames);
  }, []);
  return names;
}
