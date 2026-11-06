import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { useDialog } from "../lib/useDialog";

/** "?" button beside the query bar: the query syntax cheat sheet, shown on demand instead of taking a whole row. */
export default function QuerySyntaxHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Sintassi delle query"
        title="Sintassi delle query"
        className={`flex items-center rounded-lg p-1.5 transition ${open ? "text-indigo-300" : "text-neutral-500 hover:text-neutral-300"}`}
      >
        <CircleHelp size={16} aria-hidden />
      </button>
      {open && <Popover onClose={() => setOpen(false)} />}
    </div>
  );
}

function Popover({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose);
  const k = "font-mono text-neutral-200";
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label="Sintassi delle query"
        className="absolute right-0 top-9 z-30 w-[26rem] rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-400 shadow-2xl"
      >
        <h3 className="mb-2 text-sm font-semibold text-neutral-100">Sintassi delle query</h3>
        <ul className="space-y-1.5">
          <li>
            <span className={k}>chiave:valore</span> — es. <span className={k}>label:bug</span>, <span className={k}>assignee:mario</span>
          </li>
          <li>
            spazio = <span className={k}>and</span> · <span className={k}>or</span> = oppure · <span className={k}>-</span> davanti nega ·{" "}
            <span className={k}>( )</span> raggruppa
          </li>
          <li>
            <span className={k}>"virgolette"</span> per gli spazi, anche nel nome del campo: <span className={k}>"target date":&gt;today</span>
          </li>
          <li>
            confronto su date e numeri: <span className={k}>campo:&gt;valore</span> con <span className={k}>&gt; &lt; &gt;= &lt;=</span>
          </li>
          <li>
            date relative: <span className={k}>today</span>, <span className={k}>today+7</span>, <span className={k}>today-30</span>
          </li>
        </ul>
      </div>
    </>
  );
}
