import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { uploadFileAttachment, GithubApiError } from "../lib/github";

interface Props {
  token: string;
  repositoryDatabaseId: number | null;
  onInsert: (markdown: string) => void;
}

// GitHub's token-authenticated upload endpoint only accepts images and video
// — anything else (PDF, Office docs, zip...) needs the full browser-session
// upload flow (cookie + CSRF token from a logged-in github.com page), which
// isn't reachable with a PAT/OAuth token. Those still have to be attached
// from GitHub's own web UI.
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const MEDIA_EXTENSIONS = Object.keys(EXT_TO_MIME);

function guessMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function FileUploadButton({ token, repositoryDatabaseId, onInsert }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!repositoryDatabaseId) return;
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "Immagini e video", extensions: MEDIA_EXTENSIONS }],
    });
    if (!path || Array.isArray(path)) return;

    const fileName = baseName(path);
    const mime = guessMime(fileName);
    setUploading(true);
    try {
      const bytes = await readFile(path);
      const url = await uploadFileAttachment(token, repositoryDatabaseId, fileName, mime, bytes);
      onInsert(mime.startsWith("image/") ? `![${fileName}](${url})` : `[${fileName}](${url})`);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Caricamento allegato non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        // Prevent the click from blurring a sibling textarea first — some
        // callers auto-save/exit edit mode on blur, which would otherwise
        // fire before the upload finishes and the attachment gets inserted.
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
        disabled={uploading || !repositoryDatabaseId}
        title={
          repositoryDatabaseId
            ? "Allega immagine o video — documenti (PDF, Word, ecc.) vanno allegati da GitHub web"
            : "Disponibile dopo aver scelto il repository"
        }
        className="text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
      >
        {uploading ? "Carico…" : "🖼 Immagine/video"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
