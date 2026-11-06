import type { Grouping, ProjectDetail } from "../lib/github";
import { groupingOptions } from "../lib/github";

interface Props {
  project: ProjectDetail;
  value: Grouping;
  onChange: (next: Grouping) => void;
}

const SELECT_CLASS =
  "rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-300 outline-none transition hover:border-neutral-500 disabled:opacity-40";

/**
 * Two free grouping levels for Table and Gantt ("Raggruppa" then "poi"):
 * e.g. Stato, Assegnatario › Stato, Stato › Assegnatario, or Nessuno for a
 * flat list where rows never jump between groups when their status changes.
 */
export default function GroupByPicker({ project, value, onChange }: Props) {
  const options = groupingOptions(project);
  const second = value.first === "none" ? "none" : value.second;
  return (
    <div className="flex items-center gap-1">
      <select
        value={value.first}
        onChange={(e) => {
          const first = e.target.value;
          onChange({ first, second: first === "none" || value.second === first ? "none" : value.second });
        }}
        title="Primo livello di raggruppamento. Nessuno = lista unica: le righe non cambiano gruppo quando cambi lo stato."
        className={SELECT_CLASS}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            Raggruppa: {o.label}
          </option>
        ))}
      </select>
      <select
        value={second}
        disabled={value.first === "none"}
        onChange={(e) => onChange({ ...value, second: e.target.value })}
        title="Secondo livello, dentro ogni gruppo del primo. Se un campo ha più valori (assegnatari, label, selezioni multiple) l'issue compare in ogni gruppo."
        className={SELECT_CLASS}
      >
        {options
          .filter((o) => o.key === "none" || o.key !== value.first)
          .map((o) => (
            <option key={o.key} value={o.key}>
              poi: {o.label}
            </option>
          ))}
      </select>
    </div>
  );
}
