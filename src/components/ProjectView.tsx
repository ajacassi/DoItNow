import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDetail, ProjectItem, IssueRef, StatusOption } from "../lib/github";
import { setProjectFieldSingleSelect, fetchRepoIssueCount, mostCommonRepo } from "../lib/github";
import { parseIssueQuery, matchesIssueQuery } from "../lib/query";
import {
  getProjectViewState,
  setProjectViewState,
  getTableColumns,
  setTableColumns,
  getStatusOrderReversed,
  setStatusOrderReversed,
  getSortKeys,
  setSortKeys,
  type SavedView,
} from "../lib/store";
import { defaultColumns, orderColumns } from "../lib/columns";
import type { SortKey } from "../lib/sort";
import ProjectTable from "./ProjectTable";
import ProjectBoard from "./ProjectBoard";
import ProjectGantt from "./ProjectGantt";
import IssueDetailPanel from "./IssueDetailPanel";
import NewIssueModal from "./NewIssueModal";
import ProjectCleanup from "./ProjectCleanup";
import LabelFilterSidebar from "./LabelFilterSidebar";
import QueryInput from "./QueryInput";
import SavedViewsBar from "./SavedViewsBar";
import ColumnPicker from "./ColumnPicker";
import SortPicker from "./SortPicker";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onItemChange: (itemId: string, patch: Partial<ProjectItem>) => void;
  onItemAdded: (item: ProjectItem) => void;
  onItemRemoved: (itemId: string) => void;
  onFieldOptionsChanged: (fieldId: string, options: StatusOption[]) => void;
}

type ViewMode = "table" | "board" | "gantt";

export default function ProjectView({
  token,
  org,
  project,
  onBack,
  onRefresh,
  refreshing,
  onItemChange,
  onItemAdded,
  onItemRemoved,
  onFieldOptionsChanged,
}: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [openIssueRef, setOpenIssueRef] = useState<IssueRef | null>(null);
  const [newIssueStatusId, setNewIssueStatusId] = useState<string | null>(null);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showLabelFilter, setShowLabelFilter] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [queryText, setQueryText] = useState("");
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(defaultColumns(project)));
  const [loaded, setLoaded] = useState(false);

  // Load saved views + last filter state for this project, then restore them.
  useEffect(() => {
    setLoaded(false);
    getProjectViewState(project.id).then((state) => {
      setViews(state.views);
      setQueryText(state.current.queryText);
      setSelectedLabels(new Set(state.current.labels));
      setView(state.current.viewMode);
      setActiveViewId(state.current.activeViewId);
      setLoaded(true);
    });
  }, [project.id]);

  // Table column visibility is one setting shared by every view of this
  // project (not per-view), loaded/saved separately from the view state above.
  useEffect(() => {
    getTableColumns(project.id).then((cols) => {
      setVisibleColumns(new Set(cols?.length ? cols : defaultColumns(project)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setTableColumns(project.id, Array.from(next));
      return next;
    });
  }

  // Status group order for Table/Gantt (Board is unaffected) — one setting
  // shared by every view of this project, like column visibility.
  const [statusOrderReversed, setStatusOrderReversedState] = useState(false);

  useEffect(() => {
    getStatusOrderReversed(project.id).then(setStatusOrderReversedState);
  }, [project.id]);

  function toggleStatusOrder() {
    setStatusOrderReversedState((prev) => {
      const next = !prev;
      setStatusOrderReversed(project.id, next);
      return next;
    });
  }

  // Composable multi-column sort within each status group in Table — one
  // setting shared by every view of this project, like column visibility.
  const [sortKeys, setSortKeysState] = useState<SortKey[]>([]);

  useEffect(() => {
    getSortKeys(project.id).then(setSortKeysState);
  }, [project.id]);

  function changeSortKeys(next: SortKey[]) {
    setSortKeysState(next);
    setSortKeys(project.id, next);
  }

  // Total issue count (all states) for the repo most of this project's items
  // actually live in (see mostCommonRepo) — a stand-in for GitHub's own
  // "Default repository" setting, which isn't exposed on ProjectV2 in the
  // GraphQL API yet.
  const badgeRepo = mostCommonRepo(project);
  const [repoIssueCount, setRepoIssueCount] = useState<number | null>(null);

  useEffect(() => {
    if (!badgeRepo) {
      setRepoIssueCount(null);
      return;
    }
    let cancelled = false;
    fetchRepoIssueCount(token, badgeRepo.owner, badgeRepo.name)
      .then((count) => {
        if (!cancelled) setRepoIssueCount(count);
      })
      .catch(() => {
        if (!cancelled) setRepoIssueCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, badgeRepo?.owner, badgeRepo?.name]);

  // While a saved view is active, keep it in sync with whatever filters are
  // currently set — editing the query/labels/mode of an active view updates
  // that view automatically, so switching away and back never discards it.
  useEffect(() => {
    if (!loaded || !activeViewId) return;
    setViews((vs) => {
      const idx = vs.findIndex((v) => v.id === activeViewId);
      if (idx === -1) return vs;
      const current = vs[idx];
      const labels = Array.from(selectedLabels);
      const sameLabels = current.labels.length === labels.length && current.labels.every((l) => selectedLabels.has(l));
      if (current.queryText === queryText && current.viewMode === view && sameLabels) return vs;
      const next = [...vs];
      next[idx] = { ...current, queryText, labels, viewMode: view };
      return next;
    });
  }, [loaded, activeViewId, queryText, selectedLabels, view]);

  // Persist views + current filter state locally, debounced so fast typing doesn't hammer disk.
  useEffect(() => {
    if (!loaded) return;
    const handle = setTimeout(() => {
      setProjectViewState(project.id, {
        views,
        current: { queryText, labels: Array.from(selectedLabels), viewMode: view, activeViewId },
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [loaded, project.id, views, queryText, selectedLabels, view, activeViewId]);

  // The debounced save above can be cancelled (by unmount, e.g. navigating back
  // to the project picker, switching projects, or closing the window) before it
  // ever fires, silently dropping the latest change. Mirror the latest state
  // into a ref and flush it immediately whenever that happens, so nothing is lost.
  const latestRef = useRef({ views, queryText, selectedLabels, view, activeViewId, loaded });
  useEffect(() => {
    latestRef.current = { views, queryText, selectedLabels, view, activeViewId, loaded };
  });

  useEffect(() => {
    function flush() {
      const s = latestRef.current;
      if (!s.loaded) return;
      setProjectViewState(project.id, {
        views: s.views,
        current: { queryText: s.queryText, labels: Array.from(s.selectedLabels), viewMode: s.view, activeViewId: s.activeViewId },
      });
    }
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
    };
  }, [project.id]);

  const isAllActive = activeViewId === null && !queryText.trim() && selectedLabels.size === 0;

  function applyView(v: SavedView | null) {
    if (!v) {
      setQueryText("");
      setSelectedLabels(new Set());
      setActiveViewId(null);
      return;
    }
    setQueryText(v.queryText);
    setSelectedLabels(new Set(v.labels));
    setView(v.viewMode);
    setActiveViewId(v.id);
  }

  function saveCurrentAsNewView(name: string) {
    const newView: SavedView = { id: crypto.randomUUID(), name, queryText, labels: Array.from(selectedLabels), viewMode: view };
    setViews((vs) => [...vs, newView]);
    setActiveViewId(newView.id);
  }

  function deleteView(id: string) {
    setViews((vs) => vs.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  }

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

  const parsedQuery = useMemo(() => {
    try {
      return parseIssueQuery(queryText);
    } catch {
      return null;
    }
  }, [queryText]);

  const visibleProject: ProjectDetail = useMemo(() => {
    let items = project.items;
    if (selectedLabels.size > 0) {
      items = items.filter((item) => item.labels.some((l) => selectedLabels.has(l.name)));
    }
    if (queryText.trim()) {
      items = items.filter((item) => matchesIssueQuery(parsedQuery, item, project));
    }
    return items === project.items ? project : { ...project, items };
  }, [project, selectedLabels, queryText, parsedQuery]);

  function openNewIssue(statusId?: string) {
    setNewIssueStatusId(statusId ?? null);
    setShowNewIssue(true);
  }

  async function moveItemToStatus(itemId: string, statusOptionId: string, statusName: string) {
    if (!project.statusFieldId) return;
    const previousStatus = project.items.find((i) => i.id === itemId)?.status;
    if (previousStatus === statusName) return;
    onItemChange(itemId, { status: statusName });
    try {
      await setProjectFieldSingleSelect(token, project.id, itemId, project.statusFieldId, statusOptionId);
    } catch {
      if (previousStatus) onItemChange(itemId, { status: previousStatus });
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-300">
            ← Progetti
          </button>
          <h1 className="text-lg font-semibold tracking-tight">{project.title}</h1>
          {repoIssueCount !== null && badgeRepo && (
            <span className="text-xs text-neutral-600" title={`${badgeRepo.owner}/${badgeRepo.name}`}>
              {repoIssueCount} issue nel repo
            </span>
          )}
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
          {view === "table" && <ColumnPicker project={project} selected={visibleColumns} onToggle={toggleColumn} />}
          {view === "table" && <SortPicker project={project} sortKeys={sortKeys} onChange={changeSortKeys} />}
          {(view === "table" || view === "gantt") && (
            <button
              onClick={toggleStatusOrder}
              title="Inverte l'ordine degli stati in Tabella e Gantt (gli stati senza issue non vengono mostrati)"
              className="rounded-lg border border-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
            >
              {statusOrderReversed ? "↑ Stati" : "↓ Stati"}
            </button>
          )}
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
            <button
              onClick={() => setView("gantt")}
              className={`rounded-md px-3 py-1 transition ${
                view === "gantt" ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              Gantt
            </button>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500 disabled:opacity-50"
          >
            {refreshing ? "Aggiorno…" : "Aggiorna"}
          </button>
          <button
            onClick={() => setShowCleanup(true)}
            title="Seleziona issue con una query per scollegarle o eliminarle in blocco — azione separata, ad accesso volontario"
            className="ml-1 rounded-lg border border-neutral-800 px-2 py-1.5 text-xs text-neutral-600 transition hover:border-amber-800 hover:text-amber-500"
          >
            🧹
          </button>
        </div>
      </header>

      <SavedViewsBar
        views={views}
        activeViewId={activeViewId}
        isAllActive={isAllActive}
        onApply={applyView}
        onSaveNew={saveCurrentAsNewView}
        onDelete={deleteView}
      />

      <div className="flex items-center gap-2 border-b border-neutral-800 px-8 py-2">
        <QueryInput
          value={queryText}
          onChange={setQueryText}
          project={project}
          placeholder='es. label:bug or assignee:canada87 -status:"Done"'
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
        <main className="min-h-0 min-w-0 flex-1">
          {view === "table" ? (
            <ProjectTable
              project={visibleProject}
              columns={orderColumns(project, visibleColumns)}
              reversed={statusOrderReversed}
              sortKeys={sortKeys}
              onOpenItem={openItemDetail}
              onNewIssueForStatus={openNewIssue}
              onMoveItem={moveItemToStatus}
            />
          ) : view === "board" ? (
            <ProjectBoard
              project={visibleProject}
              onOpenItem={openItemDetail}
              onNewIssueForStatus={openNewIssue}
              onMoveItem={moveItemToStatus}
            />
          ) : (
            <ProjectGantt project={visibleProject} reversed={statusOrderReversed} onOpenItem={openItemDetail} />
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
          onItemRemoved={onItemRemoved}
          onFieldOptionsChanged={onFieldOptionsChanged}
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
          onFieldOptionsChanged={onFieldOptionsChanged}
        />
      )}

      {showCleanup && (
        <ProjectCleanup token={token} project={project} onClose={() => setShowCleanup(false)} onItemRemoved={onItemRemoved} />
      )}
    </div>
  );
}
