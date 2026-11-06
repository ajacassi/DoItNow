import { Fragment, useMemo, useState } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { activeBlockers, activeBlocking } from "../lib/github";
import { colorStyle } from "../lib/colors";
import { formatDaysLeft, scoreItems, type PriorityConfig, type ScoredItem } from "../lib/priority";
import LabelChip from "./LabelChip";
import ExternalLink from "./ExternalLink";

interface Props {
  project: ProjectDetail;
  config: PriorityConfig;
  /** False while the config is the automatic one, never saved for this project. */
  configSaved: boolean;
  onOpenItem: (item: ProjectItem) => void;
  onEditConfig: () => void;
}

function scoreTone(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 45) return "bg-orange-500";
  if (score >= 25) return "bg-yellow-500";
  return "bg-neutral-500";
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

function Breakdown({ s }: { s: ScoredItem }) {
  const active = s.factors.filter((f) => f.value !== null && f.weight > 0);
  const den = active.reduce((a, f) => a + f.weight, 0);
  return (
    <div className="space-y-1 text-[11px] text-neutral-400">
      <table className="w-full max-w-2xl">
        <thead className="text-neutral-600">
          <tr>
            <th className="py-0.5 text-left font-normal">Fattore</th>
            <th className="py-0.5 text-left font-normal">Origine</th>
            <th className="py-0.5 text-right font-normal">Valore</th>
            <th className="py-0.5 text-right font-normal">Peso</th>
            <th className="py-0.5 text-right font-normal">Contributo</th>
          </tr>
        </thead>
        <tbody>
          {s.factors.map((f) => {
            const ignored = f.value === null || f.weight <= 0;
            return (
              <tr key={f.key} className={ignored ? "text-neutral-600 line-through" : ""}>
                <td className="py-0.5 pr-3">{f.label}</td>
                <td className={`py-0.5 pr-3 ${f.defaulted ? "italic text-amber-500/80" : ""}`}>{f.detail}</td>
                <td className="py-0.5 text-right tabular-nums">{f.value === null ? "—" : fmt(f.value)}</td>
                <td className="py-0.5 text-right tabular-nums">{fmt(f.weight)}</td>
                <td className="py-0.5 text-right tabular-nums text-neutral-200">
                  {ignored || den === 0 ? "—" : fmt((100 * f.weight * f.value!) / den, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="tabular-nums">
        base <span className="text-neutral-200">{fmt(100 * s.base, 1)}</span> × stato{" "}
        <span className="text-neutral-200">{fmt(s.statusMultiplier)}</span> ({s.item.status})
        {s.blockedMultiplier !== 1 && (
          <>
            {" "}
            × bloccata <span className="text-red-400">{fmt(s.blockedMultiplier)}</span>
          </>
        )}{" "}
        = <span className="font-semibold text-neutral-100">{fmt(s.score, 1)}</span>
      </div>
    </div>
  );
}

export default function ProjectPriority({ project, config, configSaved, onOpenItem, onEditConfig }: Props) {
  const result = useMemo(() => scoreItems(project.items, project, config), [project, config]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const statusColor = useMemo(() => new Map(project.statusOptions.map((s) => [s.name, s.color])), [project.statusOptions]);
  const parentTitle = useMemo(() => new Map(project.items.filter((i) => i.contentId).map((i) => [i.contentId!, i])), [project.items]);

  return (
    <div className="h-full overflow-y-auto px-8 py-4">
      <div className="mb-3 flex items-center gap-3 text-xs text-neutral-500">
        <span>
          <span className="text-neutral-200">{result.ranked.length}</span> issue in classifica
          {result.excluded.length > 0 && (
            <>
              {" · "}
              <button onClick={() => setShowExcluded((v) => !v)} className="hover:text-neutral-300 hover:underline">
                {result.excluded.length} escluse
              </button>
            </>
          )}
        </span>
        {!configSaved && (
          <span className="rounded border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-amber-300">
            Configurazione automatica: controlla campi e valori
          </span>
        )}
        <button
          onClick={onEditConfig}
          className="ml-auto rounded-lg border border-neutral-800 px-2.5 py-1 text-neutral-300 transition hover:border-neutral-500"
        >
          ⚙ Configura priorità
        </button>
      </div>

      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-10" />
          <col className="w-32" />
          <col />
          <col className="w-36" />
          <col className="w-32" />
          <col className="w-40" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-neutral-950 text-left text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">#</th>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">Punteggio</th>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">Issue</th>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">Stato</th>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">Criticità</th>
            <th className="border-b border-neutral-800 px-2 py-2 font-medium">Scadenza</th>
          </tr>
        </thead>
        <tbody>
          {result.ranked.map((s, idx) => {
            const { item } = s;
            const open = openId === item.id;
            const st = colorStyle(statusColor.get(item.status));
            const blockers = activeBlockers(item).length;
            const blocking = activeBlocking(item).length;
            const parent = item.parentId ? parentTitle.get(item.parentId) : undefined;
            return (
              <Fragment key={item.id}>
                <tr className="group hover:bg-neutral-900/60">
                  <td className="border-b border-neutral-900 px-2 py-2 text-xs tabular-nums text-neutral-600">{idx + 1}</td>
                  <td className="border-b border-neutral-900 px-2 py-2">
                    <button
                      onClick={() => setOpenId(open ? null : item.id)}
                      title="Clicca per vedere come è calcolato"
                      className="flex w-full items-center gap-2"
                    >
                      <span className="w-9 text-right text-sm font-semibold tabular-nums">{Math.round(s.score)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                        <span className={`block h-full ${scoreTone(s.score)}`} style={{ width: `${Math.min(100, s.score)}%` }} />
                      </span>
                      <span className="text-[10px] text-neutral-600">{open ? "▾" : "▸"}</span>
                    </button>
                  </td>
                  <td className="border-b border-neutral-900 px-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.number != null && <span className="shrink-0 text-xs tabular-nums text-neutral-500">#{item.number}</span>}
                      <button onClick={() => onOpenItem(item)} className="min-w-0 truncate text-left hover:underline">
                        {item.title}
                      </button>
                      {blockers > 0 && (
                        <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
                          Bloccata da {blockers}
                        </span>
                      )}
                      {blocking > 0 && (
                        <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                          Blocca {blocking}
                        </span>
                      )}
                      {item.labels.slice(0, 3).map((l) => (
                        <LabelChip key={l.name} name={l.name} color={l.color} />
                      ))}
                      {item.url && (
                        <ExternalLink href={item.url} className="shrink-0 text-xs text-neutral-600 opacity-0 hover:text-neutral-400 group-hover:opacity-100">
                          ↗
                        </ExternalLink>
                      )}
                    </div>
                    {parent && <div className="mt-0.5 truncate text-[11px] text-neutral-600">sotto #{parent.number} {parent.title}</div>}
                  </td>
                  <td className="border-b border-neutral-900 px-2 py-2">
                    <span className={`inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] ${st.bg} ${st.text} ${st.border}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="border-b border-neutral-900 px-2 py-2 text-xs text-neutral-300">
                    {s.criticality ?? <span className="text-neutral-700">—</span>}
                  </td>
                  <td className="border-b border-neutral-900 px-2 py-2 text-xs">
                    {s.dueDate ? (
                      <div title={s.dueSource === "milestone" ? `dalla milestone "${item.milestone?.title}"` : undefined}>
                        <span className="tabular-nums text-neutral-300">{new Date(s.dueDate.slice(0, 10) + "T00:00").toLocaleDateString("it-IT")}</span>
                        {s.dueSource === "milestone" && <span className="ml-1 text-neutral-600">🎯</span>}
                        <div className={`text-[11px] ${s.daysLeft! < 0 ? "text-red-400" : s.daysLeft! <= 3 ? "text-amber-400" : "text-neutral-500"}`}>
                          {formatDaysLeft(s.daysLeft!)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-neutral-700">—</span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td />
                    <td colSpan={5} className="border-b border-neutral-900 bg-neutral-900/40 px-3 py-2">
                      <Breakdown s={s} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {result.ranked.length === 0 && <p className="mt-6 text-center text-sm text-neutral-600">Nessuna issue da ordinare in questa vista.</p>}

      {showExcluded && result.excluded.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Escluse dalla classifica</h3>
          <ul className="space-y-1 text-xs">
            {result.excluded.map(({ item, reason }) => (
              <li key={item.id} className="flex items-center gap-2 text-neutral-500">
                {item.number != null && <span className="tabular-nums">#{item.number}</span>}
                <button onClick={() => onOpenItem(item)} className="truncate text-neutral-400 hover:underline">
                  {item.title}
                </button>
                <span className="text-neutral-600">— {reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
