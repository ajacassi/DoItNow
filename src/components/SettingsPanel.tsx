import { useEffect, useState } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { getSyncFilePath, setSyncFilePath, buildSettingsExport, applySettingsImport } from "../lib/store";

interface Props {
  onClose: () => void;
}

const FILE_FILTERS = [{ name: "Impostazioni DoItNow", extensions: ["json"] }];

export default function SettingsPanel({ onClose }: Props) {
  const [path, setPath] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSyncFilePath().then(setPath);
  }, []);

  async function choosePath(): Promise<string | null> {
    const chosen = await save({ defaultPath: path ?? "doitnow-settings.json", filters: FILE_FILTERS });
    if (!chosen) return null;
    setPath(chosen);
    await setSyncFilePath(chosen);
    return chosen;
  }

  async function doExport() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const payload = JSON.stringify(await buildSettingsExport(), null, 2);
      let target = path;
      if (target) {
        try {
          await writeTextFile(target, payload);
        } catch {
          target = null; // fall through to re-pick below, granting fresh fs scope
        }
      }
      if (!target) {
        target = await choosePath();
        if (!target) return;
        await writeTextFile(target, payload);
      }
      setStatus("Impostazioni esportate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Esportazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      let target = path;
      let text: string | null = null;
      if (target) {
        try {
          text = await readTextFile(target);
        } catch {
          target = null;
        }
      }
      if (!text) {
        const picked = await open({ multiple: false, filters: FILE_FILTERS });
        target = Array.isArray(picked) ? picked[0] : picked;
        if (!target) return;
        setPath(target);
        await setSyncFilePath(target);
        text = await readTextFile(target);
      }
      await applySettingsImport(JSON.parse(text));
      setStatus("Impostazioni importate — ricarico l'app…");
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-5 text-neutral-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Impostazioni</h2>
          <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300">
            Chiudi
          </button>
        </div>

        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Sincronizzazione impostazioni</h3>
        <p className="mb-3 text-xs leading-relaxed text-neutral-500">
          Esporta viste salvate, filtri, colonne, ordinamento e cartelle label di questo PC (il token di accesso non viene mai incluso)
          in un file JSON. Mettilo in una cartella sincronizzata (es. OneDrive) e importalo dall'altro PC per ritrovare tutto.
        </p>

        <div className="mb-3 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-neutral-300">{path ?? "Nessun file scelto"}</span>
          <button onClick={choosePath} className="shrink-0 text-neutral-500 hover:text-neutral-200">
            Scegli…
          </button>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        {status && <p className="mb-3 text-xs text-green-400">{status}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={doImport}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
          >
            {busy ? "Attendere…" : "Importa da file"}
          </button>
          <button
            onClick={doExport}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Attendere…" : "Esporta su file"}
          </button>
        </div>
      </div>
    </div>
  );
}
