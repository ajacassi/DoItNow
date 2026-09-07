import type { SubIssuesSummary } from "../lib/github";

export default function SubIssueProgress({ summary }: { summary: SubIssuesSummary }) {
  if (summary.total === 0) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-[10px] text-neutral-500"
      title={`${summary.completed}/${summary.total} sub-issue completate`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-neutral-800">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${summary.percentCompleted}%` }} />
      </span>
      {summary.completed}/{summary.total}
    </span>
  );
}
