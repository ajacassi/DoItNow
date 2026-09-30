import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { ProjectSummary } from "../lib/github";
import { getShowClosedProjects, setShowClosedProjects } from "../lib/store";

interface Props {
  org: string;
  onOrgChange: (org: string) => void;
  onFetch: () => Promise<void>;
  projects: ProjectSummary[];
  loading: boolean;
  error: string | null;
  onSelect: (project: ProjectSummary) => void;
  onLogout: () => void;
}

export default function ProjectPicker({
  org,
  onOrgChange,
  onFetch,
  projects,
  loading,
  error,
  onSelect,
  onLogout,
}: Props) {
  const [touched, setTouched] = useState(false);
  // Once we already have a remembered/fetched org, show a compact summary
  // instead of the input, with a way back into edit mode.
  const [editingOrg, setEditingOrg] = useState(!org);
  const [showClosed, setShowClosed] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getShowClosedProjects().then(setShowClosed);
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function toggleShowClosed(value: boolean) {
    setShowClosed(value);
    void setShowClosedProjects(value);
  }

  const closedCount = projects.filter((p) => p.closed).length;
  const visibleProjects = showClosed ? projects : projects.filter((p) => !p.closed);

  // Collapse into the compact view once a fetch resolves successfully — this
  // covers both a manual search and the automatic fetch for a remembered org
  // on startup (which happens outside this component, in the parent).
  useEffect(() => {
    if (!loading && !error && org.trim()) setEditingOrg(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!org.trim()) return;
    await onFetch();
  }

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight">
          DoItNow
          {version && <span className="text-xs font-normal text-neutral-500">v{version}</span>}
        </h1>
        <button onClick={onLogout} className="text-xs text-neutral-500 hover:text-neutral-300">
          Cambia token
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-8 py-10">
        {editingOrg || !org ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              autoFocus
              value={org}
              onChange={(e) => onOrgChange(e.target.value)}
              placeholder="nome-organizzazione"
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Carico…" : "Cerca progetti"}
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              Organizzazione: <span className="font-medium text-neutral-100">{org}</span>
            </p>
            <button
              onClick={() => setEditingOrg(true)}
              className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
            >
              Cambia organizzazione
            </button>
          </div>
        )}

        {touched && !org.trim() && (
          <p className="mt-2 text-xs text-red-400">Inserisci il nome dell'organizzazione.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {loading && !editingOrg && <p className="mt-8 text-sm text-neutral-500">Carico i progetti…</p>}

        {closedCount > 0 && (
          <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => toggleShowClosed(e.target.checked)}
              className="accent-indigo-500"
            />
            Mostra progetti chiusi ({closedCount})
          </label>
        )}

        {visibleProjects.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleProjects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-left transition hover:border-indigo-500/60 hover:bg-neutral-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-neutral-500">#{p.number}</span>
                  </div>
                  {p.shortDescription && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{p.shortDescription}</p>
                  )}
                  {p.closed && (
                    <span className="mt-2 inline-block rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                      Chiuso
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && visibleProjects.length === 0 && touched && (
          <p className="mt-8 text-sm text-neutral-500">Nessun progetto trovato per questa organizzazione.</p>
        )}
      </main>
    </div>
  );
}
