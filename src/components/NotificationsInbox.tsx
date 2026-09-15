import { useEffect, useState } from "react";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  GithubApiError,
  type NotificationItem,
} from "../lib/github";
import ExternalLink from "./ExternalLink";

interface Props {
  token: string;
  onClose: () => void;
}

type FilterKey = "all" | "unread" | "mention" | "assign" | "review_requested" | "participating";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tutte" },
  { key: "unread", label: "Non lette" },
  { key: "mention", label: "Menzioni" },
  { key: "assign", label: "Assegnate" },
  { key: "review_requested", label: "Revisione richiesta" },
  { key: "participating", label: "Partecipazione" },
];

const REASON_LABELS: Record<string, string> = {
  mention: "Menzione",
  team_mention: "Menzione team",
  assign: "Assegnata",
  review_requested: "Revisione richiesta",
  author: "Autore",
  comment: "Commento",
  subscribed: "Partecipazione",
  state_change: "Cambio stato",
  ci_activity: "CI",
  manual: "Manuale",
};

function matchesFilter(item: NotificationItem, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return item.unread;
    case "mention":
      return item.reason === "mention" || item.reason === "team_mention";
    case "assign":
      return item.reason === "assign";
    case "review_requested":
      return item.reason === "review_requested";
    case "participating":
      return !["mention", "team_mention", "assign", "review_requested"].includes(item.reason);
  }
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 14) return `${days} giorni fa`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} settiman${weeks === 1 ? "a" : "e"} fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

export default function NotificationsInbox({ token, onClose }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchNotifications(token, { all: true, page: 1 })
      .then((r) => {
        setItems(r.items);
        setHasMore(r.hasMore);
        setPage(1);
      })
      .catch((e) => setError(e instanceof GithubApiError ? e.message : "Impossibile caricare le notifiche."))
      .finally(() => setLoading(false));
  }, [token]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const r = await fetchNotifications(token, { all: true, page: next });
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
      setPage(next);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Impossibile caricare altre notifiche.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markRead(item: NotificationItem) {
    if (!item.unread) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
    try {
      await markNotificationRead(token, item.id);
    } catch {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, unread: true } : n)));
    }
  }

  async function markAllRead() {
    const previous = items;
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
    try {
      await markAllNotificationsRead(token);
    } catch (e) {
      setItems(previous);
      setError(e instanceof GithubApiError ? e.message : "Impossibile segnare tutte come lette.");
    }
  }

  const filtered = items.filter((n) => matchesFilter(n, filter));
  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-8 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Notifiche</h1>
          <p className="text-xs text-neutral-500">
            Dall'inbox GitHub del tuo account — assegnazioni, menzioni, revisioni richieste e partecipazione.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-neutral-500 hover:text-neutral-300">
              Segna tutte come lette
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500">
            Chiudi
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1.5 border-b border-neutral-800 px-8 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-2.5 py-1 text-xs transition ${
              filter === f.key ? "bg-neutral-800 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
        {error && <div className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</div>}

        {loading ? (
          <p className="text-sm text-neutral-500">Carico…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-neutral-600">Nessuna notifica{filter !== "all" ? " in questa categoria" : ""}.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            {filtered.map((n) => (
              <div
                key={n.id}
                className="flex items-center gap-3 border-b border-neutral-800/60 px-3 py-2.5 last:border-b-0 hover:bg-neutral-900/40"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.unread ? "bg-indigo-500" : "bg-transparent"}`} />
                <span className="shrink-0 rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                  {REASON_LABELS[n.reason] ?? n.reason}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {n.htmlUrl ? (
                    <ExternalLink href={n.htmlUrl} className="hover:underline" onClick={() => markRead(n)}>
                      {n.title}
                    </ExternalLink>
                  ) : (
                    n.title
                  )}
                </span>
                <span className="shrink-0 text-xs text-neutral-600">
                  {n.repositoryFullName}
                  {n.number != null ? ` #${n.number}` : ""}
                </span>
                <span className="shrink-0 text-xs text-neutral-600">{timeAgo(n.updatedAt)}</span>
                {n.unread && (
                  <button onClick={() => markRead(n)} className="shrink-0 text-xs text-neutral-600 hover:text-neutral-300">
                    Segna letta
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="mt-3 w-full rounded-lg border border-neutral-800 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 disabled:opacity-50"
          >
            {loadingMore ? "Carico…" : "Carica altre"}
          </button>
        )}
      </div>
    </div>
  );
}
