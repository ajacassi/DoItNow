interface Props {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}

export default function LabelChip({ name, color, onRemove, className }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${className ?? ""}`}
      style={{
        backgroundColor: `#${color}30`,
        color: `#${color}`,
        boxShadow: `inset 0 0 0 1px #${color}40`,
      }}
    >
      {name}
      {onRemove && (
        <button onClick={onRemove} className="opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}
