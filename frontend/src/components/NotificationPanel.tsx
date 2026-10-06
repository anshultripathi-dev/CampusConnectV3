import { useState } from 'react';
import { fmt } from '../lib';
import type { Notification } from '../types';
import { Empty } from './common';

export function NotificationPanel({
  notifications,
  onOpen,
  onReadAll,
}: {
  notifications: Notification[];
  onOpen: (n: Notification) => void;
  onReadAll: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter((n) => !n.read_at).length;
  const markAll = async () => {
    setBusy(true);
    await onReadAll();
    setBusy(false);
  };
  return (
    <div className="notificationPanel">
      <div className="notificationHead">
        <b>Notifications</b>
        <button className="textButton" disabled={!unread || busy} onClick={markAll}>
          {busy ? 'Updating…' : 'Mark all read'}
        </button>
      </div>
      {notifications.slice(0, 8).map((n) => (
        <button className={`notificationRow ${n.read_at ? 'read' : ''}`} key={n.id} onClick={() => onOpen(n)}>
          <span className="notificationDot" />
          <div>
            <b>{n.title}</b>
            <span>{n.message}</span>
            <small>{fmt(n.created_at)}</small>
          </div>
        </button>
      ))}
      {!notifications.length && <Empty text="You're all caught up" />}
    </div>
  );
}
