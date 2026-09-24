import type { ProjectDetail, ProjectItem } from "./github";

export type ComparisonOperator = "=" | "<" | ">" | "<=" | ">=";

type QueryNode =
  | { type: "and"; children: QueryNode[] }
  | { type: "or"; children: QueryNode[] }
  | { type: "not"; child: QueryNode }
  | { type: "term"; field: string | null; operator: ComparisonOperator; value: string };

// Longest-prefix-first so "<=" is matched before "<".
const OPERATORS: ComparisonOperator[] = ["<=", ">=", "<", ">", "="];

export function unquote(token: string): string {
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  let inQuotes = false;

  function flush() {
    if (buf) {
      tokens.push(buf);
      buf = "";
    }
  }

  for (const c of input) {
    if (c === '"') {
      inQuotes = !inQuotes;
      buf += c;
      continue;
    }
    if (!inQuotes && (c === "(" || c === ")")) {
      flush();
      tokens.push(c);
      continue;
    }
    if (!inQuotes && /\s/.test(c)) {
      flush();
      continue;
    }
    buf += c;
  }
  flush();
  return tokens;
}

/** Splits a leading `<=`/`>=`/`<`/`>`/`=` off a term's value — `=` (exact match) if none is given, preserving old query behavior. */
export function splitOperator(rawValue: string): { operator: ComparisonOperator; value: string } {
  for (const op of OPERATORS) {
    if (rawValue.startsWith(op)) return { operator: op, value: rawValue.slice(op.length) };
  }
  return { operator: "=", value: rawValue };
}

function parseTermToken(tok: string): QueryNode {
  const idx = tok.indexOf(":");
  if (idx > 0) {
    // A multi-word field name (e.g. "target date") must be quoted for the
    // tokenizer to keep it as one token — strip those quotes here too, not
    // just from the value, or a quoted field name never matches anything.
    const field = unquote(tok.slice(0, idx)).toLowerCase();
    const { operator, value } = splitOperator(unquote(tok.slice(idx + 1)));
    return { type: "term", field, operator, value };
  }
  return { type: "term", field: null, operator: "=", value: unquote(tok) };
}

/** Tolerant recursive-descent parser: `and` (implicit or explicit), `or`, `-`/`not` negation, `(...)` grouping, `"quoted values"`. */
export function parseIssueQuery(input: string): QueryNode | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseOr(): QueryNode {
    const children = [parseAnd()];
    while (peek()?.toLowerCase() === "or") {
      next();
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  function parseAnd(): QueryNode {
    const children = [parseNot()];
    while (peek() && peek() !== ")" && peek()!.toLowerCase() !== "or") {
      if (peek()!.toLowerCase() === "and") next();
      children.push(parseNot());
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  function parseNot(): QueryNode {
    const tok = peek();
    if (tok === "-" || tok?.toLowerCase() === "not") {
      next();
      return { type: "not", child: parseNot() };
    }
    if (tok?.startsWith("-") && tok.length > 1) {
      next();
      return { type: "not", child: parseTermToken(tok.slice(1)) };
    }
    return parsePrimary();
  }

  function parsePrimary(): QueryNode {
    if (peek() === "(") {
      next();
      const node = parseOr();
      if (peek() === ")") next();
      return node;
    }
    const tok = next();
    if (tok == null) return { type: "and", children: [] };
    return parseTermToken(tok);
  }

  return parseOr();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolves a date term's value to a comparable ISO date: `today`, `today+N` /
 * `today-N`, the bare shorthand `+N` / `-N` (both meaning "N days from
 * today"), or a literal date string passed through as-is. `today` re-resolves
 * every time a query runs, so a saved view using it always reflects the day
 * it's opened, not the day it was saved.
 */
function resolveDateValue(raw: string): string {
  const trimmed = raw.trim();
  if (/^today$/i.test(trimmed)) return isoDate(new Date());
  const relative = /^(?:today)?([+-]\d+)$/i.exec(trimmed);
  if (relative) {
    const d = new Date();
    d.setDate(d.getDate() + parseInt(relative[1], 10));
    return isoDate(d);
  }
  return trimmed;
}

function compareDates(actual: string, operator: ComparisonOperator, rawTarget: string): boolean {
  const target = resolveDateValue(rawTarget);
  if (operator === "=") return actual === target;
  const a = new Date(actual).getTime();
  const b = new Date(target).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (operator) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
  }
}

function compareNumbers(actual: number, operator: ComparisonOperator, rawTarget: string): boolean {
  const target = Number(rawTarget);
  if (Number.isNaN(target)) return false;
  switch (operator) {
    case "=":
      return actual === target;
    case "<":
      return actual < target;
    case "<=":
      return actual <= target;
    case ">":
      return actual > target;
    case ">=":
      return actual >= target;
  }
}

function evaluateTerm(field: string | null, operator: ComparisonOperator, rawValue: string, item: ProjectItem, project: ProjectDetail): boolean {
  const value = rawValue.toLowerCase();

  if (!field) {
    return item.title.toLowerCase().includes(value);
  }

  switch (field) {
    case "label":
      return item.labels.some((l) => l.name.toLowerCase() === value);
    case "assignee":
      if (value === "" || value === "none") return item.assignees.length === 0;
      return item.assignees.some((a) => a.login.toLowerCase() === value);
    case "author":
      return (item.author?.login ?? "").toLowerCase() === value;
    case "status":
      return item.status.toLowerCase() === value;
    case "state":
    case "is":
      if (value === "open") return item.state?.toUpperCase() === "OPEN";
      if (value === "closed") return item.state?.toUpperCase() === "CLOSED";
      return (item.state ?? "").toLowerCase() === value;
    case "repo":
    case "repository":
      return (item.repository ?? "").toLowerCase() === value;
    case "title":
      return item.title.toLowerCase().includes(value);
    case "number":
      return item.number != null && String(item.number) === rawValue;
    default: {
      const fieldDef = project.fields.find((f) => f.name.toLowerCase() === field);
      if (!fieldDef) return false;
      const fv = item.fields[fieldDef.name];
      if (!fv) return value === "" || value === "none";
      switch (fv.type) {
        case "singleSelect":
          return fv.name.toLowerCase() === value;
        case "multiSelect":
          return fv.options.some((o) => o.name.toLowerCase() === value);
        case "text":
          return fv.text.toLowerCase().includes(value);
        case "number":
          return compareNumbers(fv.number, operator, rawValue);
        case "date":
          return compareDates(fv.date, operator, rawValue);
      }
    }
  }
}

function evaluateNode(node: QueryNode, item: ProjectItem, project: ProjectDetail): boolean {
  switch (node.type) {
    case "and":
      return node.children.every((c) => evaluateNode(c, item, project));
    case "or":
      return node.children.some((c) => evaluateNode(c, item, project));
    case "not":
      return !evaluateNode(node.child, item, project);
    case "term":
      return evaluateTerm(node.field, node.operator, node.value, item, project);
  }
}

export function matchesIssueQuery(node: QueryNode | null, item: ProjectItem, project: ProjectDetail): boolean {
  if (!node) return true;
  return evaluateNode(node, item, project);
}
