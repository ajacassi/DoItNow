import { useState } from "react";
import { createRepoLabel, updateRepoLabel, GithubApiError, type RepoLabel } from "../lib/github";
import LabelChip from "./LabelChip";

interface Props {
  token: string;
  repositoryId: string;
  labels: RepoLabel[];
  onClose: () => void;
  onCreated: (label: RepoLabel) => void;
  onUpdated: (label: RepoLabel) => void;
}

const DEFAULT_COLOR = "6366f1";

function isValidHexColor(value: string): boolean {
  return /^[0-9a-fA-F]{6}$/.test(value);
}

export default function LabelManager({ token, repositoryId, labels, onClose, onCreated, onUpdated }: Props) {
  const [editing, setEditing] = useState<RepoLabel | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditing("new");
    setName("");
    setColor(DEFAULT_COLOR);
    setDescription("");
    setError(null);
  }

  function startEdit(label: RepoLabel) {
    setEditing(label);
    setName(label.name);
    setColor(label.color);
    setDescription(label.description ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim() || !isValidHexColor(color)) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        const label = await createRepoLabel(token, repositoryId, name.trim(), color, description.trim());
        onCreated(label);
      } else if (editing) {
        const label = await updateRepoLabel(token, editing.id, name.trim(), color, description.trim());
        onUpdated(label);
      }
      setEditing(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Operazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  const isForm = editing !== null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">{isForm ? (editing === "new" ? "Nuova label" : "Modifica label") : "Label della repo"}</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        {!isForm ? (
          <>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {labels.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-neutral-900">
                  <LabelChip name={l.name} color={l.color} />
                  <button onClick={() => startEdit(l)} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-200">
                    Modifica
                  </button>
                </div>
              ))}
              {labels.length === 0 && <p className="px-1.5 py-1 text-xs text-neutral-600">Nessuna label in questa repo.</p>}
            </div>
            <div className="border-t border-neutral-800 p-3">
              <button
                onClick={startCreate}
                className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                + Nuova label
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4">
            {error && <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>}

            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Nome
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              />
            </label>

            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Colore
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={`#${isValidHexColor(color) ? color : DEFAULT_COLOR}`}
                  onChange={(e) => setColor(e.target.value.slice(1))}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
                />
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value.replace(/^#/, ""))}
                  placeholder="6366f1"
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-500"
                />
              </div>
              {!isValidHexColor(color) && <p className="mt-1 text-[11px] text-red-400">Colore esadecimale non valido (6 cifre, es. 6366f1).</p>}
            </label>

            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Descrizione (opzionale)
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              />
            </label>

            {name.trim() && isValidHexColor(color) && (
              <div>
                <LabelChip name={name.trim()} color={color} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
              >
                Annulla
              </button>
              <button
                onClick={save}
                disabled={saving || !name.trim() || !isValidHexColor(color)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? "Salvo…" : "Salva"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
