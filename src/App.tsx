import { useEffect, useState } from "react";
import TokenScreen from "./components/TokenScreen";
import ProjectPicker from "./components/ProjectPicker";
import ProjectView from "./components/ProjectView";
import { getGithubToken, setGithubToken, clearGithubToken, getLastOrg, setLastOrg } from "./lib/store";
import {
  fetchOrgProjects,
  fetchProjectDetail,
  fetchViewerLogin,
  GithubApiError,
  type ProjectSummary,
  type ProjectDetail,
  type ProjectItem,
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

  useEffect(() => {
    getGithubToken().then(async (t) => {
      setToken(t);
      if (!t) {
        setScreen({ name: "token" });
        return;
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

  async function fetchProjectsForOrg(t: string, orgName: string) {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const result = await fetchOrgProjects(t, orgName);
      setProjects(result);
      await setLastOrg(orgName);
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Errore sconosciuto");
      setProjects([]);
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

  async function handleLogout() {
    await clearGithubToken();
    setToken(null);
    setProjects([]);
    setScreen({ name: "token" });
  }

  if (screen.name === "loading") {
    return <div className="h-screen w-screen bg-neutral-950" />;
  }

  if (screen.name === "token") {
    return <TokenScreen onSubmit={handleTokenSubmit} error={tokenError} />;
  }

  if (screen.name === "board") {
    return (
      <ProjectView
        token={token!}
        org={org.trim()}
        project={screen.project}
        onBack={() => setScreen({ name: "picker" })}
        onRefresh={refreshBoard}
        refreshing={boardRefreshing}
        onItemChange={patchItem}
        onItemAdded={addItem}
      />
    );
  }

  return (
    <ProjectPicker
      org={org}
      onOrgChange={setOrg}
      onFetch={handleFetchProjects}
      projects={projects}
      loading={pickerLoading}
      error={pickerError}
      onSelect={openProject}
      onLogout={handleLogout}
    />
  );
}
