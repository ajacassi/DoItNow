import { load, type Store } from "@tauri-apps/plugin-store";

const SETTINGS_FILE = "settings.json";
const TOKEN_KEY = "github_token";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(SETTINGS_FILE, { autoSave: true });
  }
  return storePromise;
}

export async function getGithubToken(): Promise<string | null> {
  const store = await getStore();
  const token = await store.get<string>(TOKEN_KEY);
  return token ?? null;
}

export async function setGithubToken(token: string): Promise<void> {
  const store = await getStore();
  await store.set(TOKEN_KEY, token);
  await store.save();
}

export async function clearGithubToken(): Promise<void> {
  const store = await getStore();
  await store.delete(TOKEN_KEY);
  await store.save();
}

export interface LabelFolders {
  /** Ordered folder names. */
  folders: string[];
  /** labelName -> folderName. Labels not present here are "senza cartella". */
  assignment: Record<string, string>;
}

const EMPTY_LABEL_FOLDERS: LabelFolders = { folders: [], assignment: {} };

export async function getLabelFolders(projectId: string): Promise<LabelFolders> {
  const store = await getStore();
  const data = await store.get<LabelFolders>(`label_folders_${projectId}`);
  return data ?? EMPTY_LABEL_FOLDERS;
}

export async function setLabelFolders(projectId: string, data: LabelFolders): Promise<void> {
  const store = await getStore();
  await store.set(`label_folders_${projectId}`, data);
  await store.save();
}
