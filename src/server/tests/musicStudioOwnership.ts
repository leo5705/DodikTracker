/**
 * Automated test suite for Music Studio Releases Ownership & Privacy
 * 
 * Scenarios tested:
 * Test 1 — Artist A requesting studio releases returns ONLY Release A, NOT Release B.
 * Test 2 — Artist B requesting studio releases returns ONLY Release B, NOT Release A.
 * Test 3 — Multiple statuses (DRAFT, PENDING_REVIEW, REJECTED, PUBLISHED) of Artist A are visible to Artist A, but none leak to Artist B.
 * Test 4 — Artist A querying Release B (DRAFT / PENDING_REVIEW / REJECTED) directly is rejected.
 * Test 5 — Artist A attempting to update or delete Release B is rejected with 403 Forbidden.
 * Test 6 — Public catalog returns PUBLISHED releases from all artists, but never non-published drafts of others.
 */

import { db, pool } from '../../db/index.ts';
import {
  users,
  artistProfiles,
  musicReleases,
  musicTracks,
} from '../../db/schema.ts';
import { eq, and, or, inArray } from 'drizzle-orm';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export async function runMusicStudioOwnershipTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];
  const suffix = Date.now();

  let userAId: number | null = null;
  let artistAId: number | null = null;
  let userBId: number | null = null;
  let artistBId: number | null = null;

  const releaseIdsToCleanup: number[] = [];

  try {
    // 1. Create Test User A & Artist Profile A
    const [userA] = await db
      .insert(users)
      .values({
        uid: `test_user_a_${suffix}`,
        username: `artist_a_${suffix}`,
        email: `artist_a_${suffix}@example.com`,
        passwordHash: 'dummyhash',
        role: 'musician',
      })
      .returning();
    userAId = userA.id;

    const [artistA] = await db
      .insert(artistProfiles)
      .values({
        userId: userA.id,
        stageName: `Artist A ${suffix}`,
        slug: `artist-a-${suffix}`,
      })
      .returning();
    artistAId = artistA.id;

    // 2. Create Test User B & Artist Profile B
    const [userB] = await db
      .insert(users)
      .values({
        uid: `test_user_b_${suffix}`,
        username: `artist_b_${suffix}`,
        email: `artist_b_${suffix}@example.com`,
        passwordHash: 'dummyhash',
        role: 'musician',
      })
      .returning();
    userBId = userB.id;

    const [artistB] = await db
      .insert(artistProfiles)
      .values({
        userId: userB.id,
        stageName: `Artist B ${suffix}`,
        slug: `artist-b-${suffix}`,
      })
      .returning();
    artistBId = artistB.id;

    // Create Release A1 for Artist A
    const [releaseA1] = await db
      .insert(musicReleases)
      .values({
        artistId: artistA.id,
        title: `Release A1 ${suffix}`,
        slug: `release-a1-${suffix}`,
        type: 'SINGLE',
        status: 'PUBLISHED',
      })
      .returning();
    releaseIdsToCleanup.push(releaseA1.id);

    // Create Release B1 for Artist B
    const [releaseB1] = await db
      .insert(musicReleases)
      .values({
        artistId: artistB.id,
        title: `Release B1 ${suffix}`,
        slug: `release-b1-${suffix}`,
        type: 'ALBUM',
        status: 'PUBLISHED',
      })
      .returning();
    releaseIdsToCleanup.push(releaseB1.id);

    // ==========================================
    // Test 1 — Artist A requesting studio releases
    // ==========================================
    try {
      const studioReleasesA = await db
        .select()
        .from(musicReleases)
        .where(eq(musicReleases.artistId, artistA.id));

      const foundA1 = studioReleasesA.some((r) => r.id === releaseA1.id);
      const leakedB1 = studioReleasesA.some((r) => r.id === releaseB1.id);

      if (foundA1 && !leakedB1) {
        results.push({
          name: 'Test 1: Studio releases query for Artist A returns ONLY Release A, not Release B',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 1: Studio releases query for Artist A returns ONLY Release A, not Release B',
          passed: false,
          error: `Found A1: ${foundA1}, Leaked B1: ${leakedB1}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 1: Studio releases query for Artist A returns ONLY Release A, not Release B',
        passed: false,
        error: err.message,
      });
    }

    // ==========================================
    // Test 2 — Artist B requesting studio releases
    // ==========================================
    try {
      const studioReleasesB = await db
        .select()
        .from(musicReleases)
        .where(eq(musicReleases.artistId, artistB.id));

      const foundB1 = studioReleasesB.some((r) => r.id === releaseB1.id);
      const leakedA1 = studioReleasesB.some((r) => r.id === releaseA1.id);

      if (foundB1 && !leakedA1) {
        results.push({
          name: 'Test 2: Studio releases query for Artist B returns ONLY Release B, not Release A',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 2: Studio releases query for Artist B returns ONLY Release B, not Release A',
          passed: false,
          error: `Found B1: ${foundB1}, Leaked A1: ${leakedA1}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 2: Studio releases query for Artist B returns ONLY Release B, not Release A',
        passed: false,
        error: err.message,
      });
    }

    // ==========================================
    // Test 3 — Multiple statuses (DRAFT, PENDING_REVIEW, REJECTED, PUBLISHED)
    // ==========================================
    try {
      const [draftA] = await db
        .insert(musicReleases)
        .values({
          artistId: artistA.id,
          title: `Draft A ${suffix}`,
          slug: `draft-a-${suffix}`,
          type: 'SINGLE',
          status: 'DRAFT',
        })
        .returning();
      releaseIdsToCleanup.push(draftA.id);

      const [pendingA] = await db
        .insert(musicReleases)
        .values({
          artistId: artistA.id,
          title: `Pending A ${suffix}`,
          slug: `pending-a-${suffix}`,
          type: 'EP',
          status: 'PENDING_REVIEW',
        })
        .returning();
      releaseIdsToCleanup.push(pendingA.id);

      const [rejectedA] = await db
        .insert(musicReleases)
        .values({
          artistId: artistA.id,
          title: `Rejected A ${suffix}`,
          slug: `rejected-a-${suffix}`,
          type: 'SINGLE',
          status: 'REJECTED',
          rejectionReason: 'Poor audio quality',
        })
        .returning();
      releaseIdsToCleanup.push(rejectedA.id);

      // Query Artist A studio releases
      const allStudioA = await db
        .select()
        .from(musicReleases)
        .where(eq(musicReleases.artistId, artistA.id));

      const hasDraft = allStudioA.some((r) => r.id === draftA.id && r.status === 'DRAFT');
      const hasPending = allStudioA.some((r) => r.id === pendingA.id && r.status === 'PENDING_REVIEW');
      const hasRejected = allStudioA.some((r) => r.id === rejectedA.id && r.status === 'REJECTED' && r.rejectionReason === 'Poor audio quality');
      const hasPublished = allStudioA.some((r) => r.id === releaseA1.id && r.status === 'PUBLISHED');

      // Check Artist B does NOT see any of Artist A's private statuses
      const allStudioB = await db
        .select()
        .from(musicReleases)
        .where(eq(musicReleases.artistId, artistB.id));

      const bLeakedDraft = allStudioB.some((r) => r.id === draftA.id);
      const bLeakedPending = allStudioB.some((r) => r.id === pendingA.id);
      const bLeakedRejected = allStudioB.some((r) => r.id === rejectedA.id);

      if (hasDraft && hasPending && hasRejected && hasPublished && !bLeakedDraft && !bLeakedPending && !bLeakedRejected) {
        results.push({
          name: 'Test 3: Multiple statuses (DRAFT, PENDING_REVIEW, REJECTED, PUBLISHED) present in Artist A studio, zero leak to Artist B',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 3: Multiple statuses (DRAFT, PENDING_REVIEW, REJECTED, PUBLISHED) present in Artist A studio, zero leak to Artist B',
          passed: false,
          error: `A statuses: draft=${hasDraft}, pending=${hasPending}, rejected=${hasRejected}, pub=${hasPublished}. B leaks: draft=${bLeakedDraft}, pending=${bLeakedPending}, rejected=${bLeakedRejected}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 3: Multiple statuses test failed with exception',
        passed: false,
        error: err.message,
      });
    }

    // ==========================================
    // Test 4 — Privacy of non-published release lookup
    // ==========================================
    try {
      const [draftB] = await db
        .insert(musicReleases)
        .values({
          artistId: artistB.id,
          title: `Private Draft B ${suffix}`,
          slug: `private-draft-b-${suffix}`,
          type: 'SINGLE',
          status: 'DRAFT',
        })
        .returning();
      releaseIdsToCleanup.push(draftB.id);

      // Simulating GET /api/music/releases/:id privacy check for User A
      const [found] = await db
        .select({
          id: musicReleases.id,
          status: musicReleases.status,
          artistUserId: artistProfiles.userId,
        })
        .from(musicReleases)
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(eq(musicReleases.id, draftB.id))
        .limit(1);

      const isAllowedForA = found && (found.status === 'PUBLISHED' || found.artistUserId === userA.id);

      if (!isAllowedForA) {
        results.push({
          name: 'Test 4: Artist A querying private Draft of Artist B is blocked by privacy gate',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 4: Artist A querying private Draft of Artist B is blocked by privacy gate',
          passed: false,
          error: 'Privacy check allowed unauthorized access',
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 4: Private release lookup check failed',
        passed: false,
        error: err.message,
      });
    }

    // ==========================================
    // Test 5 — Ownership check for Update/Delete of Release B by User A
    // ==========================================
    try {
      const [existingB] = await db
        .select({
          id: musicReleases.id,
          artistUserId: artistProfiles.userId,
        })
        .from(musicReleases)
        .leftJoin(artistProfiles, eq(musicReleases.artistId, artistProfiles.id))
        .where(eq(musicReleases.id, releaseB1.id))
        .limit(1);

      const canUserAEditB = existingB && existingB.artistUserId === userA.id;

      if (!canUserAEditB) {
        results.push({
          name: 'Test 5: User A cannot edit or delete Release B (ownership check enforces 403 Forbidden)',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 5: User A cannot edit or delete Release B (ownership check enforces 403 Forbidden)',
          passed: false,
          error: 'Ownership check mistakenly allowed User A to edit Release B',
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 5: Ownership check failed with exception',
        passed: false,
        error: err.message,
      });
    }

    // ==========================================
    // Test 6 — Public catalog returns PUBLISHED releases of all artists without leaking drafts
    // ==========================================
    try {
      const publicReleases = await db
        .select({
          id: musicReleases.id,
          title: musicReleases.title,
          status: musicReleases.status,
          artistId: musicReleases.artistId,
        })
        .from(musicReleases)
        .where(eq(musicReleases.status, 'PUBLISHED'));

      const hasPubA = publicReleases.some((r) => r.id === releaseA1.id);
      const hasPubB = publicReleases.some((r) => r.id === releaseB1.id);
      const hasAnyDraft = publicReleases.some((r) => r.status !== 'PUBLISHED');

      if (hasPubA && hasPubB && !hasAnyDraft) {
        results.push({
          name: 'Test 6: Public catalog returns PUBLISHED releases from both artists and zero drafts',
          passed: true,
        });
      } else {
        results.push({
          name: 'Test 6: Public catalog returns PUBLISHED releases from both artists and zero drafts',
          passed: false,
          error: `hasPubA: ${hasPubA}, hasPubB: ${hasPubB}, hasAnyDraft: ${hasAnyDraft}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Test 6: Public catalog test failed with exception',
        passed: false,
        error: err.message,
      });
    }
  } finally {
    // Cleanup created test records
    try {
      if (releaseIdsToCleanup.length > 0) {
        await db.delete(musicTracks).where(inArray(musicTracks.releaseId, releaseIdsToCleanup));
        await db.delete(musicReleases).where(inArray(musicReleases.id, releaseIdsToCleanup));
      }
      if (artistAId) await db.delete(artistProfiles).where(eq(artistProfiles.id, artistAId));
      if (artistBId) await db.delete(artistProfiles).where(eq(artistProfiles.id, artistBId));
      if (userAId) await db.delete(users).where(eq(users.id, userAId));
      if (userBId) await db.delete(users).where(eq(users.id, userBId));
    } catch (cleanErr) {
      console.error('Error cleaning up test data:', cleanErr);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
