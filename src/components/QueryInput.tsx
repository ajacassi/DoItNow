import { useEffect, useRef, useState } from "react";
import { fetchRepoMetadata, mostCommonRepo, type ProjectDetail } from "../lib/github";
import { splitOperator, unquote } from "../lib/query";

interface Props {
  token: string;
  value: string;
  onChange: (value: string) => void;
  project: ProjectDetail;
  className: string;
  placeholder?: string;
}

const FIELD_KEYS = ["label", "assignee", "author", "status", "state", "is", "repo", "title", "number"];

function fieldSuggestions(project: ProjectDetail): string[] {
  const custom = project.fields.map((f) => f.name.toLowerCase());
  return Array.from(new Set([...FIELD_KEYS, ...custom]));
}

/** Values suggested for a given field key, or null when the field takes free text (no suggestions to offer). */
function valueSuggestions(field: string, project: ProjectDetail, assignableLogins: string[]): string[] | null {
  switch (field) {
    case "label": {
      const set = new Set<string>();
      for (const item of project.items) for (const l of item.labels) set.add(l.name);
      return Array.from(set).sort();
    }
    case "assignee":
    case "author":
      // Every assignable person on the project's repo — not just whoever
      // already happens to have something assigned/opened an issue in this project.
      return assignableLogins;
    case "status":
      return project.statusOptions.map((o) => o.name);
    case "state":
    case "is":
      return ["open", "closed"];
    case "repo":
    case "repository": {
      const set = new Set<string>();
      for (const item of project.items) if (item.repository) set.add(item.repository);
      return Array.from(set).sort();
    }
    case "title":
    case "number":
      return null;
    default: {
      const fieldDef = project.fields.find((f) => f.name.toLowerCase() === field);
      if (!fieldDef) return null;
      if (fieldDef.dataType === "DATE") return ["today", "today+7", "today+30", "today-7"];
      const issueField = project.issueFieldsByName[fieldDef.name];
      const options = issueField?.options ?? fieldDef.options;
      return options ? options.map((o) => o.name) : null;
    }
  }
}

function getCurrentToken(value: string, cursor: number): { start: number; end: number; text: string } {
  let start = cursor;
  while (start > 0 && !/[\s()]/.test(value[start - 1])) start--;
  let end = cursor;
  while (end < value.length && !/[\s()]/.test(value[end])) end++;
  return { start, end, text: value.slice(start, end) };
}

export default function QueryInput({ token, value, onChange, project, className, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState<"field" | "value">("field");
  const [tokenRange, setTokenRange] = useState<{ start: number; end: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const dominantRepo = mostCommonRepo(project);
  const [assignableLogins, setAssignableLogins] = useState<string[]>([]);

  useEffect(() => {
    if (!dominantRepo) {
      setAssignableLogins([]);
      return;
    }
    let cancelled = false;
    fetchRepoMetadata(token, dominantRepo.owner, dominantRepo.name)
      .then((m) => {
        if (!cancelled) setAssignableLogins(m.assignableUsers.map((u) => u.login).sort());
      })
      .catch(() => {
        if (!cancelled) setAssignableLogins([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, dominantRepo?.owner, dominantRepo?.name]);

  function recompute(text: string, cursor: number) {
    const token = getCurrentToken(text, cursor);
    const negPrefix = token.text.startsWith("-") ? "-" : "";
    const core = token.text.slice(negPrefix.length);
    const colonIdx = core.indexOf(":");

    if (colonIdx === -1) {
      const prefix = core.toLowerCase();
      const list = prefix ? fieldSuggestions(project).filter((k) => k.startsWith(prefix)) : fieldSuggestions(project);
      setMode("field");
      setCandidates(list.slice(0, 8));
      setTokenRange({ start: token.start, end: token.end });
      setActiveIndex(0);
      return;
    }

    // A multi-word field name (e.g. "target date") must be quoted for it to
    // stay one token — strip those quotes before looking the field up.
    const field = unquote(core.slice(0, colonIdx)).toLowerCase();
    const rawValuePrefix = core.slice(colonIdx + 1).replace(/^"/, "");
    const options = valueSuggestions(field, project, assignableLogins);
    if (!options) {
      setCandidates([]);
      return;
    }
    // A leading comparison operator (e.g. "due:>tod") is part of the value,
    // not the text being matched against suggestions like "today".
    const prefix = splitOperator(rawValuePrefix).value.toLowerCase();
    const list = prefix ? options.filter((o) => o.toLowerCase().includes(prefix)) : options;
    setMode("value");
    setCandidates(list.slice(0, 8));
    setTokenRange({ start: token.start, end: token.end });
    setActiveIndex(0);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function pick(candidate: string) {
    if (!tokenRange) return;
    const token = value.slice(tokenRange.start, tokenRange.end);
    const negPrefix = token.startsWith("-") ? "-" : "";
    const core = token.slice(negPrefix.length);
    const colonIdx = core.indexOf(":");

    let replacement: string;
    let cursorAfter: number;
    if (colonIdx === -1) {
      // A field name with a space (e.g. "target date") needs quoting to stay one token.
      const quotedField = /\s/.test(candidate) ? `"${candidate}"` : candidate;
      replacement = `${negPrefix}${quotedField}:`;
      cursorAfter = tokenRange.start + replacement.length;
    } else {
      const field = unquote(core.slice(0, colonIdx));
      const quotedField = /\s/.test(field) ? `"${field}"` : field;
      // Keep whatever comparison operator was already typed (e.g. "due:>" + picking
      // "today" should produce "due:>today", not discard the ">").
      const { operator } = splitOperator(core.slice(colonIdx + 1).replace(/^"/, ""));
      const opPrefix = operator === "=" ? "" : operator;
      const quoted = /\s/.test(candidate) ? `"${candidate}"` : candidate;
      replacement = `${negPrefix}${quotedField}:${opPrefix}${quoted} `;
      cursorAfter = tokenRange.start + replacement.length;
    }

    const nextValue = value.slice(0, tokenRange.start) + replacement + value.slice(tokenRange.end);
    onChange(nextValue);
    setCandidates([]);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(cursorAfter, cursorAfter);
      recompute(nextValue, cursorAfter);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(candidates[activeIndex]);
    } else if (e.key === "Escape") {
      setCandidates([]);
    }
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => recompute(value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setCandidates([]), 150)}
        placeholder={placeholder}
        className={className}
      />
      {candidates.length > 0 && (
        <div className="absolute z-20 mt-1 w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="border-b border-neutral-800 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-600">
            {mode === "field" ? "Campo" : "Valore"}
          </div>
          {candidates.map((c, i) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm text-neutral-100 hover:bg-neutral-800 ${
                i === activeIndex ? "bg-neutral-800" : ""
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
