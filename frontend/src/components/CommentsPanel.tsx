import { useEffect, useRef, useState } from 'react';
import { Lock, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { api, fmt, initials, isManagement, roleLabel } from '../lib';
import type { Comment, User } from '../types';
import { Empty } from './common';

const MAX = 1000;
const json = { 'Content-Type': 'application/json' };

/** Conversation on an incident. Internal notes are visible to staff only (the server enforces it). */
export function CommentsPanel({
  incidentId,
  user,
  closed,
  refreshKey,
  onToast,
  onCount,
}: {
  incidentId: string;
  user: User;
  closed: boolean;
  refreshKey: number;
  onToast: (m: string) => void;
  onCount: (n: number) => void;
}) {
  const staff = user.role !== 'Student';
  const [items, setItems] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const base = `/api/v2/incidents/${incidentId}/comments`;

  const load = () =>
    api<Comment[]>(base)
      .then((list) => {
        setItems(list);
        onCount(list.length);
      })
      .catch(() => {});
  useEffect(() => {
    setItems([]);
    setEditing(null);
    load();
  }, [incidentId, refreshKey]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items.length]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await api(base, { method: 'POST', headers: json, body: JSON.stringify({ body: text, internal }) });
      setText('');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not post comment');
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    try {
      await api(`${base}/${editing.id}`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ body: editing.text }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save');
    }
  };
  const remove = async (c: Comment) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api(`${base}/${c.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  return (
    <div className="comments">
      <div className="commentList">
        {items.map((c) => {
          const mine = c.authorId === user.id;
          return (
            <div className={`comment${c.internal ? ' internal' : ''}${mine ? ' mine' : ''}`} key={c.id}>
              <span className="commentAvatar">{initials(c.authorName)}</span>
              <div className="commentBody">
                <div className="commentHead">
                  <b>{c.authorName}</b>
                  {c.authorRole && <em className="chip">{roleLabel(c.authorRole)}</em>}
                  {c.internal && (
                    <em className="chip internalChip">
                      <Lock size={11} /> Internal
                    </em>
                  )}
                  <small>
                    {fmt(c.createdAt)}
                    {c.editedAt && ' · edited'}
                  </small>
                </div>
                {editing?.id === c.id ? (
                  <div className="commentEdit">
                    <textarea
                      value={editing.text}
                      maxLength={MAX}
                      onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                      autoFocus
                    />
                    <div className="commentBtns">
                      <button className="secondary" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button className="primary" disabled={!editing.text.trim()} onClick={saveEdit}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{c.body}</p>
                )}
                {editing?.id !== c.id && (mine || isManagement(user.role)) && (
                  <div className="commentTools">
                    {mine && (
                      <button className="textButton" onClick={() => setEditing({ id: c.id, text: c.body })}>
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                    <button className="textButton" onClick={() => remove(c)}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!items.length && (
          <Empty
            text={
              staff
                ? 'No comments yet. Start the conversation.'
                : 'No comments yet. Ask a question or add details for the team.'
            }
          />
        )}
        <div ref={endRef} />
      </div>
      {closed ? (
        <p className="drawerHint">
          This incident is closed, so comments are read-only. Reopen it to continue the conversation.
        </p>
      ) : (
        <div className={`composer${internal ? ' internal' : ''}`}>
          <textarea
            value={text}
            maxLength={MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
            placeholder={internal ? 'Internal note — only staff can see this…' : 'Write a comment…'}
            aria-label="Write a comment"
          />
          <div className="composerBar">
            {staff ? (
              <label className="internalToggle">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                <Lock size={13} /> Internal note (staff only)
              </label>
            ) : (
              <small className="composerHint">
                <MessageSquare size={12} /> The reporter and the team can see this.
              </small>
            )}
            <span className="composerCount">
              {text.length}/{MAX}
            </span>
            <button className="primary" disabled={!text.trim() || busy} onClick={send}>
              <Send size={14} /> {internal ? 'Add note' : 'Comment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
