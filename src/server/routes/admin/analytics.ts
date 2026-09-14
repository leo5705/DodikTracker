import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { users, media, userMedia, reviews, lists, tierLists, comments, directMessages } from '../../../db/schema.ts';
import { sql, desc } from 'drizzle-orm';

export const analyticsRouter = Router();

analyticsRouter.get('/analytics', requireAuth, requireStaff('VIEW_ANALYTICS'), async (req: AuthRequest, res: Response) => {
  try {
    const range = (req.query.range as string || '30d').toLowerCase();
    let days = 30;
    if (range === '7d') days = 7;
    else if (range === '14d') days = 14;
    else if (range === '90d') days = 90;
    else if (range === '365d') days = 365;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1. Daily registration curve
    const registrationsRes = await db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM users
      WHERE created_at >= ${startDate}
      GROUP BY date
      ORDER BY date ASC
    `);

    // 2. Daily user_media additions
    const userMediaAdditionsRes = await db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM user_media
      WHERE created_at >= ${startDate}
      GROUP BY date
      ORDER BY date ASC
    `);

    // 3. Daily reviews
    const reviewsRes = await db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COUNT(*)::int as count
      FROM reviews
      WHERE created_at >= ${startDate}
      GROUP BY date
      ORDER BY date ASC
    `);

    // 4. Category breakdown
    const categoryStatsRes = await db.execute(sql`
      SELECT m.type as category, COUNT(um.id)::int as count
      FROM user_media um
      JOIN media m ON m.id = um.media_id
      GROUP BY m.type
      ORDER BY count DESC
    `);

    // 5. Status distribution across user library
    const statusStatsRes = await db.execute(sql`
      SELECT status, COUNT(*)::int as count
      FROM user_media
      GROUP BY status
      ORDER BY count DESC
    `);

    // 6. Top 10 most popular titles (most tracked)
    const topTrackedRes = await db.execute(sql`
      SELECT m.id, m.title, m.type, m.poster_url as "posterUrl", m.year, COUNT(um.id)::int as "trackCount"
      FROM media m
      JOIN user_media um ON um.media_id = m.id
      GROUP BY m.id, m.title, m.type, m.poster_url, m.year
      ORDER BY "trackCount" DESC
      LIMIT 10
    `);

    // 7. Top 10 highest-rated titles by Dodik community (min 1 review)
    const topRatedRes = await db.execute(sql`
      SELECT m.id, m.title, m.type, m.poster_url as "posterUrl", m.year,
             ROUND(AVG(r.rating)::numeric, 1)::float as "avgRating",
             COUNT(r.id)::int as "reviewCount"
      FROM reviews r
      JOIN media m ON m.id = r.media_id
      WHERE r.rating IS NOT NULL
      GROUP BY m.id, m.title, m.type, m.poster_url, m.year
      ORDER BY "avgRating" DESC, "reviewCount" DESC
      LIMIT 10
    `);

    // 8. Overall totals
    const uTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const mTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM media`);
    const rTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM reviews`);
    const lTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM lists`);
    const tlTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM tier_lists`);
    const cTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM comments`);
    const dmTotalRes = await db.execute(sql`SELECT COUNT(*)::int as count FROM direct_messages`);

    const uTotal = (uTotalRes as any).rows?.[0];
    const mTotal = (mTotalRes as any).rows?.[0];
    const rTotal = (rTotalRes as any).rows?.[0];
    const lTotal = (lTotalRes as any).rows?.[0];
    const tlTotal = (tlTotalRes as any).rows?.[0];
    const cTotal = (cTotalRes as any).rows?.[0];
    const dmTotal = (dmTotalRes as any).rows?.[0];

    res.json({
      range,
      days,
      timeline: {
        registrations: (registrationsRes as any).rows || [],
        libraryAdditions: (userMediaAdditionsRes as any).rows || [],
        reviews: (reviewsRes as any).rows || [],
      },
      distributions: {
        byCategory: (categoryStatsRes as any).rows || [],
        byStatus: (statusStatsRes as any).rows || [],
      },
      topLists: {
        mostTracked: (topTrackedRes as any).rows || [],
        highestRated: (topRatedRes as any).rows || [],
      },
      totals: {
        users: (uTotal as any)?.count || 0,
        media: (mTotal as any)?.count || 0,
        reviews: (rTotal as any)?.count || 0,
        lists: (lTotal as any)?.count || 0,
        tierLists: (tlTotal as any)?.count || 0,
        comments: (cTotal as any)?.count || 0,
        messages: (dmTotal as any)?.count || 0,
      },
    });
  } catch (err: any) {
    console.error('[AdminAnalytics] Error:', err);
    res.status(500).json({ error: err.message });
  }
});
