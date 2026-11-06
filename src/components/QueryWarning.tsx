/** Warns about query field names the project doesn't have: such a term never matches, so the filter silently does nothing (usually a typo). */
export default function QueryWarning({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  const list = fields.map((f) => `"${f}"`).join(", ");
  return (
    <span
      className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300"
      title={`Nessun campo del progetto si chiama ${list}: quel termine non corrisponde mai a nulla (e negato con - corrisponde sempre). Controlla il nome del campo.`}
    >
      ⚠ Campo sconosciuto: {list}
    </span>
  );
}
