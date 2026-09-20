import { useState } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { groupItemsBy, groupColor, visibleGroupEntries } from "../lib/github";
import { colorStyle } from "../lib/colors";
import SubIssueProgress from "./SubIssueProgress";
import ExternalLink from "./ExternalLink";
import LabelChip from "./LabelChip";

interface Props {
  project: ProjectDetail;
  /** Optional secondary subdivision within each status column ("none", "assignee", "label", or `field:<name>`). */
  subGroupBy: string;
  onOpenItem: (item: ProjectItem) => void;
  onNewIssueForStatus: (statusOptionId: string) => void;
  onMoveItem: (itemId: string, statusOptionId: string, statusName: string) => void;
}

const DRAG_MIME = "application/x-doitnow-item-id";

function ItemCard({ item, onOpenItem }: { item: ProjectItem; onOpenItem: (item: ProjectItem) => void }) {
  const canOpenDetail = item.contentType === "Issue";

  const body = (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab rounded-2xl border border-neutral-800/80 bg-neutral-900 p-3.5 shadow-sm shadow-black/20 transition hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-md hover:shadow-black/30 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        {canOpenDetail ? (
          <button onClick={() => onOpenItem(item)} className="text-left text-sm leading-snug text-neutral-100 hover:underline">
            {item.title}
          </button>
        ) : (
          <p className="text-sm leading-snug text-neutral-100">{item.title}</p>
        )}
        {item.number && <span className="shrink-0 text-xs text-neutral-500">#{item.number}</span>}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        {item.repository && <p className="truncate text-xs text-neutral-500">{item.repository}</p>}
        {item.subIssuesSummary && <SubIssueProgress summary={item.subIssuesSummary} />}
      </div>

      {item.labels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.labels.map((l) => (
            <LabelChip key={l.name} name={l.name} color={l.color} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        {item.assignees.length > 0 ? (
          <div className="flex -space-x-1.5">
            {item.assignees.map((a) => (
              <img
                key={a.login}
                src={a.avatarUrl}
                title={a.login}
                alt={a.login}
                className="h-5 w-5 rounded-full border border-neutral-900"
              />
            ))}
          </div>
        ) : (
          <span />
        )}
        {item.url && (
          <ExternalLink href={item.url} className="text-xs text-neutral-600 hover:text-neutral-400">
            ↗
          </ExternalLink>
        )}
      </div>
    </div>
  );

  return body;
}

export default function ProjectBoard({ project, subGroupBy, onOpenItem, onNewIssueForStatus, onMoveItem }: Props) {
  // The chosen subdivision (if any) becomes the outer, column-level grouping,
  // with status always nested inside it — "Nessuno" means status stays the
  // sole, outer grouping (and the only mode where drag-to-change-status
  // still applies: a column only doubles as a drop target when it IS status).
  const outerKey = subGroupBy === "none" ? "status" : subGroupBy;
  const columns = groupItemsBy(project.items, project, outerKey);
  const optionId = outerKey === "status" ? new Map(project.statusOptions.map((o) => [o.name, o.id])) : new Map<string, string>();
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  return (
    <div className="flex h-full gap-4 overflow-x-auto px-8 py-6">
      {Array.from(columns.entries()).map(([status, items]) => {
        const style = colorStyle(groupColor(project, outerKey, status));
        const targetOptionId = optionId.get(status);
        const subgroups = outerKey !== "status" ? visibleGroupEntries(groupItemsBy(items, project, "status"), false) : null;
        const isDragOver = dragOverStatus === status;
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
            className={`flex w-72 shrink-0 flex-col rounded-2xl bg-neutral-900/40 transition ${
              isDragOver ? "ring-2 ring-indigo-500" : ""
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                {status}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600">{items.length}</span>
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
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {subgroups
                ? subgroups.map(([subName, subItems]) => (
                    <div key={subName} className="space-y-2">
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="truncate text-[11px] font-medium text-neutral-500">{subName}</span>
                        <span className="text-[11px] text-neutral-700">{subItems.length}</span>
                      </div>
                      {subItems.map((item) => (
                        <ItemCard key={item.id} item={item} onOpenItem={onOpenItem} />
                      ))}
                    </div>
                  ))
                : items.map((item) => <ItemCard key={item.id} item={item} onOpenItem={onOpenItem} />)}
              {items.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-neutral-600">Nessuna card</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
