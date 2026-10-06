import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CornerDownLeft,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  LogOut,
  Ticket,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { api, titleCase } from '../lib';
import { useDebounced } from '../hooks';
import type { Incident, SearchResult } from '../types';
import { Severity } from './common';

type Item = { id: string; label: string; hint?: string; icon: ReactNode; trail?: ReactNode; run: () => void };
type Section = { title: string; items: Item[] };

export function CommandPalette({
  onClose,
  pages,
  incidents,
  goto,
  openIncident,
  newIncident,
  toggleTheme,
  refresh,
  logout,
}: {
  onClose: () => void;
  pages: { id: string; label: string; icon: any }[];
  incidents: Incident[];
  goto: (p: string) => void;
  openIncident: (i: Incident) => void;
  newIncident: () => void;
  toggleTheme: () => void;
  refresh: () => void;
  logout: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [smart, setSmart] = useState<SearchResult | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 250);
  const done = (fn: () => void) => () => {
    onClose();
    fn();
  };

  useEffect(() => {
    if (dq.length < 3) {
      setSmart(null);
      return;
    }
    let live = true;
    api<SearchResult>('/api/v2/ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: dq }),
    })
      .then((r) => live && setSmart(r))
      .catch(() => live && setSmart(null));
    return () => {
      live = false;
    };
  }, [dq]);

  const sections: Section[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: Section[] = [];
    const incidentItems: Item[] =
      smart && smart.results.length && dq === q.trim()
        ? smart.results.slice(0, 6).map((r) => ({
            id: `s-${r.id}`,
            label: r.title,
            hint: `${r.id} · ${r.location}`,
            icon: <Ticket size={16} />,
            trail: <Severity s={r.severity} />,
            run: done(() => {
              const i = incidents.find((x) => x.id === r.id);
              if (i) openIncident(i);
            }),
          }))
        : needle.length >= 2
          ? incidents
              .filter((i) => `${i.id} ${i.title} ${i.location}`.toLowerCase().includes(needle))
              .slice(0, 5)
              .map((i) => ({
                id: `i-${i.id}`,
                label: i.title,
                hint: `${i.id} · ${i.location}`,
                icon: <Ticket size={16} />,
                trail: <Severity s={i.severity} />,
                run: done(() => openIncident(i)),
              }))
          : [];
    if (incidentItems.length)
      out.push({
        title:
          smart && dq === q.trim() && smart.results.length
            ? `Smart search · ${smart.description} (${smart.total})`
            : 'Incidents',
        items: incidentItems,
      });
    const pageItems = pages
      .filter((p) => match(p.label))
      .map((p) => ({
        id: `p-${p.id}`,
        label: `Go to ${p.label}`,
        icon: <p.icon size={16} />,
        trail: <ArrowRight size={14} />,
        run: done(() => goto(p.id)),
      }));
    if (pageItems.length) out.push({ title: 'Navigate', items: pageItems });
    const actions: Item[] = [
      { id: 'a-new', label: 'Report an incident', icon: <Plus size={16} />, run: done(newIncident) },
      { id: 'a-theme', label: 'Toggle dark mode', icon: <Moon size={16} />, run: done(toggleTheme) },
      { id: 'a-refresh', label: 'Refresh data', icon: <RefreshCw size={16} />, run: done(refresh) },
      { id: 'a-out', label: 'Sign out', icon: <LogOut size={16} />, run: done(logout) },
    ].filter((a) => match(a.label));
    if (actions.length) out.push({ title: 'Actions', items: actions });
    return out;
  }, [q, dq, smart, incidents, pages]);

  const flat = sections.flatMap((s) => s.items);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  let index = -1;
  return (
    <div className="paletteOverlay" onMouseDown={(e) => e.currentTarget === e.target && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}>
        <div className="paletteInput">
          <Search size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, or ask: “open electrical issues this week”"
            aria-label="Search commands and incidents"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
          <kbd>esc</kbd>
        </div>
        <div className="paletteList" id="palette-list" role="listbox" ref={listRef}>
          {sections.map((s) => (
            <div key={s.title}>
              <div className="paletteSection">
                {s.title.startsWith('Smart') && <Sparkles size={12} />}
                {s.title}
              </div>
              {s.items.map((it) => {
                index += 1;
                const mine = index;
                return (
                  <button
                    key={it.id}
                    role="option"
                    aria-selected={active === mine}
                    className={`paletteItem${active === mine ? ' active' : ''}`}
                    onMouseMove={() => setActive(mine)}
                    onClick={it.run}
                  >
                    <span className="paletteIcon">{it.icon}</span>
                    <span className="paletteText">
                      <b>{it.label}</b>
                      {it.hint && <small>{it.hint}</small>}
                    </span>
                    {it.trail}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div className="paletteEmpty">
              No results for “{q}”. Try a status, severity or place — e.g. “critical plumbing”.
            </div>
          )}
        </div>
        <div className="paletteFoot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <CornerDownLeft size={11} /> select
          </span>
          <span>{titleCase('smart search runs offline')}</span>
        </div>
      </div>
    </div>
  );
}
