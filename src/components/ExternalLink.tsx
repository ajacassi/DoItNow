import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
  /** Fires alongside opening the link (e.g. to mark something read) — doesn't replace the open behavior. */
  onClick?: () => void;
}

/**
 * A plain `<a target="_blank">` isn't reliably handled by the WebView2 host —
 * clicking it can silently do nothing. Open explicitly via Tauri's opener
 * plugin instead, which is the documented, guaranteed-to-work path.
 */
export default function ExternalLink({ href, className, title, children, onClick }: Props) {
  return (
    <a
      href={href}
      title={title}
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
