import type { ProjectDetail } from "./github";

export const ASSIGNEE_COLUMN = "assignee";
export const CREATED_COLUMN = "created";
export const UPDATED_COLUMN = "updated";
export const CLOSED_COLUMN = "closed";

const BUILT_IN_COLUMNS = [
  { key: ASSIGNEE_COLUMN, label: "Assegnatario" },
  { key: CREATED_COLUMN, label: "Creato il" },
  { key: UPDATED_COLUMN, label: "Aggiornato il" },
  { key: CLOSED_COLUMN, label: "Chiuso il" },
];

// GitHub's own reflected/mirrored project fields (Labels, Assignees, Milestone,
// Repository, Reviewers, Title, "Created"/"Updated"/"Closed", ...) surface in
// project.fields() but their per-item values don't come through the generic
// custom-field value types we read — so they'd show as toggle-able columns
// that never populate. We handle the ones worth having (assignee, created,
// updated, closed) as reliable built-ins above and hide the rest here.
const RESERVED_FIELD_NAMES = new Set([
  "created",
  "updated",
  "closed",
  "labels",
  "label",
  "assignees",
  "assignee",
  "title",
  "milestone",
  "repository",
  "reviewers",
  "linked pull requests",
  "tracks",
  "tracked by",
]);

export interface ColumnOption {
  key: string;
  label: string;
}

function customFieldColumns(project: ProjectDetail): ColumnOption[] {
  return project.fields
    .filter((f) => ["SINGLE_SELECT", "DATE", "TEXT", "NUMBER"].includes(f.dataType))
    .filter((f) => !RESERVED_FIELD_NAMES.has(f.name.toLowerCase()))
    .map((f) => ({ key: f.name, label: f.name }));
}

export function availableColumns(project: ProjectDetail): ColumnOption[] {
  return [...BUILT_IN_COLUMNS, ...customFieldColumns(project)];
}

/** Used the first time this project has no explicit column choice saved yet. */
export function defaultColumns(project: ProjectDetail): string[] {
  const dateField = customFieldColumns(project).find((o) => project.fields.find((f) => f.name === o.key)?.dataType === "DATE");
  const priorityField =
    customFieldColumns(project).find((o) => /priorit/i.test(o.key)) ??
    customFieldColumns(project).find((o) => project.fields.find((f) => f.name === o.key)?.dataType === "SINGLE_SELECT");
  return [ASSIGNEE_COLUMN, dateField?.key, priorityField?.key].filter((x): x is string => Boolean(x));
}

export function orderColumns(project: ProjectDetail, selected: Set<string>): string[] {
  return availableColumns(project)
    .map((o) => o.key)
    .filter((key) => selected.has(key));
}
