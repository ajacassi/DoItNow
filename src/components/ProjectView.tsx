import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BrushCleaning, Plus, RefreshCw, Tags, Target } from "lucide-react";
import type { ProjectDetail, ProjectItem, IssueRef, StatusOption, SubIssueRow } from "../lib/github";
import { setProjectFieldSingleSelect, fetchRepoIssueCount, mostCommonRepo, subIssueAsItem, DEFAULT_GROUPING, groupingHasStatus, type Grouping } from "../lib/github";
import { parseIssueQuery, matchesIssueQuery, unknownQueryFields } from "../lib/query";
import QueryWarning from "./QueryWarning";
import QuerySyntaxHelp from "./QuerySyntaxHelp";
import {
  getProjectViewState,
  setProjectViewState,
  getTableColumns,
  setTableColumns,
  getStatusOrderReversed,
  setStatusOrderReversed,
  getSortKeys,
  setSortKeys,
  getGrouping,
  setGrouping,
  getIncludeAllRepos,
  setIncludeAllRepos,
  getPriorityConfig,
  setPriorityConfig,
  getStatusPhases,
  setStatusPhases,
  type SavedView,
  type ViewMode,
} from "../lib/store";
import { defaultPriorityConfig, normalizeConfig, scoreItems, type PriorityConfig, type ScoredItem } from "../lib/priority";
import { uniqueViewName, type SharedView } from "../lib/priorityShare";
import { defaultColumns, groupedColumns, orderColumns, STATUS_COLUMN } from "../lib/columns";
import type { SortKey } from "../lib/sort";
import ProjectTable from "./ProjectTable";
import ProjectBoard from "./ProjectBoard";
import ProjectGantt from "./ProjectGantt";
import ProjectPriority from "./ProjectPriority";
import ProjectAnalytics from "./ProjectAnalytics";
import { materializePhases, type Phase } from "../lib/phases";
import PriorityConfigEditor from "./PriorityConfigEditor";
import IssueDetailPanel from "./IssueDetailPanel";
import NewIssueModal from "./NewIssueModal";
import ProjectCleanup from "./ProjectCleanup";
import LabelFilterSidebar, { NO_LABEL_KEY } from "./LabelFilterSidebar";
import QueryInput from "./QueryInput";
import SavedViewsBar from "./SavedViewsBar";
import ColumnPicker from "./ColumnPicker";
import SortPicker from "./SortPicker";
import GroupByPicker from "./GroupByPicker";
import MilestonesManager from "./MilestonesManager";
import NotificationsButton from "./NotificationsButton";

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
  onOpenNotifications: () => void;
  notificationsRefreshKey: number;
}

const VIEW_TABS: { key: ViewMode; label: string; title?: string }[] = [
  { key: "table", label: "Tabella" },
  { key: "board", label: "Board" },
  { key: "gantt", label: "Gantt" },
  { key: "priority", label: "Priorità", title: "Ordina le issue della vista corrente per punteggio di priorità" },
  { key: "analytics", label: "Analisi", title: "Grafici sulla distribuzione del lavoro nella vista corrente" },
];

/** Secondary header action: icon only on smaller windows, icon + text on very wide ones. */
const TOOL_BUTTON =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500 disabled:opacity-50";

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
  onOpenNotifications,
  notificationsRefreshKey,
}: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [openIssueRef, setOpenIssueRef] = useState<IssueRef | null>(null);
  const [newIssueStatusId, setNewIssueStatusId] = useState<string | null>(null);
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
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

  // Two free grouping levels for Table/Gantt (Board: columns + split). One
  // setting shared by every view of this project, like columns/status
  // order/sort. Multi-valued fields (assignees, labels, multi-select) put an
  // item in every matching group, by design.
  const [grouping, setGroupingState] = useState<Grouping>(DEFAULT_GROUPING);

  useEffect(() => {
    setGroupingState(DEFAULT_GROUPING);
    getGrouping(project.id).then(setGroupingState);
  }, [project.id]);

  // Columns the active grouping already shows (Table only): hidden from the
  // table without touching the saved column choice, so they come back as soon
  // as the grouping is removed.
  const groupHiddenColumns = useMemo(() => groupedColumns(grouping), [grouping]);

  function changeGrouping(next: Grouping) {
    setGroupingState(next);
    setGrouping(project.id, next);
    // Status no longer shown as a group: bring in the Stato column, so it stays
    // visible (and changeable) on every row. It can be turned off again.
    if (!groupingHasStatus(next) && groupingHasStatus(grouping) && !visibleColumns.has(STATUS_COLUMN)) {
      toggleColumn(STATUS_COLUMN);
    }
  }

  // Whether to also show issues from repos not linked to the project (off by
  // default = the original behaviour). One setting per project, like the ones above.
  const [includeAllRepos, setIncludeAllReposState] = useState(false);

  useEffect(() => {
    setIncludeAllReposState(false);
    getIncludeAllRepos(project.id).then(setIncludeAllReposState);
  }, [project.id]);

  function toggleIncludeAllRepos() {
    setIncludeAllReposState((prev) => {
      const next = !prev;
      setIncludeAllRepos(project.id, next);
      return next;
    });
  }

  // Priority scoring config (per project). Until the user saves one, an
  // automatic config deduced from the project's fields is used.
  const [savedPriorityConfig, setSavedPriorityConfig] = useState<PriorityConfig | null>(null);
  const [showPriorityConfig, setShowPriorityConfig] = useState(false);

  useEffect(() => {
    setSavedPriorityConfig(null);
    getPriorityConfig(project.id).then(setSavedPriorityConfig);
  }, [project.id]);

  const priorityConfig = useMemo(
    () => (savedPriorityConfig ? normalizeConfig(savedPriorityConfig, project) : defaultPriorityConfig(project)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedPriorityConfig, project.id, project.fields],
  );

  // Status → work phase mapping for the Analisi view (statuses differ per project).
  const [statusPhases, setStatusPhasesState] = useState<Record<string, Phase>>({});

  useEffect(() => {
    setStatusPhasesState({});
    getStatusPhases(project.id).then(setStatusPhasesState);
  }, [project.id]);

  function changeStatusPhases(next: Record<string, Phase>) {
    // An empty map means "back to automatic"; otherwise store the full, explicit mapping.
    const value = Object.keys(next).length === 0 ? {} : materializePhases(project, next);
    setStatusPhasesState(value);
    setStatusPhases(project.id, value);
  }

  function savePriorityConfig(config: PriorityConfig) {
    setSavedPriorityConfig(config);
    setPriorityConfig(project.id, config);
    setShowPriorityConfig(false);
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

  // For the priority config export/import: the view on screen (offered as an
  // optional part of the file), and creating a saved view from an imported one.
  const activeSavedView = views.find((v) => v.id === activeViewId);
  const currentViewForShare: SharedView | null =
    activeSavedView || queryText.trim() || selectedLabels.size > 0
      ? { name: activeSavedView?.name ?? "Vista", queryText, labels: Array.from(selectedLabels), viewMode: view }
      : null;

  function createViewFromShare(data: SharedView): string {
    const newView: SavedView = { id: crypto.randomUUID(), ...data, name: uniqueViewName(data.name, views) };
    setViews((vs) => [...vs, newView]);
    applyView(newView);
    return newView.name;
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

  const unknownFields = useMemo(() => (queryText.trim() ? unknownQueryFields(parsedQuery, project) : []), [queryText, parsedQuery, project]);

  // The label chips and the query, as one predicate — null when neither is set.
  // Applied to the project's items AND to the sub-issues listed under them, so
  // the view shows the same set of issues at every level.
  const itemFilter = useMemo(() => {
    const byLabel = selectedLabels.size > 0;
    const byQuery = !!queryText.trim();
    if (!byLabel && !byQuery) return null;
    return (item: ProjectItem) =>
      (!byLabel ||
        item.labels.some((l) => selectedLabels.has(l.name)) ||
        (selectedLabels.has(NO_LABEL_KEY) && item.labels.length === 0)) &&
      (!byQuery || matchesIssueQuery(parsedQuery, item, project));
  }, [project, selectedLabels, queryText, parsedQuery]);

  const visibleProject: ProjectDetail = useMemo(() => {
    const base: ProjectDetail = includeAllRepos ? { ...project, includeAllRepos: true } : project;
    if (!itemFilter) return base;
    return { ...base, items: project.items.filter(itemFilter) };
  }, [project, includeAllRepos, itemFilter]);

  // Sub-issues in the project are judged on their full project item (custom
  // fields included); those outside it on what the sub-issue itself carries —
  // a field they don't have counts as empty, like for any item.
  const subIssueFilter = useMemo(() => {
    if (!itemFilter) return null;
    const byContentId = new Map(project.items.filter((i) => i.contentId).map((i) => [i.contentId!, i]));
    return (row: SubIssueRow) => itemFilter(byContentId.get(row.id) ?? subIssueAsItem(row));
  }, [project, itemFilter]);

  // Priority scores for the Table's "Punteggio" column — computed on the
  // current view, exactly like the Priority view, so the numbers match.
  const priorityScores = useMemo(() => {
    const map = new Map<string, ScoredItem>();
    if (view !== "table") return map;
    for (const s of scoreItems(visibleProject.items, visibleProject, priorityConfig).ranked) map.set(s.item.id, s);
    return map;
  }, [view, visibleProject, priorityConfig]);

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
      <header className="border-b border-neutral-800">
        {/* Row 1 — where you are, which view, and project-wide actions. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-2 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm text-neutral-500 hover:text-neutral-300"
            >
              <ArrowLeft size={14} aria-hidden /> Progetti
            </button>
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight" title={project.title}>
              {project.title}
            </h1>
            {repoIssueCount !== null && badgeRepo && (
              <span className="shrink-0 whitespace-nowrap text-xs text-subtle" title={`${badgeRepo.owner}/${badgeRepo.name}`}>
                {repoIssueCount} issue nel repo
              </span>
            )}
          </div>

          <nav aria-label="Viste" className="flex shrink-0 rounded-lg border border-neutral-800 p-0.5 text-xs">
            {VIEW_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                title={t.title}
                aria-current={view === t.key ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1 transition ${
                  view === t.key ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Ricarica il progetto da GitHub"
              aria-label={refreshing ? "Aggiorno…" : "Aggiorna"}
              className={TOOL_BUTTON}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden />
              <span className="hidden 2xl:inline">{refreshing ? "Aggiorno…" : "Aggiorna"}</span>
            </button>
            <button
              onClick={() => setShowMilestones(true)}
              title="Gestisci le milestone del repository: crea, modifica, elimina, assegna issue"
              aria-label="Milestone"
              className={TOOL_BUTTON}
            >
              <Target size={14} aria-hidden />
              <span className="hidden 2xl:inline">Milestone</span>
            </button>
            <NotificationsButton token={token} onOpen={onOpenNotifications} refreshKey={notificationsRefreshKey} />
            <button
              onClick={() => setShowCleanup(true)}
              title="Seleziona issue con una query per scollegarle o eliminarle in blocco — azione separata, ad accesso volontario"
              aria-label="Pulizia progetto"
              className="flex items-center rounded-lg border border-neutral-800 px-2 py-1.5 text-xs text-subtle transition hover:border-amber-800 hover:text-amber-500"
            >
              <BrushCleaning size={15} aria-hidden />
            </button>
            <button
              onClick={() => openNewIssue()}
              className="ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
            >
              <Plus size={14} aria-hidden /> Nuova issue
            </button>
          </div>
        </div>

        {/* Row 2 — what this view shows and how: filters, columns, sorting, grouping. */}
        <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
          <button
            onClick={() => setShowLabelFilter((v) => !v)}
            aria-pressed={showLabelFilter}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition ${
              showLabelFilter ? "border-indigo-500 text-indigo-300" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            <Tags size={13} aria-hidden /> Label
            {selectedLabels.size > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{selectedLabels.size}</span>
            )}
          </button>
          <button
            onClick={toggleIncludeAllRepos}
            aria-pressed={includeAllRepos}
            title={
              includeAllRepos
                ? "Stai vedendo anche le issue di repository non collegati al progetto — clicca per mostrare solo quelle dei repo del progetto"
                : "Mostra solo le issue dei repository collegati al progetto — clicca per includere anche quelle di altri repository"
            }
            className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition ${
              includeAllRepos ? "border-indigo-500 text-indigo-300" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            Tutti i repo
          </button>
          {view !== "priority" && view !== "analytics" && <span className="mx-1 h-5 w-px shrink-0 bg-neutral-800" aria-hidden />}
          {view === "table" && <ColumnPicker project={project} selected={visibleColumns} hidden={groupHiddenColumns} onToggle={toggleColumn} />}
          {view === "table" && <SortPicker project={project} sortKeys={sortKeys} onChange={changeSortKeys} />}
          {view !== "priority" && view !== "analytics" && <GroupByPicker project={project} value={grouping} onChange={changeGrouping} />}
          {(view === "table" || view === "gantt") && groupingHasStatus(grouping) && (
            <button
              onClick={toggleStatusOrder}
              title="Inverte l'ordine degli stati in Tabella e Gantt (gli stati senza issue non vengono mostrati)"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
            >
              {statusOrderReversed ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />} Stati
            </button>
          )}
        </div>
      </header>

      {/* Saved views (left, scroll sideways when many) and the query bar (right) share one row. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-6 py-2">
        <SavedViewsBar
          views={views}
          activeViewId={activeViewId}
          isAllActive={isAllActive}
          onApply={applyView}
          onSaveNew={saveCurrentAsNewView}
          onDelete={deleteView}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2">
          <QueryWarning fields={unknownFields} />
          <QueryInput
            token={token}
            value={queryText}
            onChange={setQueryText}
            project={project}
            placeholder='Filtra: label:bug or assignee:canada87 -status:"Done"'
            className="w-80 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500 xl:w-[28rem]"
          />
          {queryText && (
            <button onClick={() => setQueryText("")} className="whitespace-nowrap text-xs text-neutral-500 hover:text-neutral-300">
              Cancella
            </button>
          )}
          <QuerySyntaxHelp />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showLabelFilter && (
          <LabelFilterSidebar
            projectId={project.id}
            items={project.items}
            linkedRepos={includeAllRepos ? [] : project.linkedRepos}
            selected={selectedLabels}
            onToggle={toggleLabel}
            onClear={() => setSelectedLabels(new Set())}
          />
        )}
        <main className="min-h-0 min-w-0 flex-1">
          {view === "table" ? (
            <ProjectTable
              token={token}
              project={visibleProject}
              columns={orderColumns(project, visibleColumns, groupHiddenColumns)}
              grouping={grouping}
              reversed={statusOrderReversed}
              sortKeys={sortKeys}
              priorityScores={priorityScores}
              subIssueFilter={subIssueFilter}
              onOpenItem={openItemDetail}
              onOpenIssue={setOpenIssueRef}
              onNewIssueForStatus={openNewIssue}
              onMoveItem={moveItemToStatus}
            />
          ) : view === "board" ? (
            <ProjectBoard
              project={visibleProject}
              grouping={grouping}
              onOpenItem={openItemDetail}
              onNewIssueForStatus={openNewIssue}
              onMoveItem={moveItemToStatus}
            />
          ) : view === "analytics" ? (
            <ProjectAnalytics
              project={visibleProject}
              config={priorityConfig}
              phases={statusPhases}
              onChangePhases={changeStatusPhases}
              onOpenItem={openItemDetail}
            />
          ) : view === "priority" ? (
            <ProjectPriority
              project={visibleProject}
              config={priorityConfig}
              configSaved={savedPriorityConfig !== null}
              onOpenItem={openItemDetail}
              onEditConfig={() => setShowPriorityConfig(true)}
            />
          ) : (
            <ProjectGantt project={visibleProject} grouping={grouping} reversed={statusOrderReversed} onOpenItem={openItemDetail} />
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

      {showPriorityConfig && (
        <PriorityConfigEditor
          project={project}
          config={priorityConfig}
          currentView={currentViewForShare}
          onCreateView={createViewFromShare}
          onClose={() => setShowPriorityConfig(false)}
          onSave={savePriorityConfig}
        />
      )}

      {showMilestones && (
        <MilestonesManager
          token={token}
          org={org}
          project={project}
          repo={badgeRepo}
          onClose={() => setShowMilestones(false)}
          onOpenIssue={setOpenIssueRef}
        />
      )}
    </div>
  );
}
