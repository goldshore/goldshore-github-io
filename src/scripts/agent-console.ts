import { buildApiUrl } from '../lib/api';

const agentPlanEndpoint = buildApiUrl('/agent/plan');

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector<HTMLFormElement>('#agentForm');
  const input = document.querySelector<HTMLInputElement>('#goal');
  const resultNode = document.querySelector<HTMLElement>('#result');

  if (!form || !input || !resultNode) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const goal = input.value.trim();

    if (!goal) {
      resultNode.textContent = 'Enter a goal to generate a plan.';
      return;
    }

    resultNode.textContent = 'Planning…';

    try {
      const endpointAttr = form.getAttribute('data-endpoint');
      const requestedEndpoint = endpointAttr && endpointAttr.trim().length > 0 ? endpointAttr.trim() : agentPlanEndpoint;
      let resolvedEndpoint: URL | null = null;

      try {
        resolvedEndpoint = new URL(requestedEndpoint, window.location.origin);
      } catch (error) {
        console.warn('Unable to resolve agent plan endpoint', requestedEndpoint, error);
      }

      const requestInit: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      };

      const explicitCredentials = form.getAttribute('data-credentials');

      if (
        explicitCredentials === 'include' ||
        explicitCredentials === 'same-origin' ||
        explicitCredentials === 'omit'
      ) {
        requestInit.credentials = explicitCredentials;
      } else if (form.hasAttribute('data-include-credentials')) {
        requestInit.credentials = 'include';
      } else if (resolvedEndpoint && resolvedEndpoint.origin === window.location.origin) {
        requestInit.credentials = 'same-origin';
      }

      const endpoint = resolvedEndpoint ? resolvedEndpoint.toString() : requestedEndpoint;
      const response = await fetch(endpoint, requestInit);

      if (!response.ok) {
        const detail = await response.text();
        resultNode.textContent = `API error ${response.status}: ${detail || response.statusText}`;
        return;
      }

      const payload = await response.json();

      if (!payload || typeof payload !== 'object') {
        resultNode.textContent = 'Unexpected response format from API.';
        return;
      }

      const body = payload as {
        ok?: unknown;
        data?: unknown;
        hint?: unknown;
        error?: unknown;
      };

      if (body.ok !== true) {
        const hint = typeof body.hint === 'string' ? body.hint : 'Unknown error. Check server logs.';
        const error = typeof body.error === 'string' ? body.error : 'ERROR';
        resultNode.textContent = `Request failed (${error}): ${hint}`;
        return;
      }

      const data = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : null;

      if (!data) {
        resultNode.textContent = 'Missing data in API response.';
        return;
      }

      const plan = Array.isArray(data.plan) ? data.plan.filter((step): step is string => typeof step === 'string') : null;
      const mode = typeof data.mode === 'string' ? data.mode : null;
      const goalEcho = typeof data.goal === 'string' ? data.goal : null;
      const hint = typeof body.hint === 'string' ? body.hint : null;

      const lines: string[] = [];

      if (goalEcho) {
        lines.push(`Goal: ${goalEcho}`);
      }

      if (mode) {
        lines.push(`Mode: ${mode}`);
      }

      if (plan && plan.length > 0) {
        lines.push('', 'Plan steps:');
        plan.forEach((step, index) => {
          lines.push(`${index + 1}. ${step}`);
        });
      } else {
        lines.push('', 'No plan steps returned.');
      }

      if (hint) {
        lines.push('', `Hint: ${hint}`);
      }

      resultNode.textContent = lines.join('\n');
    } catch (error) {
      console.error(error);
      resultNode.textContent = `Request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
});
