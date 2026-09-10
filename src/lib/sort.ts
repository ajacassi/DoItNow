import type { ItemFieldValue, ProjectDetail, ProjectItem } from "./github";
import { ASSIGNEE_COLUMN, CREATED_COLUMN, UPDATED_COLUMN, CLOSED_COLUMN } from "./columns";

export const TITLE_COLUMN = "title";

export type SortDirection = "asc" | "desc";

export interface SortKey {
  key: string;
  direction: SortDirection;
}

type SortValue = number | string | null;

/** Single-select values rank by the field's own configured option order (e.g. Priority: Urgent > High > ...), not alphabetically. */
function fieldSortValue(project: ProjectDetail, fieldName: string, value: ItemFieldValue | undefined): SortValue {
  if (!value) return null;
  switch (value.type) {
    case "singleSelect": {
      const fieldDef = project.fields.find((f) => f.name === fieldName);
      const idx = fieldDef?.options?.findIndex((o) => o.name === value.name) ?? -1;
      return idx >= 0 ? idx : value.name;
    }
    case "date":
      return value.date;
    case "number":
      return value.number;
    case "text":
      return value.text;
  }
}

function sortValueFor(item: ProjectItem, project: ProjectDetail, key: string): SortValue {
  switch (key) {
    case TITLE_COLUMN:
      return item.title;
    case ASSIGNEE_COLUMN:
      return item.assignees[0]?.login ?? null;
    case CREATED_COLUMN:
      return item.createdAt;
    case UPDATED_COLUMN:
      return item.updatedAt;
    case CLOSED_COLUMN:
      return item.closedAt;
    default:
      return fieldSortValue(project, key, item.fields[key]);
  }
}

// Items with no value on a key always sort after items that have one, regardless of direction.
function compareValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "it");
}

export function sortItems(items: ProjectItem[], project: ProjectDetail, sortKeys: SortKey[]): ProjectItem[] {
  if (sortKeys.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const { key, direction } of sortKeys) {
      const cmp = compareValues(sortValueFor(a, project, key), sortValueFor(b, project, key));
      if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}
