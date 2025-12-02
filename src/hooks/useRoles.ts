import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { toast } from 'sonner';
import { Permissions } from './usePermissions';

export interface Role {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  permissions: Permissions;
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithRole {
  id: string;
  user_id: string;
  role_id: string | null;
  is_default: boolean;
  created_at: string;
  role?: Role;
}

export function useRoles() {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['roles', currentRestaurant?.id],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('restaurant_id', currentRestaurant.id)
        .order('is_system_role', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as Role[];
    },
    enabled: !!currentRestaurant?.id
  });
}

export function useUsersWithRoles() {
  const { currentRestaurant } = useRestaurant();

  return useQuery({
    queryKey: ['users-with-roles', currentRestaurant?.id],
    queryFn: async () => {
      if (!currentRestaurant?.id) return [];

      const { data, error } = await supabase
        .from('user_restaurants')
        .select(`
          *,
          roles (*)
        `)
        .eq('restaurant_id', currentRestaurant.id);

      if (error) throw error;
      return data.map(ur => ({
        ...ur,
        role: ur.roles as Role | undefined
      })) as UserWithRole[];
    },
    enabled: !!currentRestaurant?.id
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  const { currentRestaurant } = useRestaurant();

  return useMutation({
    mutationFn: async ({ name, description, permissions }: {
      name: string;
      description?: string;
      permissions: Permissions;
    }) => {
      if (!currentRestaurant?.id) throw new Error('No restaurant selected');

      const { data, error } = await supabase
        .from('roles')
        .insert({
          restaurant_id: currentRestaurant.id,
          name,
          description: description || null,
          permissions: JSON.parse(JSON.stringify(permissions))
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create role: ${error.message}`);
    }
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, description, permissions }: {
      id: string;
      name?: string;
      description?: string;
      permissions?: Permissions;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (permissions !== undefined) updateData.permissions = JSON.parse(JSON.stringify(permissions));

      const { data, error } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Role updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role: ${error.message}`);
    }
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete role: ${error.message}`);
    }
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userRestaurantId, roleId }: {
      userRestaurantId: string;
      roleId: string;
    }) => {
      const { data, error } = await supabase
        .from('user_restaurants')
        .update({ role_id: roleId })
        .eq('id', userRestaurantId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('Role assigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign role: ${error.message}`);
    }
  });
}
