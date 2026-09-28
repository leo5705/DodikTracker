import { db } from '../../../db/index.ts';
import { musicTrackTransitions } from '../../../db/schema.ts';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

export class TransitionService {
  /**
   * Records a sequential transition between two tracks (fromTrack -> toTrack).
   */
  public async recordTransition(
    fromTrackId: string | number | null | undefined,
    toTrackId: string | number | null | undefined,
    fromArtistName?: string | null,
    toArtistName?: string | null
  ): Promise<void> {
    if (!fromTrackId || !toTrackId) return;

    const fromId = String(fromTrackId).trim();
    const toId = String(toTrackId).trim();

    if (!fromId || !toId || fromId === toId) return;

    try {
      await db
        .insert(musicTrackTransitions)
        .values({
          fromTrackId: fromId,
          toTrackId: toId,
          fromArtistName: fromArtistName || null,
          toArtistName: toArtistName || null,
          transitionCount: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [musicTrackTransitions.fromTrackId, musicTrackTransitions.toTrackId],
          set: {
            transitionCount: sql`${musicTrackTransitions.transitionCount} + 1`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.warn('[TransitionService] Failed to record transition:', err);
    }
  }

  /**
   * Gets likely next tracks from the transition graph for a given track ID.
   */
  public async getNextTracks(trackId: string | number, limit = 6): Promise<{ toTrackId: string; count: number; toArtistName?: string | null }[]> {
    const tid = String(trackId).trim();
    if (!tid) return [];

    try {
      const rows = await db
        .select({
          toTrackId: musicTrackTransitions.toTrackId,
          transitionCount: musicTrackTransitions.transitionCount,
          toArtistName: musicTrackTransitions.toArtistName,
        })
        .from(musicTrackTransitions)
        .where(eq(musicTrackTransitions.fromTrackId, tid))
        .orderBy(desc(musicTrackTransitions.transitionCount))
        .limit(limit);

      return rows.map((r) => ({
        toTrackId: r.toTrackId,
        count: r.transitionCount,
        toArtistName: r.toArtistName,
      }));
    } catch (err) {
      console.warn('[TransitionService] Error fetching next tracks:', err);
      return [];
    }
  }

  /**
   * Batch lookup transition scores from a set of source tracks to candidate tracks.
   */
  public async getBatchTransitionAffinity(
    sourceTrackIds: string[],
    candidateTrackIds: string[]
  ): Promise<Map<string, number>> {
    const affinityMap = new Map<string, number>();
    if (sourceTrackIds.length === 0 || candidateTrackIds.length === 0) return affinityMap;

    try {
      const rows = await db
        .select({
          toTrackId: musicTrackTransitions.toTrackId,
          totalTransitions: sql<number>`SUM(${musicTrackTransitions.transitionCount})`,
        })
        .from(musicTrackTransitions)
        .where(
          and(
            inArray(musicTrackTransitions.fromTrackId, sourceTrackIds.slice(0, 15)),
            inArray(musicTrackTransitions.toTrackId, candidateTrackIds.slice(0, 50))
          )
        )
        .groupBy(musicTrackTransitions.toTrackId);

      for (const row of rows) {
        affinityMap.set(row.toTrackId, Number(row.totalTransitions || 0));
      }
    } catch (err) {
      console.warn('[TransitionService] Batch transition query error:', err);
    }

    return affinityMap;
  }
}

export const transitionService = new TransitionService();
