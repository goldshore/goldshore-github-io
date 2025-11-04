export interface GitHubWebhookRequest {
  id: string;
  event: string;
  signature: string | null;
  deliveryTimestamp?: string | null;
  payload: any;
  rawBody: string;
}

export class GitHubWebhookError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GitHubWebhookError";
    this.status = status;
  }
}

const REQUIRED_HEADERS: Record<string, string> = {
  "x-github-delivery": "Missing X-GitHub-Delivery header",
  "x-github-event": "Missing X-GitHub-Event header",
};

export const parseGitHubWebhook = async (req: Request): Promise<GitHubWebhookRequest> => {
  for (const [header, message] of Object.entries(REQUIRED_HEADERS)) {
    if (!req.headers.get(header)) {
      throw new GitHubWebhookError(message, 400);
    }
  }

  const delivery = req.headers.get("x-github-delivery")!;
  const event = req.headers.get("x-github-event")!;
  const signature = req.headers.get("x-hub-signature-256");
  const deliveryTimestamp = req.headers.get("x-github-delivery-timestamp");

  const rawBody = await req.text();
  if (!rawBody) {
    throw new GitHubWebhookError("Empty webhook payload", 400);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    throw new GitHubWebhookError("Invalid JSON payload", 400);
  }

  return {
    id: delivery,
    event,
    signature,
    deliveryTimestamp,
    payload,
    rawBody,
  };
};

export const extractRefName = (payload: any): string | null => {
  if (!payload || typeof payload.ref !== "string") return null;
  const ref = payload.ref;
  if (!ref.startsWith("refs/")) return null;
  const parts = ref.split("/");
  return parts.length >= 3 ? parts.slice(2).join("/") : null;
};

