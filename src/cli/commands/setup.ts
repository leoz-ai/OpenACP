import * as fs from 'node:fs';
import * as path from 'node:path';

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

export async function cmdSetup(args: string[], instanceRoot: string): Promise<void> {
  const workspace = parseFlag(args, '--workspace');
  const agentRaw = parseFlag(args, '--agent');
  const runMode = (parseFlag(args, '--run-mode') ?? 'daemon') as 'daemon' | 'foreground';
  const json = args.includes('--json');

  if (!workspace) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: '--workspace is required' }));
    } else {
      console.error('  Error: --workspace <path> is required');
    }
    process.exit(1);
  }

  if (!agentRaw) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: '--agent is required' }));
    } else {
      console.error('  Error: --agent <name> is required');
    }
    process.exit(1);
  }

  const defaultAgent = agentRaw.split(',')[0]!.trim();

  const configPath = path.join(instanceRoot, 'config.json');

  // Read existing config if present so we don't overwrite unrelated fields
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Ignore parse errors — overwrite with fresh config
    }
  }

  const config = {
    ...existing,
    defaultAgent,
    workspace: { baseDir: workspace },
    runMode,
    autoStart: false,
  };

  fs.mkdirSync(instanceRoot, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  if (json) {
    console.log(JSON.stringify({ success: true, configPath }));
  } else {
    console.log(`\n  \x1b[32m✓ Setup complete.\x1b[0m Config written to ${configPath}\n`);
  }
}
