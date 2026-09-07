import { useState } from "react";
import type { ProjectDetail, ProjectField, ProjectItem } from "../lib/github";
import { groupItemsByStatus } from "../lib/github";
import { colorStyle } from "../lib/colors";

interface Props {
  project: ProjectDetail;
  onOpenItem: (item: ProjectItem) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_H = 34;
const HEADER_H = 32;

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor">
      <path d="M7 5l6 5-6 5V5z" />
    </svg>
  );
}

function pickDateFields(project: ProjectDetail): { startField: ProjectField | null; endField: ProjectField | null } {
  const dateFields = project.fields.filter((f) => f.dataType === "DATE");
  const startField = dateFields.find((f) => /start/i.test(f.name)) ?? null;
  const endField = dateFields.find((f) => /(target|due|end)/i.test(f.name)) ?? dateFields.find((f) => f !== startField) ?? null;
  return { startField, endField };
}

function itemRange(item: ProjectItem, startField: ProjectField | null, endField: ProjectField | null): { start: Date; end: Date } | null {
  const startVal = startField ? item.fields[startField.name] : undefined;
  const endVal = endField ? item.fields[endField.name] : undefined;
  const startDate = startVal?.type === "date" ? new Date(startVal.date) : null;
  const endDate = endVal?.type === "date" ? new Date(endVal.date) : null;
  if (!startDate && !endDate) return null;
  const start = startDate ?? endDate!;
  const end = endDate ?? startDate!;
  return { start, end: end < start ? start : end };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export default function ProjectGantt({ project, onOpenItem }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pxPerDay, setPxPerDay] = useState(24);

  const { startField, endField } = pickDateFields(project);
  const groups = groupItemsByStatus(project);
  const optionColor = new Map(project.statusOptions.map((o) => [o.name, o.color]));

  // Items with no date on either field are still listed (so it's obvious which
  // ones need updating) — just without a bar, sorted after the dated ones.
  const rangesByStatus = new Map<string, Array<{ item: ProjectItem; start: Date | null; end: Date | null }>>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const [status, items] of groups) {
    const rows: Array<{ item: ProjectItem; start: Date | null; end: Date | null }> = [];
    for (const item of items) {
      const r = itemRange(item, startField, endField);
      rows.push({ item, start: r?.start ?? null, end: r?.end ?? null });
      if (r) {
        if (!minDate || r.start < minDate) minDate = r.start;
        if (!maxDate || r.end > maxDate) maxDate = r.end;
      }
    }
    rows.sort((a, b) => {
      if (a.start && b.start) return a.start.getTime() - b.start.getTime();
      return a.start ? -1 : b.start ? 1 : 0;
    });
    rangesByStatus.set(status, rows);
  }

  function toggle(status: string) {
    setCollapsed((c) => ({ ...c, [status]: !c[status] }));
  }

  if (!startField && !endField) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-neutral-500">
        Questo progetto non ha campi data (es. "Start date" / "Target date") da usare per il Gantt.
      </div>
    );
  }

  if (!minDate || !maxDate) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-neutral-500">
        Nessuna issue ha una data impostata su {[startField?.name, endField?.name].filter(Boolean).join(" / ")}.
      </div>
    );
  }

  const rangeStart = new Date(minDate.getTime() - 3 * DAY_MS);
  const rangeEnd = new Date(maxDate.getTime() + 3 * DAY_MS);
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd));
  const timelineWidth = totalDays * pxPerDay;
  const todayOffset = daysBetween(rangeStart, new Date());

  const months: Array<{ offsetDays: number; label: string }> = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    months.push({
      offsetDays: Math.max(0, daysBetween(rangeStart, cursor)),
      label: cursor.toLocaleDateString("it-IT", { month: "short", year: "numeric" }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-8 py-2">
        <p className="text-xs text-neutral-500">
          {startField?.name ?? "—"} → {endField?.name ?? "—"}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Zoom</span>
          <div className="flex rounded-lg border border-neutral-800 p-0.5 text-xs">
            <button
              onClick={() => setPxPerDay(8)}
              className={`rounded-md px-2 py-1 transition ${pxPerDay === 8 ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Settimana
            </button>
            <button
              onClick={() => setPxPerDay(24)}
              className={`rounded-md px-2 py-1 transition ${pxPerDay === 24 ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}`}
            >
              Giorno
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="flex">
          <div className="sticky left-0 z-10 w-64 shrink-0 border-r border-neutral-800 bg-neutral-950">
            <div style={{ height: HEADER_H }} className="border-b border-neutral-800" />
            {Array.from(rangesByStatus.entries()).map(([status, rows]) => {
              const style = colorStyle(optionColor.get(status));
              const isCollapsed = collapsed[status];
              const withDates = rows.filter((r) => r.start).length;
              return (
                <div key={status}>
                  <button
                    onClick={() => toggle(status)}
                    style={{ height: ROW_H }}
                    className="flex w-full items-center gap-1.5 border-b border-neutral-800/60 px-2 text-left"
                  >
                    <ChevronIcon open={!isCollapsed} />
                    <span className={`inline-flex items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text} ${style.border}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                      {status}
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-600" title="con date impostate / totale">
                      {withDates}/{rows.length}
                    </span>
                  </button>
                  {!isCollapsed &&
                    rows.map(({ item, start }) => (
                      <button
                        key={item.id}
                        onClick={() => onOpenItem(item)}
                        style={{ height: ROW_H }}
                        title={start ? item.title : `${item.title} — nessuna data impostata`}
                        className={`flex w-full items-center truncate border-b border-neutral-800/40 px-2 pl-7 text-left text-xs hover:text-neutral-100 hover:underline ${
                          start ? "text-neutral-300" : "text-neutral-600"
                        }`}
                      >
                        {item.title}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>

          <div className="relative shrink-0" style={{ width: timelineWidth }}>
            <div style={{ height: HEADER_H }} className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950">
              {months.map((m, i) => (
                <span key={i} style={{ position: "absolute", left: m.offsetDays * pxPerDay + 4, top: 8 }} className="whitespace-nowrap text-xs text-neutral-500">
                  {m.label}
                </span>
              ))}
            </div>

            {todayOffset >= 0 && todayOffset <= totalDays && (
              <div className="pointer-events-none absolute top-0 z-0 w-px bg-indigo-500/50" style={{ left: todayOffset * pxPerDay, height: "100%" }} />
            )}

            {Array.from(rangesByStatus.entries()).map(([status, rows]) => {
              const isCollapsed = collapsed[status];
              return (
                <div key={status}>
                  <div style={{ height: ROW_H }} className="border-b border-neutral-800/60" />
                  {!isCollapsed &&
                    rows.map(({ item, start, end }) => (
                      <div key={item.id} style={{ height: ROW_H }} className="relative border-b border-neutral-800/40">
                        {start && end && (() => {
                          const style = colorStyle(optionColor.get(item.status));
                          const left = daysBetween(rangeStart, start) * pxPerDay;
                          const width = Math.max(pxPerDay * 0.6, (daysBetween(start, end) + 1) * pxPerDay - 4);
                          return (
                            <button
                              onClick={() => onOpenItem(item)}
                              title={`${item.title} · ${start.toLocaleDateString("it-IT")} → ${end.toLocaleDateString("it-IT")}`}
                              style={{ left, width, top: 6, height: ROW_H - 12 }}
                              className={`absolute overflow-hidden rounded border px-1.5 text-left text-[11px] transition hover:brightness-125 ${style.bg} ${style.border} ${style.text}`}
                            >
                              {item.title}
                            </button>
                          );
                        })()}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
