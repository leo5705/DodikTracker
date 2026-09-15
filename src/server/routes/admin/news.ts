import { Router, Response } from 'express';
import { requireAuth, requireStaff, AuthRequest } from '../../../middleware/auth.ts';
import { db } from '../../../db/index.ts';
import { news, users } from '../../../db/schema.ts';
import { eq, and, sql, desc, count, ilike, or } from 'drizzle-orm';
import { logAdminAction } from './auditHelper.ts';
import { notificationService } from '../../services/notificationService.ts';

export const newsRouter = Router();

function slugify(text: string): string {
  const ruMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return text
    .toLowerCase()
    .split('')
    .map((char) => ruMap[char] || char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// 1. Admin List News
newsRouter.get('/news', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const offset = (page - 1) * limit;

    const statusFilter = (req.query.status as string || 'ALL').toUpperCase();
    const searchQuery = (req.query.q as string || '').trim();

    const conditions: any[] = [];
    if (statusFilter !== 'ALL') {
      conditions.push(eq(news.status, statusFilter));
    }
    if (searchQuery) {
      conditions.push(or(ilike(news.title, `%${searchQuery}%`), ilike(news.slug, `%${searchQuery}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ val: count() }).from(news).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        excerpt: news.excerpt,
        content: news.content,
        cover: news.cover,
        tags: news.tags,
        status: news.status,
        isPinned: news.isPinned,
        isFeatured: news.isFeatured,
        publishedAt: news.publishedAt,
        scheduledAt: news.scheduledAt,
        viewsCount: news.viewsCount,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
        authorId: news.authorId,
        authorUsername: users.username,
        authorAvatar: users.avatar,
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .where(whereClause)
      .orderBy(desc(news.isPinned), desc(news.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      items,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err: any) {
    console.error('[News] Admin list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Admin Get Single Article by ID
newsRouter.get('/news/:id', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [article] = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        excerpt: news.excerpt,
        content: news.content,
        cover: news.cover,
        tags: news.tags,
        status: news.status,
        isPinned: news.isPinned,
        isFeatured: news.isFeatured,
        publishedAt: news.publishedAt,
        scheduledAt: news.scheduledAt,
        viewsCount: news.viewsCount,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
        authorId: news.authorId,
        authorUsername: users.username,
        authorAvatar: users.avatar,
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .where(eq(news.id, id))
      .limit(1);

    if (!article) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }
    res.json(article);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin Create News Article
newsRouter.post('/news', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      slug: customSlug,
      excerpt,
      content,
      cover,
      coverImage,
      tags,
      status,
      isPinned,
      isFeatured,
      scheduledAt,
      broadcastNotification,
      sendNotification,
    } = req.body;
    const actor = req.dbUser!;

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'Заголовок и содержимое новости обязательны' });
    }

    let finalSlug = (customSlug ? slugify(customSlug) : slugify(title)) || `news-${Date.now()}`;
    // Ensure uniqueness
    const [existing] = await db.select({ id: news.id }).from(news).where(eq(news.slug, finalSlug)).limit(1);
    if (existing) {
      finalSlug = `${finalSlug}-${Math.floor(Math.random() * 899 + 100)}`;
    }

    const currentStatus = (status || 'DRAFT').toUpperCase();
    const isPublished = currentStatus === 'PUBLISHED';
    const publishedAt = isPublished ? new Date() : null;
    const finalCover = cover || coverImage || null;

    let finalTags = '[]';
    if (Array.isArray(tags)) {
      finalTags = JSON.stringify(tags.map(t => String(t).trim()).filter(Boolean));
    } else if (typeof tags === 'string') {
      if (tags.startsWith('[') && tags.endsWith(']')) {
        finalTags = tags;
      } else {
        finalTags = JSON.stringify(tags.split(',').map(t => t.trim()).filter(Boolean));
      }
    }

    const [created] = await db
      .insert(news)
      .values({
        slug: finalSlug,
        title: title.trim(),
        excerpt: excerpt ? excerpt.trim() : null,
        content: content.trim(),
        cover: finalCover,
        authorId: actor.id,
        tags: finalTags,
        status: currentStatus,
        isPinned: Boolean(isPinned),
        isFeatured: Boolean(isFeatured),
        publishedAt,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      })
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'CREATE_NEWS',
      details: `Создана новость #${created.id}: «${created.title}» (${created.status})`,
      ip: req.ip,
    });

    const shouldNotify = Boolean(broadcastNotification ?? sendNotification);
    if (shouldNotify && isPublished) {
      await notificationService.broadcastNotification({
        type: 'SYSTEM',
        title: `📢 Новая публикация: ${created.title}`,
        body: created.excerpt || created.title,
        link: `/news/${created.slug}`,
      });
    }

    res.json(created);
  } catch (err: any) {
    console.error('[News] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin Update News Article
newsRouter.put('/news/:id', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      title,
      slug: customSlug,
      excerpt,
      content,
      cover,
      coverImage,
      tags,
      status,
      isPinned,
      isFeatured,
      scheduledAt,
      publishedAt: customPublishedAt,
      broadcastNotification,
      sendNotification,
    } = req.body;
    const actor = req.dbUser!;

    const [existing] = await db.select().from(news).where(eq(news.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    let finalSlug = existing.slug;
    if (customSlug && customSlug !== existing.slug) {
      finalSlug = slugify(customSlug);
      const [slugConflict] = await db
        .select({ id: news.id })
        .from(news)
        .where(and(eq(news.slug, finalSlug), sql`${news.id} != ${id}`))
        .limit(1);
      if (slugConflict) {
        finalSlug = `${finalSlug}-${Math.floor(Math.random() * 899 + 100)}`;
      }
    }

    const newStatus = status ? status.toUpperCase() : existing.status;
    const wasPublished = existing.status === 'PUBLISHED';
    const willBePublished = newStatus === 'PUBLISHED';

    let publishedAt = existing.publishedAt;
    if (customPublishedAt !== undefined) {
      publishedAt = customPublishedAt ? new Date(customPublishedAt) : null;
    } else if (willBePublished && !wasPublished) {
      publishedAt = new Date();
    } else if (!willBePublished && newStatus !== 'SCHEDULED') {
      // If unpublished / archived, keep or reset
    }

    const finalCover = cover !== undefined ? cover : (coverImage !== undefined ? coverImage : existing.cover);

    let finalTags = existing.tags;
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        finalTags = JSON.stringify(tags.map(t => String(t).trim()).filter(Boolean));
      } else if (typeof tags === 'string') {
        if (tags.startsWith('[') && tags.endsWith(']')) {
          finalTags = tags;
        } else {
          finalTags = JSON.stringify(tags.split(',').map(t => t.trim()).filter(Boolean));
        }
      }
    }

    const [updated] = await db
      .update(news)
      .set({
        title: title !== undefined ? title.trim() : existing.title,
        slug: finalSlug,
        excerpt: excerpt !== undefined ? (excerpt ? excerpt.trim() : null) : existing.excerpt,
        content: content !== undefined ? content.trim() : existing.content,
        cover: finalCover,
        tags: finalTags,
        status: newStatus,
        isPinned: isPinned !== undefined ? Boolean(isPinned) : existing.isPinned,
        isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : existing.isFeatured,
        publishedAt,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(news.id, id))
      .returning();

    await logAdminAction({
      userId: actor.id,
      action: 'UPDATE_NEWS',
      details: `Обновлена новость #${id}: «${updated.title}» (${updated.status})`,
      ip: req.ip,
    });

    const shouldNotify = Boolean(broadcastNotification ?? sendNotification);
    if (shouldNotify && willBePublished && !wasPublished) {
      await notificationService.broadcastNotification({
        type: 'SYSTEM',
        title: `📢 Новая публикация: ${updated.title}`,
        body: updated.excerpt || updated.title,
        link: `/news/${updated.slug}`,
      });
    }

    res.json(updated);
  } catch (err: any) {
    console.error('[News] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Admin Quick Change Status (Publish / Unpublish / Draft / Archive)
newsRouter.patch('/news/:id/status', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Укажите новый статус' });
    }

    const [existing] = await db.select().from(news).where(eq(news.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    const normalizedStatus = status.toUpperCase();
    const willBePublished = normalizedStatus === 'PUBLISHED';
    const publishedAt = willBePublished ? (existing.publishedAt || new Date()) : existing.publishedAt;

    const [updated] = await db
      .update(news)
      .set({
        status: normalizedStatus,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(news.id, id))
      .returning();

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'UPDATE_NEWS_STATUS',
      details: `Изменён статус новости #${id} («${existing.title}») на ${normalizedStatus}`,
      ip: req.ip,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('[News] Status change error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Admin Delete News Article
newsRouter.delete('/news/:id', requireAuth, requireStaff('MANAGE_NEWS'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [existing] = await db.select().from(news).where(eq(news.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Новость не найдена' });
    }

    await db.delete(news).where(eq(news.id, id));

    await logAdminAction({
      userId: req.dbUser!.id,
      action: 'DELETE_NEWS',
      details: `Удалена новость #${id}: «${existing.title}»`,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Новость успешно удалена' });
  } catch (err: any) {
    console.error('[News] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Public Endpoints for the front-end application
// ============================================

export const publicNewsRouter = Router();

// Public list of published news only
publicNewsRouter.get('/news', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '12'), 10)));
    const offset = (page - 1) * limit;

    const tagFilter = req.query.tag as string;
    const searchQuery = (req.query.q as string || '').trim();

    // STRICT CHECK: Only PUBLISHED articles where scheduledAt is null or in the past
    const conditions: any[] = [
      eq(news.status, 'PUBLISHED'),
      or(sql`${news.scheduledAt} IS NULL`, sql`${news.scheduledAt} <= NOW()`),
    ];

    if (searchQuery) {
      conditions.push(or(ilike(news.title, `%${searchQuery}%`), ilike(news.excerpt, `%${searchQuery}%`)));
    }
    if (tagFilter) {
      conditions.push(ilike(news.tags, `%"${tagFilter}"%`));
    }

    const whereClause = and(...conditions);

    const [totalRes] = await db.select({ val: count() }).from(news).where(whereClause);
    const totalCount = Number(totalRes?.val || 0);

    const items = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        excerpt: news.excerpt,
        content: news.content,
        cover: news.cover,
        tags: news.tags,
        status: news.status,
        isPinned: news.isPinned,
        isFeatured: news.isFeatured,
        publishedAt: news.publishedAt,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
        viewsCount: news.viewsCount,
        authorUsername: users.username,
        authorAvatar: users.avatar,
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .where(whereClause)
      .orderBy(desc(news.isPinned), desc(news.publishedAt), desc(news.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      items,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err: any) {
    console.error('[PublicNews] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public single article by slug or ID
publicNewsRouter.get('/news/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const isNumeric = /^\d+$/.test(slug);

    const condition = isNumeric
      ? and(eq(news.id, parseInt(slug, 10)), eq(news.status, 'PUBLISHED'), or(sql`${news.scheduledAt} IS NULL`, sql`${news.scheduledAt} <= NOW()`))
      : and(eq(news.slug, slug), eq(news.status, 'PUBLISHED'), or(sql`${news.scheduledAt} IS NULL`, sql`${news.scheduledAt} <= NOW()`));

    const [article] = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        excerpt: news.excerpt,
        content: news.content,
        cover: news.cover,
        tags: news.tags,
        status: news.status,
        isPinned: news.isPinned,
        isFeatured: news.isFeatured,
        publishedAt: news.publishedAt,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
        viewsCount: news.viewsCount,
        authorUsername: users.username,
        authorAvatar: users.avatar,
      })
      .from(news)
      .leftJoin(users, eq(news.authorId, users.id))
      .where(condition)
      .limit(1);

    if (!article) {
      return res.status(404).json({ error: 'Статья не найдена или не опубликована' });
    }

    // Increment views count asynchronously
    db.update(news)
      .set({ viewsCount: sql`${news.viewsCount} + 1` })
      .where(eq(news.id, article.id))
      .catch((e) => console.error('Failed to increment news views:', e));

    res.json(article);
  } catch (err: any) {
    console.error('[PublicNews] Detail error:', err);
    res.status(500).json({ error: err.message });
  }
});
