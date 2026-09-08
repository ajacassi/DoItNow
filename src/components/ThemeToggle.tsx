import type { ThemeName } from "../lib/store";

interface Props {
  theme: ThemeName;
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={theme === "vivid" ? "Torna al tema nero" : "Passa al tema chiaro"}
      className="fixed bottom-4 right-4 z-[100] rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs text-neutral-300 shadow-lg backdrop-blur transition hover:border-neutral-600 hover:text-neutral-100"
    >
      {theme === "vivid" ? "⚫ Nero" : "☀️ Chiaro"}
    </button>
  );
}
