import React from 'react';
import { useRouter } from '../../context/RouterContext.tsx';

export interface ArtistItem {
  id?: string | number;
  slug?: string;
  name: string;
}

export interface ArtistLinksProps {
  artistName?: string | null;
  artists?: (string | ArtistItem)[];
  artistSlug?: string | null;
  artistId?: string | number | null;
  className?: string;
  linkClassName?: string;
  separator?: string;
  onClickArtist?: (artist: string, e: React.MouseEvent) => void;
}

/**
 * Splits compound artist strings (e.g. "Artist A, Artist B & Artist C feat. Artist D")
 * or takes an array of artists, returning individual, deduplicated artist tokens.
 */
export function parseArtists(
  artistName?: string | null,
  artists?: (string | ArtistItem)[]
): ArtistItem[] {
  const result: ArtistItem[] = [];
  const seenNames = new Set<string>();

  const addArtist = (item: ArtistItem) => {
    const clean = item.name.trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      result.push({ ...item, name: clean });
    }
  };

  if (Array.isArray(artists) && artists.length > 0) {
    for (const a of artists) {
      if (typeof a === 'string') {
        const trimmed = a.trim();
        if (trimmed) addArtist({ name: trimmed });
      } else if (a && a.name) {
        addArtist(a);
      }
    }
    if (result.length > 0) return result;
  }

  if (!artistName || typeof artistName !== 'string') {
    return [{ name: 'Исполнитель' }];
  }

  const trimmed = artistName.trim();
  if (!trimmed) {
    return [{ name: 'Исполнитель' }];
  }

  // Collaboration separators:
  // - commas: ,
  // - ampersands: &
  // - feat / ft / featuring: feat., ft., featuring
  // - standalone x: " x "
  // - slashes: /
  const regex = /(?:\s*,\s*|\s+&\s+|\s+(?:feat|ft|featuring)\.?\s+|\s+x\s+|\s*\/\s*)/i;
  const parts = trimmed.split(regex).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) {
    return [{ name: trimmed }];
  }

  for (const name of parts) {
    addArtist({ name });
  }

  return result.length > 0 ? result : [{ name: trimmed }];
}

/**
 * Uniform artist link renderer across all music views, player, cards, rows, and queue.
 * Displays all authors: "Artist A · Artist B · Artist C" with proper navigation.
 * Renders HTML `<a>` tags for SPA routing on normal click and middle click / open in new tab support.
 */
export const ArtistLinks: React.FC<ArtistLinksProps> = ({
  artistName,
  artists,
  artistSlug,
  artistId,
  className = '',
  linkClassName = '',
  separator = ' · ',
  onClickArtist,
}) => {
  const { navigate } = useRouter();
  const parsed = parseArtists(artistName, artists);

  const getArtistUrl = (item: ArtistItem, index: number): string => {
    if (item.slug) {
      return `/music/artist/${encodeURIComponent(item.slug)}`;
    }
    if (item.id) {
      const idStr = String(item.id);
      if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
        return `/music/external/artist/youtube/${idStr.replace(/^yt_/, '')}`;
      }
      return `/music/artist/${encodeURIComponent(idStr)}`;
    }
    if (index === 0) {
      if (artistSlug) return `/music/artist/${encodeURIComponent(artistSlug)}`;
      if (artistId) {
        const idStr = String(artistId);
        if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
          return `/music/external/artist/youtube/${idStr.replace(/^yt_/, '')}`;
        }
        return `/music/artist/${encodeURIComponent(idStr)}`;
      }
    }
    if (
      item.name &&
      item.name !== 'Исполнитель' &&
      item.name !== 'Исполнитель не указан' &&
      item.name !== 'Неизвестный исполнитель'
    ) {
      return `/music/artist/${encodeURIComponent(item.name)}`;
    }
    return '';
  };

  return (
    <span className={`inline-flex items-center flex-wrap gap-0.5 ${className}`}>
      {parsed.map((item, idx) => {
        const isLast = idx === parsed.length - 1;
        const targetUrl = getArtistUrl(item, idx);

        if (!targetUrl) {
          return (
            <React.Fragment key={`${item.name}-${idx}`}>
              <span className={linkClassName}>{item.name}</span>
              {!isLast && (
                <span className="text-slate-500 font-normal select-none px-0.5">
                  {separator}
                </span>
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={`${item.name}-${idx}`}>
            <a
              href={targetUrl}
              onClick={(e) => {
                e.stopPropagation();
                if (onClickArtist) {
                  e.preventDefault();
                  onClickArtist(item.name, e);
                  return;
                }
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  navigate(targetUrl);
                }
              }}
              className={`hover:text-purple-300 hover:underline cursor-pointer transition-colors ${linkClassName}`}
              title={`Исполнитель: ${item.name}`}
            >
              {item.name}
            </a>
            {!isLast && (
              <span className="text-slate-500 font-normal select-none px-0.5">
                {separator}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </span>
  );
};
