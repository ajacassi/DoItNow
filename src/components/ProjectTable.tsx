import { useState } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { groupItemsByStatus } from "../lib/github";
import { colorStyle } from "../lib/colors";
import SubIssueProgress from "./SubIssueProgress";

interface Props {
  project: ProjectDetail;
  onOpenItem: (item: ProjectItem) => void;
  onNewIssueForStatus: (statusOptionId: string) => void;
}

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
        <span
          key={l.name}
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: `#${l.color}33`,
            color: `#${l.color}`,
            border: `1px solid #${l.color}66`,
          }}
        >
          {l.name}
        </span>
      ))}
      {item.subIssuesSummary && <SubIssueProgress summary={item.subIssuesSummary} />}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-neutral-600 hover:text-neutral-400">
          ↗
        </a>
      )}
    </div>
  );
}

export default function ProjectTable({ project, onOpenItem, onNewIssueForStatus }: Props) {
  const columns = groupItemsByStatus(project);
  const optionColor = new Map(project.statusOptions.map((o) => [o.name, o.color]));
  const optionId = new Map(project.statusOptions.map((o) => [o.name, o.id]));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const dateField = project.fields.find((f) => f.dataType === "DATE");
  const priorityField =
    project.fields.find((f) => f.dataType === "SINGLE_SELECT" && /priorit/i.test(f.name)) ??
    project.fields.find((f) => f.dataType === "SINGLE_SELECT");

  function toggle(status: string) {
    setCollapsed((c) => ({ ...c, [status]: !c[status] }));
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {Array.from(columns.entries()).map(([status, items]) => {
          const style = colorStyle(optionColor.get(status));
          const isCollapsed = collapsed[status];
          return (
            <div key={status}>
              <div className="flex items-center gap-2 py-2">
                <button onClick={() => toggle(status)} className="flex items-center gap-2 text-left">
                  <ChevronIcon open={!isCollapsed} />
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.bg} ${style.text} ${style.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {status}
                  </span>
                  <span className="text-xs text-neutral-600">{items.length}</span>
                </button>
                {optionId.get(status) && (
                  <button
                    onClick={() => onNewIssueForStatus(optionId.get(status)!)}
                    title={`Nuova issue in ${status}`}
                    className="text-neutral-600 hover:text-neutral-300"
                  >
                    +
                  </button>
                )}
              </div>

              {!isCollapsed && items.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-neutral-800">
                  <div className="grid grid-cols-[1fr_120px_120px_140px] border-b border-neutral-800 bg-neutral-900/60 text-xs font-medium text-neutral-500">
                    <span className="px-3 py-2">Nome</span>
                    <span className="px-3 py-2">Assegnatario</span>
                    <span className="px-3 py-2">{dateField?.name ?? "Data"}</span>
                    <span className="px-3 py-2">{priorityField?.name ?? "Priorità"}</span>
                  </div>
                  {items.map((item) => {
                    const dateValue = dateField ? item.fields[dateField.name] : undefined;
                    const priorityValue = priorityField ? item.fields[priorityField.name] : undefined;
                    const dateStr = dateValue?.type === "date" ? dateValue.date : null;
                    const overdue = dateStr ? isOverdue(dateStr) : false;
                    const prioStyle = priorityValue?.type === "singleSelect" ? colorStyle(priorityValue.color) : null;

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-[1fr_120px_120px_140px] items-center border-b border-neutral-800/60 last:border-b-0 hover:bg-neutral-900/40"
                      >
                        <NameCell item={item} onOpenItem={onOpenItem} />
                        <div className="px-3 py-2">
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
                            <span className="text-neutral-700">—</span>
                          )}
                        </div>
                        <div className="px-3 py-2">
                          {dateStr ? (
                            <span className={`text-xs ${overdue ? "text-red-400" : "text-neutral-300"}`}>
                              {new Date(dateStr).toLocaleDateString("it-IT")}
                            </span>
                          ) : (
                            <CalendarIcon className="h-4 w-4 text-neutral-700" />
                          )}
                        </div>
                        <div className="px-3 py-2">
                          {prioStyle ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${prioStyle.text}`}>
                              <FlagIcon className="h-3.5 w-3.5" />
                              {priorityValue?.type === "singleSelect" ? priorityValue.name : ""}
                            </span>
                          ) : (
                            <FlagIcon className="h-4 w-4 text-neutral-700" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
