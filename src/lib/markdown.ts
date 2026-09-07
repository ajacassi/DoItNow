import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Turn "#123" into a link the app can intercept and open in-app, without
// touching fenced code blocks or inline code spans. Uses a same-page hash
// fragment (not a custom URI scheme) so DOMPurify's default sanitizer allows
// it with no extra configuration.
function linkifyIssueRefs(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .split(/(`[^`]*`)/)
        .map((segment, i) =>
          i % 2 === 1 ? segment : segment.replace(/(^|[\s(])#(\d+)\b/g, (_m, pre, num) => `${pre}[#${num}](#issue-${num})`),
        )
        .join("");
    })
    .join("\n");
}

export function renderMarkdown(text: string): string {
  if (!text.trim()) return "";
  const html = marked.parse(linkifyIssueRefs(text), { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
}
