import { useState } from "react";
import {
  addSubIssue,
  removeSubIssue,
  type SubIssueSummary,
  type ProjectDetail,
  type ProjectItem,
  type IssueRef,
  type StatusOption,
} from "../lib/github";
import NewIssueModal from "./NewIssueModal";
import IssuePicker from "./IssuePicker";
import ExternalLink from "./ExternalLink";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  issueId: string;
  repoName: string | null;
  parent: SubIssueSummary | null;
  onParentChange: (next: SubIssueSummary | null) => void;
  subIssues: SubIssueSummary[];
  onSubIssuesChange: (next: SubIssueSummary[]) => void;
  onItemAdded: (item: ProjectItem) => void;
  onFieldOptionsChanged: (fieldId: string, options: StatusOption[]) => void;
  onOpenIssue: (ref: IssueRef) => void;
}

export default function SubIssuesSection({
  token,
  org,
  project,
  issueId,
  repoName,
  parent,
  onParentChange,
  subIssues,
  onSubIssuesChange,
  onItemAdded,
  onFieldOptionsChanged,
  onOpenIssue,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [picked, setPicked] = useState<SubIssueSummary | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showSetParent, setShowSetParent] = useState(false);
  const [pickedParent, setPickedParent] = useState<SubIssueSummary | null>(null);
  const [settingParent, setSettingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  async function confirmSetParent() {
    if (!pickedParent) return;
    setSettingParent(true);
    setParentError(null);
    try {
      await addSubIssue(token, pickedParent.id, issueId);
      onParentChange(pickedParent);
      setShowSetParent(false);
      setPickedParent(null);
    } catch {
      setParentError("Impossibile impostare il padre.");
    } finally {
      setSettingParent(false);
    }
  }

  async function unlinkParent() {
    if (!parent) return;
    try {
      await removeSubIssue(token, parent.id, issueId);
      onParentChange(null);
    } catch {
      // leave unchanged if the call fails
    }
  }

  async function confirmAddExisting() {
    if (!picked) return;
    setLinking(true);
    setError(null);
    try {
      await addSubIssue(token, issueId, picked.id);
      onSubIssuesChange([...subIssues, picked]);
      setShowAddExisting(false);
      setPicked(null);
    } catch {
      setError("Impossibile collegare l'issue.");
    } finally {
      setLinking(false);
    }
  }

  async function unlink(sub: SubIssueSummary) {
    try {
      await removeSubIssue(token, issueId, sub.id);
      onSubIssuesChange(subIssues.filter((s) => s.id !== sub.id));
    } catch {
      // leave list unchanged if the call fails
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Padre</h3>
        {parent ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
            <button
              onClick={() => onOpenIssue({ repositoryOwner: parent.repositoryOwner, repository: parent.repository, number: parent.number })}
              className="min-w-0 truncate text-left text-sm hover:underline"
            >
              <span className={parent.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-100"}>{parent.title}</span>
              <span className="ml-1.5 text-xs text-neutral-500">
                {parent.repository}#{parent.number}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              <ExternalLink href={parent.url} className="text-xs text-neutral-600 hover:text-neutral-400">
                ↗
              </ExternalLink>
              <button onClick={unlinkParent} className="text-xs text-neutral-500 hover:text-neutral-200">
                Scollega
              </button>
            </div>
          </div>
        ) : !showSetParent ? (
          <button
            onClick={() => setShowSetParent(true)}
            className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
          >
            + Imposta padre
          </button>
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
            <IssuePicker token={token} org={org} project={project} value={pickedParent} onChange={setPickedParent} excludeContentIds={[issueId]} />
            {parentError && <p className="mt-1 text-xs text-red-400">{parentError}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSetParent(false);
                  setPickedParent(null);
                  setParentError(null);
                }}
                className="text-xs text-neutral-500 hover:text-neutral-200"
              >
                Annulla
              </button>
              <button
                onClick={confirmSetParent}
                disabled={!pickedParent || settingParent}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {settingParent ? "Collego…" : "Collega"}
              </button>
            </div>
          </div>
        )}
      </div>

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Sub-issue ({subIssues.length})
      </h3>

      {subIssues.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {subIssues.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5"
            >
              <button
                onClick={() => onOpenIssue({ repositoryOwner: s.repositoryOwner, repository: s.repository, number: s.number })}
                className="min-w-0 truncate text-left text-sm hover:underline"
              >
                <span className={s.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-100"}>
                  {s.title}
                </span>
                <span className="ml-1.5 text-xs text-neutral-500">
                  {s.repository}#{s.number}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <ExternalLink href={s.url} className="text-xs text-neutral-600 hover:text-neutral-400">
                  ↗
                </ExternalLink>
                <button onClick={() => unlink(s)} className="text-xs text-neutral-500 hover:text-neutral-200">
                  Scollega
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
        >
          + Crea sub-issue
        </button>
        <button
          onClick={() => setShowAddExisting(true)}
          className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
        >
          + Aggiungi esistente
        </button>
      </div>

      {showAddExisting && (
        <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <IssuePicker
            token={token}
            org={org}
            project={project}
            value={picked}
            onChange={setPicked}
            excludeContentIds={[issueId, ...subIssues.map((s) => s.id)]}
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAddExisting(false);
                setPicked(null);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-200"
            >
              Annulla
            </button>
            <button
              onClick={confirmAddExisting}
              disabled={!picked || linking}
              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {linking ? "Collego…" : "Collega"}
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <NewIssueModal
          token={token}
          org={org}
          project={project}
          parentIssueId={issueId}
          initialRepoName={repoName ?? undefined}
          onFieldOptionsChanged={onFieldOptionsChanged}
          onClose={() => setShowCreate(false)}
          onCreated={(item, created) => {
            if (item) onItemAdded(item);
            onSubIssuesChange([
              ...subIssues,
              {
                id: created.id,
                number: created.number,
                title: created.title,
                state: created.state,
                url: created.url,
                repository: created.repository,
                repositoryOwner: created.repositoryOwner,
              },
            ]);
          }}
        />
      )}
    </section>
  );
}
