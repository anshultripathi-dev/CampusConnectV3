import { useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, Trash2, X } from 'lucide-react';
import { api, isManagement } from '../lib';
import { useAuthedImage } from '../hooks';
import { uploadPhoto } from '../images';
import type { Attachment, User } from '../types';

function Thumb({ url, name, onOpen }: { url: string; name: string; onOpen: (src: string) => void }) {
  const { src, failed } = useAuthedImage(url);
  if (failed)
    return (
      <div className="thumb broken">
        <ImageOff size={18} />
      </div>
    );
  return src ? (
    <button className="thumb" onClick={() => onOpen(src)} aria-label={`View photo ${name}`}>
      <img src={src} alt={name} />
    </button>
  ) : (
    <div className="thumb loading" />
  );
}

export function PhotoGallery({
  incidentId,
  user,
  onToast,
}: {
  incidentId: string;
  user: User;
  onToast: (m: string) => void;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/v2/incidents/${incidentId}/attachments`;
  const load = () =>
    api<Attachment[]>(base)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    setItems([]);
    load();
  }, [incidentId]);
  useEffect(() => {
    if (!view) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setView(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [view]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadPhoto(incidentId, f);
      onToast('Photo added');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      load();
    }
  };
  const remove = async (a: Attachment) => {
    try {
      await api(`${base}/${a.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not remove photo');
    }
  };
  return (
    <div className="drawerSection">
      <div className="photoHead">
        <h3>Photos {items.length > 0 && <span>({items.length})</span>}</h3>
        <button
          className="secondary"
          onClick={() => input.current?.click()}
          disabled={busy || items.length >= 5}
        >
          <Camera size={13} />
          {busy ? 'Uploading…' : 'Add photo'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          hidden
          onChange={(e) => add(e.target.files)}
        />
      </div>
      {items.length === 0 ? (
        <p className="drawerHint">No photos yet. Evidence helps crews arrive prepared.</p>
      ) : (
        <div className="photoGrid">
          {items.map((a) => (
            <div className="photoCell" key={a.id}>
              <Thumb url={`${base}/${a.id}`} name={a.filename} onOpen={setView} />
              {(isManagement(user.role) || a.uploadedBy === user.id) && (
                <button className="photoDel" onClick={() => remove(a)} aria-label={`Remove ${a.filename}`}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {view && (
        <div
          className="lightbox"
          onClick={() => setView(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <button className="iconBtn lightboxClose" onClick={() => setView(null)} aria-label="Close preview">
            <X size={18} />
          </button>
          <img src={view} alt="Incident evidence" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
