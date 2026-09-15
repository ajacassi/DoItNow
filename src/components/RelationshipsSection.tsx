import { useState } from "react";
import { addBlockedBy, removeBlockedBy, type SubIssueSummary, type ProjectDetail, type IssueRef } from "../lib/github";
import IssuePicker from "./IssuePicker";
import ExternalLink from "./ExternalLink";

interface ListProps {
  token: string;
  org: string;
  project: ProjectDetail;
  label: string;
  addLabel: string;
  items: SubIssueSummary[];
  excludeContentIds: string[];
  onAdd: (picked: SubIssueSummary) => Promise<void>;
  onRemove: (item: SubIssueSummary) => Promise<void>;
  onOpenIssue: (ref: IssueRef) => void;
}

function RelationshipList({ token, org, project, label, addLabel, items, excludeContentIds, onAdd, onRemove, onOpenIssue }: ListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [picked, setPicked] = useState<SubIssueSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmAdd() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(picked);
      setShowAdd(false);
      setPicked(null);
    } catch {
      setError("Impossibile collegare l'issue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label} ({items.length})
      </h4>
      {items.length > 0 && (
        <ul className="mb-1.5 space-y-1.5">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
              <button
                onClick={() => onOpenIssue({ repositoryOwner: s.repositoryOwner, repository: s.repository, number: s.number })}
                className="min-w-0 truncate text-left text-sm hover:underline"
              >
                <span className={s.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-100"}>{s.title}</span>
                <span className="ml-1.5 text-xs text-neutral-500">
                  {s.repository}#{s.number}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <ExternalLink href={s.url} className="text-xs text-neutral-600 hover:text-neutral-400">
                  ↗
                </ExternalLink>
                <button onClick={() => onRemove(s)} className="text-xs text-neutral-500 hover:text-neutral-200">
                  Scollega
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500">
          {addLabel}
        </button>
      ) : (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <IssuePicker token={token} org={org} project={project} value={picked} onChange={setPicked} excludeContentIds={excludeContentIds} />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAdd(false);
                setPicked(null);
                setError(null);
              }}
              className="text-xs text-neutral-500 hover:text-neutral-200"
            >
              Annulla
            </button>
            <button
              onClick={confirmAdd}
              disabled={!picked || busy}
              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "Collego…" : "Collega"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  issueId: string;
  blockedBy: SubIssueSummary[];
  blocking: SubIssueSummary[];
  onBlockedByChange: (next: SubIssueSummary[]) => void;
  onBlockingChange: (next: SubIssueSummary[]) => void;
  onOpenIssue: (ref: IssueRef) => void;
}

export default function RelationshipsSection({
  token,
  org,
  project,
  issueId,
  blockedBy,
  blocking,
  onBlockedByChange,
  onBlockingChange,
  onOpenIssue,
}: Props) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Relazioni</h3>

      <RelationshipList
        token={token}
        org={org}
        project={project}
        label="Bloccata da"
        addLabel="+ Segna come bloccata da"
        items={blockedBy}
        excludeContentIds={[issueId, ...blockedBy.map((s) => s.id)]}
        onOpenIssue={onOpenIssue}
        onAdd={async (picked) => {
          await addBlockedBy(token, issueId, picked.id);
          onBlockedByChange([...blockedBy, picked]);
        }}
        onRemove={async (item) => {
          await removeBlockedBy(token, issueId, item.id);
          onBlockedByChange(blockedBy.filter((s) => s.id !== item.id));
        }}
      />

      <RelationshipList
        token={token}
        org={org}
        project={project}
        label="Blocca"
        addLabel="+ Segna come bloccante di"
        items={blocking}
        excludeContentIds={[issueId, ...blocking.map((s) => s.id)]}
        onOpenIssue={onOpenIssue}
        onAdd={async (picked) => {
          await addBlockedBy(token, picked.id, issueId);
          onBlockingChange([...blocking, picked]);
        }}
        onRemove={async (item) => {
          await removeBlockedBy(token, item.id, issueId);
          onBlockingChange(blocking.filter((s) => s.id !== item.id));
        }}
      />
    </section>
  );
}
