import type { ProjectDetail, ProjectItem, StatusOption } from "./github";
import { activeBlockers, activeBlocking, isInLinkedRepo } from "./github";
import { realProjectFields } from "./columns";

/**
 * Priority score — a configurable, explainable ranking of the issues in the
 * current view (query + labels), in the spirit of Taskwarrior's "urgency":
 *
 *   base  = Σ weightᵢ·factorᵢ / Σ weightᵢ   (factors in 0..1; an "ignored"
 *                                             missing factor drops out of both sums)
 *   score = 100 · base · statusMultiplier · blockedMultiplier
 *
 * Every project has different fields/options, so the mapping from its values
 * to numbers ("matching dictionary") is stored per project; anything not
 * mapped explicitly falls back to a name-based guess, shown as "auto".
 */

export const EXCLUDE = "exclude" as const;
/** A status either multiplies the score or removes the issue from the ranking. */
export type StatusSetting = number | typeof EXCLUDE;

export interface PriorityConfig {
  version: 1;
  /** For display only (e.g. in the "copy from another project" list). */
  projectTitle: string;
  updatedAt: string;
  /** Closed issues / merged-or-closed PRs never show up in the ranking. */
  excludeClosed: boolean;
  due: {
    /** Name of a DATE field, or null to rely on the milestone only. */
    field: string | null;
    /** Use the milestone due date when the field has no value. */
    useMilestone: boolean;
    weight: number;
    /** Days ahead at which the urgency starts rising from 0 (overdue = 1). */
    horizonDays: number;
    /** Factor (0..1) when there's no date at all, or null to ignore the factor. */
    missing: number | null;
  };
  criticality: {
    /** Name of a SINGLE_SELECT field. */
    field: string | null;
    weight: number;
    /** Option name → 0..1. Options not listed fall back to guessCriticality. */
    values: Record<string, number>;
    missing: number | null;
  };
  blocking: {
    weight: number;
    /** Number of open issues blocked by this one at which the factor reaches 1. */
    saturateAt: number;
  };
  /** Multiplier for an issue held up by at least one open blocker. */
  blockedMultiplier: number;
  status: {
    /** Status name → multiplier or EXCLUDE. Statuses not listed fall back to guessStatus. */
    values: Record<string, StatusSetting>;
  };
}

// ---------------------------------------------------------------------------
// Field discovery + name-based guesses
// ---------------------------------------------------------------------------

export function dateFields(project: ProjectDetail) {
  return realProjectFields(project).filter((f) => f.dataType === "DATE");
}

export function selectFields(project: ProjectDetail) {
  return realProjectFields(project).filter((f) => f.dataType === "SINGLE_SELECT");
}

function fieldOptions(project: ProjectDetail, fieldName: string | null): StatusOption[] {
  if (!fieldName) return [];
  return project.fields.find((f) => f.name === fieldName)?.options ?? [];
}

/** Name-based guess for a criticality option; falls back to its position (first = most critical). */
export function guessCriticality(name: string, options: StatusOption[]): number {
  const n = name.toLowerCase();
  if (/\b(p0|critical|critica|critico|blocker|urgent|urgente|highest|massima)\b/.test(n)) return 1;
  if (/\b(p1|high|alta|alto|major)\b/.test(n)) return 0.75;
  if (/\b(p2|medium|med|media|medio|normal|normale)\b/.test(n)) return 0.5;
  if (/\b(p3|low|bassa|basso)\b/.test(n)) return 0.25;
  if (/\b(p4|lowest|minima|trivial|minor)\b/.test(n)) return 0.1;
  const idx = options.findIndex((o) => o.name === name);
  if (idx === -1 || options.length < 2) return 0.5;
  return Math.round((1 - (idx / (options.length - 1)) * 0.9) * 100) / 100;
}

/** Name-based guess for a status: finished/parked work is excluded, work closer to done weighs more. */
export function guessStatus(name: string): StatusSetting {
  const n = name.toLowerCase();
  if (/(done|deployed|closed|complet|released|shipped|cancel|won'?t|wontfix|paused|on hold|archiv|rejected|chius|fatto|annullat|sospes)/.test(n))
    return EXCLUDE;
  if (/ready|pronto/.test(n)) return 1.2;
  if (/(review|test|qa|verific)/.test(n)) return 1.15;
  if (/(progress|develop|doing|implement|sviluppo|in corso|wip)/.test(n)) return 1.1;
  if (/(backlog|todo|to do|icebox|triage|new|nuov|idea)/.test(n)) return 0.8;
  return 1;
}

export function statusSettingFor(config: PriorityConfig, status: string): { value: StatusSetting; auto: boolean } {
  const v = config.status.values[status];
  return v !== undefined ? { value: v, auto: false } : { value: guessStatus(status), auto: true };
}

export function criticalityValueFor(config: PriorityConfig, project: ProjectDetail, option: string): { value: number; auto: boolean } {
  const v = config.criticality.values[option];
  return v !== undefined
    ? { value: v, auto: false }
    : { value: guessCriticality(option, fieldOptions(project, config.criticality.field)), auto: true };
}

export function defaultPriorityConfig(project: ProjectDetail): PriorityConfig {
  const dates = dateFields(project);
  const dueField =
    dates.find((f) => /(due|scadenz|deadline|target|end|fine|consegna)/i.test(f.name)) ??
    dates.find((f) => !/(start|inizio)/i.test(f.name)) ??
    null;
  const critField = selectFields(project).find((f) => /(priorit|critic|severit|urgen|importan)/i.test(f.name)) ?? null;
  return {
    version: 1,
    projectTitle: project.title,
    updatedAt: new Date().toISOString(),
    excludeClosed: true,
    due: { field: dueField?.name ?? null, useMilestone: true, weight: 10, horizonDays: 30, missing: 0.2 },
    criticality: { field: critField?.name ?? null, weight: 8, values: {}, missing: 0.5 },
    blocking: { weight: 3, saturateAt: 2 },
    blockedMultiplier: 0.5,
    status: { values: {} },
  };
}

/**
 * Turns every auto-guessed value for the project's current options into an
 * explicit one, so the saved dictionary is complete and stable (and copies
 * to another project carry real values, not guesses).
 */
export function materializeConfig(config: PriorityConfig, project: ProjectDetail): PriorityConfig {
  const status = { ...config.status.values };
  for (const s of project.statusOptions) status[s.name] = statusSettingFor(config, s.name).value;
  const crit = { ...config.criticality.values };
  for (const o of fieldOptions(project, config.criticality.field)) crit[o.name] = criticalityValueFor(config, project, o.name).value;
  return {
    ...config,
    projectTitle: project.title,
    updatedAt: new Date().toISOString(),
    status: { values: status },
    criticality: { ...config.criticality, values: crit },
  };
}

/** Things in a (possibly copied) config that don't match this project. */
export function configWarnings(config: PriorityConfig, project: ProjectDetail): string[] {
  const out: string[] = [];
  if (config.due.field && !project.fields.some((f) => f.name === config.due.field))
    out.push(`Il campo data "${config.due.field}" non esiste in questo progetto.`);
  if (config.criticality.field && !project.fields.some((f) => f.name === config.criticality.field))
    out.push(`Il campo criticità "${config.criticality.field}" non esiste in questo progetto.`);
  return out;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  key: "due" | "criticality" | "blocking";
  label: string;
  /** 0..1, or null when the value is missing and the factor is set to be ignored. */
  value: number | null;
  weight: number;
  /** Human-readable source of the value. */
  detail: string;
  /** True when the issue had no value and the default was used. */
  defaulted: boolean;
}

export interface ScoredItem {
  item: ProjectItem;
  score: number;
  base: number;
  statusMultiplier: number;
  blockedMultiplier: number;
  factors: ScoreFactor[];
  dueDate: string | null;
  dueSource: "field" | "milestone" | null;
  daysLeft: number | null;
  criticality: string | null;
}

export interface ExcludedItem {
  item: ProjectItem;
  reason: string;
}

export interface PriorityResult {
  ranked: ScoredItem[];
  excluded: ExcludedItem[];
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "YYYY-MM-DD" (or an ISO timestamp, whose date part is used) → local midnight. */
function parseDay(s: string): number {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function formatDaysLeft(days: number): string {
  if (days < 0) return `scaduta da ${-days} gg`;
  if (days === 0) return "scade oggi";
  if (days === 1) return "domani";
  return `tra ${days} gg`;
}

function dueFactor(item: ProjectItem, config: PriorityConfig, today: number) {
  let date: string | null = null;
  let source: "field" | "milestone" | null = null;
  const v = config.due.field ? item.fields[config.due.field] : undefined;
  if (v?.type === "date" && v.date) {
    date = v.date;
    source = "field";
  } else if (config.due.useMilestone && item.milestone?.dueOn) {
    date = item.milestone.dueOn;
    source = "milestone";
  }
  if (!date) {
    const factor: ScoreFactor = {
      key: "due",
      label: "Scadenza",
      value: config.due.missing,
      weight: config.due.weight,
      detail: config.due.missing === null ? "nessuna data — ignorata" : "nessuna data — default",
      defaulted: true,
    };
    return { factor, date: null, source: null, daysLeft: null };
  }
  const daysLeft = Math.round((parseDay(date) - today) / DAY_MS);
  const horizon = Math.max(1, config.due.horizonDays);
  const value = daysLeft <= 0 ? 1 : Math.max(0, 1 - daysLeft / horizon);
  const where = source === "milestone" ? `milestone "${item.milestone!.title}"` : config.due.field!;
  const factor: ScoreFactor = {
    key: "due",
    label: "Scadenza",
    value,
    weight: config.due.weight,
    detail: `${formatDaysLeft(daysLeft)} (${where})`,
    defaulted: false,
  };
  return { factor, date, source, daysLeft };
}

function criticalityFactor(item: ProjectItem, project: ProjectDetail, config: PriorityConfig) {
  const v = config.criticality.field ? item.fields[config.criticality.field] : undefined;
  if (v?.type !== "singleSelect") {
    const factor: ScoreFactor = {
      key: "criticality",
      label: "Criticità",
      value: config.criticality.missing,
      weight: config.criticality.weight,
      detail: config.criticality.missing === null ? "non impostata — ignorata" : "non impostata — default",
      defaulted: true,
    };
    return { factor, name: null };
  }
  const { value } = criticalityValueFor(config, project, v.name);
  const factor: ScoreFactor = {
    key: "criticality",
    label: "Criticità",
    value,
    weight: config.criticality.weight,
    detail: v.name,
    defaulted: false,
  };
  return { factor, name: v.name };
}

export function scoreItems(items: ProjectItem[], project: ProjectDetail, config: PriorityConfig, now = new Date()): PriorityResult {
  const today = startOfDay(now);
  const ranked: ScoredItem[] = [];
  const excluded: ExcludedItem[] = [];

  for (const item of items) {
    if (!isInLinkedRepo(item, project)) continue;
    if (config.excludeClosed && item.state && item.state !== "OPEN") {
      excluded.push({ item, reason: item.state === "MERGED" ? "PR unita" : "chiusa" });
      continue;
    }
    const status = statusSettingFor(config, item.status).value;
    if (status === EXCLUDE) {
      excluded.push({ item, reason: `stato "${item.status}"` });
      continue;
    }

    const due = dueFactor(item, config, today);
    const crit = criticalityFactor(item, project, config);
    const blockingCount = activeBlocking(item).length;
    const blockingFactor: ScoreFactor = {
      key: "blocking",
      label: "Blocca altre issue",
      value: Math.min(1, blockingCount / Math.max(1, config.blocking.saturateAt)),
      weight: config.blocking.weight,
      detail: blockingCount === 0 ? "nessuna" : `${blockingCount} issue aperte`,
      defaulted: false,
    };
    const factors = [due.factor, crit.factor, blockingFactor];

    let num = 0;
    let den = 0;
    for (const f of factors) {
      if (f.value === null || f.weight <= 0) continue;
      num += f.weight * f.value;
      den += f.weight;
    }
    const base = den > 0 ? num / den : 0;
    const blockedMultiplier = activeBlockers(item).length > 0 ? config.blockedMultiplier : 1;
    const score = 100 * base * status * blockedMultiplier;

    ranked.push({
      item,
      score,
      base,
      statusMultiplier: status,
      blockedMultiplier,
      factors,
      dueDate: due.date,
      dueSource: due.source,
      daysLeft: due.daysLeft,
      criticality: crit.name,
    });
  }

  // Ties: sooner due date first, then issue number.
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
      (a.item.number ?? Infinity) - (b.item.number ?? Infinity),
  );
  return { ranked, excluded };
}
