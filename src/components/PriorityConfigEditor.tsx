import { useEffect, useState } from "react";
import type { ProjectDetail } from "../lib/github";
import { listPriorityConfigs } from "../lib/store";
import { colorStyle } from "../lib/colors";
import {
  EXCLUDE,
  configWarnings,
  criticalityValueFor,
  dateFields,
  defaultPriorityConfig,
  materializeConfig,
  selectFields,
  statusSettingFor,
  type PriorityConfig,
} from "../lib/priority";

interface Props {
  project: ProjectDetail;
  config: PriorityConfig;
  onClose: () => void;
  onSave: (config: PriorityConfig) => void;
}

/** Number input that keeps the raw text while typing ("0.", "") and commits a valid number on blur/Enter. */
function NumField({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  disabled,
  className = "w-20",
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit() {
    let n = parseFloat(text.replace(",", "."));
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onChange(n);
  }

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={`${className} rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs tabular-nums outline-none focus:border-indigo-500 disabled:opacity-40`}
    />
  );
}

function AutoTag() {
  return (
    <span
      title="Valore dedotto dal nome: non è ancora nel dizionario. Diventa esplicito quando salvi."
      className="rounded bg-neutral-800 px-1 py-0.5 text-[9px] uppercase tracking-wide text-neutral-500"
    >
      auto
    </span>
  );
}

/** "Use this default when the value is missing" vs "ignore the factor for that issue". */
function MissingField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={value === null ? "ignore" : "default"}
        onChange={(e) => onChange(e.target.value === "ignore" ? null : 0.5)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-indigo-500"
      >
        <option value="default">usa un default</option>
        <option value="ignore">ignora il fattore</option>
      </select>
      {value !== null && <NumField value={value} onChange={onChange} min={0} max={1} />}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-neutral-500">{hint}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-44 shrink-0 text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

const SELECT_CLASS =
  "rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-indigo-500";

export default function PriorityConfigEditor({ project, config, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<PriorityConfig>(config);
  const [others, setOthers] = useState<{ projectId: string; config: PriorityConfig }[]>([]);
  const [copyFrom, setCopyFrom] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    listPriorityConfigs().then((all) => setOthers(all.filter((c) => c.projectId !== project.id)));
  }, [project.id]);

  const critField = project.fields.find((f) => f.name === draft.criticality.field);
  const warnings = configWarnings(draft, project);

  function patch<K extends keyof PriorityConfig>(key: K, value: Partial<PriorityConfig[K]>) {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] as object), ...value } }));
  }

  function copy() {
    const src = others.find((o) => o.projectId === copyFrom);
    if (!src) return;
    setDraft({ ...src.config, projectTitle: project.title });
    setCopied(src.config.projectTitle);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Configura priorità</h1>
          <p className="text-xs text-neutral-500">{project.title} — come trasformare i campi delle issue in un punteggio</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDraft(defaultPriorityConfig(project))}
            title="Torna alla configurazione dedotta automaticamente dai campi del progetto"
            className="text-xs text-neutral-500 hover:text-neutral-300"
          >
            Ripristina default
          </button>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500">
            Annulla
          </button>
          <button
            onClick={() => onSave(materializeConfig(draft, project))}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Salva
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-[11px] leading-relaxed text-neutral-400">
            <span className="text-neutral-200">punteggio = 100 × media pesata dei fattori × moltiplicatore stato × moltiplicatore bloccata</span>
            <br />
            Ogni fattore vale da 0 a 1. Se un'issue non ha il valore, si usa il default oppure il fattore viene ignorato (esce dalla media).
          </div>

          {others.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400">Copia da un altro progetto:</span>
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={SELECT_CLASS}>
                <option value="">— scegli —</option>
                {others.map((o) => (
                  <option key={o.projectId} value={o.projectId}>
                    {o.config.projectTitle}
                  </option>
                ))}
              </select>
              <button
                onClick={copy}
                disabled={!copyFrom}
                className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
              >
                Copia
              </button>
              {copied && <span className="text-emerald-400">Copiata da "{copied}" — controlla e salva.</span>}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-300">
              {warnings.map((w) => (
                <div key={w}>⚠ {w}</div>
              ))}
            </div>
          )}

          <Section title="Scadenza" hint="Più la data è vicina, più l'urgenza sale. Le issue scadute valgono 1.">
            <Row label="Campo data">
              <select
                value={draft.due.field ?? ""}
                onChange={(e) => patch("due", { field: e.target.value || null })}
                className={SELECT_CLASS}
              >
                <option value="">— nessuno —</option>
                {draft.due.field && !dateFields(project).some((f) => f.name === draft.due.field) && (
                  <option value={draft.due.field}>{draft.due.field} (non trovato)</option>
                )}
                {dateFields(project).map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Usa la milestone se manca">
              <input
                type="checkbox"
                checked={draft.due.useMilestone}
                onChange={(e) => patch("due", { useMilestone: e.target.checked })}
              />
              <span className="text-neutral-600">la data di scadenza della milestone dell'issue</span>
            </Row>
            <Row label="Peso">
              <NumField value={draft.due.weight} onChange={(n) => patch("due", { weight: n })} step={1} min={0} />
            </Row>
            <Row label="Orizzonte (giorni)">
              <NumField value={draft.due.horizonDays} onChange={(n) => patch("due", { horizonDays: n })} step={1} min={1} />
              <span className="text-neutral-600">oltre questi giorni l'urgenza è 0, poi sale fino a 1 alla scadenza</span>
            </Row>
            <Row label="Senza data">
              <MissingField value={draft.due.missing} onChange={(v) => patch("due", { missing: v })} />
            </Row>
          </Section>

          <Section title="Criticità" hint="Dizionario di matching: ogni opzione del campo diventa un valore da 0 (minima) a 1 (massima).">
            <Row label="Campo criticità">
              <select
                value={draft.criticality.field ?? ""}
                onChange={(e) => patch("criticality", { field: e.target.value || null, values: {} })}
                className={SELECT_CLASS}
              >
                <option value="">— nessuno —</option>
                {draft.criticality.field && !critField && (
                  <option value={draft.criticality.field}>{draft.criticality.field} (non trovato)</option>
                )}
                {selectFields(project).map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Peso">
              <NumField value={draft.criticality.weight} onChange={(n) => patch("criticality", { weight: n })} step={1} min={0} />
            </Row>
            <Row label="Senza criticità">
              <MissingField value={draft.criticality.missing} onChange={(v) => patch("criticality", { missing: v })} />
            </Row>
            {critField?.options?.length ? (
              <div className="ml-44 space-y-1.5 pl-3">
                {critField.options.map((o) => {
                  const { value, auto } = criticalityValueFor(draft, project, o.name);
                  const st = colorStyle(o.color);
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-xs">
                      <span className={`w-40 truncate rounded-full border px-2 py-0.5 ${st.bg} ${st.text} ${st.border}`}>{o.name}</span>
                      <NumField
                        value={value}
                        min={0}
                        max={1}
                        onChange={(n) => patch("criticality", { values: { ...draft.criticality.values, [o.name]: n } })}
                      />
                      {auto && <AutoTag />}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Section>

          <Section
            title="Stato"
            hint="Moltiplica il punteggio (es. 1.2 = spinge a finire il lavoro già avviato). Gli stati esclusi tolgono l'issue dalla classifica."
          >
            <div className="space-y-1.5">
              {project.statusOptions.map((s) => {
                const { value, auto } = statusSettingFor(draft, s.name);
                const excluded = value === EXCLUDE;
                const st = colorStyle(s.color);
                const setStatus = (v: number | typeof EXCLUDE) =>
                  patch("status", { values: { ...draft.status.values, [s.name]: v } });
                return (
                  <div key={s.id || s.name} className="flex items-center gap-3 text-xs">
                    <span className={`w-44 truncate rounded-full border px-2 py-0.5 ${st.bg} ${st.text} ${st.border}`}>{s.name}</span>
                    <label className="flex items-center gap-1.5 text-neutral-400">
                      <input type="checkbox" checked={excluded} onChange={(e) => setStatus(e.target.checked ? EXCLUDE : 1)} />
                      Escludi
                    </label>
                    <span className="text-neutral-600">×</span>
                    <NumField value={excluded ? 1 : (value as number)} disabled={excluded} min={0} max={3} onChange={setStatus} />
                    {auto && <AutoTag />}
                  </div>
                );
              })}
            </div>
            <Row label="Escludi issue chiuse">
              <input type="checkbox" checked={draft.excludeClosed} onChange={(e) => setDraft((d) => ({ ...d, excludeClosed: e.target.checked }))} />
              <span className="text-neutral-600">issue chiuse e PR unite, qualunque sia lo stato nel progetto</span>
            </Row>
          </Section>

          <Section title="Relazioni di blocco" hint="Conta solo le issue ancora aperte, come su GitHub.">
            <Row label="Peso «blocca altre issue»">
              <NumField value={draft.blocking.weight} onChange={(n) => patch("blocking", { weight: n })} step={1} min={0} />
            </Row>
            <Row label="Fattore pieno da">
              <NumField value={draft.blocking.saturateAt} onChange={(n) => patch("blocking", { saturateAt: n })} step={1} min={1} />
              <span className="text-neutral-600">issue bloccate (meno = proporzionale)</span>
            </Row>
            <Row label="Moltiplicatore se bloccata">
              <NumField value={draft.blockedMultiplier} onChange={(n) => setDraft((d) => ({ ...d, blockedMultiplier: n }))} min={0} max={1} />
              <span className="text-neutral-600">0.5 = dimezza il punteggio finché c'è un blocco aperto</span>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}
