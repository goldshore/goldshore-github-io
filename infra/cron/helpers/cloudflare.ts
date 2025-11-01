const CF_API = "https://api.cloudflare.com/client/v4";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const getToken = () => requireEnv("CF_API_TOKEN");
const getAccount = () => requireEnv("CF_ACCOUNT_ID");
const getZone = () => requireEnv("CF_ZONE_ID");

type RequestInitWithHeaders = RequestInit & { headers?: Record<string, string> };

async function cfFetch<T>(path: string, init?: RequestInitWithHeaders): Promise<T> {
  const tok = getToken();
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`CF ${path} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.result as T;
}

export async function getPagesProjectBuildStatus(project: string) {
  type Build = { latest_stage?: { status?: string } };
  const acc = getAccount();
  const builds = await cfFetch<Build[]>(`/accounts/${acc}/pages/projects/${project}/deployments`);
  return builds[0]?.latest_stage?.status ?? "unknown";
}

export async function getDNSRecords() {
  type Rec = { id: string; name: string; type: string; content: string };
  const zone = getZone();
  return await cfFetch<Rec[]>(`/zones/${zone}/dns_records?per_page=200`);
}

export async function getWorkerBindings(script: string) {
  type Binding = { name: string; type: string };
  const acc = getAccount();
  return await cfFetch<Binding[]>(`/accounts/${acc}/workers/scripts/${script}/bindings`);
}

type WorkerRoute = { pattern: string };

function pickPrimaryRoute(routes: WorkerRoute[]): WorkerRoute {
  if (routes.length === 1) return routes[0];
  const scored = routes
    .map((route, index) => {
      const pattern = route.pattern.toLowerCase();
      const envPenalty = /preview|dev|staging|test/.test(pattern) ? 1 : 0;
      const wildcardPenalty = route.pattern.includes("*") ? 1 : 0;
      const penalty = envPenalty * 10 + wildcardPenalty;
      return { route, penalty, index };
    })
    .sort((a, b) => {
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      return a.index - b.index;
    });
  return scored[0]!.route;
}

function buildRouteURL(
  pattern: string,
  routePath: string,
  domainOverride?: string
): { url: string; host: string } {
  const ensureScheme = (input: string) => (input.includes("://") ? input : `https://${input}`);
  const sanitizeHostname = (hostname: string) => {
    const replaced = hostname.replace(/\*+/g, "wildcard");
    const collapsedDots = replaced.replace(/\.+/g, ".");
    const trimmed = collapsedDots.replace(/^\.+/, "").replace(/\.+$/, "");
    return trimmed || "wildcard";
  };

  const withScheme = ensureScheme(pattern);
  const schemeEnd = withScheme.indexOf("://") + 3;
  const remainder = withScheme.slice(schemeEnd);
  const firstSlash = remainder.indexOf("/");
  const hostPort = firstSlash === -1 ? remainder : remainder.slice(0, firstSlash);
  const rawPath = firstSlash === -1 ? "" : remainder.slice(firstSlash);

  const [rawHost, ...portParts] = hostPort.split(":");
  const port = portParts.length ? `:${portParts.join(":")}` : "";
  const hostname = sanitizeHostname(rawHost);
  const safeHost = `${hostname}${port}`;

  let path = rawPath.replace(/\*/g, "");
  path = path.replace(/\/+/g, "/");
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (!path.endsWith("/")) {
    path = `${path}/`;
  }

  const baseHost = (() => {
    if (!domainOverride) {
      return {
        origin: `${withScheme.slice(0, schemeEnd)}${safeHost}`,
        host: safeHost
      };
    }
    const overrideWithScheme = ensureScheme(domainOverride);
    const overrideURL = new URL(overrideWithScheme);
    return {
      origin: `${overrideURL.protocol}//${overrideURL.host}`,
      host: overrideURL.host
    };
  })();

  const base = new URL(`${baseHost.origin}${path}`);
  const sanitizedPath = routePath.startsWith("/") ? routePath.slice(1) : routePath;
  return { url: new URL(sanitizedPath, base).toString(), host: baseHost.host };
}

export async function fetchWorkerRoute(
  script: string,
  routePath: string,
  init?: RequestInitWithHeaders,
  domainOverride?: string
): Promise<{ url: string; response: Response }> {
  const acc = getAccount();
  const routes = await cfFetch<WorkerRoute[]>(`/accounts/${acc}/workers/scripts/${script}/routes`);
  if (!routes.length) {
    throw new Error(`No routes configured for Worker ${script}`);
  }
  const route = pickPrimaryRoute(routes);
  const { url, host } = buildRouteURL(route.pattern, routePath, domainOverride);
  const { headers: initHeaders, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "user-agent": "goldshore-agent/worker-health-check"
  };
  if (initHeaders) {
    Object.assign(headers, initHeaders);
  }
  if (domainOverride) {
    headers.host = host;
  }
  const response = await fetch(url, { ...rest, headers });
  return { url, response };
}

export async function bindPagesDomain(project: string, domain: string) {
  type DomainResponse = { domain: string; status: string };
  const acc = getAccount();
  return await cfFetch<DomainResponse>(`/accounts/${acc}/pages/projects/${project}/domains/${domain}`, {
    method: "PUT",
    body: JSON.stringify({})
  });
}

export async function triggerPagesDeployment(project: string) {
  type Deployment = { id: string };
  const acc = getAccount();
  return await cfFetch<Deployment>(`/accounts/${acc}/pages/projects/${project}/deployments`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function probeHttpsHost(host: string, init?: RequestInitWithHeaders) {
  const normalized = host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
  const { headers: initHeaders, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "user-agent": "goldshore-agent/pages-domain-probe",
    ...(initHeaders ?? {})
  };
  return await fetch(normalized, { method: "GET", ...rest, headers });
}
