import { useState } from "react";
import type { SavedView } from "../lib/store";

interface Props {
  views: SavedView[];
  activeViewId: string | null;
  isAllActive: boolean;
  onApply: (view: SavedView | null) => void;
  onSaveNew: (name: string) => void;
  onDelete: (id: string) => void;
}

export default function SavedViewsBar({ views, activeViewId, isAllActive, onApply, onSaveNew, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function confirmAdd() {
    const trimmed = name.trim();
    if (trimmed) onSaveNew(trimmed);
    setAdding(false);
    setName("");
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-neutral-800 px-8 py-2">
      <button
        onClick={() => onApply(null)}
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
          isAllActive ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        Tutte
      </button>

      {views.map((v) => {
        const active = v.id === activeViewId;
        return (
          <div
            key={v.id}
            className={`flex shrink-0 items-center gap-1 rounded-full px-1 py-0.5 pl-3 text-xs transition ${
              active ? "bg-indigo-600/20 text-indigo-300" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <button onClick={() => onApply(v)} className="py-0.5">
              {v.name}
            </button>
            <button onClick={() => onDelete(v.id)} title="Elimina vista" className="px-1.5 hover:text-neutral-100">
              ×
            </button>
          </div>
        );
      })}

      {adding ? (
        <div className="flex shrink-0 items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="Nome vista"
            className="w-32 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-indigo-500"
          />
          <button onClick={confirmAdd} className="text-xs text-indigo-400 hover:text-indigo-300">
            OK
          </button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300">
          + Vista
        </button>
      )}
    </div>
  );
}
