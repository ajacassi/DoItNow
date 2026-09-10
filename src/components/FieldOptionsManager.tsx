import { useState } from "react";
import {
  updateSingleSelectFieldOptions,
  updateMultiSelectFieldOptions,
  GithubApiError,
  type StatusOption,
  type FieldOptionInput,
} from "../lib/github";
import { colorStyle } from "../lib/colors";

interface Props {
  token: string;
  fieldId: string;
  fieldName: string;
  kind: "SINGLE_SELECT" | "MULTI_SELECT";
  options: StatusOption[];
  onClose: () => void;
  onOptionsChanged: (options: StatusOption[]) => void;
}

const PALETTE = ["GRAY", "BLUE", "GREEN", "YELLOW", "ORANGE", "RED", "PINK", "PURPLE"];
const DEFAULT_COLOR = "BLUE";

export default function FieldOptionsManager({ token, fieldId, fieldName, kind, options, onClose, onOptionsChanged }: Props) {
  const [editing, setEditing] = useState<StatusOption | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StatusOption | null>(null);
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

  function startEdit(option: StatusOption) {
    setEditing(option);
    setName(option.name);
    setColor(option.color);
    setDescription(option.description ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // The mutation replaces the whole option list, so every existing option
      // (unchanged ones included) must be resent alongside the one being added/edited.
      const kept: FieldOptionInput[] = options
        .filter((o) => editing === "new" || o.id !== editing?.id)
        .map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" }));
      const target: FieldOptionInput =
        editing !== "new" && editing ? { id: editing.id, name: name.trim(), color, description } : { name: name.trim(), color, description };
      const nextOptions = [...kept, target];

      const updated =
        kind === "SINGLE_SELECT"
          ? await updateSingleSelectFieldOptions(token, fieldId, nextOptions)
          : await updateMultiSelectFieldOptions(token, fieldId, nextOptions);
      onOptionsChanged(updated);
      setEditing(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Operazione non riuscita.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setSaving(true);
    setError(null);
    try {
      const remaining: FieldOptionInput[] = options
        .filter((o) => o.id !== confirmDelete.id)
        .map((o) => ({ id: o.id, name: o.name, color: o.color, description: o.description ?? "" }));
      const updated =
        kind === "SINGLE_SELECT"
          ? await updateSingleSelectFieldOptions(token, fieldId, remaining)
          : await updateMultiSelectFieldOptions(token, fieldId, remaining);
      onOptionsChanged(updated);
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Eliminazione non riuscita.");
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
          <h2 className="text-sm font-semibold text-neutral-100">
            {confirmDelete
              ? `Eliminare l'opzione? — ${fieldName}`
              : isForm
                ? editing === "new"
                  ? `Nuova opzione — ${fieldName}`
                  : `Modifica opzione — ${fieldName}`
                : `Opzioni — ${fieldName}`}
          </h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            ✕
          </button>
        </div>

        {confirmDelete ? (
          <div className="space-y-3 p-4">
            {error && <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>}
            {(() => {
              const style = colorStyle(confirmDelete.color);
              return (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                  {confirmDelete.name}
                </span>
              );
            })()}
            <p className="text-xs text-neutral-400">
              Azione <span className="font-semibold text-red-300">irreversibile</span>: l'opzione verrà rimossa da tutte le issue che la usano.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={saving}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
              >
                Annulla
              </button>
              <button
                onClick={doDelete}
                disabled={saving}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-40"
              >
                {saving ? "Elimino…" : "Elimina"}
              </button>
            </div>
          </div>
        ) : !isForm ? (
          <>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {options.map((o) => {
                const style = colorStyle(o.color);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-neutral-900">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {o.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => startEdit(o)} className="text-xs text-neutral-500 hover:text-neutral-200">
                        Modifica
                      </button>
                      <button onClick={() => setConfirmDelete(o)} className="text-xs text-neutral-600 hover:text-red-400">
                        Elimina
                      </button>
                    </div>
                  </div>
                );
              })}
              {options.length === 0 && <p className="px-1.5 py-1 text-xs text-neutral-600">Nessuna opzione.</p>}
            </div>
            <div className="border-t border-neutral-800 p-3">
              <button
                onClick={startCreate}
                className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                + Nuova opzione
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

            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Colore
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PALETTE.map((c) => {
                  const style = colorStyle(c);
                  const active = color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      title={c}
                      className={`h-7 w-7 rounded-full border-2 ${style.dot} ${active ? "border-neutral-100" : "border-transparent"}`}
                    />
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Descrizione (opzionale)
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-indigo-500"
              />
            </label>

            {name.trim() && (
              <div>
                {(() => {
                  const style = colorStyle(color);
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {name.trim()}
                    </span>
                  );
                })()}
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
                disabled={saving || !name.trim()}
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
