import { db } from '../../../db/index.ts';
import { systemSettings, systemIntegrations } from '../../../db/schema.ts';
import { decryptCredentials } from '../../../lib/crypto.ts';
import { eq } from 'drizzle-orm';

export interface ProviderHealth {
  id: string;
  name: string;
  type: 'catalog' | 'lyrics';
  description: string;
  enabled: boolean;
  requiresKey: boolean;
  hasKey: boolean;
  maskedKey?: string;
  status: 'connected' | 'error' | 'disabled' | 'unconfigured';
  lastCheckedAt?: string | null;
  lastError?: string | null;
  latencyMs?: number | null;
}

export interface ProviderMetrics {
  searches24h: number;
  successfulQueries: number;
  providerErrors: number;
  lyricsMatches: number;
  lyricsMisses: number;
  cacheHits: number;
  cacheMisses: number;
}

export function maskApiKey(key?: string | null): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '••••••••';
  const tail = trimmed.slice(-4);
  return `••••••••${tail}`;
}

class ExternalMusicConfigService {
  private inMemoryKeys = new Map<string, string>();
  private inMemoryEnabled = new Map<string, boolean>();
  private healthState = new Map<string, { lastCheckedAt: string | null; lastError: string | null; latencyMs: number | null }>();
  private isInitialized = false;

  private metrics: ProviderMetrics = {
    searches24h: 0,
    successfulQueries: 0,
    providerErrors: 0,
    lyricsMatches: 0,
    lyricsMisses: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor() {
    // Default initial states
    this.inMemoryEnabled.set('youtube', true);
    this.inMemoryEnabled.set('genius', false);

    // Seed from process.env if available
    if (process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_KEY) {
      const envKey = (process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_KEY || '').trim();
      this.inMemoryKeys.set('genius', envKey);
      this.inMemoryEnabled.set('genius', true);
    }
  }

  /**
   * Initializes state from systemIntegrations in PostgreSQL
   */
  public async initialize(): Promise<void> {
    try {
      // Primary source of truth: systemIntegrations
      const intRows = await db.select().from(systemIntegrations);
      
      // Clear before reload
      this.inMemoryEnabled.clear();
      this.inMemoryKeys.clear();
      
      // Defaults
      this.inMemoryEnabled.set('youtube', true);
      this.inMemoryEnabled.set('genius', false);

      for (const row of intRows) {
        const prov = row.provider.toUpperCase();
        let creds: Record<string, any> = {};
        if (row.encryptedCredentials && row.encryptedCredentials.trim()) {
          try {
            creds = decryptCredentials(row.encryptedCredentials) || {};
          } catch {
            // ignore
          }
        }

        if (prov === 'YOUTUBE' || prov === 'YOUTUBE MUSIC' || prov === 'YOUTUBE_MUSIC') {
          this.inMemoryEnabled.set('youtube', row.enabled);
        } else if (prov === 'GENIUS') {
          this.inMemoryEnabled.set('genius', row.enabled);
          const tok = creds.apiKey || creds.token;
          if (tok) this.inMemoryKeys.set('genius', String(tok).trim());
        }
      }

      // Seed from process.env if available and not set from DB
      if (!this.inMemoryKeys.has('genius') && (process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_KEY)) {
        const envKey = (process.env.GENIUS_ACCESS_TOKEN || process.env.GENIUS_API_KEY || '').trim();
        this.inMemoryKeys.set('genius', envKey);
        if (!this.inMemoryEnabled.has('genius')) this.inMemoryEnabled.set('genius', true);
      }

      this.isInitialized = true;
    } catch (err) {
      console.warn('[ExternalMusicConfig] Database sync warning, using in-memory fallbacks:', err);
    }
  }

  public isCatalogEnabled(providerId = 'youtube'): boolean {
    return this.inMemoryEnabled.get(providerId) ?? true;
  }

  public isLyricsEnabled(providerId = 'genius'): boolean {
    const hasKey = Boolean(this.getApiKey(providerId));
    if (providerId === 'genius') {
      // If a valid key exists, Genius is enabled unless explicitly set to false
      return hasKey && (this.inMemoryEnabled.get('genius') ?? true);
    }
    return this.inMemoryEnabled.get(providerId) ?? false;
  }

  public getApiKey(providerId: string): string | null {
    if (!this.isInitialized && !this.inMemoryKeys.has(providerId)) {
      // Fire async init in background if not initialized
      this.initialize().catch(() => {});
    }
    return this.inMemoryKeys.get(providerId) || null;
  }

  public recordHealth(providerId: string, ok: boolean, error?: string | null, latencyMs?: number | null) {
    this.healthState.set(providerId, {
      lastCheckedAt: new Date().toISOString(),
      lastError: ok ? null : error || 'Connection error',
      latencyMs: latencyMs ?? null,
    });
  }

  public recordSearch(success: boolean) {
    this.metrics.searches24h++;
    if (success) {
      this.metrics.successfulQueries++;
    } else {
      this.metrics.providerErrors++;
    }
  }

  public recordLyrics(matched: boolean) {
    if (matched) {
      this.metrics.lyricsMatches++;
    } else {
      this.metrics.lyricsMisses++;
    }
  }

  public recordCache(hit: boolean) {
    this.metrics.cacheHits++;
  }

  public async getProvidersHealth(): Promise<{ catalog: ProviderHealth[]; lyrics: ProviderHealth[]; stats: ProviderMetrics }> {
    await this.initialize();

    // 1. YouTube Catalog Provider
    const ytEnabled = this.isCatalogEnabled('youtube');
    const ytHealth = this.healthState.get('youtube');

    const catalogProviders: ProviderHealth[] = [
      {
        id: 'youtube',
        name: 'YouTube Music',
        type: 'catalog',
        description: 'Основной музыкальный каталог для поиска треков и воспроизведения',
        enabled: ytEnabled,
        requiresKey: false,
        hasKey: true,
        status: !ytEnabled ? 'disabled' : ytHealth?.lastError ? 'error' : 'connected',
        lastCheckedAt: ytHealth?.lastCheckedAt || null,
        lastError: ytHealth?.lastError || null,
        latencyMs: ytHealth?.latencyMs || null,
      },
    ];

    // 2. Genius Lyrics Provider
    const geniusKey = this.getApiKey('genius');
    const geniusEnabled = this.isLyricsEnabled('genius');
    const geniusHealth = this.healthState.get('genius');
    const hasGeniusKey = Boolean(geniusKey && geniusKey.trim().length > 0);

    const lyricsProviders: ProviderHealth[] = [
      {
        id: 'genius',
        name: 'Genius',
        type: 'lyrics',
        description: 'Провайдер текстов песен со строгим сопоставлением метаданных',
        enabled: geniusEnabled,
        requiresKey: true,
        hasKey: hasGeniusKey,
        maskedKey: maskApiKey(geniusKey),
        status: !geniusEnabled
          ? 'disabled'
          : !hasGeniusKey
          ? 'unconfigured'
          : geniusHealth?.lastError
          ? 'error'
          : 'connected',
        lastCheckedAt: geniusHealth?.lastCheckedAt || null,
        lastError: geniusHealth?.lastError || null,
        latencyMs: geniusHealth?.latencyMs || null,
      },
    ];

    return {
      catalog: catalogProviders,
      lyrics: lyricsProviders,
      stats: { ...this.metrics },
    };
  }
}

export const externalMusicConfig = new ExternalMusicConfigService();
