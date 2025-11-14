import type { ProviderAdapter, ProviderGenerateOptions } from "./types";

const ensureBaseUrl = (baseUrl?: string) => (baseUrl?.replace(/\/$/, "") || "http://127.0.0.1:11434");

export const localAdapter: ProviderAdapter = {
  async generate(options: ProviderGenerateOptions): Promise<Response> {
    const { model, input, stream = true, baseUrl } = options;
    const url = `${ensureBaseUrl(baseUrl)}/api/generate`;
    const body = {
      model,
      prompt: input,
      stream
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
