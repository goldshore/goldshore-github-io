import { Octokit } from "octokit";

const GH_API = "https://api.github.com";
const token = process.env.GH_TOKEN;
let gh: Octokit | null = null;

function baseHeaders(): Record<string, string> {
  if (!token) throw new Error("Missing GH_TOKEN environment variable");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "goldshore-agent"
  };
}

async function ghRequest(path: string, init: RequestInit = {}) {
  const headers = baseHeaders();
  if (init.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${GH_API}${path}`, { ...init, headers });
  return res;
}

async function ghJson<T>(path: string, init: RequestInit = {}) {
  const res = await ghRequest(path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub request failed: ${res.status} ${res.statusText} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type PullRequest = {
  number: number;
  mergeable_state?: string;
};

export async function findOpenConflicts(owner: string, repo: string) {
  const prs = await ghJson<PullRequest[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`);
  const withConflicts: PullRequest[] = [];
  for (const pr of prs) {
    const details = await ghJson<PullRequest>(`/repos/${owner}/${repo}/pulls/${pr.number}`);
    if (details.mergeable_state === "dirty") withConflicts.push(details);
  }
  return withConflicts;
}

export async function openOpsIssue(owner: string, repo: string, title: string, body: string, labels: string[] = []) {
  return await ghJson(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels })
  });
}

export async function commentOnPR(owner: string, repo: string, prNumber: number, body: string) {
  await ghJson(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
  const { data } = await gh.rest.issues.create({ owner, repo, title, body, labels });
  return data;
}

export async function commentOnPR(owner: string, repo: string, prNumber: number, body: string) {
  await gh.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
}

export async function createFixBranchAndPR(
  owner: string,
  repo: string,
  base: string,
  head: string,
  title: string,
  body: string,
  changes: Array<{ path: string; content: string }>
) {
  if (!token) throw new Error("Missing GH_TOKEN environment variable");
  const client = gh ?? (gh = new Octokit({ auth: token }));

  const baseRef = await client.rest.git.getRef({ owner, repo, ref: `heads/${base}` });
  const baseSha = baseRef.data.object.sha;
  const baseCommit = await client.rest.git.getCommit({ owner, repo, commit_sha: baseSha });

  let parentSha = baseSha;
  let baseTreeSha = baseCommit.data.tree.sha;
  let branchExists = false;
  let existingPR: any | null = null;

  try {
    await client.rest.git.createRef({ owner, repo, ref: `refs/heads/${head}`, sha: baseSha });
  } catch (error: unknown) {
    if (!(error && typeof error === "object" && "status" in error)) throw error;

    const status = (error as { status?: number }).status;
    if (status !== 422) throw error;

    branchExists = true;
    const headRef = await client.rest.git.getRef({ owner, repo, ref: `heads/${head}` });
    parentSha = headRef.data.object.sha;

    const headCommit = await client.rest.git.getCommit({ owner, repo, commit_sha: parentSha });
    baseTreeSha = headCommit.data.tree.sha;

    const existingPRs = await client.rest.pulls.list({ owner, repo, state: "open", head: `${owner}:${head}`, per_page: 1 });
    if (existingPRs.data.length > 0) {
      existingPR = existingPRs.data[0];
    }
  }

  const blobs = await Promise.all(
    changes.map(c =>
      client.rest.git.createBlob({
        owner,
        repo,
        content: c.content,
        encoding: "utf-8"
      })
    )
  );

  const tree = await client.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: changes.map((c, i) => ({ path: c.path, mode: "100644", type: "blob", sha: blobs[i].data.sha }))
  });

  const commit = await client.rest.git.createCommit({
    owner,
    repo,
    message: title,
    tree: tree.data.sha,
    parents: [parentSha]
  });

  await client.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${head}`,
    sha: commit.data.sha,
    force: branchExists
  });

  if (existingPR) {
    await client.rest.pulls.update({ owner, repo, pull_number: existingPR.number, title, body });
    const refreshed = await client.rest.pulls.get({ owner, repo, pull_number: existingPR.number });
    return refreshed.data;
  }

  try {
    const pr = await client.rest.pulls.create({ owner, repo, head, base, title, body });
    return pr.data;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 422) {
      const existing = await client.rest.pulls.list({
        owner,
        repo,
        state: "open",
        head: `${owner}:${head}`,
        per_page: 1
      });
      if (existing.data.length > 0) return existing.data[0];
    }
    throw error;
  }
}
