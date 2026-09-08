import { load, type Store } from "@tauri-apps/plugin-store";

const SETTINGS_FILE = "settings.json";
const TOKEN_KEY = "github_token";
const LAST_ORG_KEY = "last_org";

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
