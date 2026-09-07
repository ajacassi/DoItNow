import { useState } from "react";
import {
  fetchOrgRepos,
  fetchIssueByNumber,
  GithubApiError,
  type RepoSummary,
  type SubIssueSummary,
  type ProjectDetail,
} from "../lib/github";

interface Props {
  token: string;
  org: string;
  project: ProjectDetail;
  value: SubIssueSummary | null;
  onChange: (issue: SubIssueSummary | null) => void;
  /** contentIds (Issue node ids) to leave out of the suggestion list. */
  excludeContentIds?: string[];
  placeholder?: string;
}

export default function IssuePicker({ token, org, project, value, onChange, excludeContentIds = [], placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showNumberSearch, setShowNumberSearch] = useState(false);
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [repoId, setRepoId] = useState("");
  const [number, setNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = project.items
    .filter((i) => i.contentType === "Issue" && i.contentId && !excludeContentIds.includes(i.contentId))
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));

  const q = query.trim().toLowerCase();
  const filtered = (q ? candidates.filter((i) => i.title.toLowerCase().includes(q) || String(i.number).includes(q)) : candidates).slice(
    0,
    10,
  );

  function pick(item: (typeof candidates)[number]) {
    onChange({
      id: item.contentId!,
      number: item.number!,
      title: item.title,
      state: item.state ?? "OPEN",
      url: item.url ?? "",
      repository: item.repository ?? "",
      repositoryOwner: item.repositoryOwner ?? "",
    });
    setQuery("");
    setOpen(false);
  }

  function openNumberSearch() {
    setShowNumberSearch(true);
    setError(null);
    if (!repos) fetchOrgRepos(token, org).then(setRepos).catch(() => setRepos([]));
  }

  async function searchByNumber() {
    const repo = repos?.find((r) => r.id === repoId);
    const num = Number(number);
    if (!repo || !num) return;
    setSearching(true);
    setError(null);
    try {
      const issue = await fetchIssueByNumber(token, org, repo.name, num);
      onChange(issue);
      setShowNumberSearch(false);
      setNumber("");
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Issue non trovata.");
    } finally {
      setSearching(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          {value.repository}#{value.number} — {value.title}
        </span>
        <button onClick={() => onChange(null)} className="shrink-0 text-xs text-neutral-500 hover:text-neutral-200">
          Cambia
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Cerca per titolo o numero…"}
        className="block w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
      {open && filtered.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {filtered.map((item) => (
            <button
              key={item.contentId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-100 hover:bg-neutral-800"
            >
              <span className="shrink-0 text-neutral-500">#{item.number}</span>
              <span className="truncate">{item.title}</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={openNumberSearch} className="mt-1 text-xs text-neutral-500 hover:text-neutral-300">
        Non la trovi? Cerca per repo e numero
      </button>

      {showNumberSearch && (
        <div className="mt-2 flex gap-2">
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
          >
            <option value="">{repos == null ? "Carico…" : "-- repo --"}</option>
            {repos?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="numero"
            className="w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
          />
          <button
            onClick={searchByNumber}
            disabled={searching || !repoId || !number}
            className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
          >
            {searching ? "Cerco…" : "Cerca"}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
