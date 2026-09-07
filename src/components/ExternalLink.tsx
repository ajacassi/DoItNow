import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * A plain `<a target="_blank">` isn't reliably handled by the WebView2 host —
 * clicking it can silently do nothing. Open explicitly via Tauri's opener
 * plugin instead, which is the documented, guaranteed-to-work path.
 */
export default function ExternalLink({ href, className, title, children }: Props) {
  return (
    <a
      href={href}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch(() => {});
      }}
      className={className}
    >
      {children}
    </a>
  );
}
