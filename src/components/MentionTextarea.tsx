import { useRef, useState } from "react";
import { uploadFileAttachment, GithubApiError, type RepoUser } from "../lib/github";

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
  /** Both required to enable "paste/drop an image or video" — with either missing, a paste is left as plain text. */
  token?: string;
  repositoryDatabaseId?: number | null;
}

type Trigger = "@" | "#";

function guessExtension(mime: string): string {
  const ext = mime.split("/")[1];
  return ext && /^[a-z0-9]+$/i.test(ext) ? ext : "png";
}

export default function MentionTextarea({
  value,
  onChange,
  onBlur,
  users,
  issues = [],
  rows,
  placeholder,
  className,
  autoFocus,
  token,
  repositoryDatabaseId,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

  async function uploadFileAndInsert(file: File) {
    if (!token || !repositoryDatabaseId) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      // GitHub's token-authenticated upload endpoint only accepts images and
      // video — anything else (PDF, Office docs, zip...) needs the full
      // browser-session upload flow, which isn't reachable with a PAT/OAuth
      // token. Reject up front instead of a confusing 422 from the server.
      setPasteError('GitHub non permette di caricare questo tipo di file tramite token — solo immagini e video. Allegalo dall\'interfaccia web di GitHub ("Apri su GitHub").');
      return;
    }
    setPasting(true);
    setPasteError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || "application/octet-stream";
      const fileName = file.name && file.name !== "image.png" ? file.name : `image-${Date.now()}.${guessExtension(mime)}`;
      const url = await uploadFileAttachment(token, repositoryDatabaseId, fileName, mime, bytes);
      const markdown = isImage ? `![${fileName}](${url})` : `[${fileName}](${url})`;

      const el = ref.current;
      const cursor = el?.selectionStart ?? value.length;
      const newValue = `${value.slice(0, cursor)}${markdown}${value.slice(cursor)}`;
      onChange(newValue);
      const newCursor = cursor + markdown.length;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newCursor, newCursor);
      });
    } catch (err) {
      setPasteError(err instanceof GithubApiError ? err.message : "Caricamento allegato non riuscito.");
    } finally {
      setPasting(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!token || !repositoryDatabaseId) return; // no upload target — fall through to normal paste
    const file = e.clipboardData.files[0];
    if (!file) return; // plain text paste — let it proceed normally
    e.preventDefault();
    uploadFileAndInsert(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLTextAreaElement>) {
    if (!token || !repositoryDatabaseId) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    setDragActive(false);
    if (!token || !repositoryDatabaseId) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    uploadFileAndInsert(file);
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onBlur={onBlur}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${className} ${dragActive ? "outline outline-2 outline-indigo-500" : ""}`}
      />
      {dragActive && <p className="mt-1 text-xs text-indigo-400">Rilascia per caricare l'allegato…</p>}
      {pasting && <p className="mt-1 text-xs text-neutral-500">Carico allegato…</p>}
      {pasteError && <p className="mt-1 text-xs text-red-400">{pasteError}</p>}
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
