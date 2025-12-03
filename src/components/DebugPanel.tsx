import { useRestaurant } from "@/contexts/RestaurantContext";
import { usePermissions, PermissionResource } from "@/hooks/usePermissions";

interface NavItem {
  label: string;
  path: string;
  permission?: { resource: PermissionResource; action: 'view' | 'edit' | 'admin' };
}

interface NavSection {
  title: string;
  permission?: PermissionResource;
  items: NavItem[];
}

const navSections: NavSection[] = [
  { title: "Overview", permission: 'dashboard', items: [
    { label: "Dashboard", path: "/", permission: { resource: 'dashboard', action: 'view' } },
    { label: "Locations", path: "/locations", permission: { resource: 'locations', action: 'view' } },
  ]},
  { title: "Staff", permission: 'staff', items: [
    { label: "Staff List", path: "/staff", permission: { resource: 'staff', action: 'view' } },
  ]},
  { title: "Menu", permission: 'menu', items: [
    { label: "Dishes", path: "/dishes", permission: { resource: 'menu', action: 'view' } },
  ]},
  { title: "Inventory", permission: 'inventory', items: [
    { label: "Ingredients", path: "/ingredients", permission: { resource: 'inventory', action: 'view' } },
  ]},
  { title: "Settings", permission: 'settings', items: [
    { label: "Role Builder", path: "/settings/roles", permission: { resource: 'settings', action: 'view' } },
  ]},
];

export function DebugPanel() {
  const { user, currentRestaurant, permissions, isLoading } = useRestaurant();
  const { hasPermission, hasFullAccess } = usePermissions();

  // Calculate which items would be hidden and why
  const hiddenItems: { section: string; item: string; reason: string }[] = [];
  const visibleItems: { section: string; item: string }[] = [];

  navSections.forEach(section => {
    // Check section-level permission
    const sectionVisible = !section.permission || hasPermission(section.permission, 'view');
    
    if (!sectionVisible) {
      section.items.forEach(item => {
        hiddenItems.push({
          section: section.title,
          item: item.label,
          reason: `Section permission '${section.permission}:view' = false`
        });
      });
    } else {
      section.items.forEach(item => {
        if (!item.permission) {
          visibleItems.push({ section: section.title, item: item.label });
        } else {
          const itemVisible = hasPermission(item.permission.resource, item.permission.action);
          if (itemVisible) {
            visibleItems.push({ section: section.title, item: item.label });
          } else {
            hiddenItems.push({
              section: section.title,
              item: item.label,
              reason: `Item permission '${item.permission.resource}:${item.permission.action}' = false`
            });
          }
        }
      });
    }
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-black/90 text-green-400 text-xs font-mono p-4 max-h-[50vh] overflow-auto">
      <div className="flex items-center gap-2 mb-2 text-yellow-400 font-bold">
        🐛 DEBUG PANEL (remove after debugging)
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Left column - Context values */}
        <div className="space-y-2">
          <div className="text-cyan-400 font-bold">RestaurantContext Values:</div>
          
          <div>
            <span className="text-gray-400">user_id: </span>
            <span className={user?.id ? "text-green-400" : "text-red-400"}>
              {user?.id || "NULL"}
            </span>
          </div>
          
          <div>
            <span className="text-gray-400">user_email: </span>
            <span>{user?.email || "NULL"}</span>
          </div>
          
          <div>
            <span className="text-gray-400">restaurant_id: </span>
            <span className={currentRestaurant?.id ? "text-green-400" : "text-red-400"}>
              {currentRestaurant?.id || "NULL"}
            </span>
          </div>
          
          <div>
            <span className="text-gray-400">restaurant_name: </span>
            <span>{currentRestaurant?.name || "NULL"}</span>
          </div>
          
          <div>
            <span className="text-gray-400">isLoading: </span>
            <span className={isLoading ? "text-yellow-400" : "text-green-400"}>
              {String(isLoading)}
            </span>
          </div>
          
          <div className="text-cyan-400 font-bold mt-3">Permissions Object:</div>
          <div>
            <span className="text-gray-400">permissions: </span>
            <span className={permissions ? "text-green-400" : "text-red-400"}>
              {permissions ? "EXISTS" : "NULL"}
            </span>
          </div>
          
          <div>
            <span className="text-gray-400">full_access: </span>
            <span className={permissions?.full_access ? "text-green-400" : "text-yellow-400"}>
              {String(permissions?.full_access ?? "undefined")}
            </span>
          </div>

          <div>
            <span className="text-gray-400">hasFullAccess(): </span>
            <span className={hasFullAccess() ? "text-green-400" : "text-yellow-400"}>
              {String(hasFullAccess())}
            </span>
          </div>
          
          <pre className="text-[10px] bg-black/50 p-2 rounded max-h-32 overflow-auto">
            {JSON.stringify(permissions, null, 2) || "null"}
          </pre>
        </div>
        
        {/* Right column - Sidebar filtering */}
        <div className="space-y-2">
          <div className="text-cyan-400 font-bold">Sidebar Filter Results:</div>
          
          <div>
            <span className="text-gray-400">usePermissions isLoading: </span>
            <span className={isLoading ? "text-yellow-400" : "text-green-400"}>
              {String(isLoading)}
            </span>
          </div>
          
          <div className="text-green-400 font-bold mt-2">Visible Items ({visibleItems.length}):</div>
          <div className="text-[10px] max-h-20 overflow-auto">
            {visibleItems.map((v, i) => (
              <div key={i}>{v.section} → {v.item}</div>
            ))}
          </div>
          
          <div className="text-red-400 font-bold mt-2">Hidden Items ({hiddenItems.length}):</div>
          <div className="text-[10px] max-h-32 overflow-auto bg-black/50 p-2 rounded">
            {hiddenItems.length === 0 ? (
              <span className="text-gray-400">None hidden</span>
            ) : (
              hiddenItems.map((h, i) => (
                <div key={i} className="text-red-300">
                  {h.section} → {h.item}: <span className="text-orange-400">{h.reason}</span>
                </div>
              ))
            )}
          </div>
          
          <div className="text-cyan-400 font-bold mt-2">Permission Check Samples:</div>
          <div className="text-[10px] space-y-1">
            <div>dashboard:view = {String(hasPermission('dashboard', 'view'))}</div>
            <div>staff:view = {String(hasPermission('staff', 'view'))}</div>
            <div>menu:view = {String(hasPermission('menu', 'view'))}</div>
            <div>settings:view = {String(hasPermission('settings', 'view'))}</div>
            <div>inventory:view = {String(hasPermission('inventory', 'view'))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
