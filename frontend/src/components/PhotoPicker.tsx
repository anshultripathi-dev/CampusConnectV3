import { useEffect, useMemo, useRef } from 'react';
import { Camera, X } from 'lucide-react';

export const MAX_PHOTOS = 3;

export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const add = (list: FileList | null) => {
    const next = [
      ...files,
      ...Array.from(list || []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)),
    ].slice(0, MAX_PHOTOS);
    onChange(next);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="photoPicker">
      <span className="fieldLabel">Photos (optional)</span>
      <div className="photoPickerRow">
        {files.map((f, i) => (
          <div className="photoCell" key={`${f.name}-${i}`}>
            <div className="thumb">
              <img src={urls[i]} alt={f.name} />
            </div>
            <button
              type="button"
              className="photoDel"
              onClick={() => onChange(files.filter((_, k) => k !== i))}
              aria-label={`Remove ${f.name}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button type="button" className="photoAdd" onClick={() => input.current?.click()}>
            <Camera size={18} />
            <span>Add photo</span>
          </button>
        )}
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
      <small>Up to {MAX_PHOTOS} photos. They are resized on your device before upload.</small>
    </div>
  );
}
