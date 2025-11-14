import type { ProviderAdapter, ProviderGenerateOptions, ToolDefinition } from "./types";

const ensureBaseUrl = (baseUrl?: string) => (baseUrl?.replace(/\/$/, "") || "https://api.groq.com/openai/v1");

const mapTools = (tools: ToolDefinition[] = []) => {
  if (!tools.length) return undefined;
  return tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: `Invoke ${tool.name}`,
      parameters: { type: "object", properties: {}, additionalProperties: true }
    }
  }));
};

export const groqAdapter: ProviderAdapter = {
  async generate(options: ProviderGenerateOptions): Promise<Response> {
    const { model, apiKey, input, tools, stream = true, baseUrl } = options;
    if (!apiKey) {
      throw new Error("Missing Groq API key");
    }
    const url = `${ensureBaseUrl(baseUrl)}/chat/completions`;
    const body = {
      model,
      messages: [{ role: "user", content: input }],
      stream,
      tools: mapTools(tools)
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    return response;
  }
};
