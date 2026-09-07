import { useEffect, useRef } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  markdown: string;
  token: string;
  className?: string;
  onClick?: () => void;
  /** Called with the issue number when a "#123" reference link is clicked. */
  onOpenIssueRef?: (number: number) => void;
}

// Attachment images embedded via GitHub's issue/comment editor are served from
// github.com / githubusercontent.com and require an authenticated request even
// to read them on private repos — a plain <img src> has no way to carry our
// API token, so they render broken. We refetch them with the token, using
// Tauri's native HTTP client (not the browser's fetch) so the request isn't
// blocked by CORS, and swap in a local blob URL.
function needsAuthFetch(hostname: string): boolean {
  return hostname === "github.com" || hostname.endsWith(".githubusercontent.com");
}

export default function MarkdownContent({ markdown, token, className, onClick, onOpenIssueRef }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = renderMarkdown(markdown);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const objectUrls: string[] = [];
    const cleanups: Array<() => void> = [];

    if (onOpenIssueRef) {
      for (const a of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#issue-"]'))) {
        const number = Number(a.getAttribute("href")!.replace("#issue-", ""));
        const handler = (e: MouseEvent) => {
          e.preventDefault();
          // Body clicks toggle edit mode via a click handler on an ancestor —
          // stop this one from bubbling there.
          e.stopPropagation();
          onOpenIssueRef(number);
        };
        a.addEventListener("click", handler);
        a.classList.add("cursor-pointer");
        cleanups.push(() => a.removeEventListener("click", handler));
      }
    }

    for (const img of Array.from(container.querySelectorAll("img"))) {
      let url: URL;
      try {
        url = new URL(img.src);
      } catch {
        continue;
      }
      if (!needsAuthFetch(url.hostname)) continue;

      tauriFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          objectUrls.push(objectUrl);
          img.src = objectUrl;
        })
        .catch(() => {
          // leave the broken-image placeholder if the authenticated fetch also fails
        });
    }

    return () => {
      for (const u of objectUrls) URL.revokeObjectURL(u);
      for (const cleanup of cleanups) cleanup();
    };
  }, [html, token, onOpenIssueRef]);

  return <div ref={ref} className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
