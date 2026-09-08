import { useEffect, useMemo, useState } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { removeItemFromProject, deleteIssue, GithubApiError } from "../lib/github";
import { parseIssueQuery, matchesIssueQuery } from "../lib/query";
import QueryInput from "./QueryInput";
import LabelChip from "./LabelChip";
import ExternalLink from "./ExternalLink";

interface Props {
  token: string;
  project: ProjectDetail;
  onClose: () => void;
  onItemRemoved: (itemId: string) => void;
}

type BulkAction = "unlink" | "delete";

export default function ProjectCleanup({ token, project, onClose, onItemRemoved }: Props) {
  const [queryText, setQueryText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const parsedQuery = useMemo(() => {
    try {
      return parseIssueQuery(queryText);
    } catch {
      return null;
    }
  }, [queryText]);

  // Nothing is listed until a query is typed — this screen exists to select a
  // deliberate subset for a destructive bulk action, not to browse everything.
  const matched = useMemo<ProjectItem[]>(() => {
    if (!queryText.trim()) return [];
    return project.items.filter((item) => matchesIssueQuery(parsedQuery, item, project));
  }, [project.items, queryText, parsedQuery]);

  // Drop anything from the selection that fell out of the current query results.
  useEffect(() => {
    setSelected((prev) => {
      const matchedIds = new Set(matched.map((m) => m.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (matchedIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [matched]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === matched.length ? new Set() : new Set(matched.map((m) => m.id))));
  }

  const selectedItems = matched.filter((m) => selected.has(m.id));

  function openConfirm(action: BulkAction) {
    if (selectedItems.length === 0) return;
    setConfirmAction(action);
    setConfirmText("");
    setFailures([]);
  }

  async function runBulk() {
    const action = confirmAction;
    if (!action) return;
    setBusy(true);
    setFailures([]);
    setProgress({ done: 0, total: selectedItems.length });
    const errs: string[] = [];
    for (const item of selectedItems) {
      try {
        if (action === "unlink") {
          await removeItemFromProject(token, project.id, item.id);
        } else {
          if (!item.contentId) throw new Error("id issue mancante");
          await deleteIssue(token, item.contentId);
        }
        onItemRemoved(item.id);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      } catch (e) {
        errs.push(`#${item.number ?? "?"} ${item.title} — ${e instanceof GithubApiError ? e.message : "operazione non riuscita"}`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setFailures(errs);
    setBusy(false);
    setConfirmAction(null);
    setConfirmText("");
  }

  const confirmWord = "ELIMINA";
  const canConfirmDelete = confirmAction === "delete" ? confirmText.trim().toUpperCase() === confirmWord : true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-amber-900/40 bg-amber-950/10 px-8 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Pulizia progetto</h1>
          <p className="text-xs text-neutral-500">
            Costruisci una query per selezionare un sottoinsieme di issue, poi scollegale dal progetto o eliminale definitivamente dalla repo.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500">
          Chiudi
        </button>
      </header>

      <div className="flex items-center gap-2 border-b border-neutral-800 px-8 py-3">
        <QueryInput
          value={queryText}
          onChange={setQueryText}
          project={project}
          placeholder='es. status:"Done" -state:open'
          className="w-96 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
        />
        {queryText && (
          <button onClick={() => setQueryText("")} className="text-xs text-neutral-500 hover:text-neutral-300">
            Cancella
          </button>
        )}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-[11px] leading-relaxed text-neutral-500">
          <span className="text-neutral-300">chiave:valore</span> · spazio = and · <span className="text-neutral-300">or</span> = oppure ·{" "}
          <span className="text-neutral-300">-</span>nega · (raggruppa) · "virgolette" per spazi
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-8 py-4">
        {!queryText.trim() ? (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-600">
            Scrivi una query per vedere le issue corrispondenti — nessuna viene mostrata finché non ne scrivi una.
          </div>
        ) : matched.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-neutral-600">Nessuna issue corrisponde a questa query.</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-800">
            <div className="sticky top-0 flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs text-neutral-500">
              <input type="checkbox" checked={selected.size === matched.length} onChange={toggleAll} className="h-3.5 w-3.5" />
              <span>
                {selected.size} selezionate su {matched.length} trovate
              </span>
            </div>
            {matched.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-neutral-800/60 px-3 py-2 last:border-b-0 hover:bg-neutral-900/40">
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} className="h-3.5 w-3.5 shrink-0" />
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.state === "CLOSED" ? "bg-purple-950/60 text-purple-300" : "bg-emerald-950/60 text-emerald-300"
                  }`}
                >
                  {item.state === "CLOSED" ? "Chiusa" : "Aperta"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                {item.labels.map((l) => (
                  <LabelChip key={l.name} name={l.name} color={l.color} />
                ))}
                <span className="shrink-0 text-xs text-neutral-600">
                  {item.repositoryOwner}/{item.repository} #{item.number}
                </span>
                <span className="shrink-0 text-xs text-neutral-600">
                  {item.closedAt ? `chiusa ${new Date(item.closedAt).toLocaleDateString("it-IT")}` : "—"}
                </span>
                {item.url && (
                  <ExternalLink href={item.url} className="shrink-0 text-xs text-neutral-600 hover:text-neutral-400">
                    ↗
                  </ExternalLink>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-neutral-800 px-8 py-4">
        <div className="text-xs text-neutral-500">
          {progress ? `Operazione in corso: ${progress.done}/${progress.total}…` : failures.length > 0 ? `${failures.length} operazioni non riuscite.` : ""}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openConfirm("unlink")}
            disabled={selectedItems.length === 0 || busy}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500 disabled:opacity-40"
          >
            Scollega dal progetto ({selectedItems.length})
          </button>
          <button
            onClick={() => openConfirm("delete")}
            disabled={selectedItems.length === 0 || busy}
            className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-950/70 disabled:opacity-40"
          >
            Elimina definitivamente ({selectedItems.length})
          </button>
        </div>
      </footer>

      {failures.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-t border-red-900/40 bg-red-950/20 px-8 py-3 text-xs text-red-300">
          {failures.map((f, i) => (
            <div key={i}>{f}</div>
          ))}
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => !busy && setConfirmAction(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmAction === "unlink" ? (
              <>
                <h2 className="text-sm font-semibold text-neutral-100">Scollegare {selectedItems.length} issue dal progetto?</h2>
                <p className="mt-2 text-xs text-neutral-400">
                  Le issue restano nella repository e possono essere ri-aggiunte al progetto in seguito — viene rimosso solo il loro collegamento a
                  questo progetto (stato, campi custom, ecc.).
                </p>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-red-300">Eliminare definitivamente {selectedItems.length} issue?</h2>
                <p className="mt-2 text-xs text-neutral-400">
                  Azione <span className="font-semibold text-red-300">irreversibile</span>: le issue verranno cancellate dalla repository GitHub,
                  non solo dal progetto — spariscono anche i loro commenti e riferimenti. Scrivi <span className="font-mono text-neutral-200">{confirmWord}</span> per
                  confermare.
                </p>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmWord}
                  className="mt-3 w-full rounded-lg border border-red-900 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-red-500"
                />
              </>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
              >
                Annulla
              </button>
              <button
                onClick={runBulk}
                disabled={busy || !canConfirmDelete}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                  confirmAction === "delete" ? "bg-red-700 text-white hover:bg-red-600" : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {busy ? "In corso…" : confirmAction === "delete" ? "Elimina definitivamente" : "Scollega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
