import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const requiredEnvVars = [
  'GOLDSHORE_D1_DATABASE_ID',
  'AGENT_PROMPT_KV_ID',
];

const missing = requiredEnvVars.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const templatePath = join(__dirname, '..', 'wrangler.template.toml');
const outputPath = join(__dirname, '..', '.wrangler.resolved.toml');

const template = readFileSync(templatePath, 'utf8');
let resolved = template;

for (const name of requiredEnvVars) {
  const value = process.env[name];
  const placeholder = '${' + name + '}';
  resolved = resolved.split(placeholder).join(value);
}

writeFileSync(outputPath, resolved);

console.log(`Resolved Wrangler config written to ${outputPath}`);
