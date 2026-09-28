import { useEffect, useRef, useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: SearchableSelectOption[];
  /** Currently selected value, or "" for none — pass "" permanently for an "add one to a list" picker (label resets after each pick). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Overrides the trigger button's className entirely (e.g. for the colored status pill). */
  className?: string;
  disabled?: boolean;
}

const DEFAULT_TRIGGER_CLASS =
  "block w-full truncate rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-left text-sm text-neutral-100 outline-none transition hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50";

export default function SearchableSelect({ options, value, onChange, placeholder = "—", className, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        {selected ? selected.label : <span className="text-neutral-500">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[12rem] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && filtered[activeIndex]) {
                e.preventDefault();
                pick(filtered[activeIndex].value);
              }
            }}
            placeholder="Cerca…"
            className="block w-full border-b border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none"
          />
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-600">Nessun risultato.</p>}
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.value);
                }}
                className={`block w-full truncate px-2 py-1.5 text-left text-sm ${
                  i === activeIndex ? "bg-neutral-800" : ""
                } ${o.value === value ? "text-indigo-300" : "text-neutral-100"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
