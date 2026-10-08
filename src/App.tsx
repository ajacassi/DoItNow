import { useEffect, useState } from "react";
import TokenScreen from "./components/TokenScreen";
import ProjectPicker from "./components/ProjectPicker";
import ProjectView from "./components/ProjectView";
import ThemeToggle from "./components/ThemeToggle";
import NotificationsInbox from "./components/NotificationsInbox";
import SettingsPanel from "./components/SettingsPanel";
import {
  getGithubToken,
  setGithubToken,
  clearGithubToken,
  getLastOrg,
  setLastOrg,
  getTheme,
  setTheme,
  getDefaultProject,
  setDefaultProject,
  clearDefaultProject,
  type DefaultProject,
  type ThemeName,
} from "./lib/store";
import {
  fetchOrgProjects,
  fetchProjectDetail,
  fetchViewerLogin,
  GithubApiError,
  type ProjectSummary,
  type ProjectDetail,
  type ProjectItem,
  type StatusOption,
} from "./lib/github";

type Screen =
  | { name: "loading" }
  | { name: "token" }
  | { name: "picker" }
  | { name: "board"; project: ProjectDetail };

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  const [org, setOrg] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [boardRefreshing, setBoardRefreshing] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [theme, setThemeState] = useState<ThemeName>("vivid");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsRefreshKey, setNotificationsRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [defaultProject, setDefaultProjectState] = useState<DefaultProject | null>(null);
  // Title of the default project while it's being opened at startup, and the
  // explanation shown in the picker when that didn't work out.
  const [startupTitle, setStartupTitle] = useState<string | null>(null);
  const [startupNotice, setStartupNotice] = useState<string | null>(null);

  useEffect(() => {
    getTheme().then((t) => {
      const resolved = t ?? "vivid";
      setThemeState(resolved);
      document.documentElement.dataset.theme = resolved === "vivid" ? "vivid" : "";
    });
  }, []);

  function toggleTheme() {
    setThemeState((prev) => {
      const next: ThemeName = prev === "vivid" ? "dark" : "vivid";
      document.documentElement.dataset.theme = next === "vivid" ? "vivid" : "";
      setTheme(next);
      return next;
    });
  }

  useEffect(() => {
    getGithubToken().then(async (t) => {
      setToken(t);
      if (!t) {
        setScreen({ name: "token" });
        return;
      }
      const def = await getDefaultProject();
      setDefaultProjectState(def);
      if (def) {
        // Straight into the default project; the picker is only the fallback
        // (and the way back), so a project that vanished can never lock us out.
        setOrg(def.org);
        setStartupTitle(def.title);
        try {
          const detail = await fetchProjectDetail(t, def.org, def.number);
          setSelectedNumber(def.number);
          setScreen({ name: "board", project: detail });
          void fetchProjectsForOrg(t, def.org); // so "← Progetti" has its list ready
          return;
        } catch (e) {
          setScreen({ name: "picker" });
          const list = await fetchProjectsForOrg(t, def.org);
          const gone = list !== null && !list.some((p) => p.number === def.number);
          setStartupNotice(
            gone
              ? `Il progetto predefinito «${def.title}» (#${def.number}) non risulta più tra i progetti di ${def.org}: è stato eliminato o non è più accessibile.`
              : `Non sono riuscito ad aprire il progetto predefinito «${def.title}» (#${def.number}): ${e instanceof Error ? e.message : "errore sconosciuto"}.`,
          );
          return;
        } finally {
          setStartupTitle(null);
        }
      }
      setScreen({ name: "picker" });
      const savedOrg = await getLastOrg();
      if (savedOrg) {
        setOrg(savedOrg);
        await fetchProjectsForOrg(t, savedOrg);
      }
    });
  }, []);

  async function handleTokenSubmit(value: string) {
    setTokenError(null);
    try {
      await fetchViewerLogin(value);
    } catch (e) {
      setTokenError(e instanceof GithubApiError ? e.message : "Token non valido.");
      return;
    }
    await setGithubToken(value);
    setToken(value);
    setScreen({ name: "picker" });
  }

  /** Returns the fetched list, or null if it couldn't be loaded. */
  async function fetchProjectsForOrg(t: string, orgName: string): Promise<ProjectSummary[] | null> {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const result = await fetchOrgProjects(t, orgName);
      setProjects(result);
      await setLastOrg(orgName);
      return result;
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Errore sconosciuto");
      setProjects([]);
      return null;
    } finally {
      setPickerLoading(false);
    }
  }

  async function handleFetchProjects() {
    if (!token || !org.trim()) return;
    await fetchProjectsForOrg(token, org.trim());
  }

  async function openProject(p: ProjectSummary) {
    if (!token) return;
    setSelectedNumber(p.number);
    setPickerError(null);
    setPickerLoading(true);
    try {
      const detail = await fetchProjectDetail(token, org.trim(), p.number);
      setScreen({ name: "board", project: detail });
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setPickerLoading(false);
    }
  }

  async function toggleDefaultProject(p: ProjectSummary) {
    const orgName = org.trim();
    setStartupNotice(null);
    if (defaultProject && defaultProject.org === orgName && defaultProject.number === p.number) {
      await clearDefaultProject();
      setDefaultProjectState(null);
      return;
    }
    const next: DefaultProject = { org: orgName, number: p.number, title: p.title };
    await setDefaultProject(next);
    setDefaultProjectState(next);
  }

  async function removeDefaultProject() {
    await clearDefaultProject();
    setDefaultProjectState(null);
    setStartupNotice(null);
  }

  async function refreshBoard() {
    if (!token || selectedNumber == null) return;
    setBoardRefreshing(true);
    try {
      const detail = await fetchProjectDetail(token, org.trim(), selectedNumber);
      setScreen({ name: "board", project: detail });
    } finally {
      setBoardRefreshing(false);
    }
  }

  function patchItem(itemId: string, patch: Partial<ProjectItem>) {
    setScreen((s) => {
      if (s.name !== "board") return s;
      return {
        ...s,
        project: {
          ...s.project,
          items: s.project.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        },
      };
    });
  }

  function addItem(item: ProjectItem) {
    setScreen((s) => {
      if (s.name !== "board") return s;
      return { ...s, project: { ...s.project, items: [item, ...s.project.items] } };
    });
  }

  function patchFieldOptions(fieldId: string, options: StatusOption[]) {
    setScreen((s) => {
      if (s.name !== "board") return s;
      return {
        ...s,
        project: {
          ...s.project,
          fields: s.project.fields.map((f) => (f.id === fieldId ? { ...f, options } : f)),
        },
      };
    });
  }

  function removeItem(itemId: string) {
    setScreen((s) => {
      if (s.name !== "board") return s;
      return { ...s, project: { ...s.project, items: s.project.items.filter((it) => it.id !== itemId) } };
    });
  }

  async function handleLogout() {
    await clearGithubToken();
    setToken(null);
    setProjects([]);
    setScreen({ name: "token" });
  }

  let content: React.ReactNode;
  if (screen.name === "loading") {
    content = (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        {startupTitle ? `Apro «${startupTitle}»…` : null}
      </div>
    );
  } else if (screen.name === "token") {
    content = <TokenScreen onSubmit={handleTokenSubmit} error={tokenError} />;
  } else if (screen.name === "board") {
    content = (
      <ProjectView
        token={token!}
        org={org.trim()}
        project={screen.project}
        onBack={() => setScreen({ name: "picker" })}
        onRefresh={refreshBoard}
        refreshing={boardRefreshing}
        onItemChange={patchItem}
        onItemAdded={addItem}
        onItemRemoved={removeItem}
        onFieldOptionsChanged={patchFieldOptions}
        onOpenNotifications={() => setShowNotifications(true)}
        notificationsRefreshKey={notificationsRefreshKey}
      />
    );
  } else {
    content = (
      <ProjectPicker
        org={org}
        onOrgChange={setOrg}
        onFetch={handleFetchProjects}
        projects={projects}
        loading={pickerLoading}
        error={pickerError}
        onSelect={openProject}
        onLogout={handleLogout}
        defaultProject={defaultProject && defaultProject.org === org.trim() ? defaultProject : null}
        onToggleDefault={toggleDefaultProject}
        startupNotice={startupNotice}
        onRemoveDefault={removeDefaultProject}
        onDismissNotice={() => setStartupNotice(null)}
      />
    );
  }

  return (
    <>
      {content}
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <button
        onClick={() => setShowSettings(true)}
        title="Impostazioni"
        className="fixed bottom-4 right-24 z-[100] rounded-full border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs text-neutral-300 shadow-lg backdrop-blur transition hover:border-neutral-600 hover:text-neutral-100"
      >
        ⚙️
      </button>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showNotifications && token && (
        <NotificationsInbox
          token={token}
          onClose={() => {
            setShowNotifications(false);
            setNotificationsRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
