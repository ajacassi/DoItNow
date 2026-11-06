import { useEffect, useRef } from "react";

/**
 * Keyboard behavior shared by every modal, side panel and full-screen overlay:
 *  - Esc closes it (only the topmost one when dialogs are stacked, and only if
 *    nothing inside already handled Esc — e.g. an open autocomplete calls
 *    `preventDefault()` to close itself first);
 *  - on open, focus moves into the dialog (unless an `autoFocus` field already
 *    took it), Tab/Shift+Tab cycle inside it, and on close focus goes back to
 *    whatever opened it.
 *
 * Attach the returned ref to the dialog box and give that element
 * `tabIndex={-1}` plus `role="dialog"`, `aria-modal="true"` and a label.
 * Pass `canClose: false` to block Esc while an action is in progress.
 */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, canClose = true) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);
  onCloseRef.current = onClose;
  canCloseRef.current = canClose;

  useEffect(() => {
    const id = Symbol("dialog");
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id || !el) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented || !canCloseRef.current) return;
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const items = focusables(el);
        if (items.length === 0) {
          e.preventDefault();
          el.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!el.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && (active === first || active === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return ref;
}
