import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Pencil, Crown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NAV_SECTIONS } from '@/lib/navigation';
import type { Permissions, PermissionAction, ResourcePermissions, PermissionResource } from '@/hooks/usePermissions';

const EMPTY: ResourcePermissions = { view: false, edit: false, admin: false };

export type PagePermissionMap = Record<string, ResourcePermissions>;

/** Start from explicit page entries, falling back to the page's category permission. */
export function buildInitialPageMap(permissions: Permissions | undefined): PagePermissionMap {
  const map: PagePermissionMap = {};
  NAV_SECTIONS.forEach((section) => {
    section.items.forEach((item) => {
      const explicit = permissions?.pages?.[item.path];
      const category = permissions?.[item.resource];
      const src = explicit ?? category ?? EMPTY;
      map[item.path] = { view: !!src.view, edit: !!src.edit, admin: !!src.admin };
    });
  });
  return map;
}

/**
 * Store the page map and keep each category permission as the union of its
 * pages, so database-side checks stay in step with what the pages allow.
 */
export function mergePagePermissions(base: Permissions, pages: PagePermissionMap): Permissions {
  const next: Permissions = { ...base, pages };
  const resources = new Set<PermissionResource>();
  NAV_SECTIONS.forEach((s) => s.items.forEach((i) => resources.add(i.resource)));

  resources.forEach((resource) => {
    const entries = NAV_SECTIONS.flatMap((s) => s.items)
      .filter((i) => i.resource === resource)
      .map((i) => pages[i.path] ?? EMPTY);
    next[resource] = {
      view: entries.some((e) => e.view || e.edit || e.admin),
      edit: entries.some((e) => e.edit || e.admin),
      admin: entries.some((e) => e.admin),
    };
  });

  return next;
}

function applyToggle(current: ResourcePermissions, action: PermissionAction): ResourcePermissions {
  const on = !current[action];
  if (action === 'admin') return on ? { view: true, edit: true, admin: true } : { ...current, admin: false };
  if (action === 'edit') return on ? { ...current, view: true, edit: true } : { ...current, edit: false, admin: false };
  return on ? { ...current, view: true } : { view: false, edit: false, admin: false };
}

function levelValue(action: PermissionAction): ResourcePermissions {
  if (action === 'admin') return { view: true, edit: true, admin: true };
  if (action === 'edit') return { view: true, edit: true, admin: false };
  return { view: true, edit: false, admin: false };
}

interface Props {
  pages: PagePermissionMap;
  onChange: (pages: PagePermissionMap) => void;
}

export function RolePermissionMatrix({ pages, onChange }: Props) {
  const [open, setOpen] = useState<string[]>([NAV_SECTIONS[0].title]);

  const toggleSection = (title: string) =>
    setOpen((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));

  const setPage = (path: string, value: ResourcePermissions) =>
    onChange({ ...pages, [path]: value });

  const setSection = (title: string, action: PermissionAction | 'none') => {
    const section = NAV_SECTIONS.find((s) => s.title === title);
    if (!section) return;
    const next = { ...pages };
    section.items.forEach((item) => {
      next[item.path] = action === 'none' ? { ...EMPTY } : levelValue(action);
    });
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {NAV_SECTIONS.map((section) => {
        const isOpen = open.includes(section.title);
        const granted = section.items.filter((i) => pages[i.path]?.view).length;
        return (
          <Collapsible
            key={section.title}
            open={isOpen}
            onOpenChange={() => toggleSection(section.title)}
            className="border rounded-lg overflow-hidden"
          >
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2 flex-wrap">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 min-h-11 flex-1 text-left text-sm font-medium"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{section.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {granted}/{section.items.length} pages
                  </span>
                </button>
              </CollapsibleTrigger>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs"
                  onClick={() => setSection(section.title, 'view')}>All View</Button>
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs"
                  onClick={() => setSection(section.title, 'edit')}>All Edit</Button>
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs"
                  onClick={() => setSection(section.title, 'admin')}>All Admin</Button>
                <Button type="button" variant="ghost" size="sm" className="h-9 text-xs"
                  onClick={() => setSection(section.title, 'none')}>Clear</Button>
              </div>
            </div>

            <CollapsibleContent>
              <div className="hidden sm:grid grid-cols-[1fr_5rem_5rem_5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <div>Page</div>
                <div className="text-center flex items-center justify-center gap-1"><Eye className="h-3 w-3" /> View</div>
                <div className="text-center flex items-center justify-center gap-1"><Pencil className="h-3 w-3" /> Edit</div>
                <div className="text-center flex items-center justify-center gap-1"><Crown className="h-3 w-3" /> Admin</div>
              </div>
              <div className="divide-y">
                {section.items.map((item) => {
                  const perms = pages[item.path] ?? EMPTY;
                  return (
                    <div
                      key={item.path}
                      className="grid grid-cols-[1fr_5rem_5rem_5rem] gap-2 px-3 py-2 items-center min-h-12"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{item.label}</span>
                        {item.ownerOnly && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Owner</span>
                        )}
                      </div>
                      {(['view', 'edit', 'admin'] as PermissionAction[]).map((action) => (
                        <div key={action} className="flex justify-center">
                          <Switch
                            checked={perms[action]}
                            onCheckedChange={() => setPage(item.path, applyToggle(perms, action))}
                            aria-label={`${item.label} ${action}`}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
