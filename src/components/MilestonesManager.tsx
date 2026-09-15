import { useEffect, useState } from "react";
import {
  fetchRepoMilestones,
  fetchMilestoneIssues,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  setIssueMilestone,
  GithubApiError,
  type MilestoneSummary,
  type MilestoneInput,
  type SubIssueSummary,
  type ProjectDetail,
  type IssueRef,
} from "../lib/github";
import IssuePicker from "./IssuePicker";
import ExternalLink from "./ExternalLink";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  repo: { owner: string; name: string } | null;
  onClose: () => void;
  onOpenIssue: (ref: IssueRef) => void;
}

const EMPTY_FORM: MilestoneInput = { title: "", description: "", dueOn: null, state: "open" };

function toDateInput(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function formatDue(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("it-IT") : "";
}

function isOverdue(m: MilestoneSummary): boolean {
  return m.state === "OPEN" && !!m.dueOn && new Date(m.dueOn).getTime() < Date.now();
}

export default function MilestonesManager({ token, org, project, repo, onClose, onOpenIssue }: Props) {
  const [milestones, setMilestones] = useState<MilestoneSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<MilestoneInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editingNumber, setEditingNumber] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MilestoneInput>(EMPTY_FORM);

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [issuesByNumber, setIssuesByNumber] = useState<Record<number, SubIssueSummary[]>>({});
  const [loadingIssues, setLoadingIssues] = useState<number | null>(null);
  const [showAddIssue, setShowAddIssue] = useState<number | null>(null);
  const [pickedIssue, setPickedIssue] = useState<SubIssueSummary | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!repo) return;
    setMilestones(null);
    setError(null);
    fetchRepoMilestones(token, repo.owner, repo.name)
      .then(setMilestones)
      .catch((e) => setError(e instanceof GithubApiError ? e.message : "Impossibile caricare le milestone."));
  }, [token, repo?.owner, repo?.name]);

  function refreshOne(updated: MilestoneSummary) {
    setMilestones((prev) => prev?.map((m) => (m.number === updated.number ? updated : m)) ?? prev);
  }

  async function submitCreate() {
    if (!repo || !form.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createMilestone(token, repo.owner, repo.name, form);
      setMilestones((prev) => (prev ? [...prev, created] : [created]));
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile creare la milestone.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: MilestoneSummary) {
    setEditingNumber(m.number);
    setEditForm({ title: m.title, description: m.description, dueOn: toDateInput(m.dueOn), state: m.state === "CLOSED" ? "closed" : "open" });
  }

  async function submitEdit() {
    if (!repo || editingNumber == null || !editForm.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMilestone(token, repo.owner, repo.name, editingNumber, editForm);
      refreshOne(updated);
      setEditingNumber(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile aggiornare la milestone.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleState(m: MilestoneSummary) {
    if (!repo) return;
    const nextState: "open" | "closed" = m.state === "OPEN" ? "closed" : "open";
    try {
      const updated = await updateMilestone(token, repo.owner, repo.name, m.number, { state: nextState });
      refreshOne(updated);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile cambiare lo stato della milestone.");
    }
  }

  async function confirmDeleteMilestone() {
    if (!repo || confirmDelete == null) return;
    setDeleting(true);
    try {
      await deleteMilestone(token, repo.owner, repo.name, confirmDelete);
      setMilestones((prev) => prev?.filter((m) => m.number !== confirmDelete) ?? prev);
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile eliminare la milestone.");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleExpand(m: MilestoneSummary) {
    if (expanded === m.number) {
      setExpanded(null);
      return;
    }
    setExpanded(m.number);
    if (!repo || issuesByNumber[m.number]) return;
    setLoadingIssues(m.number);
    try {
      const issues = await fetchMilestoneIssues(token, repo.owner, repo.name, m.number);
      setIssuesByNumber((prev) => ({ ...prev, [m.number]: issues }));
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile caricare le issue della milestone.");
    } finally {
      setLoadingIssues(null);
    }
  }

  async function removeIssue(m: MilestoneSummary, issue: SubIssueSummary) {
    setIssuesByNumber((prev) => ({ ...prev, [m.number]: (prev[m.number] ?? []).filter((i) => i.id !== issue.id) }));
    refreshOne({
      ...m,
      openIssueCount: issue.state === "OPEN" ? m.openIssueCount - 1 : m.openIssueCount,
      closedIssueCount: issue.state === "CLOSED" ? m.closedIssueCount - 1 : m.closedIssueCount,
    });
    try {
      await setIssueMilestone(token, issue.id, null);
    } catch {
      setIssuesByNumber((prev) => ({ ...prev, [m.number]: [issue, ...(prev[m.number] ?? [])] }));
      refreshOne(m);
    }
  }

  async function confirmAddIssue(m: MilestoneSummary) {
    if (!pickedIssue) return;
    setLinking(true);
    try {
      await setIssueMilestone(token, pickedIssue.id, m.id);
      setIssuesByNumber((prev) => ({ ...prev, [m.number]: [pickedIssue, ...(prev[m.number] ?? [])] }));
      refreshOne({
        ...m,
        openIssueCount: pickedIssue.state === "OPEN" ? m.openIssueCount + 1 : m.openIssueCount,
        closedIssueCount: pickedIssue.state === "CLOSED" ? m.closedIssueCount + 1 : m.closedIssueCount,
      });
      setShowAddIssue(null);
      setPickedIssue(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile aggiungere l'issue alla milestone.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Milestone</h1>
          {repo && <p className="text-xs text-neutral-500">{repo.owner}/{repo.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          {repo && (
            <button
              onClick={() => {
                setForm(EMPTY_FORM);
                setShowCreate(true);
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              + Nuova milestone
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500">
            Chiudi
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
        {error && <div className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>}

        {!repo ? (
          <p className="text-sm text-neutral-600">Nessuna repository rilevata per questo progetto.</p>
        ) : showCreate ? (
          <div className="max-w-lg rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <h3 className="mb-3 text-sm font-medium">Nuova milestone</h3>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Titolo"
                className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Descrizione (opzionale)"
                rows={3}
                className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Scadenza (opzionale)</label>
                <input
                  type="date"
                  value={form.dueOn ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, dueOn: e.target.value || null }))}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="text-xs text-neutral-500 hover:text-neutral-200"
              >
                Annulla
              </button>
              <button
                onClick={submitCreate}
                disabled={!form.title.trim() || saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Creo…" : "Crea"}
              </button>
            </div>
          </div>
        ) : milestones == null ? (
          <p className="text-sm text-neutral-500">Carico…</p>
        ) : milestones.length === 0 ? (
          <p className="text-sm text-neutral-600">Nessuna milestone in questo repository.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => {
              const total = m.openIssueCount + m.closedIssueCount;
              const pct = total > 0 ? Math.round((m.closedIssueCount / total) * 100) : 0;
              const editing = editingNumber === m.number;
              const issues = issuesByNumber[m.number];

              return (
                <div key={m.number} className="overflow-hidden rounded-lg border border-neutral-800">
                  <div className="p-4">
                    {editing ? (
                      <div className="space-y-3">
                        <input
                          value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          rows={3}
                          className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <input
                          type="date"
                          value={editForm.dueOn ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, dueOn: e.target.value || null }))}
                          className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingNumber(null)} className="text-xs text-neutral-500 hover:text-neutral-200">
                            Annulla
                          </button>
                          <button
                            onClick={submitEdit}
                            disabled={!editForm.title.trim() || saving}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {saving ? "Salvo…" : "Salva"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => toggleExpand(m)} className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${m.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-100"}`}>
                                {m.title}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  m.state === "OPEN" ? "bg-green-900/40 text-green-300" : "bg-neutral-800 text-neutral-400"
                                }`}
                              >
                                {m.state === "OPEN" ? "Aperta" : "Chiusa"}
                              </span>
                              {m.dueOn && (
                                <span className={`shrink-0 text-xs ${isOverdue(m) ? "text-red-400" : "text-neutral-500"}`}>
                                  scade {formatDue(m.dueOn)}
                                </span>
                              )}
                            </div>
                            {m.description && <p className="mt-1 truncate text-xs text-neutral-500">{m.description}</p>}
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            <ExternalLink href={m.url} className="text-xs text-neutral-600 hover:text-neutral-400">
                              ↗
                            </ExternalLink>
                            <button onClick={() => startEdit(m)} className="text-xs text-neutral-500 hover:text-neutral-200">
                              Modifica
                            </button>
                            <button onClick={() => toggleState(m)} className="text-xs text-neutral-500 hover:text-neutral-200">
                              {m.state === "OPEN" ? "Chiudi" : "Riapri"}
                            </button>
                            <button onClick={() => setConfirmDelete(m.number)} className="text-xs text-neutral-600 hover:text-red-400">
                              Elimina
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                            <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="shrink-0 text-xs text-neutral-500">
                            {m.closedIssueCount}/{total} completate
                          </span>
                        </div>

                        {confirmDelete === m.number && (
                          <div className="mt-3 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs">
                            <p className="mb-2 text-red-300">
                              Eliminare definitivamente la milestone "{m.title}"? Le issue al suo interno restano, ma perdono il collegamento.
                            </p>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setConfirmDelete(null)} className="text-neutral-400 hover:text-neutral-200">
                                Annulla
                              </button>
                              <button
                                onClick={confirmDeleteMilestone}
                                disabled={deleting}
                                className="rounded-lg bg-red-700 px-2.5 py-1 font-medium text-white hover:bg-red-600 disabled:opacity-50"
                              >
                                {deleting ? "Elimino…" : "Elimina definitivamente"}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {expanded === m.number && (
                    <div className="border-t border-neutral-800 bg-neutral-900/30 p-4">
                      {loadingIssues === m.number ? (
                        <p className="text-xs text-neutral-500">Carico le issue…</p>
                      ) : (
                        <>
                          {(issues ?? []).length === 0 ? (
                            <p className="text-xs text-neutral-600">Nessuna issue in questa milestone.</p>
                          ) : (
                            <ul className="mb-2 space-y-1.5">
                              {(issues ?? []).map((issue) => (
                                <li
                                  key={issue.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5"
                                >
                                  <button
                                    onClick={() =>
                                      onOpenIssue({ repositoryOwner: issue.repositoryOwner, repository: issue.repository, number: issue.number })
                                    }
                                    className="min-w-0 truncate text-left text-sm hover:underline"
                                  >
                                    <span className={issue.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-100"}>
                                      {issue.title}
                                    </span>
                                    <span className="ml-1.5 text-xs text-neutral-500">
                                      {issue.repository}#{issue.number}
                                    </span>
                                  </button>
                                  <button onClick={() => removeIssue(m, issue)} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-200">
                                    Rimuovi
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {showAddIssue === m.number ? (
                            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                              <IssuePicker
                                token={token}
                                org={org}
                                project={project}
                                value={pickedIssue}
                                onChange={setPickedIssue}
                                excludeContentIds={(issues ?? []).map((i) => i.id)}
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setShowAddIssue(null);
                                    setPickedIssue(null);
                                  }}
                                  className="text-xs text-neutral-500 hover:text-neutral-200"
                                >
                                  Annulla
                                </button>
                                <button
                                  onClick={() => confirmAddIssue(m)}
                                  disabled={!pickedIssue || linking}
                                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                                >
                                  {linking ? "Collego…" : "Collega"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowAddIssue(m.number)}
                              className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                            >
                              + Aggiungi issue
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
