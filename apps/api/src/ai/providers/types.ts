export interface ToolDefinition {
  name: string;
  type: string;
  endpoint?: string;
  queue?: string;
  auth?: string;
}

export interface ProviderGenerateOptions {
  model: string;
  input: string;
  apiKey?: string;
  baseUrl?: string;
  tools?: ToolDefinition[];
  stream?: boolean;
}

export interface ProviderAdapter {
  generate(options: ProviderGenerateOptions): Promise<Response>;
}
