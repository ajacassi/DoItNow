import { useState } from "react";
import type { ProjectDetail } from "../lib/github";
import { availableColumns } from "../lib/columns";

interface Props {
  project: ProjectDetail;
  selected: Set<string>;
  onToggle: (key: string) => void;
}

export default function ColumnPicker({ project, selected, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const options = availableColumns(project);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
          open ? "border-indigo-500 text-indigo-300" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
        }`}
      >
        Colonne
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-1.5 shadow-xl">
            {options.map((o) => (
              <label
                key={o.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                <input type="checkbox" checked={selected.has(o.key)} onChange={() => onToggle(o.key)} className="accent-indigo-600" />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {options.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-600">Nessun campo disponibile.</p>}
          </div>
        </>
      )}
    </div>
  );
}
