export interface AccessPolicy {
  name: string;
  precedence?: number;
  decision: string;
  include: Array<Record<string, any>>;
  require?: Array<Record<string, any>>;
  exclude?: Array<Record<string, any>>;
  approval_groups?: Array<Record<string, any>>;
}

export interface AccessApplicationSpec {
  name: string;
  domain: string;
  aud: string;
  session_duration?: string;
  policies?: AccessPolicy[];
}

export interface PagesEnvironmentSpec {
  env_vars?: Record<string, string>;
  secrets?: Record<string, string>;
}

export interface PagesProjectSpec {
  project: string;
  environments: Record<string, PagesEnvironmentSpec>;
}

export interface WorkerRouteSpec {
  script: string;
  routes: string[];
}

export interface DnsRecordSpec {
  name: string;
  type: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
}

export interface CloudflareDesiredState {
  accessApplications: AccessApplicationSpec[];
  pages: PagesProjectSpec[];
  workerRoutes: WorkerRouteSpec[];
  dnsRecords: DnsRecordSpec[];
}

export interface ConfigLoaderEnv {
  CONFIG_KV?: KVNamespace;
  ENV_BUNDLE_JSON?: string;
}

const normalizePolicies = (policies: any): AccessPolicy[] => {
  if (!Array.isArray(policies)) return [];
  return policies.map((policy) => ({
    name: String(policy.name ?? "Unnamed Policy"),
    precedence: policy.precedence,
    decision: String(policy.decision ?? "allow"),
    include: Array.isArray(policy.include) ? policy.include : [],
    require: Array.isArray(policy.require) ? policy.require : undefined,
    exclude: Array.isArray(policy.exclude) ? policy.exclude : undefined,
    approval_groups: Array.isArray(policy.approval_groups) ? policy.approval_groups : undefined,
  }));
};

const normalizeAccessApps = (bundle: any): AccessApplicationSpec[] => {
  const apps = bundle?.access_applications ?? bundle?.accessApps ?? [];
  if (!Array.isArray(apps)) return [];
  return apps.map((app: any) => ({
    name: String(app.name ?? ""),
    domain: String(app.domain ?? ""),
    aud: String(app.aud ?? app.audience ?? ""),
    session_duration: app.session_duration ? String(app.session_duration) : undefined,
    policies: normalizePolicies(app.policies),
  })).filter((app) => app.name && app.domain && app.aud);
};

const normalizePages = (bundle: any): PagesProjectSpec[] => {
  const projects = bundle?.pages_projects ?? bundle?.pages ?? [];
  if (!Array.isArray(projects)) return [];
  return projects
    .map((project: any) => {
      const name = String(project.name ?? project.project ?? "");
      const configs = project.deployment_configs ?? project.environments ?? {};
      const environments: Record<string, PagesEnvironmentSpec> = {};
      if (configs && typeof configs === "object") {
        for (const [envName, cfg] of Object.entries<any>(configs)) {
          const envVars = cfg?.environment_variables ?? cfg?.env_vars ?? {};
          const secrets = cfg?.secrets ?? {};
          environments[envName] = {
            env_vars: envVars && typeof envVars === "object" ? normalizeStringRecord(envVars) : {},
            secrets: secrets && typeof secrets === "object" ? normalizeStringRecord(secrets) : undefined,
          };
        }
      }
      return { project: name, environments };
    })
    .filter((project: PagesProjectSpec) => !!project.project);
};

const normalizeWorkerRoutes = (bundle: any): WorkerRouteSpec[] => {
  const workers = bundle?.workers ?? bundle?.worker_routes ?? [];
  if (Array.isArray(bundle?.worker_routes)) {
    return bundle.worker_routes
      .map((route: any) => ({
        script: String(route.script ?? route.worker ?? ""),
        routes: Array.isArray(route.routes) ? route.routes.map((r: any) => String(r)) : [],
      }))
      .filter((route) => route.script && route.routes.length);
  }

  if (!Array.isArray(workers)) return [];

  return workers
    .map((worker: any) => ({
      script: String(worker.name ?? worker.script ?? ""),
      routes: Array.isArray(worker.routes) ? worker.routes.map((r: any) => String(r)) : [],
    }))
    .filter((worker) => worker.script && worker.routes.length);
};

const normalizeDnsRecords = (bundle: any): DnsRecordSpec[] => {
  const records = bundle?.dns_records ?? bundle?.dnsRecords ?? [];
  if (!Array.isArray(records)) return [];
  return records
    .map((record: any) => ({
      name: String(record.name ?? ""),
      type: String(record.type ?? "A"),
      content: String(record.content ?? record.value ?? ""),
      ttl: record.ttl !== undefined ? Number(record.ttl) : undefined,
      proxied: record.proxied !== undefined ? Boolean(record.proxied) : undefined,
      priority: record.priority !== undefined ? Number(record.priority) : undefined,
      comment: record.comment !== undefined ? String(record.comment) : undefined,
    }))
    .filter((record) => record.name && record.content && record.type);
};

const normalizeStringRecord = (input: Record<string, any>): Record<string, string> => {
  const entries = Object.entries(input).map(([key, value]) => [key, value != null ? String(value) : ""] as const);
  return Object.fromEntries(entries);
};

const parseBundle = (raw: string): any => {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Failed to parse Cloudflare configuration bundle");
  }
};

export const loadDesiredState = async (env: ConfigLoaderEnv): Promise<CloudflareDesiredState> => {
  let raw = env.ENV_BUNDLE_JSON ?? null;
  if (env.CONFIG_KV) {
    const kvValue = await env.CONFIG_KV.get("env.bundle");
    if (kvValue) raw = kvValue;
  }

  if (!raw) {
    throw new Error("Missing Cloudflare configuration bundle (env.bundle)");
  }

  const bundle = parseBundle(raw);
  const cloudflareSection = bundle.cloudflare ?? bundle;

  return {
    accessApplications: normalizeAccessApps(cloudflareSection),
    pages: normalizePages(cloudflareSection),
    workerRoutes: normalizeWorkerRoutes(cloudflareSection),
    dnsRecords: normalizeDnsRecords(cloudflareSection),
  };
};

