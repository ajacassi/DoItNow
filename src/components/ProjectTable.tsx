import { useState } from "react";
import type { ProjectDetail, ProjectField, ProjectItem, ItemFieldValue } from "../lib/github";
import { groupItemsBy, visibleGroupEntries, groupColor } from "../lib/github";
import { colorStyle } from "../lib/colors";
import { ASSIGNEE_COLUMN, CREATED_COLUMN, UPDATED_COLUMN, CLOSED_COLUMN, availableColumns } from "../lib/columns";
import { sortItems, type SortKey } from "../lib/sort";
import SubIssueProgress from "./SubIssueProgress";
import ExternalLink from "./ExternalLink";
import LabelChip from "./LabelChip";

interface Props {
  project: ProjectDetail;
  columns: string[];
  /** Optional secondary subdivision within each status group ("none", "assignee", "label", or `field:<name>`). */
  subGroupBy: string;
  reversed: boolean;
  sortKeys: SortKey[];
  onOpenItem: (item: ProjectItem) => void;
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

function NameCell({ item, onOpenItem }: { item: ProjectItem; onOpenItem: (item: ProjectItem) => void }) {
  const canOpenDetail = item.contentType === "Issue";

  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
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
      {item.url && (
        <ExternalLink href={item.url} className="shrink-0 text-xs text-neutral-600 hover:text-neutral-400">
          ↗
        </ExternalLink>
      )}
    </div>
  );
}

function AssigneeCell({ item }: { item: ProjectItem }) {
  if (item.assignees.length === 0) return <span className="text-neutral-700">—</span>;
  return (
    <div className="flex -space-x-1.5">
      {item.assignees.map((a) => (
        <img key={a.login} src={a.avatarUrl} title={a.login} alt={a.login} className="h-5 w-5 rounded-full border border-neutral-900" />
      ))}
    </div>
  );
}

function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-neutral-700">—</span>;
  return <span className="text-xs text-neutral-300">{new Date(iso).toLocaleDateString("it-IT")}</span>;
}

function FieldCell({ field, value }: { field: ProjectField; value: ItemFieldValue | undefined }) {
  if (field.dataType === "DATE") {
    const dateStr = value?.type === "date" ? value.date : null;
    if (!dateStr) return <CalendarIcon className="h-4 w-4 text-neutral-700" />;
    const overdue = isOverdue(dateStr);
    return <span className={`text-xs ${overdue ? "text-red-400" : "text-neutral-300"}`}>{new Date(dateStr).toLocaleDateString("it-IT")}</span>;
  }
  if (field.dataType === "SINGLE_SELECT") {
    if (value?.type !== "singleSelect") return <FlagIcon className="h-4 w-4 text-neutral-700" />;
    const style = colorStyle(value.color);
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${style.text}`}>
        <FlagIcon className="h-3.5 w-3.5" />
        {value.name}
      </span>
    );
  }
  if (field.dataType === "MULTI_SELECT") {
    if (value?.type !== "multiSelect" || value.options.length === 0) return <span className="text-neutral-700">—</span>;
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
    return value?.type === "number" ? <span className="text-xs text-neutral-300">{value.number}</span> : <span className="text-neutral-700">—</span>;
  }
  return value?.type === "text" ? (
    <span className="truncate text-xs text-neutral-300">{value.text}</span>
  ) : (
    <span className="text-neutral-700">—</span>
  );
}

export default function ProjectTable({
  project,
  columns: visibleColumns,
  subGroupBy,
  reversed,
  sortKeys,
  onOpenItem,
  onNewIssueForStatus,
  onMoveItem,
}: Props) {
  // The chosen subdivision (if any) becomes the outer grouping, with status
  // always nested inside it — "Nessuno" means status stays the sole, outer
  // grouping, exactly like before this feature existed.
  const outerKey = subGroupBy === "none" ? "status" : subGroupBy;
  const outerGroups = visibleGroupEntries(groupItemsBy(project.items, project, outerKey), reversed).map(
    ([name, items]) => [name, sortItems(items, project, sortKeys)] as const,
  );
  const optionId = outerKey === "status" ? new Map(project.statusOptions.map((o) => [o.name, o.id])) : new Map<string, string>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

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
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="grid cursor-grab items-center border-b border-neutral-800/60 last:border-b-0 hover:bg-neutral-900/40 active:cursor-grabbing"
            style={{ gridTemplateColumns }}
          >
            <NameCell item={item} onOpenItem={onOpenItem} />
            {visibleColumns.map((key) => (
              <div key={key} className="min-w-0 px-3 py-2">
                {key === ASSIGNEE_COLUMN ? (
                  <AssigneeCell item={item} />
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
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="space-y-6">
        {outerGroups.map(([status, items]) => {
          const style = colorStyle(groupColor(project, outerKey, status));
          const isCollapsed = collapsed[status];
          const targetOptionId = optionId.get(status);
          const isDragOver = dragOverStatus === status;
          const subgroups = outerKey !== "status" ? visibleGroupEntries(groupItemsBy(items, project, "status"), false) : null;
          // When subdivided, box each outer group so it's obvious at a glance
          // where one ends and the next begins — a faint, alternating tint,
          // not a loud border.
          const grouped = outerKey !== "status";
          const groupBox = grouped ? "border border-neutral-700/80 bg-neutral-800/40 px-3 py-2.5" : "";

          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!targetOptionId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                const itemId = e.dataTransfer.getData(DRAG_MIME);
                if (itemId && targetOptionId) onMoveItem(itemId, targetOptionId, status);
              }}
              className={`rounded-lg transition ${isDragOver ? "ring-2 ring-indigo-500" : ""} ${groupBox}`}
            >
              <div className="flex items-center gap-2 py-2">
                <button onClick={() => toggle(status)} className="flex items-center gap-2 text-left">
                  <ChevronIcon open={!isCollapsed} />
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {status}
                  </span>
                  <span className="text-xs text-neutral-600">{items.length}</span>
                </button>
                {targetOptionId && (
                  <button
                    onClick={() => onNewIssueForStatus(targetOptionId)}
                    title={`Nuova issue in ${status}`}
                    className="text-neutral-600 hover:text-neutral-300"
                  >
                    +
                  </button>
                )}
              </div>

              {!isCollapsed && items.length > 0 && (
                subgroups ? (
                  <div className="space-y-3 pl-2">
                    {subgroups.map(([subName, subItems]) => {
                      const subKey = `${status}::${subName}`;
                      const subStyle = colorStyle(groupColor(project, "status", subName));
                      const subCollapsed = collapsed[subKey];
                      return (
                        <div key={subKey}>
                          <button onClick={() => toggle(subKey)} className="mb-1.5 flex items-center gap-1.5 text-left">
                            <ChevronIcon open={!subCollapsed} />
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${subStyle.bg} ${subStyle.text} ${subStyle.border}`}
                            >
                              {subName}
                            </span>
                            <span className="text-xs text-neutral-600">{subItems.length}</span>
                          </button>
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
