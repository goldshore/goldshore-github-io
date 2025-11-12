import type {
  AccessApplicationSpec,
  CloudflareDesiredState,
  DnsRecordSpec,
  PagesProjectSpec,
  WorkerRouteSpec,
} from "./config";

export interface CloudflareEnv {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID: string;
}

type FetchLike = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code?: number; message: string }>;
  result: T;
}

const API_BASE = "https://api.cloudflare.com/client/v4";

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const cfFetch = async <T>(
  env: CloudflareEnv,
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = defaultFetch
): Promise<T> => {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      ...(init.headers || {}),
    },
  });

  const json = (await res.json()) as CloudflareResponse<T>;
  if (!res.ok || !json.success) {
    const message = json?.errors?.map((e) => e.message).join(", ") || res.statusText;
    throw new Error(`Cloudflare API error (${path}): ${message}`);
  }
  return json.result;
};

const reconcileAccessApps = async (
  env: CloudflareEnv,
  apps: AccessApplicationSpec[],
  fetchImpl: FetchLike
) => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const existing = await cfFetch<any[]>(env, `/accounts/${accountId}/access/apps`, {}, fetchImpl);

  const desiredByDomain = new Map(apps.map((app) => [app.domain, app]));
  const existingByDomain = new Map(
    (existing || []).map((app: any) => [String(app.domain), app])
  );

  for (const app of apps) {
    const payload = {
      name: app.name,
      domain: app.domain,
      session_duration: app.session_duration ?? "720h",
      type: "self_hosted",
      aud: app.aud,
      policies: app.policies ?? [],
    };

    const match = existingByDomain.get(app.domain);
    if (match) {
      await cfFetch(env, `/accounts/${accountId}/access/apps/${match.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }, fetchImpl);
    } else {
      await cfFetch(env, `/accounts/${accountId}/access/apps`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, fetchImpl);
    }
  }

  for (const app of existing || []) {
    if (!desiredByDomain.has(String(app.domain))) {
      await cfFetch(env, `/accounts/${accountId}/access/apps/${app.id}`, {
        method: "DELETE",
      }, fetchImpl);
    }
  }
};

const formatPagesVariables = (vars: Record<string, string> | undefined) => {
  if (!vars) return undefined;
  const formatted: Record<string, { value: string; type: "plain_text" }> = {};
  for (const [key, value] of Object.entries(vars)) {
    formatted[key] = { value, type: "plain_text" };
  }
  return formatted;
};

const reconcilePages = async (
  env: CloudflareEnv,
  projects: PagesProjectSpec[],
  fetchImpl: FetchLike
) => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  for (const project of projects) {
    for (const [envName, cfg] of Object.entries(project.environments)) {
      const body: Record<string, any> = {};
      const variables = formatPagesVariables(cfg.env_vars);
      if (variables) {
        body.environment_variables = variables;
      }
      if (cfg.secrets) {
        body.secrets = cfg.secrets;
      }
      if (!Object.keys(body).length) continue;

      await cfFetch(env, `/accounts/${accountId}/pages/projects/${project.project}/deployment_configs/${envName}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }, fetchImpl);
    }
  }
};

const reconcileWorkerRoutes = async (
  env: CloudflareEnv,
  workerRoutes: WorkerRouteSpec[],
  fetchImpl: FetchLike
) => {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const existing = await cfFetch<any[]>(env, `/zones/${zoneId}/workers/routes`, {}, fetchImpl);

  const desiredEntries = workerRoutes.flatMap((worker) =>
    worker.routes.map((pattern) => ({ pattern, script: worker.script }))
  );

  const desiredMap = new Map(desiredEntries.map((entry) => [entry.pattern, entry]));
  const existingMap = new Map(
    (existing || []).map((route: any) => [String(route.pattern), route])
  );

  for (const [pattern, entry] of desiredMap.entries()) {
    const match = existingMap.get(pattern);
    if (match) {
      if (match.script !== entry.script) {
        await cfFetch(env, `/zones/${zoneId}/workers/routes/${match.id}`, {
          method: "PUT",
          body: JSON.stringify({ pattern, script: entry.script }),
        }, fetchImpl);
      }
    } else {
      await cfFetch(env, `/zones/${zoneId}/workers/routes`, {
        method: "POST",
        body: JSON.stringify({ pattern, script: entry.script }),
      }, fetchImpl);
    }
  }

  for (const route of existing || []) {
    if (!desiredMap.has(String(route.pattern))) {
      await cfFetch(env, `/zones/${zoneId}/workers/routes/${route.id}`, {
        method: "DELETE",
      }, fetchImpl);
    }
  }
};

const recordsEqual = (desired: DnsRecordSpec, current: any): boolean => {
  const sameContent = String(current.content) === desired.content;
  const sameProxied =
    desired.proxied === undefined ? true : Boolean(current.proxied) === Boolean(desired.proxied);
  const sameTTL = desired.ttl === undefined ? true : Number(current.ttl) === Number(desired.ttl);
  const samePriority =
    desired.priority === undefined ? true : Number(current.priority ?? 0) === Number(desired.priority);
  return sameContent && sameProxied && sameTTL && samePriority;
};

const reconcileDns = async (
  env: CloudflareEnv,
  records: DnsRecordSpec[],
  fetchImpl: FetchLike
) => {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const existing = await cfFetch<any[]>(env, `/zones/${zoneId}/dns_records?per_page=500`, {}, fetchImpl);

  const desiredMap = new Map(records.map((record) => [`${record.type}:${record.name}`, record]));
  const existingMap = new Map(
    (existing || []).map((record: any) => [`${record.type}:${record.name}`, record])
  );

  for (const record of records) {
    const key = `${record.type}:${record.name}`;
    const match = existingMap.get(key);
    const payload: any = {
      type: record.type,
      name: record.name,
      content: record.content,
    };
    if (record.ttl !== undefined) payload.ttl = record.ttl;
    if (record.proxied !== undefined) payload.proxied = record.proxied;
    if (record.priority !== undefined) payload.priority = record.priority;
    if (record.comment !== undefined) payload.comment = record.comment;

    if (match) {
      if (!recordsEqual(record, match)) {
        await cfFetch(env, `/zones/${zoneId}/dns_records/${match.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        }, fetchImpl);
      }
    } else {
      await cfFetch(env, `/zones/${zoneId}/dns_records`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, fetchImpl);
    }
  }

  for (const record of existing || []) {
    const key = `${record.type}:${record.name}`;
    if (!desiredMap.has(key)) {
      await cfFetch(env, `/zones/${zoneId}/dns_records/${record.id}`, {
        method: "DELETE",
      }, fetchImpl);
    }
  }
};

export const applyCloudflareDesiredState = async (
  env: CloudflareEnv,
  desired: CloudflareDesiredState,
  fetchImpl: FetchLike = defaultFetch
) => {
  await reconcileAccessApps(env, desired.accessApplications, fetchImpl);
  await reconcilePages(env, desired.pages, fetchImpl);
  await reconcileWorkerRoutes(env, desired.workerRoutes, fetchImpl);
  await reconcileDns(env, desired.dnsRecords, fetchImpl);
};

