import React from 'react';
import { ChevronRight, Database, FileClock } from 'lucide-react';
import { statusLabel } from '../lib';

export function KPI({ label, value, icon: Icon, kind = '' }: any) {
  return (
    <div className="kpi">
      <div className={`kpiIcon ${kind}`}>
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function HistoryIcon() {
  return <FileClock size={14} />;
}
export function Panel({
  title,
  icon,
  children,
  action,
  onAction,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <span className="panelIcon">{icon}</span>
          <b>{title}</b>
        </div>
        {action && (
          <button onClick={onAction}>
            {action}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status.toLowerCase().replace(/[^a-z]/g, '')}`}>{statusLabel(status)}</span>
  );
}
export function Severity({ s }: { s: string }) {
  return <span className={`sev ${s.toLowerCase()}`}>{s}</span>;
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Database size={18} />
      {text}
    </div>
  );
}
