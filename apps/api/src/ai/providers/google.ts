import type { ProviderAdapter, ProviderGenerateOptions, ToolDefinition } from "./types";

const ensureBaseUrl = (baseUrl?: string) => (baseUrl?.replace(/\/$/, "") || "https://generativelanguage.googleapis.com");

const mapTools = (tools: ToolDefinition[] = []) => {
  if (!tools.length) return undefined;
  return tools.map(tool => ({
    name: tool.name,
    description: `Invoke ${tool.name}`,
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  }));
};

export const googleAdapter: ProviderAdapter = {
  async generate(options: ProviderGenerateOptions): Promise<Response> {
    const { model, apiKey, input, tools = [], stream = true, baseUrl } = options;
    if (!apiKey) {
      throw new Error("Missing Google Gemini API key");
    }
    const trimmedBase = ensureBaseUrl(baseUrl);
    const path = stream ? ":streamGenerateContent" : ":generateContent";
    const url = `${trimmedBase}/v1beta/models/${encodeURIComponent(model)}${path}?key=${apiKey}`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: input }]
        }
      ],
      tools: mapTools(tools)
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return response;
  }
};
