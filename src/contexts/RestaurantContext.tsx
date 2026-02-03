import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { Permissions } from '@/hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface Restaurant {
  id: string;
  name: string;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
}

interface RestaurantContextType {
  user: User | null;
  session: Session | null;
  currentRestaurant: Restaurant | null;
  userRestaurants: Restaurant[];
  permissions: Permissions | null;
  isLoading: boolean;
  isSwitching: boolean;
  switchRestaurant: (restaurantId: string) => Promise<void>;
  createRestaurant: (name: string) => Promise<Restaurant | null>;
  updateRestaurant: (restaurantId: string, name: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [userRestaurants, setUserRestaurants] = useState<Restaurant[]>([]);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Memoized function to load user data
  const loadUserData = useCallback(async (currentUser: User) => {
    console.log('[RestaurantContext] loadUserData called for user:', currentUser.id);
    
    try {
      // Call the backend function that ensures user has a restaurant
      const { data, error } = await supabase.rpc('ensure_user_restaurant');
      
      if (error) {
        console.error('[RestaurantContext] Error ensuring user restaurant:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        console.log('[RestaurantContext] ensure_user_restaurant result:', data);
        
        // Cast the JSON response to proper type
        const result = data as unknown as {
          restaurant_id: string;
          restaurant_name?: string;
          role_id?: string;
          permissions?: Permissions;
        };
        
        // If we got permissions from ensure_user_restaurant, use them
        if (result.permissions) {
          setPermissions(result.permissions);
        } else {
          // Otherwise fetch them separately
          const { data: permsData, error: permsError } = await supabase.rpc('get_user_permissions');
          if (!permsError && permsData) {
            console.log('[RestaurantContext] Loaded permissions:', permsData);
            setPermissions(permsData as Permissions);
          } else {
            console.error('[RestaurantContext] Error loading permissions:', permsError);
          }
        }
        
        // Load all user restaurants for the switcher
        const { data: userRests, error: restError } = await supabase
          .from('user_restaurants')
          .select('*, restaurants(*)')
          .order('is_default', { ascending: false });

        if (restError) {
          console.error('[RestaurantContext] Error loading user restaurants:', restError);
        } else if (userRests && userRests.length > 0) {
          const restaurants = userRests.map((ur: any) => ur.restaurants).filter(Boolean);
          setUserRestaurants(restaurants);
          
          // Set current restaurant
          const defaultLink = userRests.find((ur: any) => ur.is_default);
          if (defaultLink?.restaurants) {
            setCurrentRestaurant(defaultLink.restaurants);
            console.log('[RestaurantContext] Set current restaurant:', defaultLink.restaurants.name);
          } else if (restaurants.length > 0) {
            setCurrentRestaurant(restaurants[0]);
            console.log('[RestaurantContext] Set current restaurant (fallback):', restaurants[0].name);
          }
        }
      }
    } catch (error) {
      console.error('[RestaurantContext] Error in loadUserData:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      console.log('[RestaurantContext] Initializing auth...');
      
      // First, get the current session
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('[RestaurantContext] Error getting session:', error);
        if (mounted) {
          setIsLoading(false);
          setIsInitialized(true);
        }
        return;
      }

      if (currentSession?.user) {
        console.log('[RestaurantContext] Found existing session for user:', currentSession.user.id);
        if (mounted) {
          setSession(currentSession);
          setUser(currentSession.user);
          // Load user data after setting user
          await loadUserData(currentSession.user);
        }
      } else {
        console.log('[RestaurantContext] No existing session found');
        if (mounted) {
          setIsLoading(false);
        }
      }

      if (mounted) {
        setIsInitialized(true);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[RestaurantContext] Auth state changed:', event, newSession?.user?.id);
      
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        console.log('[RestaurantContext] User signed out, clearing state');
        setSession(null);
        setUser(null);
        setCurrentRestaurant(null);
        setUserRestaurants([]);
        setPermissions(null);
        setIsLoading(false);
        return;
      }

      if (newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        
        // Only load data if we're initialized (avoid duplicate loading on init)
        if (isInitialized) {
          setIsLoading(true);
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => {
            if (mounted) {
              loadUserData(newSession.user);
            }
          }, 0);
        }
      }
    });

    // Initialize
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserData, isInitialized]);

  const refreshPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_permissions');
      if (error) {
        console.error('[RestaurantContext] Error refreshing permissions:', error);
        return;
      }
      console.log('[RestaurantContext] Refreshed permissions:', data);
      setPermissions(data as Permissions);
    } catch (error) {
      console.error('[RestaurantContext] Error refreshing permissions:', error);
    }
  }, []);

  const queryClient = useQueryClient();
  
  const switchRestaurant = useCallback(async (restaurantId: string) => {
    if (!user) return;
    
    setIsSwitching(true);
    try {
      // Update default flag
      await supabase
        .from('user_restaurants')
        .update({ is_default: false })
        .eq('user_id', user.id);
      
      await supabase
        .from('user_restaurants')
        .update({ is_default: true })
        .eq('user_id', user.id)
        .eq('restaurant_id', restaurantId);
      
      const restaurant = userRestaurants.find(r => r.id === restaurantId);
      if (restaurant) {
        setCurrentRestaurant(restaurant);
        toast({ title: `Switched to ${restaurant.name}` });
      }
      
      // Refresh permissions for the new restaurant context
      await refreshPermissions();
      
      // Invalidate all queries to fetch fresh data for the new restaurant
      await queryClient.invalidateQueries();
    } catch (error) {
      console.error('[RestaurantContext] Error switching restaurant:', error);
      toast({ title: 'Failed to switch restaurant', variant: 'destructive' });
    } finally {
      setIsSwitching(false);
    }
  }, [user, userRestaurants, refreshPermissions, queryClient]);

  const createRestaurant = useCallback(async (name: string): Promise<Restaurant | null> => {
    if (!user) return null;
    
    try {
      // Create restaurant
      const { data: restaurant, error: restError } = await supabase
        .from('restaurants')
        .insert({ name, owner_email: user.email })
        .select()
        .single();

      if (restError) throw restError;

      // Create default roles for the restaurant
      await supabase.rpc('create_default_roles', { p_restaurant_id: restaurant.id });

      // Create default automation rules for the restaurant
      await supabase.rpc('create_default_automation_rules', { p_restaurant_id: restaurant.id });

      // Get the Owner role
      const { data: ownerRole } = await supabase
        .from('roles')
        .select('id')
        .eq('restaurant_id', restaurant.id)
        .eq('name', 'Owner')
        .single();

      // Link user to restaurant with Owner role
      const { error: linkError } = await supabase
        .from('user_restaurants')
        .insert({
          user_id: user.id,
          restaurant_id: restaurant.id,
          role: 'owner',
          role_id: ownerRole?.id,
          is_default: userRestaurants.length === 0
        });

      if (linkError) throw linkError;

      // Create default location
      await supabase
        .from('locations')
        .insert({
          name: 'Main Location',
          restaurant_id: restaurant.id
        });

      setUserRestaurants(prev => [...prev, restaurant]);
      if (userRestaurants.length === 0) {
        setCurrentRestaurant(restaurant);
        await refreshPermissions();
      }

      return restaurant;
    } catch (error) {
      console.error('[RestaurantContext] Error creating restaurant:', error);
      return null;
    }
  }, [user, userRestaurants, refreshPermissions]);

  const updateRestaurant = useCallback(async (restaurantId: string, name: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ name })
        .eq('id', restaurantId);

      if (error) throw error;

      // Update local state
      setUserRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, name } : r));
      if (currentRestaurant?.id === restaurantId) {
        setCurrentRestaurant(prev => prev ? { ...prev, name } : null);
      }

      toast({ title: `Restaurant renamed to "${name}"` });
      return true;
    } catch (error) {
      console.error('[RestaurantContext] Error updating restaurant:', error);
      toast({ title: 'Failed to rename restaurant', variant: 'destructive' });
      return false;
    }
  }, [currentRestaurant]);

  const signOut = useCallback(async () => {
    console.log('[RestaurantContext] Signing out...');
    await supabase.auth.signOut();
    // State will be cleared by the onAuthStateChange handler
  }, []);

  return (
    <RestaurantContext.Provider value={{
      user,
      session,
      currentRestaurant,
      userRestaurants,
      permissions,
      isLoading,
      isSwitching,
      switchRestaurant,
      createRestaurant,
      updateRestaurant,
      signOut,
      refreshPermissions
    }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (context === undefined) {
    throw new Error('useRestaurant must be used within a RestaurantProvider');
  }
  return context;
}
