import { useEffect, useState } from "react";
import { fetchNotifications } from "../lib/github";

interface Props {
  token: string;
  onOpen: () => void;
  /** Bumped by the parent whenever the inbox closes, so the badge count refreshes. */
  refreshKey: number;
}

export default function NotificationsButton({ token, onOpen, refreshKey }: Props) {
  const [unreadLabel, setUnreadLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications(token, { all: false, perPage: 50 })
      .then((r) => {
        if (cancelled) return;
        setUnreadLabel(r.items.length === 0 ? null : r.hasMore ? "50+" : String(r.items.length));
      })
      .catch(() => {
        if (!cancelled) setUnreadLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  return (
    <button
      onClick={onOpen}
      title="Notifiche"
      className="fixed bottom-4 right-24 z-[100] flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs text-neutral-300 shadow-lg backdrop-blur transition hover:border-neutral-600 hover:text-neutral-100"
    >
      🔔
      {unreadLabel && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{unreadLabel}</span>}
    </button>
  );
}
