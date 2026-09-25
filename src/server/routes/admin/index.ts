import { Router } from 'express';
import { dashboardRouter } from './dashboard.ts';
import { usersRouter } from './users.ts';
import { moderationRouter } from './moderation.ts';
import { newsRouter } from './news.ts';
import { announcementsRouter } from './announcements.ts';
import { contentRouter } from './content.ts';
import { adminNotificationsRouter } from './notifications.ts';
import { analyticsRouter } from './analytics.ts';
import { settingsRouter } from './settings.ts';
import { integrationsRouter } from './integrations.ts';
import { systemRouter } from './system.ts';

export const adminRouter = Router();

adminRouter.use('/', dashboardRouter);
adminRouter.use('/', usersRouter);
adminRouter.use('/', moderationRouter);
adminRouter.use('/', newsRouter);
adminRouter.use('/', announcementsRouter);
adminRouter.use('/', contentRouter);
adminRouter.use('/', adminNotificationsRouter);
adminRouter.use('/', analyticsRouter);
adminRouter.use('/', settingsRouter);
adminRouter.use('/', integrationsRouter);
adminRouter.use('/', systemRouter);
