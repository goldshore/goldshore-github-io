import type { ProviderAdapter, ProviderGenerateOptions, ToolDefinition } from "./types";

const ensureBaseUrl = (baseUrl?: string) => (baseUrl?.replace(/\/$/, "") || "https://api.anthropic.com");

const mapTools = (tools: ToolDefinition[] = []) => {
  if (!tools.length) return undefined;
  return tools.map(tool => ({
    name: tool.name,
    description: `Invoke ${tool.name}`,
    input_schema: { type: "object", properties: {}, additionalProperties: true }
  }));
};

export const anthropicAdapter: ProviderAdapter = {
  async generate(options: ProviderGenerateOptions): Promise<Response> {
    const { model, apiKey, input, tools = [], stream = true, baseUrl } = options;
    if (!apiKey) {
      throw new Error("Missing Anthropic API key");
    }
    const url = `${ensureBaseUrl(baseUrl)}/v1/messages`;
    const body = {
      model,
      system: "You are Goldshore's assistant orchestrator.",
      messages: [{ role: "user", content: input }],
      stream,
      tools: mapTools(tools)
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body)
    });
    return response;
  }
};
