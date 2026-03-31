import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types.js';
import { UpdateConfigBodySchema } from '../schemas/config.js';

const SENSITIVE_KEYS = [
  'botToken',
  'token',
  'apiKey',
  'secret',
  'password',
  'webhookSecret',
];

function redactConfig(config: unknown): unknown {
  const redacted = structuredClone(config);
  redactDeep(redacted as Record<string, unknown>);
  return redacted;
}

function redactDeep(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(key) && typeof value === 'string') {
      obj[key] = '***';
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object')
          redactDeep(item as Record<string, unknown>);
      }
    } else if (value && typeof value === 'object') {
      redactDeep(value as Record<string, unknown>);
    }
  }
}

export async function configRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  // GET /config/editable — list safe-to-edit config fields
  app.get('/editable', async () => {
    const { getSafeFields, resolveOptions, getConfigValue } = await import(
      '../../../core/config/config-registry.js'
    );
    const config = deps.core.configManager.get();
    const safeFields = getSafeFields();

    const fields = safeFields.map((def) => ({
      path: def.path,
      displayName: def.displayName,
      group: def.group,
      type: def.type,
      options: resolveOptions(def, config),
      value: getConfigValue(config, def.path),
      hotReload: def.hotReload,
    }));

    return { fields };
  });

  // GET /config/schema — get the config JSON schema
  app.get('/schema', async () => {
    const { zodToJsonSchema } = await import('zod-to-json-schema');
    const { ConfigSchema } = await import('../../../core/config/config.js');
    return zodToJsonSchema(ConfigSchema, 'OpenACPConfig');
  });

  // GET /config — get full config (redacted)
  app.get('/', async () => {
    const config = deps.core.configManager.get();
    return { config: redactConfig(config) };
  });

  // PATCH /config — update a config field
  app.patch('/', async (request, reply) => {
    const body = UpdateConfigBodySchema.parse(request.body);
    const configPath = body.path;
    const value = body.value;

    // Block prototype pollution
    const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const parts = configPath.split('.');
    if (parts.some((p) => BLOCKED_KEYS.has(p))) {
      return reply.status(400).send({ error: 'Invalid config path' });
    }

    // Enforce safe-fields scope — only fields marked 'safe' can be modified via API
    const { getFieldDef } = await import(
      '../../../core/config/config-registry.js'
    );
    const fieldDef = getFieldDef(configPath);
    if (!fieldDef || fieldDef.scope !== 'safe') {
      return reply.status(403).send({
        error: 'This config field cannot be modified via the API',
      });
    }

    // Pre-validate by cloning config and applying the change
    const currentConfig = deps.core.configManager.get();
    const cloned = structuredClone(currentConfig) as Record<string, unknown>;
    let target: Record<string, unknown> = cloned;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (
        target[part] &&
        typeof target[part] === 'object' &&
        !Array.isArray(target[part])
      ) {
        target = target[part] as Record<string, unknown>;
      } else if (target[part] === undefined || target[part] === null) {
        target[part] = {};
        target = target[part] as Record<string, unknown>;
      } else {
        return reply.status(400).send({ error: 'Invalid config path' });
      }
    }

    const lastKey = parts[parts.length - 1];
    target[lastKey] = value;

    // Validate with Zod
    const { ConfigSchema } = await import('../../../core/config/config.js');
    const result = ConfigSchema.safeParse(cloned);
    if (!result.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    // Convert dot-path to nested object for save
    const updates: Record<string, unknown> = {};
    let updateTarget = updates;
    for (let i = 0; i < parts.length - 1; i++) {
      updateTarget[parts[i]] = {};
      updateTarget = updateTarget[parts[i]] as Record<string, unknown>;
    }
    updateTarget[lastKey] = value;

    await deps.core.configManager.save(updates, configPath);

    const { isHotReloadable } = await import(
      '../../../core/config/config-registry.js'
    );
    const needsRestart = !isHotReloadable(configPath);

    return {
      ok: true,
      needsRestart,
      config: redactConfig(deps.core.configManager.get()),
    };
  });
}
