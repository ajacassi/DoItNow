import { useState } from "react";
import { Check } from "lucide-react";
import type { Grouping, ProjectDetail, ProjectField, ProjectItem, ItemFieldValue, IssueRef, SubIssueRow, SubIssueSummary } from "../lib/github";
import {
  groupItemsBy,
  visibleGroupEntries,
  groupColor,
  fetchSubIssueRows,
  activeBlockers,
  activeBlocking,
  NO_STATUS,
  ALL_GROUP,
} from "../lib/github";
import { colorStyle } from "../lib/colors";
import {
  ASSIGNEE_COLUMN,
  AUTHOR_COLUMN,
  CREATED_COLUMN,
  UPDATED_COLUMN,
  CLOSED_COLUMN,
  REPOSITORY_COLUMN,
  BLOCKED_BY_COLUMN,
  BLOCKING_COLUMN,
  PRIORITY_SCORE_COLUMN,
  STATUS_COLUMN,
  availableColumns,
} from "../lib/columns";
import { sortItems, type SortKey } from "../lib/sort";
import type { ScoredItem } from "../lib/priority";
import SubIssueProgress from "./SubIssueProgress";
import { GitHubIconLink } from "./ExternalLink";
import LabelChip from "./LabelChip";

interface Props {
  token: string;
  project: ProjectDetail;
  columns: string[];
  /** Two free grouping levels ("none" first = one flat list). */
  grouping: Grouping;
  reversed: boolean;
  sortKeys: SortKey[];
  /** Priority score per project item id; items excluded from the ranking are absent. */
  priorityScores: Map<string, ScoredItem>;
  /** The view's filters (label chips + query) applied to sub-issues too — null when none is set. */
  subIssueFilter: ((row: SubIssueRow) => boolean) | null;
  onOpenItem: (item: ProjectItem) => void;
  /** Open an issue that isn't necessarily a row of this project (e.g. a sub-issue from another repo). */
  onOpenIssue: (ref: IssueRef) => void;
  onNewIssueForStatus: (statusOptionId: string) => void;
  onMoveItem: (itemId: string, statusOptionId: string, statusName: string) => void;
}

const DRAG_MIME = "application/x-doitnow-item-id";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="currentColor"
    >
      <path d="M7 5l6 5-6 5V5z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" strokeLinecap="round" />
    </svg>
  );
}

function FlagIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor">
      <path d="M5 2.5v15M5 3.5h9l-2.2 3L14 9.5H5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** "No entry" sign — this issue is held up by others. */
function NoEntryIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M5.5 10h9" />
    </svg>
  );
}

/** Warning triangle with an exclamation mark — this issue is holding others up. */
function WarningIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5l8 14H2l8-14z" />
      <path d="M10 8v4" />
      <circle cx="10" cy="14.2" r="0.6" fill="currentColor" />
    </svg>
  );
}

function relationTitle(label: string, list: SubIssueSummary[]): string {
  return `${label}: ${list.map((b) => `#${b.number} ${b.title} (${b.repository})`).join(", ")}`;
}

/** "Bloccata da N" / "Blocca N" — only counts issues that are still open, as on GitHub. Click to unfold the details under the row. */
function RelationBadges({ item, open, onToggle }: { item: ProjectItem; open: boolean; onToggle: () => void }) {
  const blockers = activeBlockers(item);
  const blocking = activeBlocking(item);
  if (blockers.length === 0 && blocking.length === 0) return null;
  const title = [
    blockers.length > 0 ? relationTitle("Bloccata da", blockers) : null,
    blocking.length > 0 ? relationTitle("Blocca", blocking) : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      onClick={onToggle}
      title={`${title}\n(clicca per ${open ? "nascondere" : "vedere"} il dettaglio)`}
      className={`flex shrink-0 items-center gap-1 rounded-full text-[10px] font-medium ${open ? "ring-1 ring-neutral-600" : ""}`}
    >
      {blockers.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-red-400">
          <NoEntryIcon className="h-3 w-3" />
          Bloccata da {blockers.length}
        </span>
      )}
      {blocking.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">
          <WarningIcon className="h-3 w-3" />
          Blocca {blocking.length}
        </span>
      )}
    </button>
  );
}

function RelationLine({
  label,
  list,
  tone,
  onOpenIssue,
}: {
  label: string;
  list: SubIssueSummary[];
  tone: string;
  onOpenIssue: (ref: IssueRef) => void;
}) {
  if (list.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className={`w-24 shrink-0 pt-0.5 text-[11px] font-medium ${tone}`}>{label}</span>
      <ul className="min-w-0 flex-1 space-y-0.5">
        {list.map((b) => (
          <li key={b.id} className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => onOpenIssue({ repositoryOwner: b.repositoryOwner, repository: b.repository, number: b.number })}
              className={`min-w-0 truncate text-left text-xs hover:underline ${b.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-200"}`}
            >
              <span className="mr-1.5 tabular-nums text-neutral-500">#{b.number}</span>
              {b.title}
            </button>
            <span className="shrink-0 text-[11px] text-subtle" title={`${b.repositoryOwner}/${b.repository}`}>
              {b.repository}
            </span>
            {b.state === "CLOSED" && <span className="shrink-0 text-[10px] text-subtle">chiusa</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Column cell: every related issue as a clickable #number — open ones coloured, closed ones struck through (they no longer block). */
function RelationCell({ list, tone, onOpenIssue }: { list: SubIssueSummary[]; tone: string; onOpenIssue: (ref: IssueRef) => void }) {
  if (list.length === 0) return <span className="text-subtle">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 overflow-hidden" style={{ maxHeight: 36 }} title={relationTitle("", list)}>
      {list.map((b) => (
        <button
          key={b.id}
          onClick={() => onOpenIssue({ repositoryOwner: b.repositoryOwner, repository: b.repository, number: b.number })}
          className={`text-xs tabular-nums hover:underline ${b.state === "CLOSED" ? "text-subtle line-through" : tone}`}
        >
          #{b.number}
        </button>
      ))}
    </div>
  );
}

function NameCell({
  item,
  onOpenItem,
  expanded,
  onToggleExpand,
  relationsOpen,
  onToggleRelations,
}: {
  item: ProjectItem;
  onOpenItem: (item: ProjectItem) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  relationsOpen: boolean;
  onToggleRelations: () => void;
}) {
  const canOpenDetail = item.contentType === "Issue";
  const hasSubIssues = canOpenDetail && !!item.contentId && (item.subIssuesSummary?.total ?? 0) > 0;

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
      {hasSubIssues ? (
        <button
          onClick={onToggleExpand}
          title={expanded ? "Nascondi le sub-issue" : "Mostra le sub-issue"}
          className="-ml-1 shrink-0 rounded p-0.5 hover:bg-neutral-800"
        >
          <ChevronIcon open={expanded} />
        </button>
      ) : null}
      {item.number != null && <span className="shrink-0 text-xs tabular-nums text-neutral-500">#{item.number}</span>}
      {canOpenDetail ? (
        <button onClick={() => onOpenItem(item)} className="min-w-0 truncate text-left text-sm text-neutral-100 hover:underline">
          {item.title}
        </button>
      ) : (
        <span className="min-w-0 truncate text-sm text-neutral-100">{item.title}</span>
      )}
      {item.labels.map((l) => (
        <LabelChip key={l.name} name={l.name} color={l.color} />
      ))}
      {item.subIssuesSummary && <SubIssueProgress summary={item.subIssuesSummary} />}
      <RelationBadges item={item} open={relationsOpen} onToggle={onToggleRelations} />
      {item.url && (
        <GitHubIconLink href={item.url} className="text-subtle hover:text-neutral-400" />
      )}
    </div>
  );
}

function AssigneeCell({ item }: { item: ProjectItem }) {
  if (item.assignees.length === 0) return <span className="text-subtle">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {item.assignees.map((a) => (
        <img key={a.login} src={a.avatarUrl} title={a.login} alt={a.login} className="h-5 w-5 rounded-full border border-neutral-900" />
      ))}
    </div>
  );
}

function AuthorCell({ item }: { item: ProjectItem }) {
  if (!item.author) return <span className="text-subtle">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <img src={item.author.avatarUrl} alt={item.author.login} className="h-5 w-5 rounded-full border border-neutral-900" />
      <span className="truncate text-xs text-neutral-300">{item.author.login}</span>
    </div>
  );
}

function RepositoryCell({ item }: { item: ProjectItem }) {
  if (!item.repository) return <span className="text-subtle">—</span>;
  return (
    <span className="block truncate text-xs text-neutral-300" title={`${item.repositoryOwner ?? ""}/${item.repository}`}>
      {item.repository}
    </span>
  );
}

function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

/** One-line explanation of a score, for the cell tooltip (the full breakdown lives in the Priority view). */
function scoreTooltip(s: ScoredItem): string {
  const factors = s.factors
    .filter((f) => f.value !== null && f.weight > 0)
    .map((f) => `${f.label}: ${fmtNum(f.value!)} × peso ${fmtNum(f.weight)} (${f.detail})`);
  const parts = [`base ${fmtNum(100 * s.base, 1)}`];
  if (s.labelBonus !== 0) parts.push(`label ${s.labelBonus > 0 ? "+" : ""}${fmtNum(s.labelBonus, 1)}`);
  parts.push(`× stato ${fmtNum(s.statusMultiplier)}`);
  if (s.blockedMultiplier !== 1) parts.push(`× bloccata ${fmtNum(s.blockedMultiplier)}`);
  if (s.effortMultiplier !== 1) parts.push(`× effort ${fmtNum(s.effortMultiplier)}`);
  return [...factors, `${parts.join(" ")} = ${fmtNum(s.score, 1)}`].join("\n");
}

function ScoreCell({ scored }: { scored: ScoredItem | undefined }) {
  if (!scored) {
    return (
      <span className="text-subtle" title="Esclusa dalla classifica di priorità (stato escluso o issue chiusa)">
        —
      </span>
    );
  }
  const tone =
    scored.score >= 70 ? "bg-red-500" : scored.score >= 45 ? "bg-orange-500" : scored.score >= 25 ? "bg-yellow-500" : "bg-neutral-500";
  return (
    <div className="flex items-center gap-2" title={scoreTooltip(scored)}>
      <span className="w-7 text-right text-xs font-semibold tabular-nums text-neutral-200">{Math.round(scored.score)}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, scored.score)}%` }} />
      </span>
    </div>
  );
}

/** The item's status as a pill; click it to pick another status (works with any grouping, no drag needed). */
function StatusCell({
  item,
  project,
  onMoveItem,
}: {
  item: ProjectItem;
  project: ProjectDetail;
  onMoveItem: (itemId: string, statusOptionId: string, statusName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const style = colorStyle(groupColor(project, "status", item.status));
  const canChange = !!project.statusFieldId;
  return (
    <>
      <button
        onClick={(e) => {
          if (!canChange) return;
          const r = e.currentTarget.getBoundingClientRect();
          // Fixed-position menu: the table rows clip overflow, and the menu must not be cut off at the bottom.
          setMenuPos({ left: r.left, top: Math.min(r.bottom + 4, window.innerHeight - 8 - Math.min(320, project.statusOptions.length * 28 + 8)) });
          setOpen(true);
        }}
        title={canChange ? "Clicca per cambiare stato" : item.status}
        className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text} ${style.border} ${
          canChange ? "hover:brightness-110" : "cursor-default"
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
        <span className="truncate">{item.status}</span>
      </button>
      {open && menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 max-h-80 w-52 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl"
            style={{ left: Math.min(menuPos.left, window.innerWidth - 216), top: menuPos.top }}
          >
            {project.statusOptions
              .filter((o) => o.id)
              .map((o) => {
                const st = colorStyle(o.color);
                const current = o.name === item.status;
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      setOpen(false);
                      if (!current) onMoveItem(item.id, o.id, o.name);
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${current ? "bg-neutral-800" : "hover:bg-neutral-800"}`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                    <span className="truncate text-neutral-200">{o.name}</span>
                    {current && <Check size={13} className="ml-auto shrink-0 text-neutral-500" aria-label="stato attuale" />}
                  </button>
                );
              })}
          </div>
        </>
      )}
    </>
  );
}

function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-subtle">—</span>;
  return <span className="text-xs text-neutral-300">{new Date(iso).toLocaleDateString("it-IT")}</span>;
}

function FieldCell({ field, value }: { field: ProjectField; value: ItemFieldValue | undefined }) {
  if (field.dataType === "DATE") {
    const dateStr = value?.type === "date" ? value.date : null;
    if (!dateStr) return <CalendarIcon className="h-4 w-4 text-subtle" />;
    const overdue = isOverdue(dateStr);
    return <span className={`text-xs ${overdue ? "text-red-400" : "text-neutral-300"}`}>{new Date(dateStr).toLocaleDateString("it-IT")}</span>;
  }
  if (field.dataType === "SINGLE_SELECT") {
    if (value?.type !== "singleSelect") return <FlagIcon className="h-4 w-4 text-subtle" />;
    const style = colorStyle(value.color);
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
        <FlagIcon className="h-3.5 w-3.5" />
        {value.name}
      </span>
    );
  }
  if (field.dataType === "MULTI_SELECT") {
    if (value?.type !== "multiSelect" || value.options.length === 0) return <span className="text-subtle">—</span>;
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {value.options.map((o) => {
          const style = colorStyle(o.color);
          return (
            <span key={o.name} className={`text-xs ${style.text}`}>
              {o.name}
            </span>
          );
        })}
      </div>
    );
  }
  if (field.dataType === "NUMBER") {
    return value?.type === "number" ? <span className="text-xs text-neutral-300">{value.number}</span> : <span className="text-subtle">—</span>;
  }
  return value?.type === "text" ? (
    <span className="truncate text-xs text-neutral-300">{value.text}</span>
  ) : (
    <span className="text-subtle">—</span>
  );
}

export default function ProjectTable({
  token,
  project,
  columns: visibleColumns,
  grouping,
  reversed,
  sortKeys,
  priorityScores,
  subIssueFilter,
  onOpenItem,
  onOpenIssue,
  onNewIssueForStatus,
  onMoveItem,
}: Props) {
  const scoreById = new Map([...priorityScores].map(([id, s]) => [id, s.score]));
  // Two free grouping levels. "none" as the first level = one flat list, so
  // a row never jumps to another group when its status changes. "Inverti"
  // reverses the STATUS order, at whichever level status is.
  const outerKey = grouping.first;
  const innerKey = grouping.first === "none" ? "none" : grouping.second;
  const outerGroups = visibleGroupEntries(groupItemsBy(project.items, project, outerKey), outerKey === "status" && reversed).map(
    ([name, items]) => [name, sortItems(items, project, sortKeys, scoreById)] as const,
  );
  const optionId = new Map(project.statusOptions.map((o) => [o.name, o.id]));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // Sub-issues listed under their parent: expanded parents (by issue node id)
  // and what was fetched for them. State lives here, not in ItemsGrid, since
  // that's re-created on every render. A parent whose sub-issue count has
  // changed since the last fetch (e.g. after a refresh) is re-fetched on re-open.
  type SubState = { total: number; status: "loading" | "ok" | "error"; rows: SubIssueRow[]; error?: string };
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [subIssues, setSubIssues] = useState<Record<string, SubState>>({});
  // Rows whose blocked-by / blocking details are unfolded (by project item id).
  const [relationsOpen, setRelationsOpen] = useState<Set<string>>(new Set());

  function toggleRelations(itemId: string) {
    setRelationsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleSubIssues(issueId: string, total: number) {
    const opening = !expandedIds.has(issueId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (opening) next.add(issueId);
      else next.delete(issueId);
      return next;
    });
    const cached = subIssues[issueId];
    if (!opening || (cached && cached.status !== "error" && cached.total === total)) return;
    setSubIssues((s) => ({ ...s, [issueId]: { total, status: "loading", rows: [] } }));
    fetchSubIssueRows(token, issueId, project.id)
      .then((rows) => setSubIssues((s) => ({ ...s, [issueId]: { total, status: "ok", rows } })))
      .catch((e) =>
        setSubIssues((s) => ({
          ...s,
          [issueId]: { total, status: "error", rows: [], error: e instanceof Error ? e.message : "Caricamento non riuscito." },
        })),
      );
  }

  function renderSubIssues(parentId: string, depth: number): React.ReactNode {
    if (!expandedIds.has(parentId)) return null;
    const state = subIssues[parentId];
    const indent = { paddingLeft: 12 + depth * 22 };
    if (!state || state.status === "loading") {
      return (
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 py-1.5 text-xs text-subtle" style={indent}>
          Carico le sub-issue…
        </div>
      );
    }
    if (state.status === "error") {
      return (
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 py-1.5 text-xs text-red-400" style={indent}>
          {state.error}
        </div>
      );
    }
    // Same order as the project's statuses (honouring the "reverse" toggle);
    // sub-issues without a status come next, those outside the project last.
    const statusCount = project.statusOptions.length;
    const statusIndex = new Map(project.statusOptions.map((o, i) => [o.name, i]));
    const rank = (r: SubIssueRow) => {
      if (!r.inProject) return statusCount + 1;
      const i = r.status != null ? statusIndex.get(r.status) : undefined;
      if (i === undefined) return statusCount;
      return reversed ? statusCount - 1 - i : i;
    };
    // Same filters as the top-level rows, so every level shows the same set of issues.
    const shown = subIssueFilter ? state.rows.filter(subIssueFilter) : state.rows;
    const hidden = state.rows.length - shown.length;
    const rows = [...shown].sort((a, b) => rank(a) - rank(b));
    const hiddenNote =
      hidden > 0 ? (
        <div
          key="__hidden"
          className="border-b border-neutral-800/60 bg-neutral-900/30 py-1 text-[11px] italic text-subtle"
          style={indent}
          title="Escluse dalla query o dalle label della vista, come lo sarebbero come righe a sé"
        >
          {hidden === 1 ? "1 sub-issue nascosta dal filtro" : `${hidden} sub-issue nascoste dal filtro`}
        </div>
      ) : null;
    return [...rows.map((row) => (
      <div key={row.id}>
        <div
          className="grid items-center border-b border-neutral-800/60 bg-neutral-900/30 hover:bg-neutral-900/60"
          style={{ gridTemplateColumns }}
        >
          <div className="flex min-w-0 items-center gap-2 py-1.5 pr-3" style={indent}>
            {row.subIssuesTotal > 0 ? (
              <button
                onClick={() => toggleSubIssues(row.id, row.subIssuesTotal)}
                title={expandedIds.has(row.id) ? "Nascondi le sub-issue" : "Mostra le sub-issue"}
                className="-ml-1 shrink-0 rounded p-0.5 hover:bg-neutral-800"
              >
                <ChevronIcon open={expandedIds.has(row.id)} />
              </button>
            ) : (
              <span className="w-[18px] shrink-0" />
            )}
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">#{row.number}</span>
            <button
              onClick={() => onOpenIssue({ repositoryOwner: row.repositoryOwner, repository: row.repository, number: row.number })}
              className={`min-w-0 truncate text-left text-sm hover:underline ${row.state === "CLOSED" ? "text-neutral-500 line-through" : "text-neutral-200"}`}
            >
              {row.title}
            </button>
            {row.inProject ? (
              (() => {
                const name = row.status ?? NO_STATUS;
                const style = colorStyle(groupColor(project, "status", name));
                return (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text} ${style.border}`}
                    title={`Stato nel progetto: ${name}`}
                  >
                    <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                    {name}
                  </span>
                );
              })()
            ) : (
              <span
                className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-500"
                title="Questa sub-issue non fa parte del progetto"
              >
                Fuori dal progetto
              </span>
            )}
            <span className="shrink-0 truncate text-[11px] text-subtle" title={`${row.repositoryOwner}/${row.repository}`}>
              {row.repository}
            </span>
            <GitHubIconLink href={row.url} className="text-subtle hover:text-neutral-400" />
          </div>
          {visibleColumns.map((key) => (
            <div key={key} className="min-w-0 px-3 py-1.5">
              {key === ASSIGNEE_COLUMN ? (
                row.assignees.length === 0 ? (
                  <span className="text-subtle">—</span>
                ) : (
                  <div className="flex -space-x-1.5">
                    {row.assignees.map((a) => (
                      <img key={a.login} src={a.avatarUrl} title={a.login} alt={a.login} className="h-5 w-5 rounded-full border border-neutral-900" />
                    ))}
                  </div>
                )
              ) : key === REPOSITORY_COLUMN ? (
                <span className="block truncate text-xs text-neutral-300" title={`${row.repositoryOwner}/${row.repository}`}>
                  {row.repository}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {renderSubIssues(row.id, depth + 1)}
      </div>
    )), hiddenNote];
  }

  const fieldByName = new Map(project.fields.map((f) => [f.name, f]));
  const columnLabel = new Map(availableColumns(project).map((o) => [o.key, o.label]));
  const gridTemplateColumns = `minmax(0,1fr) repeat(${visibleColumns.length}, 130px)`;

  function toggle(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function ItemsGrid({ items }: { items: ProjectItem[] }) {
    return (
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <div className="grid border-b border-neutral-800 bg-neutral-900/60 text-xs font-medium text-neutral-500" style={{ gridTemplateColumns }}>
          <span className="px-3 py-2">Nome</span>
          {visibleColumns.map((key) => (
            <span key={key} className="truncate px-3 py-2">
              {columnLabel.get(key) ?? key}
            </span>
          ))}
        </div>
        {items.map((item) => (
          <div key={item.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="grid cursor-grab items-center border-b border-neutral-800/60 last:border-b-0 hover:bg-neutral-900/40 active:cursor-grabbing"
            style={{ gridTemplateColumns }}
          >
            <NameCell
              item={item}
              onOpenItem={onOpenItem}
              expanded={!!item.contentId && expandedIds.has(item.contentId)}
              onToggleExpand={() => item.contentId && toggleSubIssues(item.contentId, item.subIssuesSummary?.total ?? 0)}
              relationsOpen={relationsOpen.has(item.id)}
              onToggleRelations={() => toggleRelations(item.id)}
            />
            {visibleColumns.map((key) => (
              <div key={key} className="min-w-0 px-3 py-2">
                {key === STATUS_COLUMN ? (
                  <StatusCell item={item} project={project} onMoveItem={onMoveItem} />
                ) : key === PRIORITY_SCORE_COLUMN ? (
                  <ScoreCell scored={priorityScores.get(item.id)} />
                ) : key === ASSIGNEE_COLUMN ? (
                  <AssigneeCell item={item} />
                ) : key === AUTHOR_COLUMN ? (
                  <AuthorCell item={item} />
                ) : key === REPOSITORY_COLUMN ? (
                  <RepositoryCell item={item} />
                ) : key === BLOCKED_BY_COLUMN ? (
                  <RelationCell list={item.blockedBy} tone="text-red-400" onOpenIssue={onOpenIssue} />
                ) : key === BLOCKING_COLUMN ? (
                  <RelationCell list={item.blocking} tone="text-amber-400" onOpenIssue={onOpenIssue} />
                ) : key === CREATED_COLUMN ? (
                  <DateCell iso={item.createdAt} />
                ) : key === UPDATED_COLUMN ? (
                  <DateCell iso={item.updatedAt} />
                ) : key === CLOSED_COLUMN ? (
                  <DateCell iso={item.closedAt} />
                ) : fieldByName.get(key) ? (
                  <FieldCell field={fieldByName.get(key)!} value={item.fields[key]} />
                ) : null}
              </div>
            ))}
          </div>
          {relationsOpen.has(item.id) && (item.blockedBy.length > 0 || item.blocking.length > 0) && (
            <div className="space-y-1.5 border-b border-neutral-800/60 bg-neutral-900/30 py-2 pr-3" style={{ paddingLeft: 34 }}>
              <RelationLine label="Bloccata da" list={item.blockedBy} tone="text-red-400" onOpenIssue={onOpenIssue} />
              <RelationLine label="Blocca" list={item.blocking} tone="text-amber-400" onOpenIssue={onOpenIssue} />
            </div>
          )}
          {item.contentId && renderSubIssues(item.contentId, 1)}
          </div>
        ))}
      </div>
    );
  }

  /** Drop target props for a group whose items all share one status (drag a row there to move it). */
  function statusDropProps(dropKey: string, statusName: string | null) {
    const targetOptionId = statusName ? optionId.get(statusName) : undefined;
    if (!targetOptionId || !statusName) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverStatus(dropKey);
      },
      onDragLeave: () => setDragOverStatus((s) => (s === dropKey ? null : s)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverStatus(null);
        const itemId = e.dataTransfer.getData(DRAG_MIME);
        if (itemId) onMoveItem(itemId, targetOptionId, statusName);
      },
    };
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="space-y-6">
        {outerGroups.map(([name, items]) => {
          // Flat list: no header, no box — just the rows.
          if (outerKey === "none" && name === ALL_GROUP) {
            return <ItemsGrid key={name} items={items} />;
          }
          const style = colorStyle(groupColor(project, outerKey, name));
          const isCollapsed = collapsed[name];
          const outerStatus = outerKey === "status" ? name : null;
          const newIssueOptionId = outerStatus ? optionId.get(outerStatus) : undefined;
          const isDragOver = dragOverStatus === name;
          const subgroups = innerKey !== "none" ? visibleGroupEntries(groupItemsBy(items, project, innerKey), innerKey === "status" && reversed) : null;
          // With a second level, box each outer group so it's obvious at a
          // glance where one ends and the next begins — a faint tint, not a loud border.
          const groupBox = subgroups ? "border border-neutral-700/80 bg-neutral-800/40 px-3 py-2.5" : "";

          return (
            <div
              key={name}
              {...statusDropProps(name, outerStatus)}
              className={`rounded-lg transition ${isDragOver ? "ring-2 ring-indigo-500" : ""} ${groupBox}`}
            >
              <div className="flex items-center gap-2 py-2">
                <button onClick={() => toggle(name)} className="flex items-center gap-2 text-left">
                  <ChevronIcon open={!isCollapsed} />
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {name}
                  </span>
                  <span className="text-xs text-subtle">{items.length}</span>
                </button>
                {newIssueOptionId && (
                  <button
                    onClick={() => onNewIssueForStatus(newIssueOptionId)}
                    title={`Nuova issue in ${name}`}
                    className="text-subtle hover:text-neutral-300"
                  >
                    +
                  </button>
                )}
              </div>

              {!isCollapsed && items.length > 0 && (
                subgroups ? (
                  <div className="space-y-3 pl-2">
                    {subgroups.map(([subName, subItems]) => {
                      const subKey = `${name}::${subName}`;
                      const subStyle = colorStyle(groupColor(project, innerKey, subName));
                      const subCollapsed = collapsed[subKey];
                      const subStatus = innerKey === "status" ? subName : null;
                      const subNewOptionId = subStatus ? optionId.get(subStatus) : undefined;
                      return (
                        <div
                          key={subKey}
                          {...statusDropProps(subKey, subStatus)}
                          className={`rounded-lg transition ${dragOverStatus === subKey ? "ring-2 ring-indigo-500" : ""}`}
                        >
                          <div className="mb-1.5 flex items-center gap-2">
                            <button onClick={() => toggle(subKey)} className="flex items-center gap-1.5 text-left">
                              <ChevronIcon open={!subCollapsed} />
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${subStyle.bg} ${subStyle.text} ${subStyle.border}`}
                              >
                                {subName}
                              </span>
                              <span className="text-xs text-subtle">{subItems.length}</span>
                            </button>
                            {subNewOptionId && (
                              <button
                                onClick={() => onNewIssueForStatus(subNewOptionId)}
                                title={`Nuova issue in ${subName}`}
                                className="text-subtle hover:text-neutral-300"
                              >
                                +
                              </button>
                            )}
                          </div>
                          {!subCollapsed && <ItemsGrid items={subItems} />}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ItemsGrid items={items} />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
