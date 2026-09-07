import { useRef, useState } from "react";
import type { RepoUser } from "../lib/github";

export interface IssueRefCandidate {
  number: number;
  title: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  users: RepoUser[];
  issues?: IssueRefCandidate[];
  rows?: number;
  placeholder?: string;
  className: string;
  autoFocus?: boolean;
}

type Trigger = "@" | "#";

export default function MentionTextarea({ value, onChange, onBlur, users, issues = [], rows, placeholder, className, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const userCandidates =
    trigger === "@" && query !== null
      ? users.filter((u) => u.login.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6)
      : [];
  const issueCandidates =
    trigger === "#" && query !== null
      ? issues
          .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()) || String(i.number).includes(query))
          .slice(0, 6)
      : [];
  const candidateCount = trigger === "@" ? userCandidates.length : issueCandidates.length;

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(text);

    const before = text.slice(0, cursor);
    const mentionMatch = /(?:^|\s)@([a-zA-Z0-9-]*)$/.exec(before);
    const issueMatch = /(?:^|\s)#([a-zA-Z0-9 _-]*)$/.exec(before);
    if (mentionMatch) {
      setTrigger("@");
      setQuery(mentionMatch[1]);
      setMentionStart(cursor - mentionMatch[1].length - 1);
      setActiveIndex(0);
    } else if (issueMatch) {
      setTrigger("#");
      setQuery(issueMatch[1]);
      setMentionStart(cursor - issueMatch[1].length - 1);
      setActiveIndex(0);
    } else {
      setTrigger(null);
      setQuery(null);
      setMentionStart(null);
    }
  }

  function insertAtMention(text: string, newCursor: number) {
    if (mentionStart == null || !ref.current) return;
    const cursor = ref.current.selectionStart;
    const newValue = `${value.slice(0, mentionStart)}${text}${value.slice(cursor)}`;
    onChange(newValue);
    setTrigger(null);
    setQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(newCursor, newCursor);
    });
  }

  function selectUser(login: string) {
    if (mentionStart == null) return;
    insertAtMention(`@${login} `, mentionStart + login.length + 2);
  }

  function selectIssue(number: number) {
    if (mentionStart == null) return;
    const text = `#${number} `;
    insertAtMention(text, mentionStart + text.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!trigger || candidateCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % candidateCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + candidateCount) % candidateCount);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (trigger === "@") selectUser(userCandidates[activeIndex].login);
      else selectIssue(issueCandidates[activeIndex].number);
    } else if (e.key === "Escape") {
      setTrigger(null);
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
      {/* Deliberately in normal flow (not position:absolute): an absolutely
          positioned dropdown gets clipped by the scrollable panels this
          component is used inside, making it invisible rather than just misplaced. */}
      {trigger === "@" && userCandidates.length > 0 && (
        <div className="mt-1 w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {userCandidates.map((u, i) => (
            <button
              key={u.login}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectUser(u.login);
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
      {trigger === "#" && issueCandidates.length > 0 && (
        <div className="mt-1 w-72 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {issueCandidates.map((i, idx) => (
            <button
              key={i.number}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectIssue(i.number);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-100 ${
                idx === activeIndex ? "bg-neutral-800" : ""
              }`}
            >
              <span className="shrink-0 text-neutral-500">#{i.number}</span>
              <span className="truncate">{i.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
