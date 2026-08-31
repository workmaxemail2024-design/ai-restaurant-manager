import { useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  useRoles, 
  useCreateRole, 
  useUpdateRole, 
  useDeleteRole,
  useUsersWithRoles,
  useAssignRole,
  Role 
} from '@/hooks/useRoles';
import { useInvites, useCreateInvite, useRevokeInvite, useMemberProfiles } from '@/hooks/useInvites';
import { useLocations } from '@/hooks/useLocations';
import { Permissions, ResourcePermissions, PermissionResource, usePermissions } from '@/hooks/usePermissions';
import { RequirePermission } from '@/components/RequirePermission';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Shield, 
  Users, 
  Eye, 
  Pencil, 
  Crown,
  Loader2,
  Mail,
  UserPlus,
  Settings
} from 'lucide-react';

const PERMISSION_CATEGORIES: { 
  resource: PermissionResource; 
  label: string; 
  description: string;
}[] = [
  { resource: 'dashboard', label: 'Dashboard', description: 'View main dashboard and metrics' },
  { resource: 'staff', label: 'Staff Management', description: 'Manage staff, shifts, and attendance' },
  { resource: 'menu', label: 'Menu Management', description: 'Manage dishes and menu items' },
  { resource: 'inventory', label: 'Inventory', description: 'Manage ingredients and stock levels' },
  { resource: 'purchase_orders', label: 'Purchase Orders', description: 'Create and manage purchase orders' },
  { resource: 'reports', label: 'Reports', description: 'View and generate reports' },
  { resource: 'analytics', label: 'Analytics', description: 'Access analytics and insights' },
  { resource: 'ai_features', label: 'AI Features', description: 'Use AI-powered features' },
  { resource: 'pos', label: 'POS Integrations', description: 'Manage POS system integrations' },
  { resource: 'settings', label: 'Settings', description: 'Access system settings' },
  { resource: 'automation', label: 'Automation', description: 'Configure automation rules' },
  { resource: 'finance', label: 'Finance', description: 'Access financial data and reports' },
  { resource: 'locations', label: 'Multi-Location', description: 'Manage multiple locations' },
];

const defaultPermissions: Permissions = {
  dashboard: { view: false, edit: false, admin: false },
  staff: { view: false, edit: false, admin: false },
  menu: { view: false, edit: false, admin: false },
  inventory: { view: false, edit: false, admin: false },
  purchase_orders: { view: false, edit: false, admin: false },
  reports: { view: false, edit: false, admin: false },
  analytics: { view: false, edit: false, admin: false },
  ai_features: { view: false, edit: false, admin: false },
  pos: { view: false, edit: false, admin: false },
  settings: { view: false, edit: false, admin: false },
  automation: { view: false, edit: false, admin: false },
  finance: { view: false, edit: false, admin: false },
  locations: { view: false, edit: false, admin: false },
};

export default function RoleBuilderPage() {
  return (
    <RequirePermission resource="settings" action="view" redirectTo="/">
      <RoleBuilderContent />
    </RequirePermission>
  );
}

function RoleBuilderContent() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: usersWithRoles, isLoading: usersLoading } = useUsersWithRoles();
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  if (rolesLoading) {
    return (
      <PageLayout title="Role Builder" subtitle="Manage roles and permissions">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Role Builder" 
      subtitle="Create and manage custom roles with granular permissions"
    >
      <Tabs defaultValue="roles" className="space-y-6">
        <TabsList>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            User Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Custom Roles</h3>
              <p className="text-sm text-muted-foreground">
                {roles?.length || 0} roles configured
              </p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Role
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Role</DialogTitle>
                  <DialogDescription>
                    Define a new role with custom permissions
                  </DialogDescription>
                </DialogHeader>
                <RoleForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {roles?.map((role) => (
              <RoleCard 
                key={role.id} 
                role={role} 
                onEdit={() => setSelectedRole(role)}
                onDelete={() => setDeleteRoleId(role.id)}
              />
            ))}
          </div>

          {/* Edit Role Dialog */}
          <Dialog open={!!selectedRole} onOpenChange={(open) => !open && setSelectedRole(null)}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Role: {selectedRole?.name}</DialogTitle>
                <DialogDescription>
                  Modify role permissions
                </DialogDescription>
              </DialogHeader>
              {selectedRole && (
                <RoleForm 
                  role={selectedRole} 
                  onSuccess={() => setSelectedRole(null)} 
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={!!deleteRoleId} onOpenChange={(open) => !open && setDeleteRoleId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Role?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Users assigned to this role will lose their permissions.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <DeleteRoleButton roleId={deleteRoleId!} onSuccess={() => setDeleteRoleId(null)} />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserAssignments users={usersWithRoles || []} roles={roles || []} isLoading={usersLoading} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}

function RoleCard({ role, onEdit, onDelete }: { 
  role: Role; 
  onEdit: () => void;
  onDelete: () => void;
}) {
  const permissionCount = Object.values(role.permissions as Permissions).filter(
    p => typeof p === 'object' && (p.view || p.edit || p.admin)
  ).length;

  const isOwnerRole = role.name === 'Owner' && role.is_system_role;

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {isOwnerRole && <Crown className="h-4 w-4 text-yellow-500" />}
              {role.name}
              {role.is_system_role && (
                <Badge variant="secondary" className="text-xs">System</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              {role.description || 'No description'}
            </CardDescription>
          </div>
          {!isOwnerRole && (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
              {!role.is_system_role && (
                <Button variant="ghost" size="icon" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>
            {(role.permissions as Permissions).full_access 
              ? 'Full Access' 
              : `${permissionCount} permission categories`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleForm({ role, onSuccess }: { role?: Role; onSuccess: () => void }) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState<Permissions>(
    role?.permissions as Permissions || defaultPermissions
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (role) {
      await updateRole.mutateAsync({ id: role.id, name, description, permissions });
    } else {
      await createRole.mutateAsync({ name, description, permissions });
    }
    onSuccess();
  };

  const togglePermission = (resource: PermissionResource, action: 'view' | 'edit' | 'admin') => {
    setPermissions(prev => {
      const current = prev[resource] || { view: false, edit: false, admin: false };
      const newValue = !current[action];
      
      // If enabling admin, enable all
      // If enabling edit, enable view
      // If disabling view, disable all
      let newPerms: ResourcePermissions;
      
      if (action === 'admin') {
        newPerms = newValue 
          ? { view: true, edit: true, admin: true }
          : { ...current, admin: false };
      } else if (action === 'edit') {
        newPerms = newValue
          ? { ...current, view: true, edit: true }
          : { ...current, edit: false, admin: false };
      } else {
        newPerms = newValue
          ? { ...current, view: true }
          : { view: false, edit: false, admin: false };
      }
      
      return { ...prev, [resource]: newPerms };
    });
  };

  const isSubmitting = createRole.isPending || updateRole.isPending;
  const isOwnerRole = role?.name === 'Owner' && role?.is_system_role;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Role Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Kitchen Manager"
            disabled={isOwnerRole}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this role"
            disabled={isOwnerRole}
          />
        </div>
      </div>

      {!isOwnerRole && (
        <div className="space-y-4">
          <Label>Permissions</Label>
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-4 gap-4 p-3 bg-muted/50 text-sm font-medium">
              <div>Category</div>
              <div className="text-center flex items-center justify-center gap-1">
                <Eye className="h-3 w-3" /> View
              </div>
              <div className="text-center flex items-center justify-center gap-1">
                <Pencil className="h-3 w-3" /> Edit
              </div>
              <div className="text-center flex items-center justify-center gap-1">
                <Crown className="h-3 w-3" /> Admin
              </div>
            </div>
            <div className="divide-y">
              {PERMISSION_CATEGORIES.map(({ resource, label, description }) => {
                const perms = permissions[resource] || { view: false, edit: false, admin: false };
                return (
                  <div key={resource} className="grid grid-cols-4 gap-4 p-3 items-center hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground">{description}</div>
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={perms.view}
                        onCheckedChange={() => togglePermission(resource, 'view')}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={perms.edit}
                        onCheckedChange={() => togglePermission(resource, 'edit')}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={perms.admin}
                        onCheckedChange={() => togglePermission(resource, 'admin')}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting || !name.trim() || isOwnerRole}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {role ? 'Update Role' : 'Create Role'}
        </Button>
      </div>
    </form>
  );
}

function DeleteRoleButton({ roleId, onSuccess }: { roleId: string; onSuccess: () => void }) {
  const deleteRole = useDeleteRole();
  
  const handleDelete = async () => {
    await deleteRole.mutateAsync(roleId);
    onSuccess();
  };

  return (
    <AlertDialogAction onClick={handleDelete} disabled={deleteRole.isPending}>
      {deleteRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      Delete
    </AlertDialogAction>
  );
}

function InviteUserDialog({ roles }: { roles: Role[] }) {
  const { data: locations } = useLocations();
  const { hasFullAccess } = usePermissions();
  const createInvite = useCreateInvite();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [locationId, setLocationId] = useState('');

  const selectedRole = roles.find(r => r.id === roleId);
  const roleIsFullAccess = (selectedRole?.permissions as Permissions | undefined)?.full_access === true;
  // Only an Owner may invite into a full-access role
  const availableRoles = hasFullAccess()
    ? roles
    : roles.filter(r => (r.permissions as Permissions).full_access !== true);
  const locationRequired = !!selectedRole && !roleIsFullAccess;
  const canSubmit = !!email.trim() && !!roleId && (!locationRequired || !!locationId);

  const reset = () => { setEmail(''); setRoleId(''); setLocationId(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInvite.mutateAsync({
      email,
      roleId,
      locationId: roleIsFullAccess ? (locationId || null) : locationId,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            They join this restaurant automatically the next time they log in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@restaurant.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Location {locationRequired && <span className="text-destructive">*</span>}
            </Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder={roleIsFullAccess ? 'All locations (owner)' : 'Select location'} />
              </SelectTrigger>
              <SelectContent>
                {(locations ?? []).map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {roleIsFullAccess
                ? 'Owners get access to every location automatically.'
                : 'Managers and staff are locked to their assigned location.'}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || createInvite.isPending}>
              {createInvite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingInvites() {
  const { data: invites } = useInvites();
  const { data: locations } = useLocations();
  const revoke = useRevokeInvite();
  const pending = (invites ?? []).filter(i => i.status === 'pending');

  if (pending.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pending invitations</CardTitle>
        <CardDescription>Accepted automatically on the invited user's next login</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {pending.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-medium text-sm">{invite.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {invite.role}
                    {invite.location_id
                      ? ` · ${locations?.find(l => l.id === invite.location_id)?.name ?? 'Assigned location'}`
                      : ' · All locations'}
                    {` · expires ${new Date(invite.expires_at).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate(invite.id)}
                disabled={revoke.isPending}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UserAssignments({ users, roles, isLoading }: { 
  users: Array<{ id: string; user_id: string; role_id: string | null; role?: Role }>;
  roles: Role[];
  isLoading: boolean;
}) {
  const assignRole = useAssignRole();
  const { data: profiles } = useMemberProfiles(users.map(u => u.user_id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">User Role Assignments</h3>
          <p className="text-sm text-muted-foreground">
            Assign roles to users in your restaurant
          </p>
        </div>
        <InviteUserDialog roles={roles} />
      </div>

      <PendingInvites />

      {users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32">
            <Users className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No users in this restaurant yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {users.map((user) => {
                const profile = profiles?.[user.user_id];
                return (
                  <div key={user.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {profile?.full_name || profile?.email || `User ID: ${user.user_id.slice(0, 8)}…`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {profile?.full_name && profile.email ? `${profile.email} · ` : ''}
                          Current role: {user.role?.name || 'No role assigned'}
                        </div>
                      </div>
                    </div>
                    <Select
                      value={user.role_id || ''}
                      onValueChange={(value) => assignRole.mutate({ 
                        userRestaurantId: user.id, 
                        roleId: value 
                      })}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

