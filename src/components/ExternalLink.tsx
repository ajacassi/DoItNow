import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight } from "lucide-react";

interface Props {
  href: string;
  className?: string;
  title?: string;
  /** Accessible name — required when the content is only an icon. */
  label?: string;
  children: ReactNode;
  /** Fires alongside opening the link (e.g. to mark something read) — doesn't replace the open behavior. */
  onClick?: () => void;
}

/**
 * A plain `<a target="_blank">` isn't reliably handled by the WebView2 host —
 * clicking it can silently do nothing. Open explicitly via Tauri's opener
 * plugin instead, which is the documented, guaranteed-to-work path.
 */
export default function ExternalLink({ href, className, title, label, children, onClick }: Props) {
  return (
    <a
      href={href}
      title={title ?? label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch(() => {});
        onClick?.();
      }}
      className={className}
    >
      {children}
    </a>
  );
}

/**
 * Icon-only "open on GitHub" link used in lists and rows. The negative margin
 * grows the hit area to 24×24 px without changing the row layout.
 */
export function GitHubIconLink({ href, className = "" }: { href: string; className?: string }) {
  return (
    <ExternalLink href={href} label="Apri su GitHub" className={`-m-[5px] inline-flex shrink-0 rounded p-[5px] ${className}`}>
      <ArrowUpRight size={14} aria-hidden />
    </ExternalLink>
  );
}
