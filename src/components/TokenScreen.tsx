import { useState } from "react";

interface Props {
  onSubmit: (token: string) => Promise<void>;
  error: string | null;
}

export default function TokenScreen({ onSubmit, error }: Props) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 shadow-2xl"
      >
        <h1 className="text-2xl font-semibold tracking-tight">DoItNow</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Collega un Personal Access Token di GitHub per iniziare.
        </p>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Token
        </label>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ghp_..."
          className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-indigo-500"
        />

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !value.trim()}
          className="mt-5 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Verifica in corso…" : "Continua"}
        </button>

        <p className="mt-5 text-xs leading-relaxed text-neutral-500">
          Serve un token con scope <code className="text-neutral-400">read:project</code> (classic) oppure,
          per un fine-grained token, permesso <code className="text-neutral-400">Projects: Read</code> sull'organizzazione.
          Il token resta salvato solo in locale sul tuo PC.
        </p>
      </form>
    </div>
  );
}
