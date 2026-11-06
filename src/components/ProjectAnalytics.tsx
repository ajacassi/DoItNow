import { useMemo, useState, type ReactNode } from "react";
import type { ProjectDetail, ProjectItem } from "../lib/github";
import { colorStyle } from "../lib/colors";
import type { PriorityConfig } from "../lib/priority";
import { ACTIVE_PHASES, PHASE_HINT, PHASE_LABEL, phaseFor, type Phase } from "../lib/phases";
import {
  computeAnalytics,
  itemHasPerson,
  loadValue,
  UNASSIGNED,
  URGENT_SCORE,
  type Analytics,
  type LoadMeasure,
  type PersonStats,
} from "../lib/analytics";

interface Props {
  project: ProjectDetail;
  config: PriorityConfig;
  phases: Record<string, Phase>;
  onChangePhases: (phases: Record<string, Phase>) => void;
  onOpenItem: (item: ProjectItem) => void;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const PHASE_VAR: Record<Exclude<Phase, "out">, string> = {
  todo: "var(--viz-ph-todo)",
  doing: "var(--viz-ph-doing)",
  closing: "var(--viz-ph-closing)",
};

type Tip = { x: number; y: number; lines: ReactNode[] } | null;

function fmt(n: number, digits = 1): string {
  return Number.isInteger(n) ? n.toLocaleString("it-IT") : n.toLocaleString("it-IT", { maximumFractionDigits: digits });
}

/** Rounds up to a clean axis maximum (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k), tight enough not to waste the plot. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  if (v <= 4) return Math.ceil(v);
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * exp) return m * exp;
  return 10 * exp;
}

function weekLabel(t: number): string {
  return new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function issueLabel(item: ProjectItem): string {
  return `${item.number != null ? `#${item.number} ` : ""}${item.title}`;
}

function personName(p: { key: string; login: string | null }): string {
  return p.key === UNASSIGNED ? "Non assegnate" : (p.login ?? p.key);
}

function Swatch({ color, round }: { color: string; round?: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 ${round ? "rounded-full" : "rounded-sm"}`} style={{ background: color }} />;
}

function Legend({ items }: { items: { label: string; color: string; icon?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <Swatch color={i.color} />
          {i.icon && <span aria-hidden>{i.icon}</span>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

interface TableData {
  head: string[];
  rows: (string | number)[][];
}

/** A chart card with a title, an optional control row, and a chart ⇄ table toggle. */
function Card({
  title,
  subtitle,
  controls,
  table,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  controls?: ReactNode;
  table?: TableData;
  className?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`rounded-xl border border-neutral-800 bg-neutral-900 p-4 ${className}`}>
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-neutral-500">{subtitle}</p>}
        </div>
        {controls}
        {table && (
          <button
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 rounded-md border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neutral-600"
          >
            {showTable ? "Grafico" : "Tabella"}
          </button>
        )}
      </div>
      {showTable && table ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-neutral-900 text-left text-neutral-500">
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={`border-b border-neutral-800 px-2 py-1 font-medium ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} className={`border-b border-neutral-800/60 px-2 py-1 ${ci > 0 ? "text-right tabular-nums" : ""} text-neutral-300`}>
                      {typeof c === "number" ? fmt(c) : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-neutral-600">{text}</p>;
}

function PersonLabel({ p, selected, onSelect }: { p: { key: string; login: string | null; avatarUrl: string | null }; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      title={selected ? "Togli il filtro su questa persona" : "Filtra tutta l'analisi su questa persona"}
      className={`flex w-36 shrink-0 items-center gap-2 truncate rounded px-1 text-left text-xs ${
        selected ? "bg-indigo-600/20 text-indigo-300" : "text-neutral-300 hover:bg-neutral-800"
      }`}
    >
      {p.avatarUrl ? (
        <img src={p.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-600 text-[10px] text-neutral-500">
          ?
        </span>
      )}
      <span className="truncate">{personName(p)}</span>
    </button>
  );
}

/** Horizontal stacked bar: segments separated by a 2px gap, rounded only at the data end. */
function StackBar({
  segments,
  max,
  total,
  totalLabel,
  onHover,
  onLeave,
}: {
  segments: { key: string; value: number; color: string; tip: ReactNode[]; onClick?: () => void }[];
  max: number;
  total: number;
  totalLabel: string;
  onHover: (e: React.MouseEvent, lines: ReactNode[]) => void;
  onLeave: () => void;
}) {
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex h-3.5 min-w-0 gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
        {visible.map((s, i) => (
          <div
            key={s.key}
            onMouseMove={(e) => onHover(e, s.tip)}
            onMouseLeave={onLeave}
            onClick={s.onClick}
            className={`h-full ${i === visible.length - 1 ? "rounded-r" : ""} ${s.onClick ? "cursor-pointer" : ""}`}
            style={{ flexGrow: s.value, flexBasis: 0, minWidth: 3, background: s.color }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">{totalLabel}</span>
    </div>
  );
}

/** Deterministic 0..1 jitter from an id, so dots don't move between renders. */
function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

function Dot({
  leftPct,
  topPct,
  color,
  onHover,
  onLeave,
  onClick,
}: {
  leftPct: number;
  topPct: number;
  color: string;
  onHover: (e: React.MouseEvent) => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  // 8px dot with a 2px surface ring; the 16px button around it is the hit target.
  return (
    <button
      onMouseMove={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      className="group absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    >
      <span
        className="block h-2 w-2 rounded-full transition-transform group-hover:scale-150"
        style={{ background: color, boxShadow: "0 0 0 2px var(--viz-surface)" }}
      />
    </button>
  );
}

function Axis({ ticks, unit }: { ticks: { pct: number; label: string }[]; unit?: string }) {
  return (
    <div className="relative mt-1 h-4 text-[10px] tabular-nums text-neutral-600">
      {ticks.map((t) => (
        <span key={t.pct} className="absolute -translate-x-1/2" style={{ left: `${t.pct}%` }}>
          {t.label}
        </span>
      ))}
      {unit && <span className="absolute right-0 top-3.5 text-neutral-600">{unit}</span>}
    </div>
  );
}

function GridLines({ pcts }: { pcts: number[] }) {
  return (
    <>
      {pcts.map((p) => (
        <span key={p} className="pointer-events-none absolute inset-y-0 w-px" style={{ left: `${p}%`, background: "var(--viz-grid)" }} />
      ))}
    </>
  );
}

/** Vertical columns sharing one baseline; each group may hold 1–2 series side by side. */
function Columns({
  groups,
  max,
  height = 140,
  onHover,
  onLeave,
}: {
  groups: { key: string; label: string; bars: { value: number; color: string }[]; tip: ReactNode[]; highlight?: boolean }[];
  max: number;
  height?: number;
  onHover: (e: React.MouseEvent, lines: ReactNode[]) => void;
  onLeave: () => void;
}) {
  const ticks = [0, max / 2, max];
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-6 shrink-0 text-right text-[10px] tabular-nums text-neutral-600" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-[2px]" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute inset-x-0 h-px"
              style={{ top: `${100 - (t / max) * 100}%`, background: "var(--viz-grid)" }}
            />
          ))}
          {groups.map((g) => (
            <div
              key={g.key}
              onMouseMove={(e) => onHover(e, g.tip)}
              onMouseLeave={onLeave}
              className={`relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-sm ${g.highlight ? "bg-neutral-800/40" : "hover:bg-neutral-800/40"}`}
            >
              {g.bars.map((b, i) => (
                <div
                  key={i}
                  className="rounded-t"
                  style={{ height: `${(b.value / max) * 100}%`, width: "100%", maxWidth: 16, background: b.color, minHeight: b.value > 0 ? 2 : 0 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-8 mt-1 flex gap-[2px]">
        {groups.map((g) => (
          <span key={g.key} className={`flex-1 truncate text-center text-[10px] tabular-nums ${g.highlight ? "text-neutral-300" : "text-neutral-600"}`}>
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "critical" | "warning" }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3" title={hint}>
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        {tone && <Swatch round color={tone === "critical" ? "var(--viz-critical)" : "var(--viz-warning)"} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase mapping editor (statuses differ from project to project)
// ---------------------------------------------------------------------------

function PhaseEditor({
  project,
  phases,
  onChange,
  onClose,
}: {
  project: ProjectDetail;
  phases: Record<string, Phase>;
  onChange: (p: Record<string, Phase>) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute right-0 top-9 z-30 w-[26rem] rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
        <h3 className="text-sm font-semibold">Fasi del lavoro</h3>
        <p className="mb-3 mt-0.5 text-[11px] leading-relaxed text-neutral-500">
          Ogni progetto ha stati diversi: qui decidi in quale fase cade ciascuno. Le issue chiuse sono sempre escluse. Vale solo per questo
          progetto.
        </p>
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {project.statusOptions.map((s) => {
            const { phase, auto } = phaseFor(s.name, phases);
            const st = colorStyle(s.color);
            return (
              <div key={s.id || s.name} className="flex items-center gap-2 text-xs">
                <span className={`w-40 truncate rounded-full border px-2 py-0.5 ${st.bg} ${st.text} ${st.border}`}>{s.name}</span>
                <select
                  value={phase}
                  onChange={(e) => onChange({ ...phases, [s.name]: e.target.value as Phase })}
                  className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-indigo-500"
                >
                  {(["todo", "doing", "closing", "out"] as Phase[]).map((p) => (
                    <option key={p} value={p}>
                      {PHASE_LABEL[p]}
                    </option>
                  ))}
                </select>
                {auto && (
                  <span
                    title="Dedotta dal nome dello stato"
                    className="rounded bg-neutral-800 px-1 py-0.5 text-[9px] uppercase tracking-wide text-neutral-500"
                  >
                    auto
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-0.5 border-t border-neutral-800 pt-2 text-[10px] text-neutral-600">
          {(["todo", "doing", "closing", "out"] as Phase[]).map((p) => (
            <div key={p}>
              <span className="text-neutral-400">{PHASE_LABEL[p]}</span>: {PHASE_HINT[p]}
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          <button onClick={() => onChange({})} className="text-[11px] text-neutral-500 hover:text-neutral-300">
            Ripristina automatico
          </button>
          <button onClick={onClose} className="rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:border-neutral-500">
            Chiudi
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

const MEASURE_LABEL: Record<LoadMeasure, string> = { count: "Numero issue", effort: "Somma effort", score: "Somma punteggi" };

export default function ProjectAnalytics({ project, config, phases, onChangePhases, onOpenItem }: Props) {
  const [measure, setMeasure] = useState<LoadMeasure>("count");
  const [person, setPerson] = useState<string | null>(null);
  const [showPhases, setShowPhases] = useState(false);
  const [tip, setTip] = useState<Tip>(null);

  const items = useMemo(() => (person ? project.items.filter((i) => itemHasPerson(i, person)) : project.items), [project.items, person]);
  const a: Analytics = useMemo(() => computeAnalytics(items, project, config, phases), [items, project, config, phases]);

  const effMeasure: LoadMeasure = measure === "effort" && !a.hasEffort ? "count" : measure;
  const showTip = (e: React.MouseEvent, lines: ReactNode[]) => setTip({ x: e.clientX, y: e.clientY, lines });
  const hideTip = () => setTip(null);
  const togglePerson = (key: string) => setPerson((p) => (p === key ? null : key));

  const openPeople = a.people.filter((p) => p.open > 0);
  const personLabel = person ? (person === UNASSIGNED ? "Non assegnate" : person) : null;

  // --- 1. Load per person ---
  const loads = openPeople.map((p) => ({
    p,
    values: ACTIVE_PHASES.map((ph) => loadValue(p.byPhase[ph], effMeasure, a)),
  }));
  const loadMax = niceMax(Math.max(0, ...loads.map((l) => l.values.reduce((s, v) => s + v, 0))));

  // --- 2. Score distribution ---
  const scorePeople = a.people.filter((p) => p.scores.length > 0);

  // --- 3. Due per person ---
  const duePeople = a.people.filter((p) => p.overdue + p.due7 + p.due30 > 0);
  const dueMax = niceMax(Math.max(0, ...duePeople.map((p) => p.overdue + p.due7 + p.due30)));

  // --- 4. Due per week ---
  const dueWeekMax = niceMax(Math.max(a.overdueItems.length, ...a.dueWeeks.map((w) => w.count)));

  // --- 5. Created vs closed ---
  const flowMax = niceMax(Math.max(0, ...a.weeks.flatMap((w) => [w.created, w.closed])));

  // --- 6. Throughput & lead time ---
  const closedPeople = a.people.filter((p) => p.closedLast28 > 0).sort((x, y) => y.closedLast28 - x.closedLast28);
  const closedMax = niceMax(Math.max(0, ...closedPeople.map((p) => p.closedLast28)));
  const leadPeople = a.people.filter((p) => p.leadTimeMedian !== null).sort((x, y) => (y.leadTimeMedian ?? 0) - (x.leadTimeMedian ?? 0));
  const leadMax = niceMax(Math.max(0, ...leadPeople.map((p) => p.leadTimeMedian ?? 0)));

  // --- 7. Age by status ---
  const ageMax = niceMax(Math.max(0, ...a.statusAges.flatMap((s) => s.items.map((i) => i.ageDays))));

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

  return (
    <div className="h-full overflow-y-auto px-8 py-5">
      {/* Filter row */}
      <div className="relative mb-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-neutral-500">
          Analisi delle issue della vista corrente
          {personLabel && (
            <>
              {" · "}
              <button onClick={() => setPerson(null)} className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-indigo-300 hover:bg-indigo-600/30">
                solo {personLabel} ✕
              </button>
            </>
          )}
        </span>
        <span className="text-neutral-600">Clicca una persona per filtrare tutti i grafici.</span>
        <button
          onClick={() => setShowPhases((v) => !v)}
          className="ml-auto rounded-lg border border-neutral-800 px-2.5 py-1 text-neutral-300 transition hover:border-neutral-500"
        >
          ⚙ Fasi degli stati
        </button>
        {showPhases && <PhaseEditor project={project} phases={phases} onChange={onChangePhases} onClose={() => setShowPhases(false)} />}
      </div>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Aperte" value={fmt(a.kpi.open)} hint="Issue aperte in una fase attiva (da fare, in lavorazione, in chiusura)" />
        <Kpi label="Non assegnate" value={fmt(a.kpi.unassigned)} tone={a.kpi.unassigned > 0 ? "warning" : undefined} />
        <Kpi label="Scadute" value={fmt(a.kpi.overdue)} tone={a.kpi.overdue > 0 ? "critical" : undefined} />
        <Kpi label="Bloccate" value={fmt(a.kpi.blocked)} hint="Con almeno una issue bloccante ancora aperta" />
        <Kpi label="Chiuse negli ultimi 30 gg" value={fmt(a.kpi.closedLast30)} />
        <Kpi label="Età mediana delle aperte" value={a.kpi.medianAgeOpen === null ? "—" : `${fmt(a.kpi.medianAgeOpen)} gg`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 1. Load per person */}
        <Card
          className="xl:col-span-2"
          title="Carico per persona"
          subtitle="Lavoro aperto diviso per fase. Le issue con più assegnatari contano per ciascuno."
          controls={
            <div className="flex shrink-0 rounded-md border border-neutral-800 p-0.5 text-[11px]">
              {(["count", "effort", "score"] as LoadMeasure[]).map((m) => (
                <button
                  key={m}
                  disabled={m === "effort" && !a.hasEffort}
                  title={m === "effort" && !a.hasEffort ? "Imposta un campo effort in ⚙ Configura priorità" : undefined}
                  onClick={() => setMeasure(m)}
                  className={`rounded px-2 py-0.5 disabled:opacity-40 ${effMeasure === m ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"}`}
                >
                  {MEASURE_LABEL[m]}
                </button>
              ))}
            </div>
          }
          table={{
            head: ["Persona", ...ACTIVE_PHASES.map((ph) => PHASE_LABEL[ph]), "Totale"],
            rows: loads.map((l) => [personName(l.p), ...l.values.map((v) => Math.round(v * 10) / 10), Math.round(l.values.reduce((s, v) => s + v, 0) * 10) / 10]),
          }}
        >
          {loads.length === 0 ? (
            <Empty text="Nessuna issue aperta in questa vista." />
          ) : (
            <>
              <div className="mb-3">
                <Legend items={ACTIVE_PHASES.map((ph) => ({ label: PHASE_LABEL[ph], color: PHASE_VAR[ph] }))} />
              </div>
              <div className="space-y-1.5">
                {loads.map(({ p, values }) => {
                  const total = values.reduce((s, v) => s + v, 0);
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <PersonLabel p={p} selected={person === p.key} onSelect={() => togglePerson(p.key)} />
                      <StackBar
                        max={loadMax}
                        total={total}
                        totalLabel={effMeasure === "count" ? fmt(total) : fmt(Math.round(total))}
                        onHover={showTip}
                        onLeave={hideTip}
                        segments={ACTIVE_PHASES.map((ph, i) => ({
                          key: ph,
                          value: values[i],
                          color: PHASE_VAR[ph],
                          tip: [
                            <b key="t">
                              {personName(p)} · {PHASE_LABEL[ph]}
                            </b>,
                            `${p.byPhase[ph].length} issue${effMeasure !== "count" ? ` · ${MEASURE_LABEL[effMeasure].toLowerCase()} ${fmt(Math.round(values[i]))}` : ""}`,
                            ...p.byPhase[ph].slice(0, 6).map((it) => issueLabel(it)),
                            ...(p.byPhase[ph].length > 6 ? [`… e altre ${p.byPhase[ph].length - 6}`] : []),
                          ],
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
              {effMeasure === "effort" && loads.some((l) => l.p.effortKnown < l.p.open) && (
                <p className="mt-2 text-[11px] text-neutral-500">Le issue senza effort non contano nella somma: vedi "Qualità dei dati".</p>
              )}
            </>
          )}
        </Card>

        {/* 2. Score distribution */}
        <Card
          className="xl:col-span-2"
          title="Distribuzione dei punteggi di priorità"
          subtitle={`Ogni pallino è una issue aperta. Oltre ${URGENT_SCORE} = molto urgente. Clicca un pallino per aprirla.`}
          table={{
            head: ["Persona", "Issue con punteggio", "Mediana", "Massimo", `≥ ${URGENT_SCORE}`],
            rows: scorePeople.map((p) => {
              const s = p.scores.map((d) => d.score).sort((x, y) => x - y);
              const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
              return [personName(p), s.length, Math.round(mid), Math.round(s[s.length - 1]), p.urgent];
            }),
          }}
        >
          {scorePeople.length === 0 ? (
            <Empty text="Nessuna issue con punteggio in questa vista." />
          ) : (
            <div>
              {scorePeople.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <PersonLabel p={p} selected={person === p.key} onSelect={() => togglePerson(p.key)} />
                  <div className="relative h-7 flex-1">
                    <GridLines pcts={[0, 25, 50, 75, 100]} />
                    <span
                      className="pointer-events-none absolute inset-y-0 w-px"
                      style={{ left: `${URGENT_SCORE}%`, background: "var(--viz-critical)", opacity: 0.6 }}
                    />
                    {p.scores.map((d) => (
                      <Dot
                        key={d.item.id}
                        leftPct={Math.min(100, d.score)}
                        topPct={20 + jitter(d.item.id) * 60}
                        color={d.score >= URGENT_SCORE ? "var(--viz-critical)" : "var(--viz-s1)"}
                        onHover={(e) => showTip(e, [<b key="t">{issueLabel(d.item)}</b>, `Punteggio ${Math.round(d.score)} · ${d.item.status}`])}
                        onLeave={hideTip}
                        onClick={() => onOpenItem(d.item)}
                      />
                    ))}
                  </div>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-neutral-400" title={`Issue con punteggio ≥ ${URGENT_SCORE}`}>
                    {p.urgent > 0 ? `${p.urgent} urgenti` : "—"}
                  </span>
                </div>
              ))}
              <div className="flex gap-3">
                <span className="w-36 shrink-0" />
                <div className="flex-1">
                  <Axis ticks={[0, 25, 50, 75, 100].map((t) => ({ pct: t, label: String(t) }))} />
                </div>
                <span className="w-20 shrink-0" />
              </div>
              <div className="mt-2">
                <Legend
                  items={[
                    { label: `Sotto ${URGENT_SCORE}`, color: "var(--viz-s1)" },
                    { label: `${URGENT_SCORE} o più (molto urgente)`, color: "var(--viz-critical)", icon: "⚠" },
                  ]}
                />
              </div>
            </div>
          )}
        </Card>

        {/* 3. Due per person */}
        <Card
          title="Scadenze per persona"
          subtitle="Issue aperte scadute o in scadenza (data del campo o della milestone)."
          table={{
            head: ["Persona", "Scadute", "Entro 7 gg", "Entro 30 gg"],
            rows: duePeople.map((p) => [personName(p), p.overdue, p.due7, p.due30]),
          }}
        >
          {duePeople.length === 0 ? (
            <Empty text="Nessuna scadenza nei prossimi 30 giorni." />
          ) : (
            <>
              <div className="mb-3">
                <Legend
                  items={[
                    { label: "Scadute", color: "var(--viz-critical)", icon: "⛔" },
                    { label: "Entro 7 gg", color: "var(--viz-serious)", icon: "⚠" },
                    { label: "Entro 30 gg", color: "var(--viz-warning)", icon: "⏳" },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                {duePeople.map((p) => (
                  <div key={p.key} className="flex items-center gap-3">
                    <PersonLabel p={p} selected={person === p.key} onSelect={() => togglePerson(p.key)} />
                    <StackBar
                      max={dueMax}
                      total={p.overdue + p.due7 + p.due30}
                      totalLabel={fmt(p.overdue + p.due7 + p.due30)}
                      onHover={showTip}
                      onLeave={hideTip}
                      segments={[
                        { key: "o", value: p.overdue, color: "var(--viz-critical)", tip: [<b key="t">{personName(p)}</b>, `${p.overdue} scadute`] },
                        { key: "7", value: p.due7, color: "var(--viz-serious)", tip: [<b key="t">{personName(p)}</b>, `${p.due7} in scadenza entro 7 giorni`] },
                        { key: "30", value: p.due30, color: "var(--viz-warning)", tip: [<b key="t">{personName(p)}</b>, `${p.due30} in scadenza entro 30 giorni`] },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* 4. Due per week */}
        <Card
          title="Scadenze nelle prossime 8 settimane"
          subtitle="Quante issue aperte scadono in ciascuna settimana (da lunedì). I picchi sono settimane a rischio."
          table={{
            head: ["Settimana", "Issue in scadenza"],
            rows: [["Già scadute", a.overdueItems.length], ...a.dueWeeks.map((w) => [`dal ${weekLabel(w.start)}`, w.count])],
          }}
        >
          <Columns
            max={dueWeekMax}
            onHover={showTip}
            onLeave={hideTip}
            groups={[
              {
                key: "overdue",
                label: "scadute",
                bars: [{ value: a.overdueItems.length, color: "var(--viz-critical)" }],
                tip: [<b key="t">Già scadute: {a.overdueItems.length}</b>, ...a.overdueItems.slice(0, 6).map(issueLabel)],
              },
              ...a.dueWeeks.map((w, i) => ({
                key: String(w.start),
                label: i === 0 ? "questa" : weekLabel(w.start),
                highlight: i === 0,
                bars: [{ value: w.count, color: "var(--viz-s1)" }],
                tip: [<b key="t">Settimana dal {weekLabel(w.start)}: {w.count}</b>, ...w.items.slice(0, 6).map(issueLabel), ...(w.items.length > 6 ? [`… e altre ${w.items.length - 6}`] : [])],
              })),
            ]}
          />
        </Card>

        {/* 5. Created vs closed */}
        <Card
          className="xl:col-span-2"
          title="Aperte e chiuse per settimana"
          subtitle="Ultime 12 settimane. Se le nuove superano stabilmente le chiuse, il backlog sta crescendo."
          table={{
            head: ["Settimana", "Create", "Chiuse", "Saldo"],
            rows: a.weeks.map((w) => [`dal ${weekLabel(w.start)}`, w.created, w.closed, w.created - w.closed]),
          }}
        >
          <div className="mb-3">
            <Legend
              items={[
                { label: "Create", color: "var(--viz-s1)" },
                { label: "Chiuse", color: "var(--viz-s2)" },
              ]}
            />
          </div>
          <Columns
            max={flowMax}
            height={150}
            onHover={showTip}
            onLeave={hideTip}
            groups={a.weeks.map((w, i) => ({
              key: String(w.start),
              label: i === a.weeks.length - 1 ? "questa" : weekLabel(w.start),
              highlight: i === a.weeks.length - 1,
              bars: [
                { value: w.created, color: "var(--viz-s1)" },
                { value: w.closed, color: "var(--viz-s2)" },
              ],
              tip: [
                <b key="t">Settimana dal {weekLabel(w.start)}</b>,
                `Create ${w.created} · Chiuse ${w.closed}`,
                `Saldo ${w.created - w.closed > 0 ? "+" : ""}${w.created - w.closed}`,
              ],
            }))}
          />
          {(() => {
            const created = a.weeks.reduce((s, w) => s + w.created, 0);
            const closed = a.weeks.reduce((s, w) => s + w.closed, 0);
            return (
              <p className="mt-2 text-[11px] text-neutral-500">
                In 12 settimane: <span className="text-neutral-300">{created}</span> create,{" "}
                <span className="text-neutral-300">{closed}</span> chiuse — saldo{" "}
                <span className="text-neutral-300">
                  {created - closed > 0 ? "+" : ""}
                  {created - closed}
                </span>
                .
              </p>
            );
          })()}
        </Card>

        {/* 6a. Closed per person */}
        <Card
          title="Chiuse per persona (ultimi 28 giorni)"
          subtitle="Il lavoro effettivamente completato, da confrontare con il carico."
          table={{ head: ["Persona", "Chiuse"], rows: closedPeople.map((p) => [personName(p), p.closedLast28]) }}
        >
          {closedPeople.length === 0 ? (
            <Empty text="Nessuna issue chiusa negli ultimi 28 giorni." />
          ) : (
            <div className="space-y-1.5">
              {closedPeople.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <PersonLabel p={p} selected={person === p.key} onSelect={() => togglePerson(p.key)} />
                  <StackBar
                    max={closedMax}
                    total={p.closedLast28}
                    totalLabel={fmt(p.closedLast28)}
                    onHover={showTip}
                    onLeave={hideTip}
                    segments={[{ key: "c", value: p.closedLast28, color: "var(--viz-s1)", tip: [<b key="t">{personName(p)}</b>, `${p.closedLast28} chiuse`] }]}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 6b. Lead time */}
        <Card
          title="Tempo di chiusura (mediana)"
          subtitle="Giorni dalla creazione alla chiusura, sulle issue chiuse negli ultimi 90 giorni."
          table={{
            head: ["Persona", "Mediana (gg)", "Issue considerate"],
            rows: leadPeople.map((p) => [personName(p), Math.round(p.leadTimeMedian ?? 0), p.leadTimeCount]),
          }}
        >
          {leadPeople.length === 0 ? (
            <Empty text="Nessuna issue chiusa negli ultimi 90 giorni." />
          ) : (
            <div className="space-y-1.5">
              {leadPeople.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <PersonLabel p={p} selected={person === p.key} onSelect={() => togglePerson(p.key)} />
                  <StackBar
                    max={leadMax}
                    total={p.leadTimeMedian ?? 0}
                    totalLabel={`${fmt(Math.round(p.leadTimeMedian ?? 0))} gg`}
                    onHover={showTip}
                    onLeave={hideTip}
                    segments={[
                      {
                        key: "l",
                        value: p.leadTimeMedian ?? 0,
                        color: "var(--viz-s1)",
                        tip: [<b key="t">{personName(p)}</b>, `Mediana ${fmt(Math.round(p.leadTimeMedian ?? 0))} giorni su ${p.leadTimeCount} issue`],
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 7. Age by status */}
        <Card
          className="xl:col-span-2"
          title="Età delle issue aperte per stato"
          subtitle="Giorni dalla creazione (GitHub non espone da quanto tempo sono in quello stato). I pallini più a destra sono le issue più vecchie."
          table={{
            head: ["Stato", "Issue", "Età mediana (gg)", "Più vecchia (gg)"],
            rows: a.statusAges.map((s) => [s.status, s.items.length, Math.round(s.medianAge ?? 0), s.items[0]?.ageDays ?? 0]),
          }}
        >
          {a.statusAges.length === 0 ? (
            <Empty text="Nessuna issue aperta in questa vista." />
          ) : (
            <div>
              {a.statusAges.map((s) => {
                const st = colorStyle(project.statusOptions.find((o) => o.name === s.status)?.color);
                return (
                  <div key={s.status} className="flex items-center gap-3">
                    <span className={`w-36 shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] ${st.bg} ${st.text} ${st.border}`}>{s.status}</span>
                    <div className="relative h-7 flex-1">
                      <GridLines pcts={[0, 50, 100]} />
                      {s.items.map(({ item, ageDays }) => (
                        <Dot
                          key={item.id}
                          leftPct={(ageDays / ageMax) * 100}
                          topPct={20 + jitter(item.id) * 60}
                          color="var(--viz-s1)"
                          onHover={(e) =>
                            showTip(e, [
                              <b key="t">{issueLabel(item)}</b>,
                              `Aperta da ${ageDays} giorni · ${item.assignees.map((x) => x.login).join(", ") || "non assegnata"}`,
                            ])
                          }
                          onLeave={hideTip}
                          onClick={() => onOpenItem(item)}
                        />
                      ))}
                    </div>
                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-neutral-400">
                      mediana {fmt(Math.round(s.medianAge ?? 0))} gg
                    </span>
                  </div>
                );
              })}
              <div className="flex gap-3">
                <span className="w-36 shrink-0" />
                <div className="flex-1">
                  <Axis ticks={[0, 50, 100].map((t) => ({ pct: t, label: fmt(Math.round((ageMax * t) / 100)) }))} />
                </div>
                <span className="w-24 shrink-0 text-right text-[10px] text-neutral-600">giorni</span>
              </div>
            </div>
          )}
        </Card>

        {/* 8. Bottlenecks */}
        <Card title="Colli di bottiglia" subtitle="Le issue aperte che bloccano più lavoro: sbloccarle libera altre persone.">
          {a.bottlenecks.length === 0 ? (
            <Empty text="Nessuna issue aperta blocca altre issue." />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {a.bottlenecks.map(({ item, blocking }) => (
                <li key={item.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-center text-[10px] text-amber-400">
                    blocca {blocking}
                  </span>
                  <button onClick={() => onOpenItem(item)} className="min-w-0 flex-1 truncate text-left text-neutral-200 hover:underline">
                    {issueLabel(item)}
                  </button>
                  <span className="shrink-0 text-[11px] text-neutral-500">{item.assignees.map((x) => x.login).join(", ") || "non assegnata"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 9. Data quality */}
        <Card
          title="Qualità dei dati"
          subtitle="Quanto sono completi i dati che alimentano punteggi e grafici, per persona (sulle issue aperte)."
        >
          {openPeople.length === 0 ? (
            <Empty text="Nessuna issue aperta in questa vista." />
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="border-b border-neutral-800 px-2 py-1 font-medium">Persona</th>
                  <th className="border-b border-neutral-800 px-2 py-1 text-right font-medium">Aperte</th>
                  <th className="border-b border-neutral-800 px-2 py-1 text-right font-medium">Senza scadenza</th>
                  {a.hasCriticality && <th className="border-b border-neutral-800 px-2 py-1 text-right font-medium">Senza criticità</th>}
                  {a.hasEffort && <th className="border-b border-neutral-800 px-2 py-1 text-right font-medium">Senza effort</th>}
                  <th className="border-b border-neutral-800 px-2 py-1 text-right font-medium">Bloccate</th>
                </tr>
              </thead>
              <tbody>
                {openPeople.map((p: PersonStats) => (
                  <tr key={p.key}>
                    <td className="border-b border-neutral-800/60 px-2 py-1">
                      <button onClick={() => togglePerson(p.key)} className="text-neutral-300 hover:underline">
                        {personName(p)}
                      </button>
                    </td>
                    <td className="border-b border-neutral-800/60 px-2 py-1 text-right tabular-nums text-neutral-300">{p.open}</td>
                    <QualityCell n={p.noDue} d={p.open} pct={pct} />
                    {a.hasCriticality && <QualityCell n={p.noCriticality} d={p.open} pct={pct} />}
                    {a.hasEffort && <QualityCell n={p.noEffort} d={p.open} pct={pct} />}
                    <td className="border-b border-neutral-800/60 px-2 py-1 text-right tabular-nums text-neutral-300">{p.blocked || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[11px] leading-relaxed text-neutral-300 shadow-xl"
          style={{ left: Math.min(tip.x + 14, window.innerWidth - 380), top: tip.y + 14 }}
        >
          {tip.lines.map((l, i) => (
            <div key={i} className={`truncate ${i === 0 ? "text-neutral-100" : ""}`}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "3 (25%)", with a thin meter so the worst gaps stand out down the column. */
function QualityCell({ n, d, pct }: { n: number; d: number; pct: (n: number, d: number) => string }) {
  const ratio = d === 0 ? 0 : n / d;
  return (
    <td className="border-b border-neutral-800/60 px-2 py-1 text-right tabular-nums text-neutral-300">
      <div className="flex items-center justify-end gap-2">
        <span className="h-1 w-12 overflow-hidden rounded-full bg-neutral-800">
          <span className="block h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--viz-s1)" }} />
        </span>
        <span className="w-14">{n === 0 ? "—" : `${n} (${pct(n, d)})`}</span>
      </div>
    </td>
  );
}
