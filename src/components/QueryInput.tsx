import { useRef, useState } from "react";
import type { ProjectDetail } from "../lib/github";

interface Props {
  value: string;
  onChange: (value: string) => void;
  project: ProjectDetail;
  className: string;
  placeholder?: string;
}

const FIELD_KEYS = ["label", "assignee", "status", "state", "is", "repo", "title", "number"];

function fieldSuggestions(project: ProjectDetail): string[] {
  const custom = project.fields.map((f) => f.name.toLowerCase());
  return Array.from(new Set([...FIELD_KEYS, ...custom]));
}

/** Values suggested for a given field key, or null when the field takes free text (no suggestions to offer). */
function valueSuggestions(field: string, project: ProjectDetail): string[] | null {
  switch (field) {
    case "label": {
      const set = new Set<string>();
      for (const item of project.items) for (const l of item.labels) set.add(l.name);
      return Array.from(set).sort();
    }
    case "assignee": {
      const set = new Set<string>();
      for (const item of project.items) for (const a of item.assignees) set.add(a.login);
      return Array.from(set).sort();
    }
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

export default function QueryInput({ value, onChange, project, className, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [mode, setMode] = useState<"field" | "value">("field");
  const [tokenRange, setTokenRange] = useState<{ start: number; end: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

    const field = core.slice(0, colonIdx).toLowerCase();
    const rawValuePrefix = core.slice(colonIdx + 1).replace(/^"/, "");
    const options = valueSuggestions(field, project);
    if (!options) {
      setCandidates([]);
      return;
    }
    const prefix = rawValuePrefix.toLowerCase();
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
      replacement = `${negPrefix}${candidate}:`;
      cursorAfter = tokenRange.start + replacement.length;
    } else {
      const field = core.slice(0, colonIdx);
      const quoted = /\s/.test(candidate) ? `"${candidate}"` : candidate;
      replacement = `${negPrefix}${field}:${quoted} `;
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
