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
  "parent issue",
  "sub-issues progress",
]);

export interface ColumnOption {
  key: string;
  label: string;
}

// The custom fields actually worth surfacing as a column or an editable row:
// GitHub's own reflected/mirrored fields (Title, Assignees, Milestone, ...)
// are excluded — they're either already handled by a dedicated built-in
// (assignee/created/updated/closed) or by their own section of the issue
// panel (title, labels, milestone), and their per-item values don't come
// through the generic custom-field value types anyway. Whatever dataType
// remains is still included — SINGLE_SELECT/DATE/TEXT/NUMBER render their
// real value, anything else still shows up (read-only, "—") rather than
// being silently invisible, until that type gets explicit support.
export function realProjectFields(project: ProjectDetail) {
  return project.fields.filter((f) => !RESERVED_FIELD_NAMES.has(f.name.toLowerCase()));
}

function customFieldColumns(project: ProjectDetail): ColumnOption[] {
  return realProjectFields(project).map((f) => ({ key: f.name, label: f.name }));
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
