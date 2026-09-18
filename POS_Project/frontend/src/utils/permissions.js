/**
 * Utility functions for Granular Module Permissions (View vs Maintain)
 */

function getModulePermVal(permissions, moduleKey) {
  if (!permissions) return undefined;
  
  // If exact moduleKey exists in permissions object, return it directly
  if (permissions[moduleKey] !== undefined) {
    return permissions[moduleKey];
  }
  
  // If role permissions were configured using the new per-page structure,
  // do not fall back to legacy keys for unselected modules.
  const modernKeys = ['pos', 'sales', 'dashboard', 'products', 'inventory', 'recipes', 'ocr', 'customers', 'settings', 'approvals'];
  const isModernConfig = modernKeys.some(k => permissions[k] !== undefined);
  if (isModernConfig) {
    return false;
  }

  // Backward-compatibility fallback only for legacy roles (e.g. { inventory: true, reports: true })
  if (moduleKey === 'products') return permissions.inventory;
  if (moduleKey === 'sales' || moduleKey === 'dashboard') return permissions.reports;
  if (moduleKey === 'approvals') return permissions.reports || permissions.settings;
  
  return undefined;
}

/**
 * Checks whether a user has permission to VIEW a given module page.
 * @param {object} user - User object with permissions property
 * @param {string} moduleKey - Module key (e.g., 'pos', 'sales', 'dashboard', 'products', 'inventory', 'recipes', 'ocr', 'customers', 'settings', 'approvals')
 * @returns {boolean}
 */
export function canViewModule(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (moduleKey === 'approvals' && user.role === 'manager') return true;
  const p = user.permissions;
  if (!p) return false;
  if (p.all) return true;
  const mod = getModulePermVal(p, moduleKey);
  if (mod === true) return true;
  if (typeof mod === 'object' && mod !== null) {
    return Boolean(mod.view || mod.maintain);
  }
  return false;
}

/**
 * Checks whether a user has permission to MAINTAIN (add/edit/delete/manage) a given module page.
 * @param {object} user - User object with permissions property
 * @param {string} moduleKey - Module key (e.g., 'pos', 'sales', 'dashboard', 'products', 'inventory', 'recipes', 'ocr', 'customers', 'settings', 'approvals')
 * @returns {boolean}
 */
export function canMaintainModule(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (moduleKey === 'approvals' && user.role === 'manager') return true;

  const p = user.permissions;
  if (!p) return false;
  if (p.all) return true;
  const mod = getModulePermVal(p, moduleKey);
  if (mod === true) return true;
  if (typeof mod === 'object' && mod !== null) {
    return Boolean(mod.maintain);
  }
  return false;
}
