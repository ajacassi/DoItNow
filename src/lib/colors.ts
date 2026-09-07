export interface ColorStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STYLES: Record<string, ColorStyle> = {
  GRAY: { bg: "bg-neutral-800/60", text: "text-neutral-300", border: "border-neutral-600/50", dot: "bg-neutral-400" },
  BLUE: { bg: "bg-blue-950/60", text: "text-blue-300", border: "border-blue-700/50", dot: "bg-blue-400" },
  GREEN: { bg: "bg-emerald-950/60", text: "text-emerald-300", border: "border-emerald-700/50", dot: "bg-emerald-400" },
  YELLOW: { bg: "bg-yellow-950/60", text: "text-yellow-300", border: "border-yellow-700/50", dot: "bg-yellow-400" },
  ORANGE: { bg: "bg-orange-950/60", text: "text-orange-300", border: "border-orange-700/50", dot: "bg-orange-400" },
  RED: { bg: "bg-red-950/60", text: "text-red-300", border: "border-red-700/50", dot: "bg-red-400" },
  PINK: { bg: "bg-pink-950/60", text: "text-pink-300", border: "border-pink-700/50", dot: "bg-pink-400" },
  PURPLE: { bg: "bg-purple-950/60", text: "text-purple-300", border: "border-purple-700/50", dot: "bg-purple-400" },
};

export function colorStyle(color: string | undefined): ColorStyle {
  return STYLES[color ?? "GRAY"] ?? STYLES.GRAY;
}
