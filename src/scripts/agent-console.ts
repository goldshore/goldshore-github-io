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
      let resolvedEndpoint: URL | null = null;

      try {
        resolvedEndpoint = new URL(agentPlanEndpoint, window.location.origin);
      } catch (error) {
        console.warn('Unable to resolve agent plan endpoint', agentPlanEndpoint, error);
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

      const endpoint = resolvedEndpoint ? resolvedEndpoint.toString() : agentPlanEndpoint;
      const response = await fetch(endpoint, requestInit);

      if (!response.ok) {
        const detail = await response.text();
        resultNode.textContent = `API error ${response.status}: ${detail || response.statusText}`;
        return;
      }

      const payload = await response.json();
      resultNode.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      console.error(error);
      resultNode.textContent = `Request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
});
