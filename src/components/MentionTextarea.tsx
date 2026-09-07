import { useRef, useState } from "react";
import type { RepoUser } from "../lib/github";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  users: RepoUser[];
  rows?: number;
  placeholder?: string;
  className: string;
  autoFocus?: boolean;
}

export default function MentionTextarea({ value, onChange, onBlur, users, rows, placeholder, className, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const candidates =
    query !== null ? users.filter((u) => u.login.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6) : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(text);

    const before = text.slice(0, cursor);
    const match = /(?:^|\s)@([a-zA-Z0-9-]*)$/.exec(before);
    if (match) {
      setQuery(match[1]);
      setMentionStart(cursor - match[1].length - 1);
      setActiveIndex(0);
    } else {
      setQuery(null);
      setMentionStart(null);
    }
  }

  function selectCandidate(login: string) {
    if (mentionStart == null || !ref.current) return;
    const cursor = ref.current.selectionStart;
    const newValue = `${value.slice(0, mentionStart)}@${login} ${value.slice(cursor)}`;
    const newCursor = mentionStart + login.length + 2;
    onChange(newValue);
    setQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(newCursor, newCursor);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectCandidate(candidates[activeIndex].login);
    } else if (e.key === "Escape") {
      setQuery(null);
      setMentionStart(null);
    }
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
      />
      {candidates.length > 0 && (
        // Deliberately in normal flow (not position:absolute): an absolutely
        // positioned dropdown gets clipped by the scrollable panels this
        // component is used inside, making it invisible rather than just
        // misplaced.
        <div className="mt-1 w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {candidates.map((u, i) => (
            <button
              key={u.login}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectCandidate(u.login);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-100 ${
                i === activeIndex ? "bg-neutral-800" : ""
              }`}
            >
              <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
              {u.login}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
