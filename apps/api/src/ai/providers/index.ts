import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { groqAdapter } from "./groq";
import { localAdapter } from "./local";
import { openaiAdapter } from "./openai";
import type { ProviderAdapter } from "./types";

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  groq: groqAdapter,
  local: localAdapter
};

export const getAdapter = (name: string): ProviderAdapter => {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${name}`);
  }
  return adapter;
};
