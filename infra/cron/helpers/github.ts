import { Octokit } from "octokit";

export const gh = new Octokit({ auth: process.env.GH_TOKEN! });

export async function findOpenConflicts(owner: string, repo: string) {
  const prs = await gh.rest.pulls.list({ owner, repo, state: "open", per_page: 50 });
  const withConflicts: any[] = [];
  for (const pr of prs.data) {
    const details = await gh.rest.pulls.get({ owner, repo, pull_number: pr.number });
    if (details.data.mergeable_state === "dirty") withConflicts.push(pr);
  }
  return withConflicts;
}

export async function openOpsIssue(owner: string, repo: string, title: string, body: string, labels: string[] = []) {
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
  const baseRef = await gh.rest.git.getRef({ owner, repo, ref: `heads/${base}` });
  const baseSha = baseRef.data.object.sha;
  const baseCommit = await gh.rest.git.getCommit({ owner, repo, commit_sha: baseSha });
  const baseTreeSha = baseCommit.data.tree.sha;

  let headExists = true;
  try {
    await gh.rest.git.getRef({ owner, repo, ref: `heads/${head}` });
  } catch (error: any) {
    if (error?.status === 404) {
      headExists = false;
    } else {
      throw error;
    }
  }

  let existingPR: any | null = null;

  if (!headExists) {
    try {
      await gh.rest.git.createRef({ owner, repo, ref: `refs/heads/${head}`, sha: baseSha });
    } catch (error: any) {
      if (error?.status === 422) {
        headExists = true;
      } else {
        throw error;
      }
    }
  }

  if (headExists) {
    const existingPRs = await gh.rest.pulls.list({ owner, repo, state: "open", head: `${owner}:${head}`, per_page: 1 });
    if (existingPRs.data.length > 0) {
      existingPR = existingPRs.data[0];
    }
  }

  const blobs = await Promise.all(
    changes.map(c =>
      gh.rest.git.createBlob({
        owner,
        repo,
        content: c.content,
        encoding: "utf-8"
      })
    )
  );

  const tree = await gh.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: changes.map((c, i) => ({ path: c.path, mode: "100644", type: "blob", sha: blobs[i].data.sha }))
  });

  const commit = await gh.rest.git.createCommit({
    owner,
    repo,
    message: title,
    tree: tree.data.sha,
    parents: [baseSha]
  });

  await gh.rest.git.updateRef({ owner, repo, ref: `heads/${head}`, sha: commit.data.sha, force: true });

  if (existingPR) {
    await gh.rest.pulls.update({ owner, repo, pull_number: existingPR.number, title, body });
    const refreshed = await gh.rest.pulls.get({ owner, repo, pull_number: existingPR.number });
    return refreshed.data;
  }

  const pr = await gh.rest.pulls.create({ owner, repo, head, base, title, body });
  return pr.data;
}
