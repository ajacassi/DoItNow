import { useState } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { groupItemsByStatus } from "../lib/github";
import { colorStyle } from "../lib/colors";
import SubIssueProgress from "./SubIssueProgress";
import ExternalLink from "./ExternalLink";

interface Props {
  project: ProjectDetail;
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
      className="cursor-grab rounded-lg border border-neutral-800 bg-neutral-900 p-3 transition hover:border-neutral-700 active:cursor-grabbing"
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
        <div className="mt-2 flex flex-wrap gap-1">
          {item.labels.map((l) => (
            <span
              key={l.name}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `#${l.color}33`,
                color: `#${l.color}`,
                border: `1px solid #${l.color}66`,
              }}
            >
              {l.name}
            </span>
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

export default function ProjectBoard({ project, onOpenItem, onNewIssueForStatus, onMoveItem }: Props) {
  const columns = groupItemsByStatus(project);
  const optionColor = new Map(project.statusOptions.map((o) => [o.name, o.color]));
  const optionId = new Map(project.statusOptions.map((o) => [o.name, o.id]));
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  return (
    <div className="flex h-full gap-4 overflow-x-auto px-8 py-6">
      {Array.from(columns.entries()).map(([status, items]) => {
        const style = colorStyle(optionColor.get(status));
        const targetOptionId = optionId.get(status);
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
            className={`flex w-72 shrink-0 flex-col rounded-xl bg-neutral-900/40 transition ${
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
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onOpenItem={onOpenItem} />
              ))}
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
