import type { SavedView } from "./store";
import type { PriorityConfig } from "./priority";

/**
 * The priority scoring config of a project as a small JSON file to send to a
 * colleague — optionally with a view (query + labels + mode) to look at the
 * ranking through. Importing loads the config into the editor (saved only on
 * "Salva") and offers to create the view.
 */
export interface SharedPriorityFile {
  doitnowPriorityExport: 1;
  exportedAt: string;
  /** Title of the project it was exported from — informational only. */
  sourceProject: string;
  priorityConfig: PriorityConfig;
  view: Omit<SavedView, "id"> | null;
}

export type SharedView = Omit<SavedView, "id">;

export const PRIORITY_FILE_FILTERS = [{ name: "Priorità DoItNow", extensions: ["json"] }];

export function buildSharedPriority(priorityConfig: PriorityConfig, sourceProject: string, view: SharedView | null): SharedPriorityFile {
  return { doitnowPriorityExport: 1, exportedAt: new Date().toISOString(), sourceProject, priorityConfig, view };
}

export function suggestedFileName(projectTitle: string): string {
  const slug = projectTitle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `doitnow-priorita-${slug || "progetto"}.json`;
}

const VIEW_MODES = new Set(["table", "board", "gantt", "priority", "analytics"]);

/** Throws an Italian message if `text` isn't a priority file exported by this app. */
export function parseSharedPriority(text: string): SharedPriorityFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Il file non è un JSON valido.");
  }
  const f = parsed as Partial<SharedPriorityFile> | null;
  if (!f || typeof f !== "object" || f.doitnowPriorityExport !== 1) {
    throw new Error("Il file non è un export di priorità di DoItNow.");
  }
  const c = f.priorityConfig;
  if (!c || typeof c !== "object" || c.version !== 1 || !c.due || !c.criticality || !c.status) {
    throw new Error("La configurazione dei punteggi nel file è incompleta.");
  }
  let view: SharedView | null = null;
  const v = f.view as Partial<SavedView> | null | undefined;
  if (v && typeof v === "object" && typeof v.name === "string" && typeof v.queryText === "string") {
    view = {
      name: v.name,
      queryText: v.queryText,
      labels: Array.isArray(v.labels) ? v.labels.filter((l): l is string => typeof l === "string") : [],
      viewMode: v.viewMode && VIEW_MODES.has(v.viewMode) ? v.viewMode : "priority",
    };
  }
  return {
    doitnowPriorityExport: 1,
    exportedAt: typeof f.exportedAt === "string" ? f.exportedAt : "",
    sourceProject: typeof f.sourceProject === "string" ? f.sourceProject : "",
    priorityConfig: c,
    view,
  };
}

/** "Nome", or "Nome (2)", "Nome (3)"... if a view with that name already exists. */
export function uniqueViewName(name: string, existing: { name: string }[]): string {
  const taken = new Set(existing.map((v) => v.name));
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}
