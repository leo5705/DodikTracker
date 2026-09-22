import { UnifiedStore } from '../types/unifiedGame.ts';

export interface StoreDefinition {
  key: string;
  name: string;
  priority: number;
  rawgIds: number[];
  domains: string[];
  aliases: string[];
  defaultDomain: string;
}

export const STORE_DEFINITIONS: StoreDefinition[] = [
  {
    key: 'steam',
    name: 'Steam',
    priority: 1,
    rawgIds: [1],
    domains: ['store.steampowered.com', 'steampowered.com', 'steamcommunity.com'],
    aliases: ['steam', 'steam store', 'store.steampowered.com', 'valvesteam'],
    defaultDomain: 'store.steampowered.com',
  },
  {
    key: 'epic_games',
    name: 'Epic Games Store',
    priority: 2,
    rawgIds: [11],
    domains: ['epicgames.com', 'store.epicgames.com'],
    aliases: ['epic games store', 'epic games', 'epic store', 'epic', 'egs', 'epicgames'],
    defaultDomain: 'store.epicgames.com',
  },
  {
    key: 'gog',
    name: 'GOG',
    priority: 3,
    rawgIds: [5],
    domains: ['gog.com'],
    aliases: ['gog', 'gog.com', 'good old games'],
    defaultDomain: 'gog.com',
  },
  {
    key: 'xbox_store',
    name: 'Xbox Store',
    priority: 4,
    rawgIds: [2, 7],
    domains: ['xbox.com', 'marketplace.xbox.com', 'microsoft.com'],
    aliases: [
      'xbox store',
      'microsoft store',
      'xbox',
      'xbox 360 store',
      'xbox one store',
      'xbox series store',
      'windows store',
      'ms store',
    ],
    defaultDomain: 'xbox.com',
  },
  {
    key: 'playstation_store',
    name: 'PlayStation Store',
    priority: 5,
    rawgIds: [3],
    domains: ['store.playstation.com', 'playstation.com', 'sonyentertainmentnetwork.com'],
    aliases: [
      'playstation store',
      'ps store',
      'playstation',
      'psn',
      'ps4 store',
      'ps5 store',
      'playstation network',
    ],
    defaultDomain: 'store.playstation.com',
  },
  {
    key: 'nintendo_eshop',
    name: 'Nintendo eShop',
    priority: 6,
    rawgIds: [6],
    domains: ['nintendo.com', 'ec.nintendo.com', 'nintendo-europe.com', 'nintendo.co.jp'],
    aliases: ['nintendo eshop', 'nintendo store', 'nintendo', 'eshop', 'nintendo e-shop'],
    defaultDomain: 'nintendo.com',
  },
  {
    key: 'ea_app',
    name: 'EA App',
    priority: 7,
    rawgIds: [],
    domains: ['ea.com', 'origin.com'],
    aliases: ['ea app', 'ea desktop', 'origin', 'electronic arts', 'ea store'],
    defaultDomain: 'ea.com',
  },
  {
    key: 'ubisoft_store',
    name: 'Ubisoft Store',
    priority: 8,
    rawgIds: [],
    domains: ['store.ubisoft.com', 'ubisoft.com', 'uplay.com'],
    aliases: ['ubisoft store', 'ubisoft connect', 'uplay', 'ubisoft'],
    defaultDomain: 'store.ubisoft.com',
  },
  {
    key: 'battle_net',
    name: 'Battle.net',
    priority: 9,
    rawgIds: [],
    domains: ['shop.battle.net', 'battle.net', 'blizzard.com'],
    aliases: ['battle.net', 'battlenet', 'blizzard battle.net', 'blizzard'],
    defaultDomain: 'battle.net',
  },
  {
    key: 'vk_play',
    name: 'VK Play',
    priority: 10,
    rawgIds: [],
    domains: ['vkplay.ru'],
    aliases: ['vk play', 'vkplay'],
    defaultDomain: 'vkplay.ru',
  },
  {
    key: 'humble_store',
    name: 'Humble Store',
    priority: 11,
    rawgIds: [],
    domains: ['humblebundle.com'],
    aliases: ['humble store', 'humble bundle', 'humble'],
    defaultDomain: 'humblebundle.com',
  },
  {
    key: 'itch_io',
    name: 'itch.io',
    priority: 12,
    rawgIds: [9],
    domains: ['itch.io'],
    aliases: ['itch.io', 'itch'],
    defaultDomain: 'itch.io',
  },
  {
    key: 'app_store',
    name: 'App Store',
    priority: 13,
    rawgIds: [4],
    domains: ['apps.apple.com', 'itunes.apple.com', 'apple.com'],
    aliases: ['app store', 'apple app store', 'apple store', 'ios app store', 'itunes', 'mac app store'],
    defaultDomain: 'apps.apple.com',
  },
  {
    key: 'google_play',
    name: 'Google Play',
    priority: 14,
    rawgIds: [8],
    domains: ['play.google.com'],
    aliases: ['google play', 'google play store', 'android play store', 'play store'],
    defaultDomain: 'play.google.com',
  },
  {
    key: 'rockstar_games',
    name: 'Rockstar Games',
    priority: 15,
    rawgIds: [],
    domains: ['rockstargames.com', 'store.rockstargames.com'],
    aliases: ['rockstar games', 'rockstar store', 'rockstar games launcher'],
    defaultDomain: 'store.rockstargames.com',
  },
  {
    key: 'amazon_games',
    name: 'Amazon Games',
    priority: 16,
    rawgIds: [],
    domains: ['gaming.amazon.com', 'amazon.com'],
    aliases: ['amazon games', 'prime gaming', 'amazon store'],
    defaultDomain: 'amazon.com',
  },
];

/**
 * Clean URL and remove tracking parameters
 */
export function cleanStoreUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  let urlStr = rawUrl.trim();
  if (!urlStr) return undefined;

  // Prepend https if missing protocol
  if (urlStr.startsWith('//')) {
    urlStr = `https:${urlStr}`;
  } else if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const parsed = new URL(urlStr);
    // Remove typical tracking queries
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'affiliate_id',
      'fbclid',
      'gclid',
      'origin',
      'feed',
      'tag',
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    // Convert http to https for known domains
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Extract hostname or domain snippet
 */
function extractHostname(url?: string, domain?: string): string {
  if (domain && domain.trim()) {
    return domain.toLowerCase().trim().replace(/^www\./, '');
  }
  if (!url) return '';
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return (url || '').toLowerCase();
  }
}

/**
 * Identify canonical store definition
 */
export function identifyStore(store: {
  id?: string | number;
  name?: string;
  url?: string;
  domain?: string;
  storeId?: string | number;
}): { definition: StoreDefinition | null; key: string; name: string; priority: number } {
  const storeIdNum = store.storeId !== undefined && store.storeId !== null
    ? parseInt(String(store.storeId), 10)
    : undefined;

  const rawName = (store.name || '').toLowerCase().trim();
  const rawId = store.id !== undefined && store.id !== null ? String(store.id).toLowerCase() : '';
  const hostname = extractHostname(store.url, store.domain);

  // 1. Match by RAWG store_id
  if (storeIdNum && !isNaN(storeIdNum)) {
    const match = STORE_DEFINITIONS.find((d) => d.rawgIds.includes(storeIdNum));
    if (match) {
      return { definition: match, key: match.key, name: match.name, priority: match.priority };
    }
  }

  // Check if name is "store #X" or "store-X"
  const storeNumberMatch = rawName.match(/^store\s*[#\-]?\s*(\d+)$/i);
  if (storeNumberMatch) {
    const sNum = parseInt(storeNumberMatch[1], 10);
    const match = STORE_DEFINITIONS.find((d) => d.rawgIds.includes(sNum));
    if (match) {
      return { definition: match, key: match.key, name: match.name, priority: match.priority };
    }
  }

  // 2. Match by domain / hostname
  if (hostname) {
    const match = STORE_DEFINITIONS.find((d) =>
      d.domains.some((dom) => hostname === dom || hostname.endsWith(`.${dom}`) || hostname.includes(dom))
    );
    if (match) {
      return { definition: match, key: match.key, name: match.name, priority: match.priority };
    }
  }

  // 3. Match by name or alias
  if (rawName) {
    const cleanName = rawName.replace(/[^a-z0-9а-яё\s\.]/gi, ' ').replace(/\s+/g, ' ').trim();
    const match = STORE_DEFINITIONS.find((d) =>
      d.aliases.some((alias) => cleanName === alias || cleanName.includes(alias))
    );
    if (match) {
      return { definition: match, key: match.key, name: match.name, priority: match.priority };
    }
  }

  // 4. Match by rawId if it contains key
  if (rawId) {
    const match = STORE_DEFINITIONS.find((d) => rawId === d.key || rawId.includes(d.key));
    if (match) {
      return { definition: match, key: match.key, name: match.name, priority: match.priority };
    }
  }

  // Custom / unrecognized store
  let fallbackName = store.name?.trim() || (hostname ? hostname.split('.')[0] : 'Магазин');
  if (/^store\s*#?\d+$/i.test(fallbackName)) {
    fallbackName = hostname ? hostname.split('.')[0] : fallbackName;
  }
  // Capitalize clean display name
  fallbackName = fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);
  const fallbackKey = fallbackName.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '_').replace(/^_+|_+$/g, '');

  return {
    definition: null,
    key: fallbackKey || 'custom_store',
    name: fallbackName,
    priority: 100,
  };
}

/**
 * Score a URL to determine the most preferred / canonical link for a store
 */
function scoreStoreUrl(url?: string, definition?: StoreDefinition | null): number {
  if (!url) return 0;
  let score = 10;
  const lower = url.toLowerCase();

  // Prefer direct product / game paths
  if (
    lower.includes('/app/') ||
    lower.includes('/product/') ||
    lower.includes('/products/') ||
    lower.includes('/p/') ||
    lower.includes('/game/') ||
    lower.includes('/games/') ||
    lower.includes('/concept/') ||
    lower.includes('/title_purchase/') ||
    lower.includes('details?id=')
  ) {
    score += 100;
  }

  // Check if hostname matches official default domain
  if (definition && definition.defaultDomain) {
    if (lower.includes(definition.defaultDomain)) {
      score += 50;
    }
  }

  // Penalize API redirect links
  if (lower.includes('api.rawg.io') || lower.includes('/api/') || lower.includes('redirect')) {
    score -= 40;
  }

  // Prefer HTTPS
  if (lower.startsWith('https://')) {
    score += 5;
  }

  // Reward specific URL depth
  score += Math.min(url.length * 0.1, 20);

  return score;
}

/**
 * Deduplicates, normalizes, and deterministically sorts game stores.
 * Every store platform is included AT MOST ONCE.
 */
export function deduplicateAndNormalizeStores(
  stores: Array<{
    id?: string | number;
    name?: string;
    url?: string;
    domain?: string;
    storeId?: string | number;
  }>
): UnifiedStore[] {
  if (!Array.isArray(stores) || stores.length === 0) return [];

  interface CandidateGroup {
    key: string;
    name: string;
    priority: number;
    definition: StoreDefinition | null;
    bestUrl?: string;
    bestUrlScore: number;
    domain?: string;
    storeId?: string;
    id?: string | number;
  }

  const map = new Map<string, CandidateGroup>();

  for (const st of stores) {
    if (!st) continue;
    const { definition, key, name, priority } = identifyStore(st);
    const cleanedUrl = cleanStoreUrl(st.url);
    const urlScore = scoreStoreUrl(cleanedUrl, definition);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name: definition ? definition.name : name,
        priority: definition ? definition.priority : priority,
        definition,
        bestUrl: cleanedUrl,
        bestUrlScore: urlScore,
        domain: definition ? definition.defaultDomain : (st.domain || extractHostname(cleanedUrl)),
        storeId: st.storeId ? String(st.storeId) : (definition?.rawgIds[0] ? String(definition.rawgIds[0]) : undefined),
        id: st.id || `store-${key}`,
      });
    } else {
      // Update with higher score URL
      if (urlScore > existing.bestUrlScore || (!existing.bestUrl && cleanedUrl)) {
        existing.bestUrl = cleanedUrl;
        existing.bestUrlScore = urlScore;
      }
      // If current item has better storeId
      if (!existing.storeId && st.storeId) {
        existing.storeId = String(st.storeId);
      }
      // If current item has specific domain
      if (!existing.domain && st.domain) {
        existing.domain = st.domain;
      }
      // Keep canonical definition name if not already set
      if (definition && existing.name !== definition.name) {
        existing.name = definition.name;
        existing.priority = definition.priority;
        existing.definition = definition;
      }
    }
  }

  // Convert to UnifiedStore array and sort deterministically
  const results: UnifiedStore[] = Array.from(map.values()).map((g) => ({
    id: g.id || `store-${g.key}`,
    name: g.name,
    url: g.bestUrl || (g.domain ? `https://${g.domain}` : undefined),
    domain: g.domain,
    storeId: g.storeId,
  }));

  results.sort((a, b) => {
    const identA = identifyStore(a);
    const identB = identifyStore(b);
    if (identA.priority !== identB.priority) {
      return identA.priority - identB.priority;
    }
    return a.name.localeCompare(b.name, 'ru');
  });

  return results;
}
