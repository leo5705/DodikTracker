import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { systemIntegrations } from '../../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { providerManager } from '../../providers/index.ts';
import { encryptCredentials, maskApiKey } from '../../../lib/crypto.ts';
import { logAdminAction } from './auditHelper.ts';

export const integrationsRouter = Router();

// 1. GET /integrations - Return integration statuses with masked keys (NO PLAINTEXT KEYS)
integrationsRouter.get(
  '/integrations',
  requireAuth,
  requireStaff('MANAGE_SETTINGS'),
  async (_req: AuthRequest, res: Response) => {
    try {
      const allProviders = providerManager.getAllProviders();
      const dbRecords = await db.select().from(systemIntegrations);
      const dbMap = new Map(dbRecords.map((r) => [r.provider.toUpperCase(), r]));

      const result = [];

      for (const provider of allProviders) {
        const provName = provider.name.toUpperCase();
        const rec = dbMap.get(provName);

        const credData = await providerManager.getCredentialsForProvider(provider.name);
        const creds = credData.credentials || {};

        const apiKey = creds.apiKey || creds.token;
        const clientId = creds.clientId;
        const clientSecret = creds.clientSecret;

        const hasKey = Boolean(apiKey);
        const hasClientId = Boolean(clientId);
        const hasClientSecret = Boolean(clientSecret);

        const enabled = rec ? rec.enabled : (hasKey || !provider.requiresKey);

        result.push({
          provider: provider.name,
          supportedTypes: provider.supportedTypes,
          requiresKey: provider.requiresKey,
          enabled,
          hasKey: hasKey || (provider.name === 'IGDB' && hasClientId && hasClientSecret),
          hasClientId,
          hasClientSecret,
          maskedKey: apiKey ? maskApiKey(apiKey) : undefined,
          maskedClientId: clientId ? maskApiKey(clientId) : undefined,
          lastCheckedAt: rec?.lastCheckedAt ? rec.lastCheckedAt.toISOString() : undefined,
          lastError: rec?.lastError || undefined,
          priority: rec?.priority || 1,
        });
      }

      res.json(result);
    } catch (err: any) {
      console.error('[Integrations Router] GET error:', err);
      res.status(500).json({ error: 'Ошибка получения списка интеграций' });
    }
  }
);

// 2. POST /integrations - Save/Update API key, toggle enabled status, or remove key
integrationsRouter.post(
  '/integrations',
  requireAuth,
  requireStaff('MANAGE_SETTINGS'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { provider: rawProvider, apiKey, clientId, clientSecret, enabled, removeKey } = req.body;

      if (!rawProvider || typeof rawProvider !== 'string') {
        return res.status(400).json({ error: 'Укажите наименование провайдера' });
      }

      const provObj = providerManager.getProvider(rawProvider);
      if (!provObj) {
        return res.status(400).json({ error: `Провайдер ${rawProvider} не поддерживается` });
      }

      const providerName = provObj.name.toUpperCase();

      const [existingRec] = await db
        .select()
        .from(systemIntegrations)
        .where(eq(systemIntegrations.provider, providerName))
        .limit(1);

      // Action 1: Remove Key
      if (removeKey) {
        const emptyEncrypted = encryptCredentials({});
        if (existingRec) {
          await db
            .update(systemIntegrations)
            .set({
              encryptedCredentials: emptyEncrypted,
              enabled: false,
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(systemIntegrations.id, existingRec.id));
        } else {
          await db.insert(systemIntegrations).values({
            provider: providerName,
            enabled: false,
            encryptedCredentials: emptyEncrypted,
            priority: 1,
          });
        }

        providerManager.clearCache();
        await logAdminAction({
          userId: req.user!.id,
          action: 'DELETE_INTEGRATION_KEY',
          details: `Удален ключ для провайдера ${providerName}`,
        });

        return res.json({ success: true, message: `Ключи для ${providerName} удалены` });
      }

      // Action 2: Save or Update Key
      if (apiKey !== undefined || clientId !== undefined || clientSecret !== undefined) {
        let credsToSave: Record<string, any> = {};

        if (providerName === 'IGDB') {
          let cId = clientId;
          let cSec = clientSecret;
          if (apiKey && typeof apiKey === 'string' && apiKey.includes(':')) {
            const parts = apiKey.split(':');
            cId = parts[0].trim();
            cSec = parts.slice(1).join(':').trim();
          } else if (apiKey && typeof apiKey === 'string') {
            cId = apiKey.trim();
          }
          credsToSave = { clientId: cId, clientSecret: cSec, apiKey };
        } else {
          const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
          if (!trimmedKey) {
            return res.status(400).json({ error: 'API ключ не может быть пустым' });
          }
          credsToSave = { apiKey: trimmedKey };
        }

        // Test credentials before persisting
        const healthResult = await providerManager.healthCheck(providerName, credsToSave);

        const encrypted = encryptCredentials(credsToSave);
        const isEnabled = enabled !== undefined ? Boolean(enabled) : true;

        if (existingRec) {
          await db
            .update(systemIntegrations)
            .set({
              enabled: isEnabled,
              encryptedCredentials: encrypted,
              lastCheckedAt: new Date(),
              lastError: healthResult.ok ? null : (healthResult.error || 'Ошибка проверки ключа'),
              updatedAt: new Date(),
            })
            .where(eq(systemIntegrations.id, existingRec.id));
        } else {
          await db.insert(systemIntegrations).values({
            provider: providerName,
            enabled: isEnabled,
            encryptedCredentials: encrypted,
            priority: 1,
            lastCheckedAt: new Date(),
            lastError: healthResult.ok ? null : (healthResult.error || 'Ошибка проверки ключа'),
          });
        }

        providerManager.clearCache();
        await logAdminAction({
          userId: req.user!.id,
          action: 'UPDATE_INTEGRATION_KEY',
          details: `Обновлен ключ для ${providerName}. Проверка: ${healthResult.ok ? 'успешно' : 'ошибка'}`,
        });

        return res.json({
          success: true,
          provider: providerName,
          health: healthResult,
        });
      }

      // Action 3: Toggle Enabled status only
      if (enabled !== undefined) {
        const isEnabled = Boolean(enabled);
        if (existingRec) {
          await db
            .update(systemIntegrations)
            .set({ enabled: isEnabled, updatedAt: new Date() })
            .where(eq(systemIntegrations.id, existingRec.id));
        } else {
          const emptyEncrypted = encryptCredentials({});
          await db.insert(systemIntegrations).values({
            provider: providerName,
            enabled: isEnabled,
            encryptedCredentials: emptyEncrypted,
            priority: 1,
          });
        }

        providerManager.clearCache();
        await logAdminAction({
          userId: req.user!.id,
          action: 'TOGGLE_INTEGRATION',
          details: `Изменен статус ${providerName}: ${isEnabled ? 'включен' : 'выключен'}`,
        });

        return res.json({ success: true, enabled: isEnabled });
      }

      return res.status(400).json({ error: 'Не переданы параметры для обновления' });
    } catch (err: any) {
      console.error('[Integrations Router] POST error:', err);
      res.status(500).json({ error: err.message || 'Ошибка сохранения интеграции' });
    }
  }
);

// 3. POST /integrations/health-check - Live connection test
integrationsRouter.post(
  '/integrations/health-check',
  requireAuth,
  requireStaff('MANAGE_SETTINGS'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { provider: rawProvider } = req.body;
      if (!rawProvider) {
        return res.status(400).json({ error: 'Укажите провайдер для проверки' });
      }

      const provObj = providerManager.getProvider(rawProvider);
      if (!provObj) {
        return res.status(400).json({ error: `Провайдер ${rawProvider} не найден` });
      }

      const providerName = provObj.name.toUpperCase();

      const credData = await providerManager.getCredentialsForProvider(providerName);
      const creds = credData.credentials;

      const healthResult = await providerManager.healthCheck(providerName, creds);

      const [existingRec] = await db
        .select()
        .from(systemIntegrations)
        .where(eq(systemIntegrations.provider, providerName))
        .limit(1);

      if (existingRec) {
        await db
          .update(systemIntegrations)
          .set({
            lastCheckedAt: new Date(),
            lastError: healthResult.ok ? null : (healthResult.error || 'Ошибка подключения'),
            updatedAt: new Date(),
          })
          .where(eq(systemIntegrations.id, existingRec.id));
      }

      res.json(healthResult);
    } catch (err: any) {
      console.error('[Integrations Router] Health Check error:', err);
      res.status(500).json({ ok: false, latencyMs: 0, error: err.message || 'Ошибка проверки соединения' });
    }
  }
);

export default integrationsRouter;
