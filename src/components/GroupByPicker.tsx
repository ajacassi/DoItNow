import type { ProjectDetail } from "../lib/github";
import { subGroupByOptions } from "../lib/github";

interface Props {
  project: ProjectDetail;
  value: string;
  onChange: (key: string) => void;
}

export default function GroupByPicker({ project, value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Sottodivide ogni gruppo di stato per questo campo — se un campo ha più valori (assegnatari, label, tag multipli) l'issue compare in ogni sottogruppo"
      className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-300 outline-none transition hover:border-neutral-500"
    >
      {subGroupByOptions(project).map((o) => (
        <option key={o.key} value={o.key}>
          {o.key === "none" ? "Sottodividi: nessuno" : `Sottodividi: ${o.label}`}
        </option>
      ))}
    </select>
  );
}
