import { useState } from "react";
import type { ProjectDetail } from "../lib/github";
import { availableColumns, type ColumnOption } from "../lib/columns";
import { TITLE_COLUMN, type SortKey } from "../lib/sort";

interface Props {
  project: ProjectDetail;
  sortKeys: SortKey[];
  onChange: (next: SortKey[]) => void;
}

function sortableColumns(project: ProjectDetail): ColumnOption[] {
  return [{ key: TITLE_COLUMN, label: "Nome" }, ...availableColumns(project)];
}

export default function SortPicker({ project, sortKeys, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const options = sortableColumns(project);
  const byKey = new Map(sortKeys.map((s, i) => [s.key, { direction: s.direction, rank: i + 1 }]));

  // Click cycles a column through: not sorted -> ascending -> descending -> not
  // sorted. Order of clicks sets priority (first key wins ties, then the next).
  function cycle(key: string) {
    const idx = sortKeys.findIndex((s) => s.key === key);
    if (idx === -1) {
      onChange([...sortKeys, { key, direction: "asc" }]);
    } else if (sortKeys[idx].direction === "asc") {
      const next = [...sortKeys];
      next[idx] = { key, direction: "desc" };
      onChange(next);
    } else {
      onChange(sortKeys.filter((s) => s.key !== key));
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
          open || sortKeys.length > 0 ? "border-indigo-500 text-indigo-300" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
        }`}
      >
        Ordina
        {sortKeys.length > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{sortKeys.length}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-1.5 shadow-xl">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-600">
              Clicca per aggiungere · di nuovo per invertire · ancora per togliere
            </p>
            {options.map((o) => {
              const active = byKey.get(o.key);
              return (
                <button
                  key={o.key}
                  onClick={() => cycle(o.key)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  <span className="truncate">{o.label}</span>
                  {active && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-300">
                      {active.rank}
                      {active.direction === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              );
            })}
            {sortKeys.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              >
                Cancella ordinamento
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
