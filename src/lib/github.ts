import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

export class GithubApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GithubApiError";
  }
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new GithubApiError(`GitHub API ha risposto ${res.status}`, res.status);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new GithubApiError(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data as T;
}

const VIEWER_QUERY = `
  query Viewer {
    viewer {
      login
    }
  }
`;

export async function fetchViewerLogin(token: string): Promise<string> {
  const data = await graphql<{ viewer: { login: string } }>(token, VIEWER_QUERY, {});
  return data.viewer.login;
}

export interface ProjectSummary {
  id: string;
  title: string;
  number: number;
  shortDescription: string | null;
  closed: boolean;
}

const ORG_PROJECTS_QUERY = `
  query OrgProjects($org: String!) {
    organization(login: $org) {
      projectsV2(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          id
          title
          number
          shortDescription
          closed
        }
      }
    }
  }
`;

export async function fetchOrgProjects(token: string, org: string): Promise<ProjectSummary[]> {
  const data = await graphql<{
    organization: { projectsV2: { nodes: ProjectSummary[] } } | null;
  }>(token, ORG_PROJECTS_QUERY, { org });

  if (!data.organization) {
    throw new GithubApiError(`Organizzazione "${org}" non trovata o non accessibile con questo token.`);
  }
  return data.organization.projectsV2.nodes;
}

export interface ProjectItemUser {
  login: string;
  avatarUrl: string;
}

export interface ProjectItemLabel {
  name: string;
  color: string;
}

export interface StatusOption {
  id: string;
  name: string;
  color: string;
}

export interface ProjectField {
  id: string;
  name: string;
  dataType: string;
  options?: StatusOption[];
}

/** An "Issue Field" (org-level custom field on issues, mirrored into project views) — distinct from a true ProjectV2 custom field. */
export interface IssueFieldDef {
  id: string;
  name: string;
  dataType: string;
  options?: StatusOption[];
}

export type ItemFieldValue =
  | { type: "singleSelect"; name: string; color: string }
  | { type: "date"; date: string }
  | { type: "text"; text: string }
  | { type: "number"; number: number };

/** Enough to load an issue's detail regardless of whether it's a row in the current project. */
export interface IssueRef {
  repositoryOwner: string;
  repository: string;
  number: number;
}

export interface SubIssuesSummary {
  total: number;
  completed: number;
  percentCompleted: number;
}

export interface ProjectItem {
  id: string;
  /** Node id of the underlying Issue/PullRequest (not the ProjectV2Item id) — needed for issue-level mutations like sub-issues. */
  contentId: string | null;
  /** Node id of the parent issue, if this item is itself a sub-issue. */
  parentId: string | null;
  subIssuesSummary: SubIssuesSummary | null;
  status: string;
  contentType: "Issue" | "PullRequest" | "DraftIssue";
  number: number | null;
  title: string;
  url: string | null;
  state: string | null;
  repository: string | null;
  repositoryOwner: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  assignees: ProjectItemUser[];
  labels: ProjectItemLabel[];
  fields: Record<string, ItemFieldValue>;
}

export interface ProjectDetail {
  id: string;
  title: string;
  url: string;
  statusFieldId: string | null;
  statusOptions: StatusOption[];
  fields: ProjectField[];
  /** Fields in `fields` that are actually Issue Fields (org-level) must be written via updateIssueFieldValue, keyed by field name. */
  issueFieldsByName: Record<string, IssueFieldDef>;
  items: ProjectItem[];
}

const PROJECT_ITEMS_QUERY = `
  query ProjectItems($org: String!, $number: Int!) {
    organization(login: $org) {
      issueFields(first: 50) {
        nodes {
          __typename
          ... on IssueFieldCommon {
            name
            dataType
          }
          ... on IssueFieldSingleSelect {
            id
            options {
              id
              name
              color
            }
          }
          ... on IssueFieldText { id }
          ... on IssueFieldNumber { id }
          ... on IssueFieldDate { id }
        }
      }
      projectV2(number: $number) {
        id
        title
        url
        fields(first: 30) {
          nodes {
            ... on ProjectV2FieldCommon {
              id
              name
              dataType
            }
            ... on ProjectV2SingleSelectField {
              options {
                id
                name
                color
              }
            }
          }
        }
        items(first: 100) {
          nodes {
            id
            fieldValues(first: 20) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  color
                  field {
                    ... on ProjectV2FieldCommon { name }
                  }
                }
                ... on ProjectV2ItemFieldDateValue {
                  date
                  field {
                    ... on ProjectV2FieldCommon { name }
                  }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field {
                    ... on ProjectV2FieldCommon { name }
                  }
                }
                ... on ProjectV2ItemFieldNumberValue {
                  number
                  field {
                    ... on ProjectV2FieldCommon { name }
                  }
                }
                ... on ProjectV2ItemIssueFieldValue {
                  issueFieldValue {
                    __typename
                    ... on IssueFieldValueCommon {
                      field {
                        ... on IssueFieldCommon { name }
                      }
                    }
                    ... on IssueFieldTextValue { value }
                    ... on IssueFieldNumberValue { value }
                    ... on IssueFieldDateValue { value }
                    ... on IssueFieldSingleSelectValue { id name color }
                  }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                id
                number
                title
                url
                state
                parent { id }
                subIssuesSummary { total completed percentCompleted }
                repository { name owner { login } }
                assignees(first: 6) { nodes { login avatarUrl } }
                labels(first: 10) { nodes { name color } }
                createdAt
                updatedAt
                closedAt
              }
              ... on PullRequest {
                id
                number
                title
                url
                state
                repository { name owner { login } }
                assignees(first: 6) { nodes { login avatarUrl } }
                labels(first: 10) { nodes { name color } }
                createdAt
                updatedAt
                closedAt
              }
              ... on DraftIssue {
                title
              }
            }
          }
        }
      }
    }
  }
`;

interface RawIssueFieldValue {
  __typename: string;
  id?: string;
  name?: string;
  color?: string;
  value?: string | number;
  field?: { name?: string } | null;
}

interface RawFieldValue {
  __typename: string;
  name?: string;
  color?: string;
  date?: string;
  text?: string;
  number?: number;
  field?: { name?: string } | null;
  issueFieldValue?: RawIssueFieldValue | null;
}

interface RawIssueFieldNode {
  __typename: string;
  name?: string;
  dataType?: string;
  id?: string;
  options?: Array<{ id: string; name: string; color: string }>;
}

interface RawProjectItemsResponse {
  organization: {
    issueFields: { nodes: RawIssueFieldNode[] };
    projectV2: {
      id: string;
      title: string;
      url: string;
      fields: {
        nodes: Array<{
          id?: string;
          name?: string;
          dataType?: string;
          options?: Array<{ id: string; name: string; color: string }>;
        } | null>;
      };
      items: {
        nodes: Array<{
          id: string;
          fieldValues: { nodes: RawFieldValue[] };
          content: {
            __typename: "Issue" | "PullRequest" | "DraftIssue";
            id?: string;
            number?: number;
            title: string;
            url?: string;
            state?: string;
            parent?: { id: string } | null;
            subIssuesSummary?: SubIssuesSummary | null;
            repository?: { name: string; owner: { login: string } };
            assignees?: { nodes: ProjectItemUser[] };
            labels?: { nodes: ProjectItemLabel[] };
            createdAt?: string;
            updatedAt?: string;
            closedAt?: string | null;
          } | null;
        }>;
      };
    } | null;
  } | null;
}

const NO_STATUS = "Senza stato";
const STATUS_FIELD_NAME = "Status";

function parseFieldValue(raw: RawFieldValue): ItemFieldValue | null {
  switch (raw.__typename) {
    case "ProjectV2ItemFieldSingleSelectValue":
      return raw.name != null && raw.color != null ? { type: "singleSelect", name: raw.name, color: raw.color } : null;
    case "ProjectV2ItemFieldDateValue":
      return raw.date != null ? { type: "date", date: raw.date } : null;
    case "ProjectV2ItemFieldTextValue":
      return raw.text != null ? { type: "text", text: raw.text } : null;
    case "ProjectV2ItemFieldNumberValue":
      return raw.number != null ? { type: "number", number: raw.number } : null;
    case "ProjectV2ItemIssueFieldValue":
      return raw.issueFieldValue ? parseIssueFieldValue(raw.issueFieldValue) : null;
    default:
      return null;
  }
}

function parseIssueFieldValue(raw: RawIssueFieldValue): ItemFieldValue | null {
  switch (raw.__typename) {
    case "IssueFieldSingleSelectValue":
      return raw.name != null && raw.color != null ? { type: "singleSelect", name: raw.name, color: raw.color } : null;
    case "IssueFieldDateValue":
      return typeof raw.value === "string" ? { type: "date", date: raw.value } : null;
    case "IssueFieldTextValue":
      return typeof raw.value === "string" ? { type: "text", text: raw.value } : null;
    case "IssueFieldNumberValue":
      return typeof raw.value === "number" ? { type: "number", number: raw.value } : null;
    default:
      return null;
  }
}

function fieldNameOf(raw: RawFieldValue): string | undefined {
  if (raw.__typename === "ProjectV2ItemIssueFieldValue") return raw.issueFieldValue?.field?.name;
  return raw.field?.name;
}

export async function fetchProjectDetail(token: string, org: string, number: number): Promise<ProjectDetail> {
  const data = await graphql<RawProjectItemsResponse>(token, PROJECT_ITEMS_QUERY, { org, number });

  const project = data.organization?.projectV2;
  if (!project) {
    throw new GithubApiError(`Progetto #${number} non trovato per l'organizzazione "${org}".`);
  }

  const fields: ProjectField[] = project.fields.nodes
    .filter((f): f is NonNullable<typeof f> => !!f?.name && !!f?.dataType)
    .map((f) => ({
      id: f.id!,
      name: f.name!,
      dataType: f.dataType!,
      options: f.options?.map((o) => ({ id: o.id, name: o.name, color: o.color })),
    }));

  const statusField = fields.find((f) => f.name === STATUS_FIELD_NAME);
  const statusOptions: StatusOption[] = statusField?.options ?? [];

  const issueFieldsByName: Record<string, IssueFieldDef> = {};
  for (const f of data.organization!.issueFields.nodes) {
    if (!f?.name || !f?.dataType || !f?.id) continue;
    issueFieldsByName[f.name] = {
      id: f.id,
      name: f.name,
      dataType: f.dataType,
      options: f.options?.map((o) => ({ id: o.id, name: o.name, color: o.color })),
    };
  }

  const items: ProjectItem[] = project.items.nodes
    .filter((node) => node.content)
    .map((node) => {
      const content = node.content!;

      const fieldMap: Record<string, ItemFieldValue> = {};
      for (const raw of node.fieldValues.nodes) {
        const fieldName = fieldNameOf(raw);
        const parsed = fieldName ? parseFieldValue(raw) : null;
        if (fieldName && parsed) fieldMap[fieldName] = parsed;
      }

      const statusValue = fieldMap[STATUS_FIELD_NAME];
      const status = statusValue?.type === "singleSelect" ? statusValue.name : NO_STATUS;
      delete fieldMap[STATUS_FIELD_NAME];

      return {
        id: node.id,
        contentId: content.id ?? null,
        parentId: content.parent?.id ?? null,
        subIssuesSummary: content.subIssuesSummary ?? null,
        status,
        contentType: content.__typename,
        number: content.number ?? null,
        title: content.title,
        url: content.url ?? null,
        state: content.state ?? null,
        repository: content.repository?.name ?? null,
        repositoryOwner: content.repository?.owner.login ?? null,
        createdAt: content.createdAt ?? null,
        updatedAt: content.updatedAt ?? null,
        closedAt: content.closedAt ?? null,
        assignees: content.assignees?.nodes ?? [],
        labels: content.labels?.nodes ?? [],
        fields: fieldMap,
      };
    });

  return {
    id: project.id,
    title: project.title,
    url: project.url,
    statusFieldId: statusField?.id ?? null,
    statusOptions: statusOptions.length ? statusOptions : [{ id: "", name: NO_STATUS, color: "GRAY" }],
    fields: fields.filter((f) => f.name !== STATUS_FIELD_NAME),
    issueFieldsByName,
    items,
  };
}

export function groupItemsByStatus(project: ProjectDetail): Map<string, ProjectItem[]> {
  const map = new Map<string, ProjectItem[]>();
  for (const option of project.statusOptions) map.set(option.name, []);
  for (const item of project.items) {
    // Sub-issues are shown nested under their parent issue, not as their own row.
    if (item.parentId) continue;
    if (!map.has(item.status)) map.set(item.status, []);
    map.get(item.status)!.push(item);
  }
  return map;
}

export { NO_STATUS };

// ---------------------------------------------------------------------------
// Issue detail: full read/write view of a single issue
// ---------------------------------------------------------------------------

export interface RepoUser {
  id: string;
  login: string;
  avatarUrl: string;
}

export interface RepoLabel {
  id: string;
  name: string;
  color: string;
}

export interface RepoMilestone {
  id: string;
  title: string;
}

export interface IssueComment {
  id: string;
  body: string;
  createdAt: string;
  author: { login: string; avatarUrl: string } | null;
}

export interface SubIssueSummary {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  repository: string;
  repositoryOwner: string;
}

export interface IssueDetail {
  id: string;
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  milestone: RepoMilestone | null;
  assignees: RepoUser[];
  labels: RepoLabel[];
  comments: IssueComment[];
  subIssues: SubIssueSummary[];
  repoLabels: RepoLabel[];
  repoMilestones: RepoMilestone[];
  repoAssignableUsers: RepoUser[];
  /** Legacy numeric repository id, required by GitHub's attachment upload endpoint. */
  repositoryDatabaseId: number;
}

const ISSUE_DETAIL_QUERY = `
  query IssueDetail($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      databaseId
      issue(number: $number) {
        id
        number
        title
        body
        state
        url
        milestone { id title }
        assignees(first: 10) { nodes { id login avatarUrl } }
        labels(first: 20) { nodes { id name color } }
        comments(first: 50) { nodes { id body createdAt author { login avatarUrl } } }
        subIssues(first: 25) {
          nodes {
            id
            number
            title
            state
            url
            repository { name owner { login } }
          }
        }
      }
      labels(first: 100) { nodes { id name color } }
      milestones(first: 50, states: [OPEN]) { nodes { id title } }
      assignableUsers(first: 100) { nodes { id login avatarUrl } }
    }
  }
`;

interface RawSubIssue {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  repository: { name: string; owner: { login: string } };
}

interface RawIssueDetailResponse {
  repository: {
    databaseId: number;
    issue: {
      id: string;
      number: number;
      title: string;
      body: string;
      state: string;
      url: string;
      milestone: RepoMilestone | null;
      assignees: { nodes: RepoUser[] };
      labels: { nodes: RepoLabel[] };
      comments: { nodes: IssueComment[] };
      subIssues: { nodes: RawSubIssue[] };
    } | null;
    labels: { nodes: RepoLabel[] };
    milestones: { nodes: RepoMilestone[] };
    assignableUsers: { nodes: RepoUser[] };
  } | null;
}

export async function fetchIssueDetail(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<IssueDetail> {
  const data = await graphql<RawIssueDetailResponse>(token, ISSUE_DETAIL_QUERY, { owner, repo, number });
  const issue = data.repository?.issue;
  if (!issue) {
    throw new GithubApiError(`Issue #${number} non trovata in ${owner}/${repo}.`);
  }
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    url: issue.url,
    milestone: issue.milestone,
    assignees: issue.assignees.nodes,
    labels: issue.labels.nodes,
    comments: issue.comments.nodes,
    subIssues: issue.subIssues.nodes.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      state: s.state,
      url: s.url,
      repository: s.repository.name,
      repositoryOwner: s.repository.owner.login,
    })),
    repoLabels: data.repository!.labels.nodes,
    repoMilestones: data.repository!.milestones.nodes,
    repoAssignableUsers: data.repository!.assignableUsers.nodes,
    repositoryDatabaseId: data.repository!.databaseId,
  };
}

export async function updateIssueTitle(token: string, issueId: string, title: string): Promise<void> {
  await graphql(token, `mutation($id: ID!, $title: String!) { updateIssue(input: { id: $id, title: $title }) { clientMutationId } }`, {
    id: issueId,
    title,
  });
}

export async function updateIssueBody(token: string, issueId: string, body: string): Promise<void> {
  await graphql(token, `mutation($id: ID!, $body: String!) { updateIssue(input: { id: $id, body: $body }) { clientMutationId } }`, {
    id: issueId,
    body,
  });
}

export async function setIssueState(token: string, issueId: string, state: "OPEN" | "CLOSED"): Promise<void> {
  const mutation =
    state === "CLOSED"
      ? `mutation($id: ID!) { closeIssue(input: { issueId: $id }) { clientMutationId } }`
      : `mutation($id: ID!) { reopenIssue(input: { issueId: $id }) { clientMutationId } }`;
  await graphql(token, mutation, { id: issueId });
}

export async function setIssueMilestone(token: string, issueId: string, milestoneId: string | null): Promise<void> {
  await graphql(
    token,
    `mutation($id: ID!, $milestoneId: ID) { updateIssue(input: { id: $id, milestoneId: $milestoneId }) { clientMutationId } }`,
    { id: issueId, milestoneId },
  );
}

export async function addIssueAssignee(token: string, issueId: string, userId: string): Promise<void> {
  await graphql(
    token,
    `mutation($id: ID!, $userId: ID!) { addAssigneesToAssignable(input: { assignableId: $id, assigneeIds: [$userId] }) { clientMutationId } }`,
    { id: issueId, userId },
  );
}

export async function removeIssueAssignee(token: string, issueId: string, userId: string): Promise<void> {
  await graphql(
    token,
    `mutation($id: ID!, $userId: ID!) { removeAssigneesFromAssignable(input: { assignableId: $id, assigneeIds: [$userId] }) { clientMutationId } }`,
    { id: issueId, userId },
  );
}

export async function addIssueLabel(token: string, issueId: string, labelId: string): Promise<void> {
  await graphql(
    token,
    `mutation($id: ID!, $labelId: ID!) { addLabelsToLabelable(input: { labelableId: $id, labelIds: [$labelId] }) { clientMutationId } }`,
    { id: issueId, labelId },
  );
}

export async function removeIssueLabel(token: string, issueId: string, labelId: string): Promise<void> {
  await graphql(
    token,
    `mutation($id: ID!, $labelId: ID!) { removeLabelsFromLabelable(input: { labelableId: $id, labelIds: [$labelId] }) { clientMutationId } }`,
    { id: issueId, labelId },
  );
}

export async function addIssueComment(token: string, issueId: string, body: string): Promise<IssueComment> {
  const data = await graphql<{
    addComment: { commentEdge: { node: IssueComment } };
  }>(token, `mutation($id: ID!, $body: String!) { addComment(input: { subjectId: $id, body: $body }) { commentEdge { node { id body createdAt author { login avatarUrl } } } } }`, {
    id: issueId,
    body,
  });
  return data.addComment.commentEdge.node;
}

export async function setProjectFieldSingleSelect(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  await graphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId } }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId, optionId },
  );
}

export async function setProjectFieldDate(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  date: string,
): Promise<void> {
  await graphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
      updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { date: $date } }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId, date },
  );
}

export async function setProjectFieldText(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  text: string,
): Promise<void> {
  await graphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
      updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { text: $text } }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId, text },
  );
}

export async function setProjectFieldNumber(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
  value: number,
): Promise<void> {
  await graphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
      updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { number: $value } }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId, value },
  );
}

export async function clearProjectFieldValue(
  token: string,
  projectId: string,
  itemId: string,
  fieldId: string,
): Promise<void> {
  await graphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
      clearProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId }) {
        clientMutationId
      }
    }`,
    { projectId, itemId, fieldId },
  );
}

// ---------------------------------------------------------------------------
// Issue Fields (org-level custom fields on issues, added by GitHub in 2026 —
// distinct from ProjectV2 custom fields even though they're mirrored into
// project views). Values must be written via updateIssueFieldValue, not
// updateProjectV2ItemFieldValue.
// ---------------------------------------------------------------------------

export async function setIssueFieldSingleSelect(
  token: string,
  issueId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $fieldId: ID!, $optionId: ID!) {
      updateIssueFieldValue(input: { issueId: $issueId, issueField: { fieldId: $fieldId, singleSelectOptionId: $optionId } }) {
        clientMutationId
      }
    }`,
    { issueId, fieldId, optionId },
  );
}

export async function setIssueFieldDate(token: string, issueId: string, fieldId: string, date: string): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $fieldId: ID!, $date: String!) {
      updateIssueFieldValue(input: { issueId: $issueId, issueField: { fieldId: $fieldId, dateValue: $date } }) {
        clientMutationId
      }
    }`,
    { issueId, fieldId, date },
  );
}

export async function setIssueFieldText(token: string, issueId: string, fieldId: string, text: string): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $fieldId: ID!, $text: String!) {
      updateIssueFieldValue(input: { issueId: $issueId, issueField: { fieldId: $fieldId, textValue: $text } }) {
        clientMutationId
      }
    }`,
    { issueId, fieldId, text },
  );
}

export async function setIssueFieldNumber(token: string, issueId: string, fieldId: string, value: number): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $fieldId: ID!, $value: Float!) {
      updateIssueFieldValue(input: { issueId: $issueId, issueField: { fieldId: $fieldId, numberValue: $value } }) {
        clientMutationId
      }
    }`,
    { issueId, fieldId, value },
  );
}

export async function clearIssueFieldValue(token: string, issueId: string, fieldId: string): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $fieldId: ID!) {
      updateIssueFieldValue(input: { issueId: $issueId, issueField: { fieldId: $fieldId, delete: true } }) {
        clientMutationId
      }
    }`,
    { issueId, fieldId },
  );
}

// ---------------------------------------------------------------------------
// Creating a brand-new issue and adding it to the current project
// ---------------------------------------------------------------------------

export interface RepoSummary {
  id: string;
  databaseId: number;
  name: string;
}

const ORG_REPOS_QUERY = `
  query OrgRepos($org: String!) {
    organization(login: $org) {
      repositories(first: 100, orderBy: { field: NAME, direction: ASC }) {
        nodes { id databaseId name }
      }
    }
  }
`;

export async function fetchOrgRepos(token: string, org: string): Promise<RepoSummary[]> {
  const data = await graphql<{ organization: { repositories: { nodes: RepoSummary[] } } | null }>(
    token,
    ORG_REPOS_QUERY,
    { org },
  );
  return data.organization?.repositories.nodes ?? [];
}

export interface RepoMetadata {
  labels: RepoLabel[];
  milestones: RepoMilestone[];
  assignableUsers: RepoUser[];
}

const REPO_METADATA_QUERY = `
  query RepoMetadata($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      labels(first: 100) { nodes { id name color } }
      milestones(first: 50, states: [OPEN]) { nodes { id title } }
      assignableUsers(first: 100) { nodes { id login avatarUrl } }
    }
  }
`;

interface RawRepoMetadataResponse {
  repository: {
    labels: { nodes: RepoLabel[] };
    milestones: { nodes: RepoMilestone[] };
    assignableUsers: { nodes: RepoUser[] };
  } | null;
}

export async function fetchRepoMetadata(token: string, owner: string, repo: string): Promise<RepoMetadata> {
  const data = await graphql<RawRepoMetadataResponse>(token, REPO_METADATA_QUERY, { owner, repo });
  if (!data.repository) {
    throw new GithubApiError(`Repository ${owner}/${repo} non trovato.`);
  }
  return {
    labels: data.repository.labels.nodes,
    milestones: data.repository.milestones.nodes,
    assignableUsers: data.repository.assignableUsers.nodes,
  };
}

export interface CreatedIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  repository: string;
  repositoryOwner: string;
}

interface RawCreateIssueResponse {
  createIssue: {
    issue: {
      id: string;
      number: number;
      title: string;
      url: string;
      state: string;
      repository: { name: string; owner: { login: string } };
    };
  };
}

export async function createIssue(
  token: string,
  params: {
    repositoryId: string;
    title: string;
    body: string;
    assigneeIds: string[];
    labelIds: string[];
    milestoneId: string | null;
  },
): Promise<CreatedIssue> {
  const data = await graphql<RawCreateIssueResponse>(
    token,
    `mutation($repositoryId: ID!, $title: String!, $body: String, $assigneeIds: [ID!], $labelIds: [ID!], $milestoneId: ID) {
      createIssue(input: { repositoryId: $repositoryId, title: $title, body: $body, assigneeIds: $assigneeIds, labelIds: $labelIds, milestoneId: $milestoneId }) {
        issue {
          id
          number
          title
          url
          state
          repository { name owner { login } }
        }
      }
    }`,
    params,
  );
  const issue = data.createIssue.issue;
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    repository: issue.repository.name,
    repositoryOwner: issue.repository.owner.login,
  };
}

export async function addIssueToProject(token: string, projectId: string, contentId: string): Promise<string> {
  const data = await graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
    token,
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId },
  );
  return data.addProjectV2ItemById.item.id;
}

// ---------------------------------------------------------------------------
// Sub-issues (parent/child issue relationships)
// ---------------------------------------------------------------------------

export async function addSubIssue(token: string, issueId: string, subIssueId: string): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $subIssueId: ID!) {
      addSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
        clientMutationId
      }
    }`,
    { issueId, subIssueId },
  );
}

export async function removeSubIssue(token: string, issueId: string, subIssueId: string): Promise<void> {
  await graphql(
    token,
    `mutation($issueId: ID!, $subIssueId: ID!) {
      removeSubIssue(input: { issueId: $issueId, subIssueId: $subIssueId }) {
        clientMutationId
      }
    }`,
    { issueId, subIssueId },
  );
}

export async function fetchIssueByNumber(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<SubIssueSummary> {
  const data = await graphql<{
    repository: { issue: { id: string; number: number; title: string; state: string; url: string } | null } | null;
  }>(
    token,
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) { id number title state url }
      }
    }`,
    { owner, repo, number },
  );
  const issue = data.repository?.issue;
  if (!issue) {
    throw new GithubApiError(`Issue #${number} non trovata in ${owner}/${repo}.`);
  }
  return { ...issue, repository: repo, repositoryOwner: owner };
}

// ---------------------------------------------------------------------------
// Image attachments. GitHub has no public/documented API for this — this
// calls the same undocumented endpoint the github.com web editor itself uses
// for drag-and-drop image uploads. It works today and behaves exactly like a
// native attachment (including on private repos), but it's an internal
// implementation detail we don't control: GitHub could change or remove it
// without notice.
// ---------------------------------------------------------------------------

function extractAttachmentUrl(data: unknown): string | null {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const direct = obj.href ?? obj.url ?? (obj.asset as Record<string, unknown> | undefined)?.href;
    if (typeof direct === "string") return direct;
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  }
  return null;
}

export async function uploadImageAttachment(
  token: string,
  repositoryDatabaseId: number,
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<string> {
  const params = new URLSearchParams({
    name: fileName,
    content_type: contentType,
    repository_id: String(repositoryDatabaseId),
  });

  const res = await tauriFetch(`https://uploads.github.com/user-attachments/assets?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": contentType,
    },
    body: bytes,
  });

  if (!res.ok) {
    throw new GithubApiError(
      `Upload immagine non riuscito (${res.status}). Questo endpoint non è ufficiale e potrebbe essere cambiato lato GitHub.`,
      res.status,
    );
  }

  const data = await res.json();
  const url = extractAttachmentUrl(data);
  if (!url) {
    throw new GithubApiError("Risposta inattesa dal servizio di upload immagini di GitHub.");
  }
  return url;
}
