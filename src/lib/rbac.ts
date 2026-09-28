export const APP_ROLES = [
  'user',
  'musician',
  'news_editor',
  'content_manager',
  'moderator',
  'admin',
  'super_admin',
] as const;

export type AppRole = typeof APP_ROLES[number];

export type AdminPermission =
  | 'ACCESS_ADMIN_PANEL'
  | 'VIEW_DASHBOARD'
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'MANAGE_MODERATION'
  | 'MANAGE_MUSIC_MODERATION'
  | 'MANAGE_NEWS'
  | 'MANAGE_ANNOUNCEMENTS'
  | 'MANAGE_CONTENT'
  | 'MANAGE_ACHIEVEMENTS'
  | 'MANAGE_NOTIFICATIONS'
  | 'MANAGE_INTEGRATIONS'
  | 'MANAGE_SETTINGS'
  | 'MANAGE_INVITES'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_ANALYTICS'
  | 'CREATIVE_STUDIO';

/**
 * Parses user roles into a normalized, deduplicated array of lowercase AppRole strings.
 * Always guarantees 'user' is present.
 */
export function parseUserRoles(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): AppRole[] {
  if (!user) return [];
  const set = new Set<string>();
  set.add('user');

  if (user.roles) {
    if (Array.isArray(user.roles)) {
      user.roles.forEach((r) => {
        if (typeof r === 'string' && r.trim()) set.add(r.trim().toLowerCase());
      });
    } else if (typeof user.roles === 'string') {
      try {
        const parsed = JSON.parse(user.roles);
        if (Array.isArray(parsed)) {
          parsed.forEach((r) => {
            if (typeof r === 'string' && r.trim()) set.add(r.trim().toLowerCase());
          });
        } else if (typeof parsed === 'string') {
          set.add(parsed.trim().toLowerCase());
        }
      } catch {
        user.roles.split(',').forEach((r) => {
          if (r.trim()) set.add(r.trim().toLowerCase());
        });
      }
    }
  }

  // Also include legacy user.role if present
  if (user.role) {
    const legacy = user.role.trim().toLowerCase();
    if (legacy && legacy !== 'user') {
      set.add(legacy);
    }
  }

  return Array.from(set).filter((r): r is AppRole => APP_ROLES.includes(r as AppRole));
}

/**
 * Computes the primary display role for the users.role column (backward-compatibility).
 */
export function getPrimaryRole(roles: (AppRole | string)[]): string {
  const normalized = roles.map((r) => r.toLowerCase().trim());
  if (normalized.includes('super_admin')) return 'SUPER_ADMIN';
  if (normalized.includes('admin')) return 'ADMIN';
  if (normalized.includes('moderator')) return 'MODERATOR';
  if (normalized.includes('content_manager')) return 'CONTENT_MANAGER';
  if (normalized.includes('news_editor')) return 'NEWS_EDITOR';
  if (normalized.includes('musician')) return 'musician';
  return 'USER';
}

/**
 * Checks if a user has a specific role.
 */
export function hasRole(
  user: { roles?: string | string[] | null; role?: string | null } | null | undefined,
  role: AppRole | string
): boolean {
  if (!user) return false;
  const userRoles = parseUserRoles(user);
  return userRoles.includes(role.toLowerCase().trim() as AppRole);
}

/**
 * Adds a role to an existing set of roles (idempotent, no duplicates, preserves others).
 */
export function addRoleToSet(currentRoles: (AppRole | string)[], newRole: AppRole | string): AppRole[] {
  const norm = newRole.toLowerCase().trim() as AppRole;
  if (!APP_ROLES.includes(norm)) {
    throw new Error(`Недопустимая роль: ${newRole}`);
  }
  const set = new Set(currentRoles.map((r) => r.toLowerCase().trim() as AppRole));
  set.add('user');
  set.add(norm);
  return Array.from(set).filter((r): r is AppRole => APP_ROLES.includes(r));
}

/**
 * Removes a role from a set of roles (preserves all other roles).
 * Base 'user' role cannot be removed.
 */
export function removeRoleFromSet(currentRoles: (AppRole | string)[], roleToRemove: AppRole | string): AppRole[] {
  const norm = roleToRemove.toLowerCase().trim() as AppRole;
  if (norm === 'user') {
    throw new Error('Базовая роль "user" обязательна и не может быть удалена');
  }
  const set = new Set(currentRoles.map((r) => r.toLowerCase().trim() as AppRole));
  set.delete(norm);
  set.add('user'); // Always keep 'user'
  return Array.from(set).filter((r): r is AppRole => APP_ROLES.includes(r));
}

/**
 * Checks if user is any staff role.
 */
export function isStaff(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const roles = parseUserRoles(user);
  return roles.some((r) => ['super_admin', 'admin', 'moderator', 'content_manager', 'news_editor'].includes(r));
}

/**
 * Checks if user has admin privileges (ADMIN or SUPER_ADMIN).
 */
export function isAdmin(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const roles = parseUserRoles(user);
  return roles.includes('admin') || roles.includes('super_admin');
}

/**
 * Checks if user has super admin privileges.
 */
export function isSuperAdmin(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const roles = parseUserRoles(user);
  return roles.includes('super_admin');
}

/**
 * Checks if user has active musician status.
 */
export function isMusician(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return hasRole(user, 'musician');
}

/**
 * Checks if user has moderator privileges (MODERATOR, ADMIN, SUPER_ADMIN).
 */
export function isModerator(user: { roles?: string | string[] | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const roles = parseUserRoles(user);
  return roles.includes('moderator') || roles.includes('admin') || roles.includes('super_admin');
}

/**
 * Central permission check function.
 */
export function hasPermission(
  user: { roles?: string | string[] | null; role?: string | null } | null | undefined,
  permission: AdminPermission
): boolean {
  if (!user) return false;
  const roles = parseUserRoles(user);

  if (roles.includes('super_admin')) return true;

  if (roles.includes('admin')) {
    // Admin has access to all admin operations except super_admin delegation
    return permission !== 'MANAGE_SETTINGS' && permission !== 'CREATIVE_STUDIO'
      ? true
      : permission === 'MANAGE_SETTINGS'
      ? true
      : roles.includes('musician');
  }

  switch (permission) {
    case 'VIEW_DASHBOARD':
      // Dashboard is strictly available for moderator+ (moderator, admin, super_admin)
      // NEWS_EDITOR and regular USER CANNOT view dashboard!
      return roles.includes('moderator') || roles.includes('admin') || roles.includes('super_admin');

    case 'ACCESS_ADMIN_PANEL':
      // Staff members can access admin panel for their respective functions
      return roles.some((r) => ['moderator', 'content_manager', 'news_editor', 'admin', 'super_admin'].includes(r));

    case 'MANAGE_NEWS':
    case 'MANAGE_ANNOUNCEMENTS':
      return roles.includes('news_editor') || roles.includes('admin') || roles.includes('super_admin');

    case 'MANAGE_CONTENT':
      return roles.includes('content_manager') || roles.includes('admin') || roles.includes('super_admin');

    case 'MANAGE_MODERATION':
    case 'MANAGE_MUSIC_MODERATION':
    case 'VIEW_AUDIT_LOG':
      return roles.includes('moderator') || roles.includes('admin') || roles.includes('super_admin');

    case 'MANAGE_USERS':
      // Viewing users list and warnings/bans
      return roles.includes('moderator') || roles.includes('admin') || roles.includes('super_admin');

    case 'MANAGE_ROLES':
      // Role changing is strictly ADMIN or SUPER_ADMIN
      return roles.includes('admin') || roles.includes('super_admin');

    case 'MANAGE_INVITES':
    case 'MANAGE_INTEGRATIONS':
    case 'MANAGE_SETTINGS':
    case 'MANAGE_ACHIEVEMENTS':
    case 'MANAGE_NOTIFICATIONS':
    case 'VIEW_ANALYTICS':
      return roles.includes('admin') || roles.includes('super_admin');

    case 'CREATIVE_STUDIO':
      // Creative Studio is strictly for users with the musician role
      return roles.includes('musician');

    default:
      return false;
  }
}
