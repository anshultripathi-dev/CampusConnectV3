import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Copy, LifeBuoy, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib';
import { useDebounced } from '../hooks';
import { uploadPhoto } from '../images';
import type { Incident, SimilarMatch, Triage } from '../types';
import { Severity, Status } from '../components/common';
import { PhotoPicker } from '../components/PhotoPicker';

export function IncidentReportPage({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (i: Incident, note?: string) => void;
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Maintenance',
    subCategory: 'Electrical',
    location: '',
    severity: 'Medium',
    reporterContact: '',
    itemDescription: '',
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [similar, setSimilar] = useState<{ count: number; matches: SimilarMatch[] }>({
    count: 0,
    matches: [],
  });
  const draft = useDebounced(
    { title: form.title, description: form.description, location: form.location },
    600,
  );
  useEffect(() => {
    if (draft.title.length + draft.description.length < 12) {
      setTriage(null);
      setSimilar({ count: 0, matches: [] });
      return;
    }
    let live = true;
    const post = (url: string) =>
      api<any>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
    post('/api/v2/ai/triage')
      .then((r) => live && setTriage(r))
      .catch(() => live && setTriage(null));
    post('/api/v2/ai/similar')
      .then((r) => live && setSimilar(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft]);
  const [error, setError] = useState('');
  const routes: { [key: string]: string } = {
    Maintenance: 'Maintenance',
    Safety: 'Security',
    LostFound: 'Facilities',
  };
  const subTypes: { [key: string]: string[] } = {
    Maintenance: ['Electrical', 'Plumbing', 'IT'],
    Safety: ['Security'],
    LostFound: ['General'],
  };
  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setCategory = (category: string) =>
    setForm((f) => ({ ...f, category, subCategory: subTypes[category][0] }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.title.trim().length < 5) {
      setError('Use a short, specific title of at least 5 characters.');
      return;
    }
    if (form.description.trim().length < 15) {
      setError('Add a little more detail so the receiving team can act without follow-up.');
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ ticket: Incident }>('/api/v2/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, flags: form.severity === 'Critical' ? ['Urgent'] : [] }),
      });
      let note = '';
      if (photos.length) {
        const results = await Promise.allSettled(photos.map((f) => uploadPhoto(r.ticket.id, f)));
        const failed = results.filter((x) => x.status === 'rejected').length;
        note = failed
          ? `${failed} photo${failed > 1 ? 's' : ''} could not be uploaded — add them from the incident.`
          : '';
      }
      onCreated(r.ticket, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create incident');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="page reportPage">
      <div className="pageHead">
        <div>
          <span className="eyebrow">GUIDED INCIDENT TRIAGE</span>
          <h1>Report an issue</h1>
          <p>Give the right team the information they need on the first pass.</p>
        </div>
        <button className="secondary" onClick={onBack}>
          Back to incidents
        </button>
      </div>
      <div className="reportLayout">
        <form className="form reportCard" onSubmit={submit}>
          <div className="formSteps">
            <span className="active">1 · Classify</span>
            <span>2 · Describe</span>
            <span>3 · Route</span>
          </div>
          <label>
            What needs attention?
            <input
              required
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Sparking socket near Lab 204"
            />
            <small>Make the subject easy to scan in an operations queue.</small>
          </label>
          <div className="formGrid">
            <label>
              Category
              <select value={form.category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Maintenance">Maintenance</option>
                <option value="Safety">Safety & security</option>
                <option value="LostFound">Lost & found</option>
              </select>
            </label>
            <label>
              Issue type
              <select value={form.subCategory} onChange={(e) => update('subCategory', e.target.value)}>
                {subTypes[form.category].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
          {triage?.suggestion && (
            <div className="aiSuggest" role="status">
              <Sparkles size={16} />
              <div>
                <b>{triage.confident ? 'Smart suggestion' : 'Possible match'}</b>
                <span>
                  {triage.suggestion.category} · {triage.suggestion.subCategory} ·{' '}
                  {triage.suggestion.severity} severity → {triage.suggestion.department}
                  {triage.confidence != null && ` (${Math.round(triage.confidence * 100)}% match)`}
                </span>
                {triage.signals && triage.signals.keywords.length > 0 && (
                  <small>Based on: {triage.signals.keywords.join(', ')}</small>
                )}
              </div>
              {(triage.suggestion.category !== form.category ||
                triage.suggestion.subCategory !== form.subCategory ||
                triage.suggestion.severity !== form.severity) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      category: triage.suggestion!.category,
                      subCategory: triage.suggestion!.subCategory,
                      severity: triage.suggestion!.severity,
                    }))
                  }
                >
                  Apply
                </button>
              )}
            </div>
          )}
          <div className="routePreview">
            <ShieldCheck size={16} />
            <div>
              <b>Auto-routing preview</b>
              <span>
                {form.category} · {form.subCategory} → {routes[form.category]}
              </span>
            </div>
          </div>
          <label>
            Location
            <input
              required
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              placeholder="Building, floor, room, or landmark"
            />
          </label>
          <label>
            What happened?
            <textarea
              required
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Describe the issue, who is affected, and anything that makes it urgent…"
            />
            <small>Include safe, observable facts. Do not add passwords or personal records.</small>
          </label>
          {similar.count > 0 && (
            <div className="dupWarn" role="status">
              <Copy size={16} />
              <div>
                <b>
                  {similar.count} similar report{similar.count > 1 ? 's' : ''} already open
                </b>
                <span>
                  Check whether someone has already reported this — it helps the team respond faster.
                </span>
                <ul>
                  {similar.matches.map((m, k) => (
                    <li key={m.id ?? k}>
                      {m.title ? `${m.id} · ${m.title}` : m.location} <Status status={m.status} />
                      {m.mine && ' (yours)'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {form.category === 'LostFound' && (
            <label>
              Item description
              <input
                required
                value={form.itemDescription}
                onChange={(e) => update('itemDescription', e.target.value)}
                placeholder="Colour, brand, identifying feature"
              />
            </label>
          )}
          <div className="formGrid">
            <label>
              Severity
              <select value={form.severity} onChange={(e) => update('severity', e.target.value)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </label>
            <label>
              Contact (optional)
              <input
                type="email"
                value={form.reporterContact}
                onChange={(e) => update('reporterContact', e.target.value)}
                placeholder="you@campus.edu"
              />
            </label>
          </div>
          {form.severity === 'Critical' && (
            <div className="urgentHint">
              <AlertTriangle size={15} />
              <span>
                Critical reports are flagged as urgent. Contact campus emergency services immediately if there
                is imminent danger.
              </span>
            </div>
          )}
          {error && <div className="formError">{error}</div>}
          <PhotoPicker files={photos} onChange={setPhotos} />
          <div className="reportActions">
            <button type="button" className="secondary" onClick={onBack}>
              Cancel
            </button>
            <button className="primary" disabled={saving}>
              {saving ? 'Routing your report…' : 'Submit incident'}
            </button>
          </div>
        </form>
        <aside className="reportGuide">
          <div className="guideIcon">
            <LifeBuoy size={20} />
          </div>
          <span className="eyebrow">WHAT HAPPENS NEXT</span>
          <h2>Clear input, faster response.</h2>
          <ol>
            <li>
              <b>Classify</b>
              <span>Your category selects the appropriate incident family.</span>
            </li>
            <li>
              <b>Route</b>
              <span>The interpreter selects the receiving department.</span>
            </li>
            <li>
              <b>Track</b>
              <span>Your report gains an auditable status timeline.</span>
            </li>
          </ol>
          <div className="guideNote">
            <Clock3 size={15} />
            <span>Electrical and IT reports receive accelerated SLA handling.</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
