import { useEffect, useState } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { getSyncFilePath, setSyncFilePath, buildSettingsExport, applySettingsImport } from "../lib/store";
import {
  fetchOrgProjects,
  fetchProjectDetail,
  measureApiUsage,
  type ApiMeasurement,
  type ProjectSummary,
} from "../lib/github";

interface Props {
  onClose: () => void;
  token: string | null;
  org: string;
  projects: ProjectSummary[];
  /** The project to preselect for the measurement (the open or default one). */
  preferredProjectNumber: number | null;
}

const FILE_FILTERS = [{ name: "Impostazioni DoItNow", extensions: ["json"] }];

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

export default function SettingsPanel({ onClose, token, org, projects, preferredProjectNumber }: Props) {
  const [path, setPath] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // API usage measurement
  const [measureNumber, setMeasureNumber] = useState<number | null>(
    preferredProjectNumber != null && projects.some((p) => p.number === preferredProjectNumber)
      ? preferredProjectNumber
      : (projects[0]?.number ?? null),
  );
  const [measuring, setMeasuring] = useState(false);
  const [measurement, setMeasurement] = useState<{ result: ApiMeasurement; itemCount: number; projectTitle: string; ms: number } | null>(null);
  const [measureError, setMeasureError] = useState<string | null>(null);

  useEffect(() => {
    getSyncFilePath().then(setPath);
  }, []);

  async function runMeasurement() {
    if (!token || !org || measureNumber == null) return;
    setMeasuring(true);
    setMeasureError(null);
    setMeasurement(null);
    const started = performance.now();
    let itemCount = 0;
    let projectTitle = "";
    try {
      // The same calls as a cold start into that project: org project list, then the project with all its pages.
      const result = await measureApiUsage(async () => {
        await fetchOrgProjects(token, org);
        const detail = await fetchProjectDetail(token, org, measureNumber);
        itemCount = detail.items.length;
        projectTitle = detail.title;
      });
      setMeasurement({ result, itemCount, projectTitle, ms: Math.round(performance.now() - started) });
    } catch (e) {
      setMeasureError(e instanceof Error ? e.message : "Misurazione non riuscita.");
    } finally {
      setMeasuring(false);
    }
  }

  const grouped = measurement
    ? Array.from(
        measurement.result.calls.reduce((map, c) => {
          const g = map.get(c.name) ?? { name: c.name, count: 0, cost: 0, nodes: 0, bytes: 0, ms: 0 };
          g.count += 1;
          g.cost += c.cost;
          g.nodes += c.nodeCount;
          g.bytes += c.bytes;
          g.ms += c.ms;
          map.set(c.name, g);
          return map;
        }, new Map<string, { name: string; count: number; cost: number; nodes: number; bytes: number; ms: number }>()),
      ).map(([, g]) => g)
    : [];
  const totalCost = measurement ? measurement.result.calls.reduce((s, c) => s + c.cost, 0) : 0;
  const totalBytes = measurement ? measurement.result.calls.reduce((s, c) => s + c.bytes, 0) : 0;

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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-5 text-neutral-100">
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

        {token && org && projects.length > 0 && (
          <div className="mt-6 border-t border-neutral-800 pt-4">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Diagnostica API</h3>
            <p className="mb-3 text-xs leading-relaxed text-neutral-500">
              Ripete le chiamate di un avvio a freddo (elenco progetti + caricamento completo del progetto scelto) e conta quanto
              costano sul limite orario di GitHub. Le chiamate sono reali: la misura stessa consuma quei punti.
            </p>
            <div className="mb-3 flex items-center gap-2">
              <select
                value={measureNumber ?? ""}
                onChange={(e) => setMeasureNumber(Number(e.target.value))}
                disabled={measuring}
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.number}>
                    {p.title} (#{p.number})
                  </option>
                ))}
              </select>
              <button
                onClick={runMeasurement}
                disabled={measuring || measureNumber == null}
                className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
              >
                {measuring ? "Misuro…" : "Misura consumo API"}
              </button>
            </div>

            {measureError && <p className="mb-2 text-xs text-red-400">{measureError}</p>}
            {measurement && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-xs">
                <p className="mb-2 text-neutral-400">
                  «{measurement.projectTitle}» — {measurement.itemCount} issue
                </p>
                <table className="w-full text-left">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="pb-1 font-medium">Chiamata</th>
                      <th className="pb-1 text-right font-medium">Punti</th>
                      <th className="pb-1 text-right font-medium">Nodi</th>
                      <th className="pb-1 text-right font-medium">Dati</th>
                      <th className="pb-1 text-right font-medium">Tempo</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-300">
                    {grouped.map((g) => (
                      <tr key={g.name}>
                        <td className="py-0.5">
                          {g.name}
                          {g.count > 1 && <span className="text-neutral-600"> ×{g.count}</span>}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">{g.cost}</td>
                        <td className="py-0.5 text-right tabular-nums">{g.nodes.toLocaleString("it-IT")}</td>
                        <td className="py-0.5 text-right tabular-nums">{formatKb(g.bytes)}</td>
                        <td className="py-0.5 text-right tabular-nums">{(g.ms / 1000).toFixed(1)} s</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-neutral-800 text-neutral-100">
                    <tr>
                      <td className="pt-1.5 font-medium">Totale ({measurement.result.calls.length} chiamate)</td>
                      <td className="pt-1.5 text-right font-medium tabular-nums">{totalCost}</td>
                      <td className="pt-1.5" />
                      <td className="pt-1.5 text-right font-medium tabular-nums">{formatKb(totalBytes)}</td>
                      <td className="pt-1.5 text-right font-medium tabular-nums">{(measurement.ms / 1000).toFixed(1)} s</td>
                    </tr>
                  </tfoot>
                </table>
                {measurement.result.limit != null && measurement.result.remaining != null && (
                  <p className="mt-2 text-neutral-500">
                    Limite orario: {measurement.result.remaining.toLocaleString("it-IT")} / {measurement.result.limit.toLocaleString("it-IT")} punti
                    rimasti
                    {measurement.result.resetAt && <> (si azzera alle {new Date(measurement.result.resetAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })})</>}
                    . Un avvio costa lo {((totalCost / measurement.result.limit) * 100).toFixed(2)}% del limite.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
