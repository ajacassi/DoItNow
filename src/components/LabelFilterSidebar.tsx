import { useEffect, useState } from "react";
import type { ProjectItem } from "../lib/github";
import { getLabelFolders, setLabelFolders, type LabelFolders } from "../lib/store";

interface Props {
  projectId: string;
  items: ProjectItem[];
  selected: Set<string>;
  onToggle: (labelName: string) => void;
  onClear: () => void;
}

interface LabelInfo {
  name: string;
  color: string;
  count: number;
}

const UNASSIGNED = "__unassigned__";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="currentColor"
    >
      <path d="M7 5l6 5-6 5V5z" />
    </svg>
  );
}

export default function LabelFilterSidebar({ projectId, items, selected, onToggle, onClear }: Props) {
  const [folders, setFolders] = useState<LabelFolders>({ folders: [], assignment: {} });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    getLabelFolders(projectId).then(setFolders);
  }, [projectId]);

  function persist(next: LabelFolders) {
    setFolders(next);
    setLabelFolders(projectId, next);
  }

  function addFolder() {
    const name = newFolderName.trim();
    if (!name || folders.folders.includes(name)) {
      setAddingFolder(false);
      setNewFolderName("");
      return;
    }
    persist({ ...folders, folders: [...folders.folders, name] });
    setAddingFolder(false);
    setNewFolderName("");
  }

  function removeFolder(name: string) {
    const nextAssignment = { ...folders.assignment };
    for (const k of Object.keys(nextAssignment)) {
      if (nextAssignment[k] === name) delete nextAssignment[k];
    }
    persist({ folders: folders.folders.filter((f) => f !== name), assignment: nextAssignment });
  }

  function assignLabel(labelName: string, folderName: string) {
    const nextAssignment = { ...folders.assignment };
    if (folderName) nextAssignment[labelName] = folderName;
    else delete nextAssignment[labelName];
    persist({ ...folders, assignment: nextAssignment });
  }

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  const labelMap = new Map<string, LabelInfo>();
  for (const item of items) {
    for (const l of item.labels) {
      const existing = labelMap.get(l.name);
      if (existing) existing.count += 1;
      else labelMap.set(l.name, { name: l.name, color: l.color, count: 1 });
    }
  }
  const allLabels = Array.from(labelMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const groups = new Map<string, LabelInfo[]>();
  for (const folder of folders.folders) groups.set(folder, []);
  groups.set(UNASSIGNED, []);
  for (const l of allLabels) {
    const folder = folders.assignment[l.name];
    const key = folder && groups.has(folder) ? folder : UNASSIGNED;
    groups.get(key)!.push(l);
  }
  const orderedKeys = [...folders.folders, UNASSIGNED];

  function LabelRow({ l }: { l: LabelInfo }) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-neutral-900">
        <input
          type="checkbox"
          checked={selected.has(l.name)}
          onChange={() => onToggle(l.name)}
          className="accent-indigo-600"
        />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `#${l.color}` }} />
        <label className="min-w-0 flex-1 truncate text-sm text-neutral-200" onClick={() => onToggle(l.name)}>
          {l.name}
        </label>
        <span className="shrink-0 text-xs text-neutral-600">{l.count}</span>
        <select
          value={folders.assignment[l.name] ?? ""}
          onChange={(e) => assignLabel(l.name, e.target.value)}
          title="Sposta in cartella"
          className="w-16 shrink-0 rounded border-none bg-transparent text-[10px] text-neutral-600 outline-none"
        >
          <option value="">—</option>
          {folders.folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 py-4">
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Label</h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={onClear} className="text-xs text-neutral-500 hover:text-neutral-300">
              Cancella
            </button>
          )}
          <button onClick={() => setAddingFolder(true)} title="Nuova cartella" className="text-xs text-neutral-500 hover:text-neutral-300">
            + Cartella
          </button>
        </div>
      </div>

      {addingFolder && (
        <div className="flex items-center gap-1 px-4 pb-2">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addFolder();
              if (e.key === "Escape") {
                setAddingFolder(false);
                setNewFolderName("");
              }
            }}
            placeholder="Nome cartella"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-indigo-500"
          />
          <button onClick={addFolder} className="shrink-0 text-xs text-indigo-400 hover:text-indigo-300">
            OK
          </button>
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-2">
        {allLabels.length === 0 && <p className="px-2 text-xs text-neutral-600">Nessuna label nel progetto.</p>}

        {orderedKeys.map((key) => {
          const labels = groups.get(key) ?? [];
          const isCollapsed = collapsed[key];
          const title = key === UNASSIGNED ? "Senza cartella" : key;

          if (key === UNASSIGNED && labels.length === 0) return null;

          return (
            <div key={key}>
              <div className="flex items-center gap-1 px-1 py-1">
                <button onClick={() => toggleCollapse(key)} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <ChevronIcon open={!isCollapsed} />
                  <span className="truncate text-xs font-medium text-neutral-400">{title}</span>
                  <span className="shrink-0 text-xs text-neutral-700">{labels.length}</span>
                </button>
                {key !== UNASSIGNED && (
                  <button onClick={() => removeFolder(key)} title="Elimina cartella" className="shrink-0 text-neutral-700 hover:text-neutral-400">
                    ×
                  </button>
                )}
              </div>
              {!isCollapsed && (
                <div>
                  {labels.map((l) => (
                    <LabelRow key={l.name} l={l} />
                  ))}
                  {labels.length === 0 && <p className="px-3 pb-1 text-[11px] text-neutral-700">Vuota</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
