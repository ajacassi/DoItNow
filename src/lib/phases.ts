import type { ProjectDetail, ProjectItem } from "./github";

/**
 * Every project has its own statuses, so the analytics view groups them into
 * a few work phases. The mapping is per project: guessed from the status
 * names, adjustable by the user (stored in lib/store).
 */
export type Phase = "todo" | "doing" | "closing" | "out";

/** The phases that count as open work, in workflow order. */
export const ACTIVE_PHASES: Exclude<Phase, "out">[] = ["todo", "doing", "closing"];

export const PHASE_LABEL: Record<Phase, string> = {
  todo: "Da fare",
  doing: "In lavorazione",
  closing: "In chiusura",
  out: "Esclusa (conclusa o in pausa)",
};

export const PHASE_HINT: Record<Phase, string> = {
  todo: "backlog, requisiti, da iniziare",
  doing: "progettazione, sviluppo",
  closing: "test, review, pronta al rilascio",
  out: "rilasciata, chiusa, in pausa: non conta nel carico",
};

export function guessPhase(status: string): Phase {
  const n = status.toLowerCase();
  if (/(done|deployed|closed|complet|released|shipped|cancel|won'?t|wontfix|paused|on hold|archiv|rejected|chius|fatto|annullat|sospes)/.test(n))
    return "out";
  if (/(ready|pronto|review|test|qa|verific|staging)/.test(n)) return "closing";
  if (/(progress|develop|doing|implement|sviluppo|in corso|wip|design|progett|build)/.test(n)) return "doing";
  return "todo";
}

export function phaseFor(status: string, map: Record<string, Phase>): { phase: Phase; auto: boolean } {
  const p = map[status];
  return p ? { phase: p, auto: false } : { phase: guessPhase(status), auto: true };
}

/** An issue's phase: closed issues / merged PRs are always out, whatever their project status. */
export function itemPhase(item: ProjectItem, map: Record<string, Phase>): Phase {
  if (item.state && item.state !== "OPEN") return "out";
  return phaseFor(item.status, map).phase;
}

/** The full mapping for the project's current statuses (guesses made explicit). */
export function materializePhases(project: ProjectDetail, map: Record<string, Phase>): Record<string, Phase> {
  const out: Record<string, Phase> = { ...map };
  for (const s of project.statusOptions) out[s.name] = phaseFor(s.name, map).phase;
  return out;
}
