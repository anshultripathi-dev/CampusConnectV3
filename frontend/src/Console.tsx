import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Users as UsersIcon,
  ShieldCheck,
  Sun,
  Ticket,
  Workflow,
} from 'lucide-react';
import {
  api,
  tokenKey,
  initials,
  titleCase,
  roleLabel,
  isManagement,
  canApproveBookings,
  canManageUsers,
} from './lib';
import type { Incident, Overview, Trace, Notification, RiskMap, User } from './types';
import { OverviewPage } from './pages/OverviewPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { BookingsPage } from './pages/BookingsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AuditPage } from './pages/AuditPage';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { IncidentDrawer } from './components/IncidentDrawer';
import { IncidentReportPage } from './pages/IncidentReportPage';
import { NotificationPanel } from './components/NotificationPanel';
import { CommandPalette } from './components/CommandPalette';
import { AccountDialog } from './components/AccountDialog';
import { UsersPage } from './pages/UsersPage';

export function Console({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [page, setPage] = useState('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [risks, setRisks] = useState<RiskMap>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bookingTick, setBookingTick] = useState(0);
  const [commentTick, setCommentTick] = useState(0);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Incident | null>(null);
  const [live, setLive] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dark, setDark] = useState(() => localStorage.getItem('campusconnect_theme') === 'dark');
  const load = async () => {
    setLoading(true);
    try {
      const [o, i, t, n, r] = await Promise.all([
        api<Overview>('/api/v2/dashboard/overview'),
        api<Incident[]>('/api/v2/incidents'),
        api<Trace[]>('/api/v2/architecture/traces'),
        api<Notification[]>('/api/v2/notifications'),
        api<RiskMap>('/api/v2/ai/risk').catch(() => ({}) as RiskMap),
      ]);
      setOverview(o);
      setIncidents(i);
      setTraces(t);
      setNotifications(n);
      setRisks(r);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('campusconnect_theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const token = localStorage.getItem(tokenKey);
    if (!token) return;
    const socket = io({ auth: { token } });
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('connect_error', () => setLive(false));
    socket.on('incident.created', (e: any) => {
      setToast(`New incident: ${e.incident?.id || 'received'}`);
      load();
    });
    socket.on('incident.updated', (e: any) => {
      if (e.incident?.id === selected?.id) setSelected(e.incident);
      setToast(`${e.incident?.id || 'Incident'} updated`);
      load();
    });
    socket.on('booking.created', () => {
      setToast(
        canApproveBookings(user.role) ? 'New booking request awaiting approval' : 'Booking request sent',
      );
      setBookingTick((t) => t + 1);
      load();
    });
    socket.on('incident.comment', () => {
      setCommentTick((t) => t + 1);
      load();
    });
    socket.on('booking.updated', (e: any) => {
      const s = String(e?.booking?.status || '').toLowerCase();
      if (e?.booking?.requester_id === user.id && s) setToast(`Your booking was ${s}`);
      setBookingTick((t) => t + 1);
      load();
    });
    socket.on('notification.created', (e: any) => {
      // The server only sends alerts addressed to this user, their department or management.
      if (e) setNotifications((n) => (n.some((x) => x.id === e.id) ? n : [e, ...n]));
    });
    return () => {
      socket.disconnect();
    };
  }, [user.id]);
  const unread = notifications.filter((n) => !n.read_at).length;
  const management = isManagement(user.role);
  const canAudit = ['Supervisor', 'FacilitiesHead', 'SecurityHead', 'Admin'].includes(user.role);
  const pendingBookings = overview?.pendingBookings ?? 0;
  const canAnalytics =
    management || user.role === 'Maintenance' || user.role === 'Security' || user.role === 'IT';
  const nav = [
    ['overview', 'Overview', LayoutDashboard, true],
    ['incidents', user.role === 'Student' ? 'My Incidents' : 'Incidents', Ticket, true],
    ['resources', 'Resources', Building2, true],
    ['bookings', 'Bookings', CalendarDays, true],
    ...(canAnalytics ? [['analytics', 'Analytics', BarChart3, true]] : []),
    ['architecture', 'Architecture', Workflow, true],
    ...(canAudit ? [['audit', 'Audit Log', FileClock, true]] : []),
    ...(canManageUsers(user.role) ? [['users', 'Users', UsersIcon, true]] : []),
  ];
  const palettePages = nav.map(([id, label, icon]: any) => ({ id, label, icon }));
  const filtered = useMemo(
    () =>
      incidents.filter((i) =>
        [i.id, i.title, i.category, i.location, i.department, i.status, i.severity]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [incidents, query],
  );
  const act = async (
    id: string,
    action: string,
    opts: { open?: boolean; body?: object; rethrow?: boolean } = {},
  ) => {
    try {
      if (action === 'escalate') {
        const r = await api<any>(`/api/v2/incidents/${id}/escalate`, { method: 'POST' });
        setToast(r.message || 'Escalation evaluated');
        load();
        return;
      }
      if (action === 'undo') {
        const r = await api<{ ticket: Incident; message: string }>(`/api/v2/incidents/${id}/undo`, {
          method: 'POST',
        });
        setSelected(r.ticket);
        setToast(r.message);
        load();
        return;
      }
      const r = await api<{ ticket: Incident }>(`/api/v2/incidents/${id}/command/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts.body || {}),
      });
      if (opts.open !== false) setSelected(r.ticket);
      setToast(`${id} moved to ${r.ticket.status}`);
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Action failed');
      if (opts.rethrow) throw e;
    }
  };
  const markRead = async (id: number) => {
    await api(`/api/v2/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)));
  };
  const markAllRead = async () => {
    await api('/api/v2/notifications/read-all', { method: 'POST' }).catch(() => {});
    setNotifications((n) => n.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
  };
  const openNotification = (n: Notification) => {
    markRead(n.id);
    setNotificationOpen(false);
    if (n.reference_type === 'booking') setPage('bookings');
    else if (n.reference_type === 'incident' && n.reference_id) {
      const i = incidents.find((x) => x.id === n.reference_id);
      if (i) setSelected(i);
      else setPage('incidents');
    }
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <LifeBuoy size={22} />
          </div>
          <div>
            <b>CampusConnect</b>
            <span>Campus Operations OS</span>
          </div>
        </div>
        <div className="workspaceLabel">
          {user.department || 'CAMPUS-WIDE'} · {roleLabel(user.role).toUpperCase()}
        </div>
        <nav>
          {nav.map(([id, label, Icon]: any) => (
            <button className={page === id ? 'active' : ''} onClick={() => setPage(id)} key={id}>
              <Icon size={18} />
              <span>{label}</span>
              {id === 'incidents' && <em>{overview?.openIncidents ?? 0}</em>}
              {id === 'bookings' && pendingBookings > 0 && (
                <em title="Awaiting approval">{pendingBookings}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebarFoot">
          <div className={`healthDot ${live ? 'live' : ''}`} />
          <span>{live ? 'Live operational feed' : 'Reconnecting…'}</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="mobileTitle">
            <Menu size={20} />
            <b>CampusConnect</b>
          </div>
          <div className="crumb">
            Operations / <strong>{titleCase(page)}</strong>
          </div>
          <div className="headerActions">
            <button
              className="searchTrigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <Search size={15} />
              <span>Search or jump to…</span>
              <kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} K</kbd>
            </button>
            <div className="liveBadge">
              <span className={live ? 'dot live' : 'dot'} />
              {live ? 'LIVE' : 'SYNC'}
            </div>
            <div className="userContext">
              <ShieldCheck size={14} />
              <span>{roleLabel(user.role)}</span>
              <small>{user.department || 'Campus-wide'}</small>
            </div>
            <div className="notificationWrap">
              <button
                className="notificationBtn"
                onClick={() => setNotificationOpen((x) => !x)}
                title="Notifications"
              >
                <Bell size={17} />
                {unread > 0 && <b>{unread}</b>}
              </button>
              {notificationOpen && (
                <NotificationPanel
                  notifications={notifications}
                  onOpen={openNotification}
                  onReadAll={markAllRead}
                />
              )}
            </div>
            <button
              className="iconBtn themeToggle"
              onClick={() => setDark((x) => !x)}
              title={dark ? 'Use light theme' : 'Use dark theme'}
              aria-label={dark ? 'Use light theme' : 'Use dark theme'}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="iconBtn" onClick={load} title="Refresh">
              <RefreshCw size={17} />
            </button>
            <button className="profileChip" title="My account" onClick={() => setAccountOpen(true)}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="profileInit">{initials(user.name)}</span>
              )}
              <div>
                <b>{user.name}</b>
                <small>{user.email}</small>
              </div>
            </button>
            <button className="iconBtn" onClick={onLogout} title="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {page === 'overview' && (
          <OverviewPage
            user={user}
            overview={overview}
            incidents={incidents}
            onOpen={setSelected}
            onNew={() => setPage('report')}
            setPage={setPage}
          />
        )}
        {page === 'incidents' && (
          <IncidentsPage
            user={user}
            incidents={filtered}
            query={query}
            setQuery={setQuery}
            risks={risks}
            onMove={(id, action) => act(id, action, { open: false })}
            onOpen={setSelected}
            onNew={() => setPage('report')}
          />
        )}
        {page === 'resources' && <ResourcesPage onToast={setToast} />}
        {page === 'bookings' && <BookingsPage user={user} onToast={setToast} refreshKey={bookingTick} />}
        {page === 'analytics' && canAnalytics && <AnalyticsPage user={user} />}
        {page === 'audit' && canAudit && <AuditPage />}
        {page === 'users' && canManageUsers(user.role) && <UsersPage user={user} onToast={setToast} />}
        {page === 'architecture' && <ArchitecturePage traces={traces} />}
        {page === 'report' && (
          <IncidentReportPage
            onBack={() => setPage('incidents')}
            onCreated={(i, note) => {
              setToast(
                `${i.id} was submitted and routed to ${i.department || 'operations'}.${note ? ` ${note}` : ''}`,
              );
              setPage('incidents');
              load();
            }}
          />
        )}
      </main>
      {selected && (
        <IncidentDrawer
          incident={selected}
          close={() => setSelected(null)}
          action={(id, a, o) => act(id, a, { ...o, rethrow: true })}
          commentTick={commentTick}
          onChanged={(t) => {
            setSelected(t);
            load();
          }}
          user={user}
          risk={risks[selected.id]}
          onToast={setToast}
        />
      )}{' '}
      {accountOpen && <AccountDialog user={user} onClose={() => setAccountOpen(false)} onToast={setToast} />}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          pages={palettePages}
          incidents={incidents}
          goto={setPage}
          openIncident={setSelected}
          newIncident={() => setPage('report')}
          toggleTheme={() => setDark((x) => !x)}
          refresh={load}
          logout={onLogout}
        />
      )}
      {toast && (
        <div className="toast">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
      {loading && <div className="sync">Syncing…</div>}
    </div>
  );
}
