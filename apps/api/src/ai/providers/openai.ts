import type { ProviderAdapter, ProviderGenerateOptions, ToolDefinition } from "./types";

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

const ensureBaseUrl = (baseUrl?: string) => (baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1");

export const openaiAdapter: ProviderAdapter = {
  async generate(options: ProviderGenerateOptions): Promise<Response> {
    const { model, apiKey, input, tools, stream = true, baseUrl } = options;
    if (!apiKey) {
      throw new Error("Missing OpenAI API key");
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
