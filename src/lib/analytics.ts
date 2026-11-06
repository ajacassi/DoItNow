import type { ProjectDetail, ProjectItem, ProjectItemUser } from "./github";
import { activeBlockers, activeBlocking, isInLinkedRepo } from "./github";
import { daysFromToday, itemEffort, resolveDueDate, scoreItems, type PriorityConfig } from "./priority";
import { ACTIVE_PHASES, itemPhase, type Phase } from "./phases";

/**
 * Workload analytics over the issues of the current view. Pure functions of
 * the already-loaded project data (no extra API calls).
 *
 * "Open work" = open issues whose status maps to an active phase (see
 * lib/phases). An issue with several assignees counts for each of them, like
 * the assignee grouping elsewhere in the app.
 */

export const UNASSIGNED = "__unassigned__";
export const URGENT_SCORE = 70;
const DAY_MS = 86_400_000;

export type LoadMeasure = "count" | "effort" | "score";

export interface PersonScoreDot {
  item: ProjectItem;
  score: number;
}

export interface PersonStats {
  key: string;
  login: string | null;
  avatarUrl: string | null;
  /** Open work items per active phase. */
  byPhase: Record<Exclude<Phase, "out">, ProjectItem[]>;
  open: number;
  effortSum: number;
  /** Open items with an effort value (to tell "0 effort" from "no data"). */
  effortKnown: number;
  scoreSum: number;
  scores: PersonScoreDot[];
  urgent: number;
  overdue: number;
  due7: number;
  due30: number;
  blocked: number;
  noDue: number;
  noCriticality: number;
  noEffort: number;
  closedLast28: number;
  /** Median days from creation to closing, over issues closed in the last 90 days. */
  leadTimeMedian: number | null;
  leadTimeCount: number;
}

export interface WeekBucket {
  /** Local midnight of the week's Monday. */
  start: number;
  created: number;
  closed: number;
}

export interface DueWeekBucket {
  start: number;
  count: number;
  items: ProjectItem[];
}

export interface StatusAge {
  status: string;
  phase: Phase;
  items: { item: ProjectItem; ageDays: number }[];
  medianAge: number | null;
}

export interface Bottleneck {
  item: ProjectItem;
  blocking: number;
}

export interface Analytics {
  kpi: {
    open: number;
    unassigned: number;
    overdue: number;
    blocked: number;
    closedLast30: number;
    medianAgeOpen: number | null;
  };
  people: PersonStats[];
  weeks: WeekBucket[];
  overdueItems: ProjectItem[];
  dueWeeks: DueWeekBucket[];
  statusAges: StatusAge[];
  bottlenecks: Bottleneck[];
  /** Whether an effort field is configured (else the effort measure is unavailable). */
  hasEffort: boolean;
  hasCriticality: boolean;
  /** Priority score per item id (items excluded from the ranking are absent). */
  scoreById: Map<string, number>;
  /** Effort per item id for open work (null = no value). */
  effortById: Map<string, number | null>;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight of the Monday of `t`'s week. */
export function weekStart(t: number): number {
  const d = new Date(startOfDay(t));
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function ageDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(iso).getTime())) / DAY_MS));
}

function personKeys(item: ProjectItem): { key: string; user: ProjectItemUser | null }[] {
  if (item.assignees.length === 0) return [{ key: UNASSIGNED, user: null }];
  return item.assignees.map((a) => ({ key: a.login, user: a }));
}

/** Whether `item` belongs to `person` (a login, or UNASSIGNED). */
export function itemHasPerson(item: ProjectItem, person: string): boolean {
  return person === UNASSIGNED ? item.assignees.length === 0 : item.assignees.some((a) => a.login === person);
}

export function computeAnalytics(
  allItems: ProjectItem[],
  project: ProjectDetail,
  config: PriorityConfig,
  phases: Record<string, Phase>,
  now = new Date(),
): Analytics {
  const nowT = now.getTime();
  const items = allItems.filter((i) => isInLinkedRepo(i, project));
  const scored = new Map(scoreItems(items, project, config, now).ranked.map((s) => [s.item.id, s.score]));
  const openWork = items.filter((i) => itemPhase(i, phases) !== "out");
  const effortById = new Map(openWork.map((i) => [i.id, itemEffort(i, project, config)]));

  const people = new Map<string, PersonStats>();
  function person(key: string, user: ProjectItemUser | null): PersonStats {
    let p = people.get(key);
    if (!p) {
      p = {
        key,
        login: user?.login ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        byPhase: { todo: [], doing: [], closing: [] },
        open: 0,
        effortSum: 0,
        effortKnown: 0,
        scoreSum: 0,
        scores: [],
        urgent: 0,
        overdue: 0,
        due7: 0,
        due30: 0,
        blocked: 0,
        noDue: 0,
        noCriticality: 0,
        noEffort: 0,
        closedLast28: 0,
        leadTimeMedian: null,
        leadTimeCount: 0,
      };
      people.set(key, p);
    }
    return p;
  }

  let overdueTotal = 0;
  let blockedTotal = 0;
  const overdueItems: ProjectItem[] = [];
  const thisWeek = weekStart(nowT);
  const dueWeeks: DueWeekBucket[] = Array.from({ length: 8 }, (_, i) => ({ start: addDays(thisWeek, 7 * i), count: 0, items: [] }));
  const dueHorizonEnd = addDays(thisWeek, 7 * 8);

  for (const item of openWork) {
    const phase = itemPhase(item, phases) as Exclude<Phase, "out">;
    const due = resolveDueDate(item, config);
    const days = due ? daysFromToday(due.date, now) : null;
    const effort = effortById.get(item.id) ?? null;
    const score = scored.get(item.id);
    const isBlocked = activeBlockers(item).length > 0;
    const crit = config.criticality.field ? item.fields[config.criticality.field] : undefined;

    if (days !== null && days < 0) {
      overdueTotal++;
      overdueItems.push(item);
    }
    if (isBlocked) blockedTotal++;
    if (due && days !== null && days >= 0) {
      const t = startOfDay(nowT) + days * DAY_MS;
      if (t < dueHorizonEnd) {
        const idx = Math.floor((weekStart(t) - thisWeek) / (7 * DAY_MS) + 0.01);
        const bucket = dueWeeks[Math.max(0, Math.min(7, idx))];
        bucket.count++;
        bucket.items.push(item);
      }
    }

    for (const { key, user } of personKeys(item)) {
      const p = person(key, user);
      p.byPhase[phase].push(item);
      p.open++;
      if (effort !== null) {
        p.effortSum += effort;
        p.effortKnown++;
      } else p.noEffort++;
      if (score !== undefined) {
        p.scoreSum += score;
        p.scores.push({ item, score });
        if (score >= URGENT_SCORE) p.urgent++;
      }
      if (days === null) p.noDue++;
      else if (days < 0) p.overdue++;
      else if (days <= 7) p.due7++;
      else if (days <= 30) p.due30++;
      if (isBlocked) p.blocked++;
      if (crit?.type !== "singleSelect") p.noCriticality++;
    }
  }

  // Closed work: throughput and lead time per person (any phase — it's closed).
  const leadTimes = new Map<string, number[]>();
  for (const item of items) {
    if (!item.closedAt || item.state === "OPEN") continue;
    const closedT = new Date(item.closedAt).getTime();
    const daysAgo = (nowT - closedT) / DAY_MS;
    for (const { key, user } of personKeys(item)) {
      if (daysAgo <= 28) person(key, user).closedLast28++;
      if (daysAgo <= 90 && item.createdAt) {
        const lt = (closedT - new Date(item.createdAt).getTime()) / DAY_MS;
        if (!leadTimes.has(key)) leadTimes.set(key, []);
        leadTimes.get(key)!.push(Math.max(0, lt));
      }
    }
  }
  for (const [key, values] of leadTimes) {
    const p = people.get(key)!;
    p.leadTimeMedian = median(values);
    p.leadTimeCount = values.length;
  }

  // Created vs closed per week, last 12 weeks (current week included).
  const firstWeek = addDays(thisWeek, -7 * 11);
  const weeks: WeekBucket[] = Array.from({ length: 12 }, (_, i) => ({ start: addDays(firstWeek, 7 * i), created: 0, closed: 0 }));
  const weekIndex = (t: number) => Math.round((weekStart(t) - firstWeek) / (7 * DAY_MS));
  for (const item of items) {
    if (item.createdAt) {
      const i = weekIndex(new Date(item.createdAt).getTime());
      if (i >= 0 && i < 12) weeks[i].created++;
    }
    if (item.closedAt && item.state !== "OPEN") {
      const i = weekIndex(new Date(item.closedAt).getTime());
      if (i >= 0 && i < 12) weeks[i].closed++;
    }
  }

  // Age of open work, per status, in the project's status order.
  const byStatus = new Map<string, { item: ProjectItem; ageDays: number }[]>();
  for (const item of openWork) {
    const age = ageDays(item.createdAt, nowT);
    if (age === null) continue;
    if (!byStatus.has(item.status)) byStatus.set(item.status, []);
    byStatus.get(item.status)!.push({ item, ageDays: age });
  }
  const statusOrder = project.statusOptions.map((s) => s.name);
  const statusAges: StatusAge[] = [...byStatus.entries()]
    .sort(([a], [b]) => {
      const ia = statusOrder.indexOf(a);
      const ib = statusOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map(([status, list]) => ({
      status,
      phase: itemPhase(list[0].item, phases),
      items: list.sort((a, b) => b.ageDays - a.ageDays),
      medianAge: median(list.map((l) => l.ageDays)),
    }));

  const bottlenecks: Bottleneck[] = openWork
    .map((item) => ({ item, blocking: activeBlocking(item).length }))
    .filter((b) => b.blocking > 0)
    .sort((a, b) => b.blocking - a.blocking)
    .slice(0, 10);

  const closedLast30 = items.filter(
    (i) => i.closedAt && i.state !== "OPEN" && nowT - new Date(i.closedAt).getTime() <= 30 * DAY_MS,
  ).length;

  // Heaviest first; "unassigned" always last. People with only closed work trail behind.
  const peopleList = [...people.values()].sort((a, b) => {
    if (a.key === UNASSIGNED) return 1;
    if (b.key === UNASSIGNED) return -1;
    return b.open - a.open || b.closedLast28 - a.closedLast28 || (a.login ?? "").localeCompare(b.login ?? "");
  });

  return {
    kpi: {
      open: openWork.length,
      unassigned: openWork.filter((i) => i.assignees.length === 0).length,
      overdue: overdueTotal,
      blocked: blockedTotal,
      closedLast30,
      medianAgeOpen: median(openWork.map((i) => ageDays(i.createdAt, nowT)).filter((a): a is number => a !== null)),
    },
    people: peopleList,
    weeks,
    overdueItems,
    dueWeeks,
    statusAges,
    bottlenecks,
    hasEffort: !!config.effort.field,
    hasCriticality: !!config.criticality.field,
    scoreById: scored,
    effortById,
  };
}

/** Value of the load chart for one person and phase, per the chosen measure. */
export function loadValue(items: ProjectItem[], measure: LoadMeasure, a: Analytics): number {
  if (measure === "count") return items.length;
  let sum = 0;
  for (const i of items) sum += (measure === "effort" ? a.effortById.get(i.id) : a.scoreById.get(i.id)) ?? 0;
  return sum;
}

export { ACTIVE_PHASES };
