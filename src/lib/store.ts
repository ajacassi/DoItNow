import { load, type Store } from "@tauri-apps/plugin-store";
import type { SortKey } from "./sort";

const SETTINGS_FILE = "settings.json";
const TOKEN_KEY = "github_token";
const LAST_ORG_KEY = "last_org";
const SYNC_FILE_PATH_KEY = "sync_file_path";
/** Keys that are machine-specific or sensitive — never exported to, or imported from, the portable settings file. */
const NON_PORTABLE_KEYS = new Set([TOKEN_KEY, SYNC_FILE_PATH_KEY]);

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

export async function getLastOrg(): Promise<string | null> {
  const store = await getStore();
  const org = await store.get<string>(LAST_ORG_KEY);
  return org ?? null;
}

export async function setLastOrg(org: string): Promise<void> {
  const store = await getStore();
  await store.set(LAST_ORG_KEY, org);
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

export interface SavedView {
  id: string;
  name: string;
  queryText: string;
  labels: string[];
  viewMode: "table" | "board" | "gantt";
}

export interface ProjectFilterState {
  queryText: string;
  labels: string[];
  viewMode: "table" | "board" | "gantt";
  activeViewId: string | null;
}

export interface ProjectViewState {
  views: SavedView[];
  current: ProjectFilterState;
}

const EMPTY_VIEW_STATE: ProjectViewState = {
  views: [],
  current: { queryText: "", labels: [], viewMode: "table", activeViewId: null },
};

export async function getProjectViewState(projectId: string): Promise<ProjectViewState> {
  const store = await getStore();
  const data = await store.get<ProjectViewState>(`project_views_${projectId}`);
  return data ?? EMPTY_VIEW_STATE;
}

export async function setProjectViewState(projectId: string, data: ProjectViewState): Promise<void> {
  const store = await getStore();
  await store.set(`project_views_${projectId}`, data);
  await store.save();
}

// Table column visibility is shared across all views of a project (not
// per-view), per explicit user request.
export async function getTableColumns(projectId: string): Promise<string[] | null> {
  const store = await getStore();
  const data = await store.get<string[]>(`table_columns_${projectId}`);
  return data ?? null;
}

export async function setTableColumns(projectId: string, columns: string[]): Promise<void> {
  const store = await getStore();
  await store.set(`table_columns_${projectId}`, columns);
  await store.save();
}

// Whether Table/Gantt show status groups bottom-up instead of the project's
// natural Status field order — shared across views of a project, like columns.
export async function getStatusOrderReversed(projectId: string): Promise<boolean> {
  const store = await getStore();
  const data = await store.get<boolean>(`status_order_reversed_${projectId}`);
  return data ?? false;
}

export async function setStatusOrderReversed(projectId: string, value: boolean): Promise<void> {
  const store = await getStore();
  await store.set(`status_order_reversed_${projectId}`, value);
  await store.save();
}

// Composable multi-column sort within each status group in Table — shared
// across views of a project, like columns and status order.
export async function getSortKeys(projectId: string): Promise<SortKey[]> {
  const store = await getStore();
  const data = await store.get<SortKey[]>(`sort_keys_${projectId}`);
  return data ?? [];
}

export async function setSortKeys(projectId: string, keys: SortKey[]): Promise<void> {
  const store = await getStore();
  await store.set(`sort_keys_${projectId}`, keys);
  await store.save();
}

export type ThemeName = "vivid" | "dark";

const THEME_KEY = "theme";

export async function getTheme(): Promise<ThemeName | null> {
  const store = await getStore();
  const data = await store.get<ThemeName>(THEME_KEY);
  return data ?? null;
}

export async function setTheme(theme: ThemeName): Promise<void> {
  const store = await getStore();
  await store.set(THEME_KEY, theme);
  await store.save();
}

// ---------------------------------------------------------------------------
// Portable settings file — lets everything saved locally (views, filters,
// columns, sort, label folders, theme...) except the token and the sync path
// itself travel to another machine, e.g. via a file kept in a synced folder
// (OneDrive, Dropbox...).
// ---------------------------------------------------------------------------

export async function getSyncFilePath(): Promise<string | null> {
  const store = await getStore();
  const path = await store.get<string>(SYNC_FILE_PATH_KEY);
  return path ?? null;
}

export async function setSyncFilePath(path: string): Promise<void> {
  const store = await getStore();
  await store.set(SYNC_FILE_PATH_KEY, path);
  await store.save();
}

export interface SettingsExport {
  doitnowSettingsExport: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export async function buildSettingsExport(): Promise<SettingsExport> {
  const store = await getStore();
  const entries = await store.entries<unknown>();
  const data: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (NON_PORTABLE_KEYS.has(key)) continue;
    data[key] = value;
  }
  return { doitnowSettingsExport: 1, exportedAt: new Date().toISOString(), data };
}

/** Throws if `parsed` doesn't look like a settings export produced by this app. */
export async function applySettingsImport(parsed: unknown): Promise<void> {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Partial<SettingsExport>).doitnowSettingsExport !== 1 ||
    typeof (parsed as Partial<SettingsExport>).data !== "object"
  ) {
    throw new Error("Il file non è un export di impostazioni DoItNow valido.");
  }
  const store = await getStore();
  for (const [key, value] of Object.entries((parsed as SettingsExport).data)) {
    if (NON_PORTABLE_KEYS.has(key)) continue;
    await store.set(key, value);
  }
  await store.save();
}
