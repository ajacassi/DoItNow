import { useEffect, useState } from "react";
import {
  fetchOrgRepos,
  fetchRepoMetadata,
  createIssue,
  addIssueToProject,
  addSubIssue,
  setProjectFieldSingleSelect,
  setProjectFieldDate,
  setProjectFieldText,
  setProjectFieldNumber,
  setIssueFieldSingleSelect,
  setIssueFieldDate,
  setIssueFieldText,
  setIssueFieldNumber,
  GithubApiError,
  NO_STATUS,
  type RepoSummary,
  type RepoMetadata,
  type ProjectDetail,
  type ProjectItem,
  type ItemFieldValue,
  type CreatedIssue,
} from "../lib/github";
import MentionTextarea from "./MentionTextarea";
import LabelChip from "./LabelChip";
import ImageUploadButton from "./ImageUploadButton";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  /** Pre-select this Status option (e.g. opened via a per-column "+ Nuova issue" button). */
  initialStatusId?: string;
  /** Pre-select the repository by name (e.g. opened as "create sub-issue" from an issue in a known repo). */
  initialRepoName?: string;
  /** If set, the created issue is linked as a sub-issue of this issue node id and NOT added to the project board. */
  parentIssueId?: string;
  onClose: () => void;
  /** `item` is null when the created issue is a sub-issue (sub-issues aren't added to the project board). */
  onCreated: (item: ProjectItem | null, created: CreatedIssue) => void;
}

export default function NewIssueModal({
  token,
  org,
  project,
  initialStatusId,
  initialRepoName,
  parentIssueId,
  onClose,
  onCreated,
}: Props) {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [repoId, setRepoId] = useState("");
  const [metadata, setMetadata] = useState<RepoMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [milestoneId, setMilestoneId] = useState("");
  const [statusId, setStatusId] = useState(initialStatusId ?? "");
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubIssue = Boolean(parentIssueId);

  useEffect(() => {
    fetchOrgRepos(token, org)
      .then((r) => {
        setRepos(r);
        if (initialRepoName) {
          const match = r.find((x) => x.name === initialRepoName);
          if (match) setRepoId(match.id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Impossibile caricare i repository."))
      .finally(() => setReposLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, org]);

  useEffect(() => {
    if (!repoId) {
      setMetadata(null);
      return;
    }
    const repoName = repos.find((r) => r.id === repoId)?.name;
    if (!repoName) return;
    setMetadataLoading(true);
    setAssigneeIds([]);
    setLabelIds([]);
    setMilestoneId("");
    fetchRepoMetadata(token, org, repoName)
      .then(setMetadata)
      .catch((e) => setError(e instanceof Error ? e.message : "Impossibile caricare i dati del repository."))
      .finally(() => setMetadataLoading(false));
  }, [repoId, repos, token, org]);

  function setFieldInput(name: string, value: string) {
    setFieldInputs((f) => ({ ...f, [name]: value }));
  }

  async function handleCreate() {
    if (!repoId || !title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createIssue(token, {
        repositoryId: repoId,
        title: title.trim(),
        body,
        assigneeIds,
        labelIds,
        milestoneId: milestoneId || null,
      });
      if (parentIssueId) {
        await addSubIssue(token, parentIssueId, created.id);
      }

      // Sub-issues are only ever shown nested under their parent issue, never
      // as their own row in the project board/table.
      let newItem: ProjectItem | null = null;
      if (!isSubIssue) {
        const itemId = await addIssueToProject(token, project.id, created.id);

        let status = NO_STATUS;
        if (project.statusFieldId && statusId) {
          const option = project.statusOptions.find((o) => o.id === statusId);
          if (option) {
            await setProjectFieldSingleSelect(token, project.id, itemId, project.statusFieldId, statusId);
            status = option.name;
          }
        }

        const fieldsPatch: Record<string, ItemFieldValue> = {};
        for (const f of project.fields) {
          const raw = fieldInputs[f.name];
          if (!raw) continue;
          const issueField = project.issueFieldsByName[f.name];

          if (f.dataType === "SINGLE_SELECT") {
            const options = issueField?.options ?? f.options;
            const option = options?.find((o) => o.id === raw);
            if (!option) continue;
            if (issueField) await setIssueFieldSingleSelect(token, created.id, issueField.id, raw);
            else await setProjectFieldSingleSelect(token, project.id, itemId, f.id, raw);
            fieldsPatch[f.name] = { type: "singleSelect", name: option.name, color: option.color };
          } else if (f.dataType === "DATE") {
            if (issueField) await setIssueFieldDate(token, created.id, issueField.id, raw);
            else await setProjectFieldDate(token, project.id, itemId, f.id, raw);
            fieldsPatch[f.name] = { type: "date", date: raw };
          } else if (f.dataType === "NUMBER") {
            const num = Number(raw);
            if (Number.isNaN(num)) continue;
            if (issueField) await setIssueFieldNumber(token, created.id, issueField.id, num);
            else await setProjectFieldNumber(token, project.id, itemId, f.id, num);
            fieldsPatch[f.name] = { type: "number", number: num };
          } else if (f.dataType === "TEXT") {
            if (issueField) await setIssueFieldText(token, created.id, issueField.id, raw);
            else await setProjectFieldText(token, project.id, itemId, f.id, raw);
            fieldsPatch[f.name] = { type: "text", text: raw };
          }
        }

        newItem = {
          id: itemId,
          contentId: created.id,
          parentId: null,
          subIssuesSummary: null,
          status,
          contentType: "Issue",
          number: created.number,
          title: created.title,
          url: created.url,
          state: created.state,
          repository: created.repository,
          repositoryOwner: created.repositoryOwner,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          closedAt: null,
          assignees: (metadata?.assignableUsers ?? [])
            .filter((u) => assigneeIds.includes(u.id))
            .map((u) => ({ login: u.login, avatarUrl: u.avatarUrl })),
          labels: (metadata?.labels ?? [])
            .filter((l) => labelIds.includes(l.id))
            .map((l) => ({ name: l.name, color: l.color })),
          fields: fieldsPatch,
        };
      }
      onCreated(newItem, created);
      onClose();
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Creazione dell'issue non riuscita.");
    } finally {
      setCreating(false);
    }
  }

  const editableFields = project.fields.filter((f) => ["SINGLE_SELECT", "DATE", "TEXT", "NUMBER"].includes(f.dataType));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{isSubIssue ? "Nuova sub-issue" : "Nuova issue"}</h2>

        {error && (
          <div className="mt-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Repository
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            disabled={reposLoading}
            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 disabled:opacity-50"
          >
            <option value="">{reposLoading ? "Carico…" : "-- seleziona repository --"}</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Titolo
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo dell'issue"
            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Descrizione
          <MentionTextarea
            value={body}
            onChange={setBody}
            users={metadata?.assignableUsers ?? []}
            issues={project.items
              // "#123" resolves against the issue's own repository, so only
              // offer issues from the repo picked above — a candidate from a
              // different repo would silently reference the wrong issue there.
              .filter((i) => i.contentType === "Issue" && i.number != null && i.repository === repos.find((r) => r.id === repoId)?.name)
              .map((i) => ({ number: i.number!, title: i.title }))}
            rows={5}
            placeholder="Descrizione (opzionale)"
            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <div className="mt-1.5">
            <ImageUploadButton
              token={token}
              repositoryDatabaseId={repos.find((r) => r.id === repoId)?.databaseId ?? null}
              onInsert={(md) => setBody((prev) => (prev.trim() ? `${prev}\n\n${md}` : md))}
            />
          </div>
        </label>

        {metadataLoading && <p className="mt-3 text-xs text-neutral-500">Carico assegnatari, label e milestone…</p>}

        {metadata && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Assegnatari
                <select
                  value=""
                  onChange={(e) => e.target.value && setAssigneeIds((ids) => [...ids, e.target.value])}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-400"
                >
                  <option value="">+ Aggiungi</option>
                  {metadata.assignableUsers
                    .filter((u) => !assigneeIds.includes(u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.login}
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Milestone
                <select
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                >
                  <option value="">Nessuna</option>
                  {metadata.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {assigneeIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {assigneeIds.map((id) => {
                  const u = metadata.assignableUsers.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-neutral-900 py-0.5 pl-1 pr-2 text-xs">
                      <img src={u.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
                      {u.login}
                      <button
                        onClick={() => setAssigneeIds((ids) => ids.filter((x) => x !== id))}
                        className="text-neutral-500 hover:text-neutral-200"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Label
              <select
                value=""
                onChange={(e) => e.target.value && setLabelIds((ids) => [...ids, e.target.value])}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-400"
              >
                <option value="">+ Aggiungi</option>
                {metadata.labels
                  .filter((l) => !labelIds.includes(l.id))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
            {labelIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labelIds.map((id) => {
                  const l = metadata.labels.find((x) => x.id === id);
                  if (!l) return null;
                  return (
                    <LabelChip key={id} name={l.name} color={l.color} onRemove={() => setLabelIds((ids) => ids.filter((x) => x !== id))} />
                  );
                })}
              </div>
            )}

            {isSubIssue && (
              <p className="mt-4 text-[11px] text-neutral-600">
                Le sub-issue non vengono aggiunte al progetto, quindi i suoi campi non sono impostabili qui.
              </p>
            )}

            {!isSubIssue && (project.statusFieldId || editableFields.length > 0) && (
              <div className="mt-5 border-t border-neutral-800 pt-4">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Campi del progetto</h3>
                <div className="grid grid-cols-2 gap-3">
                  {project.statusFieldId && (
                    <label className="text-xs text-neutral-500">
                      Status
                      <select
                        value={statusId}
                        onChange={(e) => setStatusId(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                      >
                        <option value="">—</option>
                        {project.statusOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {editableFields.map((f) => {
                    const issueField = project.issueFieldsByName[f.name];
                    if (f.dataType === "SINGLE_SELECT") {
                      const options = issueField?.options ?? f.options;
                      return (
                        <label key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <select
                            value={fieldInputs[f.name] ?? ""}
                            onChange={(e) => setFieldInput(f.name, e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                          >
                            <option value="">—</option>
                            {options?.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }
                    if (f.dataType === "DATE") {
                      return (
                        <label key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <input
                            type="date"
                            value={fieldInputs[f.name] ?? ""}
                            onChange={(e) => setFieldInput(f.name, e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                          />
                        </label>
                      );
                    }
                    if (f.dataType === "NUMBER") {
                      return (
                        <label key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <input
                            type="number"
                            value={fieldInputs[f.name] ?? ""}
                            onChange={(e) => setFieldInput(f.name, e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                          />
                        </label>
                      );
                    }
                    return (
                      <label key={f.id} className="text-xs text-neutral-500">
                        {f.name}
                        <input
                          type="text"
                          value={fieldInputs[f.name] ?? ""}
                          onChange={(e) => setFieldInput(f.name, e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
            Annulla
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !repoId || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creo…" : isSubIssue ? "Crea sub-issue" : "Crea issue"}
          </button>
        </div>
      </div>
    </div>
  );
}
