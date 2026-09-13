import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../../middleware/auth.ts';
import { db } from '../../db/index.ts';
import { media, userMedia, mediaExternalIds, reviews, lists, listItems, users } from '../../db/schema.ts';
import { eq, and, inArray, or, ilike } from 'drizzle-orm';

export const importExportRouter = Router();

importExportRouter.get('/export', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.dbUser!.id;
    
    // 1. Fetch library items
    const userLibrary = await db.select().from(userMedia).where(eq(userMedia.userId, userId));
    
    if (userLibrary.length === 0) {
      return res.json({ format: 'dodik-tracker', version: 1, library: [], lists: [] });
    }
    
    const mediaIds = userLibrary.map(u => u.mediaId);
    
    // 2. Fetch associated media
    const mediaItems = await db.select().from(media).where(inArray(media.id, mediaIds));
    const mediaMap = new Map(mediaItems.map(m => [m.id, m]));
    
    // 3. Fetch external IDs
    const externalIds = await db.select().from(mediaExternalIds).where(inArray(mediaExternalIds.mediaId, mediaIds));
    const extIdsMap = new Map<number, any[]>();
    for (const ext of externalIds) {
      if (!extIdsMap.has(ext.mediaId)) extIdsMap.set(ext.mediaId, []);
      extIdsMap.get(ext.mediaId)!.push({ provider: ext.provider, externalId: ext.externalId });
    }
    
    // 4. Fetch user's reviews for these media
    const userReviews = await db.select().from(reviews).where(and(eq(reviews.userId, userId), inArray(reviews.mediaId, mediaIds)));
    const reviewsMap = new Map(userReviews.map(r => [r.mediaId, r]));
    
    // 5. Build library JSON
    const libraryExport = userLibrary.map(ul => {
      const m = mediaMap.get(ul.mediaId);
      const ext = extIdsMap.get(ul.mediaId) || [];
      const rev = reviewsMap.get(ul.mediaId);
      
      return {
        media: m ? {
          title: m.originalTitle || m.title,
          type: m.type,
          year: m.year,
          posterUrl: m.posterUrl,
          externalIds: ext
        } : null,
        userMedia: {
          status: ul.status,
          progress: ul.progress,
          rating: ul.rating,
          isFavorite: ul.isFavorite,
          notes: ul.notes,
          startedAt: ul.startedAt,
          completedAt: ul.completedAt,
          rewatchCount: ul.rewatchCount
        },
        review: rev ? {
          rating: rev.rating,
          title: rev.title,
          content: rev.content,
          containsSpoilers: rev.containsSpoilers,
          createdAt: rev.createdAt,
          updatedAt: rev.updatedAt
        } : null
      };
    }).filter(item => item.media !== null);
    
    // 6. Fetch user's lists
    const userLists = await db.select().from(lists).where(eq(lists.ownerId, userId));
    let listsExport: any[] = [];
    if (userLists.length > 0) {
       const listIds = userLists.map(l => l.id);
       const lItems = await db.select().from(listItems).where(inArray(listItems.listId, listIds));
       
       // get media external IDs for list items that might not be in library
       const listMediaIds = lItems.map(li => li.mediaId).filter(id => !mediaIds.includes(id));
       let allListMediaExtIds = new Map(extIdsMap);
       let allListMediaMap = new Map(mediaMap);
       
       if (listMediaIds.length > 0) {
         const extraMedia = await db.select().from(media).where(inArray(media.id, listMediaIds));
         extraMedia.forEach(m => allListMediaMap.set(m.id, m));
         const extraExt = await db.select().from(mediaExternalIds).where(inArray(mediaExternalIds.mediaId, listMediaIds));
         extraExt.forEach(ext => {
           if (!allListMediaExtIds.has(ext.mediaId)) allListMediaExtIds.set(ext.mediaId, []);
           allListMediaExtIds.get(ext.mediaId)!.push({ provider: ext.provider, externalId: ext.externalId });
         });
       }
       
       listsExport = userLists.map(l => {
         const items = lItems.filter(li => li.listId === l.id).map(li => {
            const m = allListMediaMap.get(li.mediaId);
            const ext = allListMediaExtIds.get(li.mediaId) || [];
            return {
              media: m ? {
                title: m.originalTitle || m.title,
                type: m.type,
                year: m.year,
                posterUrl: m.posterUrl,
                externalIds: ext
              } : null,
              notes: li.notes,
              order: li.orderIndex
            };
         });
         return {
           title: l.title,
           description: l.description,
           category: l.category,
           visibility: l.visibility,
           items: items.filter(i => i.media !== null)
         };
       });
    }
    
    const exportData = {
      format: 'dodik-tracker',
      version: 1,
      library: libraryExport,
      lists: listsExport
    };
    
    return res.json(exportData);
  } catch (error) {
    console.error('Export Error:', error);
    return res.status(500).json({ error: 'Failed to export library' });
  }
});

importExportRouter.post('/import/preview', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { library = [] } = req.body;
    
    if (!Array.isArray(library)) {
      return res.status(400).json({ error: 'Invalid library format' });
    }
    
    const userId = req.dbUser!.id;
    const existingLibrary = await db.select().from(userMedia).where(eq(userMedia.userId, userId));
    const existingMediaIds = existingLibrary.map(u => u.mediaId);
    
    // We need to resolve media ids
    const matchedItems = [];
    const notFoundItems = [];
    let conflicts = 0;
    let added = 0;
    let updated = 0;
    
    for (const item of library) {
      const mediaData = item.media;
      if (!mediaData) continue;
      
      let matchedMediaId = null;
      
      // 1. Try to find by external IDs in our DB
      if (mediaData.externalIds && mediaData.externalIds.length > 0) {
         for (const ext of mediaData.externalIds) {
            const match = await db.select().from(mediaExternalIds)
               .where(and(eq(mediaExternalIds.provider, ext.provider), eq(mediaExternalIds.externalId, ext.externalId)))
               .limit(1);
            if (match.length > 0) {
               matchedMediaId = match[0].mediaId;
               break;
            }
         }
      }
      
      // 2. Try to find by title and year if no external ID matched
      if (!matchedMediaId && mediaData.title) {
         // Try exact string matching on originalTitle and title first, ignoring year
         // as many export files may not specify the year identically or at all.
         let match = await db.select().from(media)
            .where(and(
               eq(media.type, mediaData.type || 'MOVIE'),
               or(
                 eq(media.originalTitle, mediaData.title),
                 eq(media.title, mediaData.title),
                 ilike(media.originalTitle, mediaData.title),
                 ilike(media.title, mediaData.title)
               )
            ));
            
         // If we matched multiple but we have a year, filter it down
         if (match.length > 1 && mediaData.year) {
            match = match.filter(m => m.year === mediaData.year);
         }
         
         if (match.length > 0) {
            matchedMediaId = match[0].id;
         }
      }
      
      if (matchedMediaId) {
         const isExisting = existingMediaIds.includes(matchedMediaId);
         if (isExisting) {
            updated++;
            conflicts++; // If user imports something they already have, it's considered updated/conflict
         } else {
            added++;
         }
         
         matchedItems.push({
           ...item,
           resolvedMediaId: matchedMediaId,
           isExisting
         });
      } else {
         added++;
         matchedItems.push({
           ...item,
           resolvedMediaId: null,
           isExisting: false
         });
      }
    }
    
    return res.json({
       total: library.length,
       matched: matchedItems.length,
       notFound: notFoundItems.length,
       conflicts,
       added,
       updated,
       matchedItems,
       notFoundItems
    });
  } catch (error) {
    console.error('Import Preview Error:', error);
    return res.status(500).json({ error: 'Failed to preview import' });
  }
});

importExportRouter.post('/import/execute', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { items = [], strategy = 'all' } = req.body;
    // strategy: 'all', 'new', 'update'
    const userId = req.dbUser!.id;
    
    // We should use a transaction, but since Drizzle handles it well:
    await db.transaction(async (tx) => {
       for (const item of items) {
          
          let targetMediaId = item.resolvedMediaId;
          
          if (!targetMediaId) {
             const mData = item.media;
             if (!mData || !mData.title) continue;
             
             const [newMedia] = await tx.insert(media).values({
                 title: mData.title,
                 originalTitle: mData.title,
                 type: mData.type || 'MOVIE',
                 year: mData.year || null,
                 posterUrl: mData.posterUrl || null,
                 backdropUrl: mData.backdropUrl || null,
                 description: '',
                 
                 
             }).returning({ id: media.id });
             targetMediaId = newMedia.id;
             
             if (mData.externalIds && mData.externalIds.length > 0) {
                 for (const ext of mData.externalIds) {
                     await tx.insert(mediaExternalIds).values({
                         mediaId: targetMediaId,
                         provider: ext.provider,
                         externalId: ext.externalId
                     });
                 }
             }
          }

          if (!targetMediaId) continue;
          
          if (item.isExisting && strategy === 'new') continue;
          
          const uMedia = item.userMedia;
          if (!uMedia) continue;
          
          if (item.isExisting) {
             await tx.update(userMedia).set({
                status: uMedia.status,
                progress: uMedia.progress,
                rating: uMedia.rating,
                isFavorite: uMedia.isFavorite,
                notes: uMedia.notes,
                startedAt: uMedia.startedAt,
                completedAt: uMedia.completedAt,
                rewatchCount: uMedia.rewatchCount,
                updatedAt: new Date()
             }).where(and(eq(userMedia.userId, userId), eq(userMedia.mediaId, targetMediaId)));
          } else {
             await tx.insert(userMedia).values({
                userId,
                mediaId: targetMediaId,
                status: uMedia.status || 'COMPLETED',
                progress: uMedia.progress || 0,
                rating: uMedia.rating || null,
                isFavorite: uMedia.isFavorite || false,
                notes: uMedia.notes || null,
                startedAt: uMedia.startedAt || null,
                completedAt: uMedia.completedAt || null,
                rewatchCount: uMedia.rewatchCount || 0
             });
          }
          
          // Import review if present
          if (item.review) {
             const existingReview = await tx.select().from(reviews).where(and(eq(reviews.userId, userId), eq(reviews.mediaId, targetMediaId))).limit(1);
             if (existingReview.length > 0 && strategy !== 'new') {
                await tx.update(reviews).set({
                   rating: item.review.rating,
                   title: item.review.title,
                   content: item.review.content,
                   updatedAt: new Date()
                }).where(eq(reviews.id, existingReview[0].id));
             } else if (existingReview.length === 0) {
                await tx.insert(reviews).values({
                   userId,
                   mediaId: targetMediaId,
                   rating: item.review.rating,
                   title: item.review.title,
                   content: item.review.content,
                   containsSpoilers: item.review.containsSpoilers || false,
                   createdAt: item.review.createdAt ? new Date(item.review.createdAt) : new Date()
                });
             }
          }
       }
    });
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Import Execute Error:', error);
    return res.status(500).json({ error: 'Failed to execute import' });
  }
});
