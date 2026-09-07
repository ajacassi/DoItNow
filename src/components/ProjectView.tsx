import { useState } from "react";
import type { ProjectDetail, ProjectItem, IssueRef } from "../lib/github";
import ProjectTable from "./ProjectTable";
import ProjectBoard from "./ProjectBoard";
import IssueDetailPanel from "./IssueDetailPanel";
import NewIssueModal from "./NewIssueModal";
import LabelFilterSidebar from "./LabelFilterSidebar";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onItemChange: (itemId: string, patch: Partial<ProjectItem>) => void;
  onItemAdded: (item: ProjectItem) => void;
}

type ViewMode = "table" | "board";

export default function ProjectView({ token, org, project, onBack, onRefresh, refreshing, onItemChange, onItemAdded }: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [openIssueRef, setOpenIssueRef] = useState<IssueRef | null>(null);
  const [newIssueStatusId, setNewIssueStatusId] = useState<string | null>(null);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [showLabelFilter, setShowLabelFilter] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());

  function openItemDetail(item: ProjectItem) {
    if (item.repositoryOwner && item.repository && item.number != null) {
      setOpenIssueRef({ repositoryOwner: item.repositoryOwner, repository: item.repository, number: item.number });
    }
  }

  function toggleLabel(name: string) {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const visibleProject: ProjectDetail =
    selectedLabels.size === 0
      ? project
      : { ...project, items: project.items.filter((item) => item.labels.some((l) => selectedLabels.has(l.name))) };

  function openNewIssue(statusId?: string) {
    setNewIssueStatusId(statusId ?? null);
    setShowNewIssue(true);
  }

  return (
    <div className="flex h-screen w-full flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-300">
            ← Progetti
          </button>
          <h1 className="text-lg font-semibold tracking-tight">{project.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openNewIssue()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            + Nuova issue
          </button>
          <button
            onClick={() => setShowLabelFilter((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
              showLabelFilter
                ? "border-indigo-500 text-indigo-300"
                : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            Label
            {selectedLabels.size > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
                {selectedLabels.size}
              </span>
            )}
          </button>
          <div className="flex rounded-lg border border-neutral-800 p-0.5 text-xs">
            <button
              onClick={() => setView("table")}
              className={`rounded-md px-3 py-1 transition ${
                view === "table" ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Tabella
            </button>
            <button
              onClick={() => setView("board")}
              className={`rounded-md px-3 py-1 transition ${
                view === "board" ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Board
            </button>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500 disabled:opacity-50"
          >
            {refreshing ? "Aggiorno…" : "Aggiorna"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {showLabelFilter && (
          <LabelFilterSidebar
            projectId={project.id}
            items={project.items}
            selected={selectedLabels}
            onToggle={toggleLabel}
            onClear={() => setSelectedLabels(new Set())}
          />
        )}
        <main className="min-h-0 flex-1">
          {view === "table" ? (
            <ProjectTable project={visibleProject} onOpenItem={openItemDetail} onNewIssueForStatus={openNewIssue} />
          ) : (
            <ProjectBoard project={visibleProject} onOpenItem={openItemDetail} onNewIssueForStatus={openNewIssue} />
          )}
        </main>
      </div>

      {openIssueRef && (
        <IssueDetailPanel
          token={token}
          org={org}
          issueRef={openIssueRef}
          project={project}
          onClose={() => setOpenIssueRef(null)}
          onItemChange={onItemChange}
          onItemAdded={onItemAdded}
          onOpenIssue={setOpenIssueRef}
        />
      )}

      {showNewIssue && (
        <NewIssueModal
          token={token}
          org={org}
          project={project}
          initialStatusId={newIssueStatusId ?? undefined}
          onClose={() => setShowNewIssue(false)}
          onCreated={(item) => item && onItemAdded(item)}
        />
      )}
    </div>
  );
}
