import { useEffect, useState } from "react";
import {
  fetchIssueDetail,
  updateIssueTitle,
  updateIssueBody,
  setIssueState,
  setIssueMilestone,
  addIssueAssignee,
  removeIssueAssignee,
  addIssueLabel,
  removeIssueLabel,
  addIssueComment,
  setProjectFieldSingleSelect,
  setProjectFieldMultiSelect,
  setProjectFieldDate,
  setProjectFieldText,
  setProjectFieldNumber,
  clearProjectFieldValue,
  setIssueFieldSingleSelect,
  setIssueFieldDate,
  setIssueFieldText,
  setIssueFieldNumber,
  clearIssueFieldValue,
  removeItemFromProject,
  GithubApiError,
  type IssueDetail,
  type ProjectDetail,
  type ProjectItem,
  type IssueRef,
  type RepoLabel,
} from "../lib/github";
import { colorStyle } from "../lib/colors";
import { realProjectFields } from "../lib/columns";
import MarkdownContent from "./MarkdownContent";
import LabelChip from "./LabelChip";
import ImageUploadButton from "./ImageUploadButton";
import MentionTextarea from "./MentionTextarea";
import SubIssuesSection from "./SubIssuesSection";
import ExternalLink from "./ExternalLink";
import LabelManager from "./LabelManager";

interface Props {
  token: string;
  org: string;
  issueRef: IssueRef;
  project: ProjectDetail;
  onClose: () => void;
  onItemChange: (itemId: string, patch: Partial<ProjectItem>) => void;
  onItemAdded: (item: ProjectItem) => void;
  onItemRemoved: (itemId: string) => void;
  onOpenIssue: (ref: IssueRef) => void;
}

export default function IssueDetailPanel({
  token,
  org,
  issueRef,
  project,
  onClose,
  onItemChange,
  onItemAdded,
  onItemRemoved,
  onOpenIssue,
}: Props) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);

  // Sub-issues aren't added to the project board, so an issue opened from a
  // Sub-issue list won't have a matching entry here — project-field editing
  // is hidden in that case (see `projectItem &&` checks below).
  const projectItem = detail ? project.items.find((i) => i.contentId === detail.id) ?? null : null;

  // "#123" always resolves against the repository the comment/issue lives in,
  // so cross-repo candidates would silently link to the wrong issue there.
  const issueCandidates = project.items
    .filter(
      (i) => i.contentType === "Issue" && i.number != null && i.contentId !== detail?.id && i.repository === issueRef.repository,
    )
    .map((i) => ({ number: i.number!, title: i.title }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDetail(null);

    fetchIssueDetail(token, issueRef.repositoryOwner, issueRef.repository, issueRef.number)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setTitleDraft(d.title);
        setBodyDraft(d.body ?? "");
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Errore sconosciuto");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, issueRef.repositoryOwner, issueRef.repository, issueRef.number]);

  async function guarded(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof GithubApiError ? e.message : "Operazione non riuscita.");
    }
  }

  async function commitTitle() {
    if (!detail || titleDraft === detail.title) return;
    await guarded(async () => {
      await updateIssueTitle(token, detail.id, titleDraft);
      setDetail({ ...detail, title: titleDraft });
      if (projectItem) onItemChange(projectItem.id, { title: titleDraft });
    });
  }

  async function commitBody() {
    setEditingBody(false);
    if (!detail || bodyDraft === detail.body) return;
    await guarded(async () => {
      await updateIssueBody(token, detail.id, bodyDraft);
      setDetail({ ...detail, body: bodyDraft });
    });
  }

  async function toggleState() {
    if (!detail) return;
    const next = detail.state === "CLOSED" ? "OPEN" : "CLOSED";
    await guarded(async () => {
      await setIssueState(token, detail.id, next);
      setDetail({ ...detail, state: next });
      if (projectItem) onItemChange(projectItem.id, { state: next });
    });
  }

  async function changeMilestone(milestoneId: string) {
    if (!detail) return;
    await guarded(async () => {
      await setIssueMilestone(token, detail.id, milestoneId || null);
      const milestone = detail.repoMilestones.find((m) => m.id === milestoneId) ?? null;
      setDetail({ ...detail, milestone });
    });
  }

  async function addAssignee(userId: string) {
    if (!detail || !userId) return;
    await guarded(async () => {
      await addIssueAssignee(token, detail.id, userId);
      const user = detail.repoAssignableUsers.find((u) => u.id === userId)!;
      const nextAssignees = [...detail.assignees, user];
      setDetail({ ...detail, assignees: nextAssignees });
      if (projectItem) onItemChange(projectItem.id, { assignees: nextAssignees.map((u) => ({ login: u.login, avatarUrl: u.avatarUrl })) });
    });
  }

  async function removeAssignee(userId: string) {
    if (!detail) return;
    await guarded(async () => {
      await removeIssueAssignee(token, detail.id, userId);
      const nextAssignees = detail.assignees.filter((u) => u.id !== userId);
      setDetail({ ...detail, assignees: nextAssignees });
      if (projectItem) onItemChange(projectItem.id, { assignees: nextAssignees.map((u) => ({ login: u.login, avatarUrl: u.avatarUrl })) });
    });
  }

  async function addLabel(labelId: string) {
    if (!detail || !labelId) return;
    await guarded(async () => {
      await addIssueLabel(token, detail.id, labelId);
      const label = detail.repoLabels.find((l) => l.id === labelId)!;
      const nextLabels = [...detail.labels, label];
      setDetail({ ...detail, labels: nextLabels });
      if (projectItem) onItemChange(projectItem.id, { labels: nextLabels.map((l) => ({ name: l.name, color: l.color })) });
    });
  }

  async function removeLabel(labelId: string) {
    if (!detail) return;
    await guarded(async () => {
      await removeIssueLabel(token, detail.id, labelId);
      const nextLabels = detail.labels.filter((l) => l.id !== labelId);
      setDetail({ ...detail, labels: nextLabels });
      if (projectItem) onItemChange(projectItem.id, { labels: nextLabels.map((l) => ({ name: l.name, color: l.color })) });
    });
  }

  function handleLabelCreated(label: RepoLabel) {
    setDetail((d) => (d ? { ...d, repoLabels: [...d.repoLabels, label] } : d));
  }

  function handleLabelUpdated(label: RepoLabel) {
    const wasOnIssue = detail?.labels.some((l) => l.id === label.id) ?? false;
    setDetail((d) => {
      if (!d) return d;
      const repoLabels = d.repoLabels.map((l) => (l.id === label.id ? label : l));
      const labels = d.labels.map((l) => (l.id === label.id ? label : l));
      return { ...d, repoLabels, labels };
    });
    if (projectItem && wasOnIssue) {
      const nextLabels = (detail?.labels ?? []).map((l) => (l.id === label.id ? label : l));
      onItemChange(projectItem.id, { labels: nextLabels.map((l) => ({ name: l.name, color: l.color })) });
    }
  }

  async function changeStatus(optionId: string) {
    if (!project.statusFieldId || !projectItem) return;
    await guarded(async () => {
      await setProjectFieldSingleSelect(token, project.id, projectItem.id, project.statusFieldId!, optionId);
      const option = project.statusOptions.find((o) => o.id === optionId);
      if (option) onItemChange(projectItem.id, { status: option.name });
    });
  }

  async function changeSingleSelectField(fieldId: string, fieldName: string, optionId: string) {
    if (!projectItem) return;
    const issueField = project.issueFieldsByName[fieldName];
    await guarded(async () => {
      if (!optionId) {
        if (issueField && detail) await clearIssueFieldValue(token, detail.id, issueField.id);
        else await clearProjectFieldValue(token, project.id, projectItem.id, fieldId);
        const next = { ...projectItem.fields };
        delete next[fieldName];
        onItemChange(projectItem.id, { fields: next });
        return;
      }
      const options = issueField?.options ?? project.fields.find((f) => f.id === fieldId)?.options;
      const option = options?.find((o) => o.id === optionId);
      if (issueField && detail) await setIssueFieldSingleSelect(token, detail.id, issueField.id, optionId);
      else await setProjectFieldSingleSelect(token, project.id, projectItem.id, fieldId, optionId);
      if (option) {
        onItemChange(projectItem.id, {
          fields: { ...projectItem.fields, [fieldName]: { type: "singleSelect", name: option.name, color: option.color } },
        });
      }
    });
  }

  async function changeMultiSelectField(fieldId: string, fieldName: string, optionIds: string[]) {
    if (!projectItem) return;
    await guarded(async () => {
      await setProjectFieldMultiSelect(token, project.id, projectItem.id, fieldId, optionIds);
      const options = project.fields.find((f) => f.id === fieldId)?.options ?? [];
      const selected = options.filter((o) => optionIds.includes(o.id)).map((o) => ({ name: o.name, color: o.color }));
      if (selected.length === 0) {
        const next = { ...projectItem.fields };
        delete next[fieldName];
        onItemChange(projectItem.id, { fields: next });
      } else {
        onItemChange(projectItem.id, { fields: { ...projectItem.fields, [fieldName]: { type: "multiSelect", options: selected } } });
      }
    });
  }

  async function changeDateField(fieldId: string, fieldName: string, value: string) {
    if (!projectItem) return;
    const issueField = project.issueFieldsByName[fieldName];
    await guarded(async () => {
      if (!value) {
        if (issueField && detail) await clearIssueFieldValue(token, detail.id, issueField.id);
        else await clearProjectFieldValue(token, project.id, projectItem.id, fieldId);
        const next = { ...projectItem.fields };
        delete next[fieldName];
        onItemChange(projectItem.id, { fields: next });
        return;
      }
      if (issueField && detail) await setIssueFieldDate(token, detail.id, issueField.id, value);
      else await setProjectFieldDate(token, project.id, projectItem.id, fieldId, value);
      onItemChange(projectItem.id, { fields: { ...projectItem.fields, [fieldName]: { type: "date", date: value } } });
    });
  }

  async function changeTextField(fieldId: string, fieldName: string, value: string) {
    if (!projectItem) return;
    const issueField = project.issueFieldsByName[fieldName];
    await guarded(async () => {
      if (!value) {
        if (issueField && detail) await clearIssueFieldValue(token, detail.id, issueField.id);
        else await clearProjectFieldValue(token, project.id, projectItem.id, fieldId);
        const next = { ...projectItem.fields };
        delete next[fieldName];
        onItemChange(projectItem.id, { fields: next });
        return;
      }
      if (issueField && detail) await setIssueFieldText(token, detail.id, issueField.id, value);
      else await setProjectFieldText(token, project.id, projectItem.id, fieldId, value);
      onItemChange(projectItem.id, { fields: { ...projectItem.fields, [fieldName]: { type: "text", text: value } } });
    });
  }

  async function changeNumberField(fieldId: string, fieldName: string, value: string) {
    if (!projectItem) return;
    const issueField = project.issueFieldsByName[fieldName];
    await guarded(async () => {
      if (value === "") {
        if (issueField && detail) await clearIssueFieldValue(token, detail.id, issueField.id);
        else await clearProjectFieldValue(token, project.id, projectItem.id, fieldId);
        const next = { ...projectItem.fields };
        delete next[fieldName];
        onItemChange(projectItem.id, { fields: next });
        return;
      }
      const num = Number(value);
      if (Number.isNaN(num)) return;
      if (issueField && detail) await setIssueFieldNumber(token, detail.id, issueField.id, num);
      else await setProjectFieldNumber(token, project.id, projectItem.id, fieldId, num);
      onItemChange(projectItem.id, { fields: { ...projectItem.fields, [fieldName]: { type: "number", number: num } } });
    });
  }

  async function postComment() {
    if (!detail || !commentDraft.trim()) return;
    setPostingComment(true);
    try {
      const comment = await addIssueComment(token, detail.id, commentDraft.trim());
      setDetail({ ...detail, comments: [...detail.comments, comment] });
      setCommentDraft("");
    } catch (e) {
      setActionError(e instanceof GithubApiError ? e.message : "Impossibile pubblicare il commento.");
    } finally {
      setPostingComment(false);
    }
  }

  async function unlinkProject(link: { itemId: string; projectId: string }) {
    if (!detail) return;
    await guarded(async () => {
      await removeItemFromProject(token, link.projectId, link.itemId);
      setDetail({ ...detail, projectItems: detail.projectItems.filter((p) => p.itemId !== link.itemId) });
      if (link.itemId === projectItem?.id) onItemRemoved(link.itemId);
    });
  }

  // Every true custom project field shows up here (GitHub's own reflected
  // fields like Title/Assignees/Milestone are excluded — they have their own
  // dedicated sections above). The ones this app knows how to render/edit
  // (SINGLE_SELECT/DATE/NUMBER, TEXT as the fallback) get a real input;
  // anything else falls back to a read-only row rather than being silently missing.
  const editableFields = realProjectFields(project);
  const KNOWN_FIELD_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT", "DATE", "NUMBER", "TEXT"]);
  const statusStyle = colorStyle(project.statusOptions.find((o) => o.name === projectItem?.status)?.color);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <span className="text-xs text-neutral-500">
            {issueRef.repositoryOwner}/{issueRef.repository} #{issueRef.number}
          </span>
          <div className="flex items-center gap-3">
            {detail?.url && (
              <ExternalLink href={detail.url} className="text-xs text-neutral-500 hover:text-neutral-300">
                Apri su GitHub ↗
              </ExternalLink>
            )}
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
              ✕
            </button>
          </div>
        </div>

        {loading && <div className="p-5 text-sm text-neutral-500">Carico…</div>}
        {loadError && <div className="p-5 text-sm text-red-400">{loadError}</div>}

        {detail && (
          <div className="flex-1 space-y-6 p-5">
            {actionError && (
              <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                {actionError}
              </div>
            )}

            <textarea
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              rows={1}
              className="w-full resize-none bg-transparent text-xl font-semibold leading-snug outline-none focus:ring-0"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleState}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  detail.state === "CLOSED" ? "bg-purple-950/60 text-purple-300" : "bg-emerald-950/60 text-emerald-300"
                }`}
              >
                {detail.state === "CLOSED" ? "Chiusa — riapri" : "Aperta — chiudi"}
              </button>

              {projectItem && project.statusFieldId && (
                <select
                  value={project.statusOptions.find((o) => o.name === projectItem.status)?.id ?? ""}
                  onChange={(e) => changeStatus(e.target.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                >
                  {project.statusOptions.map((o) => (
                    <option key={o.id} value={o.id} className="bg-neutral-900 text-neutral-100">
                      {o.name}
                    </option>
                  ))}
                </select>
              )}

              <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400">
                {issueRef.repositoryOwner}/{issueRef.repository}
              </span>
            </div>

            {!projectItem && (
              <p className="text-xs text-neutral-600">Questa issue non è nella tabella del progetto corrente.</p>
            )}

            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Descrizione</h3>
              {editingBody ? (
                <>
                  <MentionTextarea
                    autoFocus
                    value={bodyDraft}
                    onChange={setBodyDraft}
                    onBlur={commitBody}
                    users={detail.repoAssignableUsers}
                    issues={issueCandidates}
                    rows={10}
                    placeholder="Nessuna descrizione"
                    className="w-full rounded-lg border border-indigo-500 bg-neutral-900 px-3 py-2 text-sm outline-none"
                  />
                  <div className="mt-1.5">
                    <ImageUploadButton
                      token={token}
                      repositoryDatabaseId={detail.repositoryDatabaseId}
                      onInsert={(md) => setBodyDraft((prev) => (prev.trim() ? `${prev}\n\n${md}` : md))}
                    />
                  </div>
                </>
              ) : bodyDraft.trim() ? (
                <MarkdownContent
                  markdown={bodyDraft}
                  token={token}
                  onClick={() => setEditingBody(true)}
                  onOpenIssueRef={(number) => onOpenIssue({ repositoryOwner: issueRef.repositoryOwner, repository: issueRef.repository, number })}
                  className="prose prose-invert prose-sm max-w-none cursor-text rounded-lg border border-transparent px-3 py-2 hover:border-neutral-800"
                />
              ) : (
                <button
                  onClick={() => setEditingBody(true)}
                  className="w-full rounded-lg border border-dashed border-neutral-800 px-3 py-2 text-left text-sm text-neutral-600"
                >
                  Nessuna descrizione — clicca per aggiungerne una
                </button>
              )}
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Assegnatari</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detail.assignees.map((a) => (
                    <span key={a.id} className="flex items-center gap-1 rounded-full bg-neutral-900 py-0.5 pl-1 pr-2 text-xs">
                      <img src={a.avatarUrl} alt={a.login} className="h-4 w-4 rounded-full" />
                      {a.login}
                      <button onClick={() => removeAssignee(a.id)} className="text-neutral-500 hover:text-neutral-200">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  value=""
                  onChange={(e) => addAssignee(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400"
                >
                  <option value="">+ Aggiungi assegnatario</option>
                  {detail.repoAssignableUsers
                    .filter((u) => !detail.assignees.some((a) => a.id === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.login}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Milestone</h3>
                <select
                  value={detail.milestone?.id ?? ""}
                  onChange={(e) => changeMilestone(e.target.value)}
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                >
                  <option value="">Nessuna milestone</option>
                  {detail.repoMilestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Label</h3>
                <button onClick={() => setShowLabelManager(true)} className="text-xs text-neutral-500 hover:text-neutral-300">
                  Gestisci label…
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.labels.map((l) => (
                  <LabelChip key={l.id} name={l.name} color={l.color} onRemove={() => removeLabel(l.id)} />
                ))}
              </div>
              <select
                value=""
                onChange={(e) => addLabel(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400"
              >
                <option value="">+ Aggiungi label</option>
                {detail.repoLabels
                  .filter((l) => !detail.labels.some((x) => x.id === l.id))
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </section>

            {projectItem && editableFields.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Campi del progetto</h3>
                <div className="grid grid-cols-2 gap-3">
                  {editableFields.map((f) => {
                    const value = projectItem.fields[f.name];
                    const issueField = project.issueFieldsByName[f.name];
                    if (f.dataType === "SINGLE_SELECT") {
                      const options = issueField?.options ?? f.options;
                      const currentOptionId = value?.type === "singleSelect" ? options?.find((o) => o.name === value.name)?.id : undefined;
                      return (
                        <label key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <select
                            value={currentOptionId ?? ""}
                            onChange={(e) => changeSingleSelectField(f.id, f.name, e.target.value)}
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
                    if (f.dataType === "MULTI_SELECT") {
                      const options = f.options ?? [];
                      const selectedNames = new Set(value?.type === "multiSelect" ? value.options.map((o) => o.name) : []);
                      function toggle(option: NonNullable<typeof f.options>[number]) {
                        const currentIds = options.filter((o) => selectedNames.has(o.name)).map((o) => o.id);
                        const nextIds = selectedNames.has(option.name)
                          ? currentIds.filter((id) => id !== option.id)
                          : [...currentIds, option.id];
                        changeMultiSelectField(f.id, f.name, nextIds);
                      }
                      return (
                        <div key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5">
                            {options.length === 0 && <span className="text-neutral-700">—</span>}
                            {options.map((o) => {
                              const active = selectedNames.has(o.name);
                              const style = colorStyle(o.color);
                              return (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => toggle(o)}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                                    active ? `${style.bg} ${style.text} ${style.border}` : "border-neutral-800 text-neutral-600 hover:border-neutral-600"
                                  }`}
                                >
                                  {o.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    if (f.dataType === "DATE") {
                      return (
                        <label key={f.id} className="text-xs text-neutral-500">
                          {f.name}
                          <input
                            type="date"
                            defaultValue={value?.type === "date" ? value.date : ""}
                            onBlur={(e) => changeDateField(f.id, f.name, e.target.value)}
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
                            defaultValue={value?.type === "number" ? value.number : ""}
                            onBlur={(e) => changeNumberField(f.id, f.name, e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                          />
                        </label>
                      );
                    }
                    if (!KNOWN_FIELD_TYPES.has(f.dataType)) {
                      return (
                        <div key={f.id} className="text-xs text-neutral-500">
                          {f.name} <span className="text-neutral-700">({f.dataType}, non ancora supportato)</span>
                          <p className="mt-1 rounded-lg border border-dashed border-neutral-800 px-2 py-1.5 text-sm text-neutral-600">
                            {value && value.type === "text" ? value.text : "—"}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <label key={f.id} className="text-xs text-neutral-500">
                        {f.name}
                        <input
                          type="text"
                          defaultValue={value?.type === "text" ? value.text : ""}
                          onBlur={(e) => changeTextField(f.id, f.name, e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {detail.projectItems.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Progetti collegati</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detail.projectItems.map((p) => (
                    <span
                      key={p.itemId}
                      className={`flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1.5 text-xs ${
                        p.projectId === project.id ? "bg-indigo-950/60 text-indigo-300" : "bg-neutral-900 text-neutral-300"
                      }`}
                    >
                      {p.projectTitle} <span className="opacity-60">#{p.projectNumber}</span>
                      <button
                        onClick={() => unlinkProject(p)}
                        title={`Scollega da "${p.projectTitle}"`}
                        className="text-current opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}

            <SubIssuesSection
              token={token}
              org={org}
              project={project}
              issueId={detail.id}
              repoName={issueRef.repository}
              subIssues={detail.subIssues}
              onSubIssuesChange={(next) => setDetail({ ...detail, subIssues: next })}
              onItemAdded={onItemAdded}
              onOpenIssue={onOpenIssue}
            />

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Commenti ({detail.comments.length})
              </h3>
              <div className="space-y-3">
                {detail.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-neutral-500">
                      {c.author && <img src={c.author.avatarUrl} alt="" className="h-4 w-4 rounded-full" />}
                      <span>{c.author?.login ?? "sconosciuto"}</span>
                      <span>· {new Date(c.createdAt).toLocaleString("it-IT")}</span>
                    </div>
                    <MarkdownContent
                      markdown={c.body}
                      token={token}
                      onOpenIssueRef={(number) => onOpenIssue({ repositoryOwner: issueRef.repositoryOwner, repository: issueRef.repository, number })}
                      className="prose prose-invert prose-sm max-w-none"
                    />
                  </div>
                ))}
              </div>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                users={detail.repoAssignableUsers}
                issues={issueCandidates}
                rows={3}
                placeholder="Scrivi un commento… (usa @ per menzionare, # per citare un'issue)"
                className="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={postComment}
                  disabled={postingComment || !commentDraft.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {postingComment ? "Invio…" : "Commenta"}
                </button>
                <ImageUploadButton
                  token={token}
                  repositoryDatabaseId={detail.repositoryDatabaseId}
                  onInsert={(md) => setCommentDraft((prev) => (prev.trim() ? `${prev}\n\n${md}` : md))}
                />
              </div>
            </section>
          </div>
        )}
      </div>

      {showLabelManager && detail && (
        <LabelManager
          token={token}
          repositoryId={detail.repositoryId}
          labels={detail.repoLabels}
          onClose={() => setShowLabelManager(false)}
          onCreated={handleLabelCreated}
          onUpdated={handleLabelUpdated}
        />
      )}
    </div>
  );
}
