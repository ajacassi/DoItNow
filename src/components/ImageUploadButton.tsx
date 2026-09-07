import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { uploadImageAttachment, GithubApiError } from "../lib/github";

interface Props {
  token: string;
  repositoryDatabaseId: number | null;
  onInsert: (markdown: string) => void;
}

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

function guessMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function ImageUploadButton({ token, repositoryDatabaseId, onInsert }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!repositoryDatabaseId) return;
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "Immagini", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
    });
    if (!path || Array.isArray(path)) return;

    const fileName = baseName(path);
    setUploading(true);
    try {
      const bytes = await readFile(path);
      const url = await uploadImageAttachment(token, repositoryDatabaseId, fileName, guessMime(fileName), bytes);
      onInsert(`![${fileName}](${url})`);
    } catch (e) {
      setError(e instanceof GithubApiError ? e.message : "Caricamento immagine non riuscito.");
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
        // fire before the upload finishes and the image gets inserted.
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleClick}
        disabled={uploading || !repositoryDatabaseId}
        title={repositoryDatabaseId ? "Carica immagine" : "Disponibile dopo aver scelto il repository"}
        className="text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
      >
        {uploading ? "Carico immagine…" : "🖼 Immagine"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
