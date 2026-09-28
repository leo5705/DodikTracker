/**
 * DODIK TRACKER — Unified Role-Based Access Control (RBAC) System
 *
 * Single Source of Truth for roles, permissions, and hierarchy.
 * Supports independent multi-role assignments:
 * [user], [user, musician], [user, musician, moderator], [user, musician, news_editor], etc.
 */

export type SystemRole =
  | 'user'
  | 'musician'
  | 'news_editor'
  | 'content_manager'
  | 'moderator'
  | 'admin'
  | 'super_admin';

export const ALL_ROLES: readonly SystemRole[] = [
  'user',
  'musician',
  'news_editor',
  'content_manager',
  'moderator',
  'admin',
  'super_admin',
] as const;

export const ROLE_HIERARCHY: Record<SystemRole, number> = {
  super_admin: 100,
  admin: 80,
  moderator: 60,
  content_manager: 50,
  news_editor: 40,
  musician: 20,
  user: 0,
};

export const ROLE_LABELS: Record<SystemRole, string> = {
  super_admin: 'Главный администратор',
  admin: 'Администратор',
  moderator: 'Модератор',
  content_manager: 'Контент-менеджер',
  news_editor: 'Редактор новостей',
  musician: 'Музыкант',
  user: 'Пользователь',
};

export const ROLE_BADGE_COLORS: Record<SystemRole, { bg: string; text: string; border: string }> = {
  super_admin: { bg: 'bg-rose-950/70', text: 'text-rose-400', border: 'border-rose-500/40' },
  admin: { bg: 'bg-violet-950/70', text: 'text-violet-300', border: 'border-violet-500/40' },
  moderator: { bg: 'bg-blue-950/70', text: 'text-blue-300', border: 'border-blue-500/40' },
  content_manager: { bg: 'bg-emerald-950/70', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  news_editor: { bg: 'bg-amber-950/70', text: 'text-amber-300', border: 'border-amber-500/40' },
  musician: { bg: 'bg-purple-950/70', text: 'text-purple-300', border: 'border-purple-500/40' },
  user: { bg: 'bg-slate-900/60', text: 'text-slate-400', border: 'border-slate-700/40' },
};

/**
 * Extracts and normalizes all roles for a user into a unique lowercase array.
 * Guaranteed to always include 'user'.
 */
export function getUserRoles(userOrRoleOrRoles: any): SystemRole[] {
  if (!userOrRoleOrRoles) return ['user'];

  const roleSet = new Set<string>();
  roleSet.add('user');

  const addRoleItem = (val: unknown) => {
    if (typeof val === 'string') {
      const clean = val.trim().toLowerCase();
      if (clean.startsWith('[') && clean.endsWith(']')) {
        try {
          const parsed = JSON.parse(clean);
          if (Array.isArray(parsed)) {
            parsed.forEach((p) => {
              if (typeof p === 'string' && p.trim()) {
                roleSet.add(p.trim().toLowerCase());
              }
            });
          }
        } catch (_e) {
          if (clean) roleSet.add(clean);
        }
      } else if (clean) {
        roleSet.add(clean);
      }
    }
  };

  if (typeof userOrRoleOrRoles === 'string') {
    addRoleItem(userOrRoleOrRoles);
  } else if (Array.isArray(userOrRoleOrRoles)) {
    userOrRoleOrRoles.forEach(addRoleItem);
  } else if (typeof userOrRoleOrRoles === 'object') {
    if (userOrRoleOrRoles.roles) {
      if (Array.isArray(userOrRoleOrRoles.roles)) {
        userOrRoleOrRoles.roles.forEach(addRoleItem);
      } else if (typeof userOrRoleOrRoles.roles === 'string') {
        addRoleItem(userOrRoleOrRoles.roles);
      }
    }
    if (userOrRoleOrRoles.role && typeof userOrRoleOrRoles.role === 'string') {
      addRoleItem(userOrRoleOrRoles.role);
    }
  }

  const validRoles = Array.from(roleSet).filter((r): r is SystemRole =>
    ALL_ROLES.includes(r as SystemRole)
  );

  return validRoles.length > 0 ? validRoles : ['user'];
}

/**
 * Checks if user has a specific role (or super_admin override).
 */
export function hasRole(userOrRole: any, role: SystemRole | string): boolean {
  const roles = getUserRoles(userOrRole);
  const target = role.toLowerCase().trim() as SystemRole;

  if (target === 'user') return true;
  if (roles.includes('super_admin')) return true;

  if (target === 'admin') {
    return roles.includes('admin') || roles.includes('super_admin');
  }

  return roles.includes(target);
}

/**
 * Specifically checks musician privileges (musician role or administrator).
 */
export function isMusician(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return (
    roles.includes('musician') ||
    roles.includes('admin') ||
    roles.includes('super_admin')
  );
}

/**
 * Specifically checks news editor privileges.
 */
export function isNewsEditor(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return (
    roles.includes('news_editor') ||
    roles.includes('admin') ||
    roles.includes('super_admin')
  );
}

/**
 * Specifically checks moderator privileges.
 */
export function isModerator(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return (
    roles.includes('moderator') ||
    roles.includes('admin') ||
    roles.includes('super_admin')
  );
}

/**
 * Checks content manager privileges.
 */
export function isContentManager(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return (
    roles.includes('content_manager') ||
    roles.includes('admin') ||
    roles.includes('super_admin')
  );
}

/**
 * Checks administrator privileges (ADMIN or SUPER_ADMIN).
 */
export function isAdminRole(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return roles.includes('admin') || roles.includes('super_admin');
}

/**
 * Checks super administrator privileges.
 */
export function isSuperAdmin(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return roles.includes('super_admin');
}

/**
 * Checks whether user has ANY staff/administrative role.
 */
export function isStaffRole(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return roles.some((r) =>
    ['super_admin', 'admin', 'moderator', 'content_manager', 'news_editor'].includes(r)
  );
}

/**
 * Determines whether user can access the Admin Dashboard (/admin/dashboard tab).
 * Explicitly: news_editor, musician, and regular user CANNOT access the dashboard!
 * Only moderator, content_manager, admin, and super_admin can view the dashboard.
 */
export function canAccessAdminDashboard(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  return roles.some((r) =>
    ['super_admin', 'admin', 'moderator', 'content_manager'].includes(r)
  );
}

/**
 * Determines whether user can access the admin portal at all.
 */
export function canAccessAdminPanel(userOrRole: any): boolean {
  return isStaffRole(userOrRole);
}

/**
 * Checks if user is ONLY a news editor (no higher roles like moderator, admin, super_admin).
 */
export function isOnlyNewsEditor(userOrRole: any): boolean {
  const roles = getUserRoles(userOrRole);
  const staff = roles.filter((r) =>
    ['super_admin', 'admin', 'moderator', 'content_manager', 'news_editor'].includes(r)
  );
  return staff.length === 1 && staff[0] === 'news_editor';
}

/**
 * Adds a role to the user's role list, ensuring uniqueness and preserving existing roles.
 */
export function addRole(currentRoles: any, roleToAdd: string): SystemRole[] {
  const existing = getUserRoles(currentRoles);
  const normalized = roleToAdd.toLowerCase().trim() as SystemRole;
  if (!ALL_ROLES.includes(normalized)) {
    throw new Error(`Недопустимая роль: ${roleToAdd}`);
  }
  const set = new Set<SystemRole>(existing);
  set.add(normalized);
  set.add('user');
  return Array.from(set);
}

/**
 * Removes a single role from the user's role list, preserving all other roles.
 * 'user' base role cannot be removed.
 */
export function removeRole(currentRoles: any, roleToRemove: string): SystemRole[] {
  const existing = getUserRoles(currentRoles);
  const normalized = roleToRemove.toLowerCase().trim() as SystemRole;
  if (normalized === 'user') {
    return existing;
  }
  const filtered = existing.filter((r) => r !== normalized);
  if (!filtered.includes('user')) {
    filtered.push('user');
  }
  return filtered;
}

/**
 * Computes the primary/legacy role string for backwards-compatibility.
 */
export function getPrimaryRole(roles: SystemRole[]): string {
  const sorted = [...roles].sort((a, b) => (ROLE_HIERARCHY[b] || 0) - (ROLE_HIERARCHY[a] || 0));
  const highest = sorted[0] || 'user';
  if (highest === 'musician') return 'musician';
  return highest.toUpperCase();
}

export type AdminPermission =
  | 'ACCESS_ADMIN_PANEL'
  | 'VIEW_DASHBOARD'
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'MANAGE_MODERATION'
  | 'MANAGE_NEWS'
  | 'MANAGE_ANNOUNCEMENTS'
  | 'MANAGE_CONTENT'
  | 'MANAGE_ACHIEVEMENTS'
  | 'MANAGE_NOTIFICATIONS'
  | 'MANAGE_INTEGRATIONS'
  | 'MANAGE_SETTINGS'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_ANALYTICS';

export const ROLE_PERMISSIONS: Record<SystemRole, readonly AdminPermission[]> = {
  super_admin: [
    'ACCESS_ADMIN_PANEL',
    'VIEW_DASHBOARD',
    'MANAGE_USERS',
    'MANAGE_ROLES',
    'MANAGE_MODERATION',
    'MANAGE_NEWS',
    'MANAGE_ANNOUNCEMENTS',
    'MANAGE_CONTENT',
    'MANAGE_ACHIEVEMENTS',
    'MANAGE_NOTIFICATIONS',
    'MANAGE_INTEGRATIONS',
    'MANAGE_SETTINGS',
    'VIEW_AUDIT_LOG',
    'VIEW_ANALYTICS',
  ],
  admin: [
    'ACCESS_ADMIN_PANEL',
    'VIEW_DASHBOARD',
    'MANAGE_USERS',
    'MANAGE_ROLES',
    'MANAGE_MODERATION',
    'MANAGE_NEWS',
    'MANAGE_ANNOUNCEMENTS',
    'MANAGE_CONTENT',
    'MANAGE_ACHIEVEMENTS',
    'MANAGE_NOTIFICATIONS',
    'MANAGE_INTEGRATIONS',
    'VIEW_AUDIT_LOG',
    'VIEW_ANALYTICS',
  ],
  moderator: [
    'ACCESS_ADMIN_PANEL',
    'VIEW_DASHBOARD',
    'MANAGE_MODERATION',
    'MANAGE_USERS',
    'VIEW_AUDIT_LOG',
    'VIEW_ANALYTICS',
  ],
  content_manager: [
    'ACCESS_ADMIN_PANEL',
    'VIEW_DASHBOARD',
    'MANAGE_CONTENT',
    'MANAGE_INTEGRATIONS',
    'VIEW_ANALYTICS',
  ],
  news_editor: [
    'ACCESS_ADMIN_PANEL',
    'MANAGE_NEWS',
    'MANAGE_ANNOUNCEMENTS',
  ],
  musician: [],
  user: [],
};

/**
 * Checks if the user possesses the required permission across ANY of their assigned roles.
 */
export function hasStaffPermission(userOrRole: any, permission: AdminPermission): boolean {
  const roles = getUserRoles(userOrRole);
  for (const r of roles) {
    const perms = ROLE_PERMISSIONS[r];
    if (perms && perms.includes(permission)) {
      return true;
    }
  }
  return false;
}
