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
 * or takes an array of artists, returning individual artist tokens.
 */
export function parseArtists(
  artistName?: string | null,
  artists?: (string | ArtistItem)[]
): ArtistItem[] {
  if (Array.isArray(artists) && artists.length > 0) {
    const list: ArtistItem[] = [];
    for (const a of artists) {
      if (typeof a === 'string') {
        const trimmed = a.trim();
        if (trimmed) list.push({ name: trimmed });
      } else if (a && a.name) {
        list.push(a);
      }
    }
    if (list.length > 0) return list;
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

  return parts.map((name) => ({ name }));
}

/**
 * Uniform artist link renderer across all music views, player, cards, rows, and queue.
 * Displays all authors: "Artist A · Artist B · Artist C" with proper navigation.
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

  const handleClick = (item: ArtistItem, index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (onClickArtist) {
      onClickArtist(item.name, e);
      return;
    }

    // 1. Direct slug provided on item
    if (item.slug) {
      navigate(`/music/artist/${item.slug}`);
      return;
    }

    // 2. Direct id provided on item
    if (item.id) {
      const idStr = String(item.id);
      if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
        navigate(`/music/external/artist/youtube/${idStr.replace(/^yt_/, '')}`);
      } else {
        navigate(`/music/artist/${idStr}`);
      }
      return;
    }

    // 3. If primary artist (first item) and parent passed artistSlug / artistId
    if (index === 0) {
      if (artistSlug) {
        navigate(`/music/artist/${artistSlug}`);
        return;
      }
      if (artistId) {
        const idStr = String(artistId);
        if (idStr.startsWith('yt_') || idStr.startsWith('UC')) {
          navigate(`/music/external/artist/youtube/${idStr.replace(/^yt_/, '')}`);
        } else {
          navigate(`/music/artist/${idStr}`);
        }
        return;
      }
    }

    // 4. Default: navigate to search query for this specific artist
    navigate(`/music/search?q=${encodeURIComponent(item.name)}`);
  };

  return (
    <span className={`inline-flex items-center flex-wrap gap-0.5 ${className}`}>
      {parsed.map((item, idx) => {
        const isLast = idx === parsed.length - 1;
        return (
          <React.Fragment key={`${item.name}-${idx}`}>
            <span
              onClick={(e) => handleClick(item, idx, e)}
              className={`hover:text-purple-300 hover:underline cursor-pointer transition-colors ${linkClassName}`}
              title={`Исполнитель: ${item.name}`}
            >
              {item.name}
            </span>
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
