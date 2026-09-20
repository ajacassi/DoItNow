import { useState } from "react";
import type { ProjectDetail, ProjectField, ProjectItem } from "../lib/github";
import { groupItemsBy, visibleGroupEntries, groupColor } from "../lib/github";
import { colorStyle } from "../lib/colors";

interface Props {
  project: ProjectDetail;
  /** Optional secondary subdivision within each status group ("none", "assignee", "label", or `field:<name>`). */
  subGroupBy: string;
  reversed: boolean;
  onOpenItem: (item: ProjectItem) => void;
}

type GanttRange = { item: ProjectItem; start: Date | null; end: Date | null };

type GanttRow = { kind: "subheader"; key: string; label: string; count: number } | ({ kind: "item" } & GanttRange);

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

export default function ProjectGantt({ project, subGroupBy, reversed, onOpenItem }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pxPerDay, setPxPerDay] = useState(24);
  const [showDeps, setShowDeps] = useState(true);

  // The chosen subdivision (if any) becomes the outer grouping, with status
  // always nested inside it — "Nessuno" means status stays the sole, outer
  // grouping, exactly like before this feature existed.
  const outerKey = subGroupBy === "none" ? "status" : subGroupBy;

  const { startField, endField } = pickDateFields(project);
  const statusGroups = visibleGroupEntries(groupItemsBy(project.items, project, outerKey), reversed);

  // Items with no date on either field are still listed (so it's obvious which
  // ones need updating) — just without a bar, sorted after the dated ones.
  const rangesByStatus: Array<[string, GanttRange[]]> = [];
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const [status, items] of statusGroups) {
    const rows: GanttRange[] = [];
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
    rangesByStatus.push([status, rows]);
  }

  function toggle(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  // Rows to actually render for one status: either the ranged items directly
  // (no secondary grouping), or subheader rows interleaved with them — a
  // collapsed subheader hides its item rows here, so cursorY/layout below
  // never has to special-case it separately.
  function rowsForStatus(status: string, rows: GanttRange[]): GanttRow[] {
    if (outerKey === "status") return rows.map((r) => ({ kind: "item", ...r }));
    const byId = new Map(rows.map((r) => [r.item.id, r]));
    const subgroups = visibleGroupEntries(groupItemsBy(rows.map((r) => r.item), project, "status"), false);
    const out: GanttRow[] = [];
    for (const [subName, subItems] of subgroups) {
      const subKey = `${status}::${subName}`;
      out.push({ kind: "subheader", key: subKey, label: subName, count: subItems.length });
      if (collapsed[subKey]) continue;
      for (const item of subItems) out.push({ kind: "item", ...byId.get(item.id)! });
    }
    return out;
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

  // Bar position of every row that has one, keyed by content id — built from
  // data already in this project's bulk fetch (item.blockedByIds), so drawing
  // dependency arrows costs zero extra network calls.
  const barByContentId = new Map<string, { top: number; left: number; width: number }>();
  const rowsByStatus = new Map<string, GanttRow[]>();
  let cursorY = HEADER_H;
  for (const [status, rows] of rangesByStatus) {
    const displayRows = rowsForStatus(status, rows);
    rowsByStatus.set(status, displayRows);
    cursorY += ROW_H;
    if (collapsed[status]) continue;
    for (const row of displayRows) {
      if (row.kind === "item" && row.start && row.end && row.item.contentId) {
        const left = daysBetween(rangeStart, row.start) * pxPerDay;
        const width = Math.max(pxPerDay * 0.6, (daysBetween(row.start, row.end) + 1) * pxPerDay - 4);
        barByContentId.set(row.item.contentId, { top: cursorY + ROW_H / 2, left, width });
      }
      cursorY += ROW_H;
    }
  }
  const timelineHeight = cursorY;

  const connectors: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const [, rows] of rangesByStatus) {
    for (const { item } of rows) {
      if (!item.contentId || item.blockedByIds.length === 0) continue;
      const to = barByContentId.get(item.contentId);
      if (!to) continue;
      for (const blockerId of item.blockedByIds) {
        const from = barByContentId.get(blockerId);
        if (!from) continue; // blocker not visible in this Gantt (no dates, collapsed, or not in this project)
        connectors.push({ x1: from.left + from.width, y1: from.top, x2: to.left, y2: to.top });
      }
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-8 py-2">
        <p className="text-xs text-neutral-500">
          {startField?.name ?? "—"} → {endField?.name ?? "—"}
        </p>
        <div className="flex items-center gap-2">
          {connectors.length > 0 && (
            <button
              onClick={() => setShowDeps((v) => !v)}
              title="Mostra/nascondi le frecce di dipendenza (bloccata da)"
              className={`rounded-lg border px-2 py-1 text-xs transition ${
                showDeps ? "border-indigo-500 text-indigo-300" : "border-neutral-800 text-neutral-500 hover:border-neutral-500"
              }`}
            >
              Dipendenze
            </button>
          )}
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
            {rangesByStatus.map(([status, rows]) => {
              const style = colorStyle(groupColor(project, outerKey, status));
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
                    rowsByStatus.get(status)!.map((row) =>
                      row.kind === "subheader" ? (
                        <button
                          key={row.key}
                          onClick={() => toggle(row.key)}
                          style={{ height: ROW_H }}
                          className="flex w-full items-center gap-1.5 border-b border-neutral-800/60 bg-neutral-900/30 px-2 pl-4 text-left"
                        >
                          <ChevronIcon open={!collapsed[row.key]} />
                          <span className="truncate text-[11px] font-medium text-neutral-400">{row.label}</span>
                          <span className="shrink-0 text-[11px] text-neutral-700">{row.count}</span>
                        </button>
                      ) : (
                        <button
                          key={row.item.id}
                          onClick={() => onOpenItem(row.item)}
                          style={{ height: ROW_H }}
                          title={row.start ? row.item.title : `${row.item.title} — nessuna data impostata`}
                          className={`flex w-full items-center truncate border-b border-neutral-800/40 px-2 text-left text-xs hover:text-neutral-100 hover:underline ${
                            outerKey === "status" ? "pl-7" : "pl-9"
                          } ${row.start ? "text-neutral-300" : "text-neutral-600"}`}
                        >
                          {row.item.title}
                        </button>
                      ),
                    )}
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

            {rangesByStatus.map(([status]) => {
              const isCollapsed = collapsed[status];
              return (
                <div key={status}>
                  <div style={{ height: ROW_H }} className="border-b border-neutral-800/60" />
                  {!isCollapsed &&
                    rowsByStatus.get(status)!.map((row) =>
                      row.kind === "subheader" ? (
                        <div key={row.key} style={{ height: ROW_H }} className="border-b border-neutral-800/60 bg-neutral-900/20" />
                      ) : (
                        <div key={row.item.id} style={{ height: ROW_H }} className="relative border-b border-neutral-800/40">
                          {row.start && row.end && (() => {
                            const item = row.item;
                            const start = row.start!;
                            const end = row.end!;
                            const style = colorStyle(groupColor(project, "status", item.status));
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
                      ),
                    )}
                </div>
              );
            })}

            {showDeps && connectors.length > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={timelineWidth}
                height={timelineHeight}
                style={{ overflow: "visible" }}
              >
                <defs>
                  <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 Z" className="fill-indigo-500/70" />
                  </marker>
                </defs>
                {connectors.map((c, i) => {
                  const elbowX = c.x1 + 14;
                  const d = `M${c.x1},${c.y1} L${elbowX},${c.y1} L${elbowX},${c.y2} L${c.x2},${c.y2}`;
                  return (
                    <path key={i} d={d} className="fill-none stroke-indigo-500/70" strokeWidth={1.5} markerEnd="url(#gantt-arrow)" />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
