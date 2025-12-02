import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { Permissions } from '@/hooks/usePermissions';

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
  switchRestaurant: (restaurantId: string) => Promise<void>;
  createRestaurant: (name: string) => Promise<Restaurant | null>;
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Use setTimeout to avoid Supabase deadlock
        setTimeout(() => {
          ensureUserRestaurant();
        }, 0);
      } else {
        setCurrentRestaurant(null);
        setUserRestaurants([]);
        setPermissions(null);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        ensureUserRestaurant();
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const ensureUserRestaurant = async () => {
    try {
      // Call the backend function that ensures user has a restaurant
      const { data, error } = await supabase.rpc('ensure_user_restaurant');
      
      if (error) {
        console.error('Error ensuring user restaurant:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        console.log('ensure_user_restaurant result:', data);
        
        // Cast the JSON response to proper type
        const result = data as unknown as {
          restaurant_id: string;
          restaurant_name: string;
          role_id: string;
          permissions: Permissions;
        };
        
        // Set permissions from the response
        setPermissions(result.permissions);
        
        // Set current restaurant
        const restaurant: Restaurant = {
          id: result.restaurant_id,
          name: result.restaurant_name,
          owner_email: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setCurrentRestaurant(restaurant);
        
        // Load all user restaurants for the switcher
        await loadUserRestaurants();
      }
    } catch (error) {
      console.error('Error in ensureUserRestaurant:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserRestaurants = async () => {
    try {
      const { data: userRests, error } = await supabase
        .from('user_restaurants')
        .select('*, restaurants(*)')
        .order('is_default', { ascending: false });

      if (error) {
        console.error('Error loading user restaurants:', error);
        return;
      }

      if (userRests && userRests.length > 0) {
        const restaurants = userRests.map((ur: any) => ur.restaurants).filter(Boolean);
        setUserRestaurants(restaurants);
        
        // Update currentRestaurant with full data if available
        const defaultLink = userRests.find((ur: any) => ur.is_default);
        if (defaultLink?.restaurants) {
          setCurrentRestaurant(defaultLink.restaurants);
        } else if (restaurants.length > 0) {
          setCurrentRestaurant(restaurants[0]);
        }
      }
    } catch (error) {
      console.error('Error loading restaurants:', error);
    }
  };

  const refreshPermissions = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_permissions');
      if (error) {
        console.error('Error refreshing permissions:', error);
        return;
      }
      setPermissions(data as Permissions);
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    }
  };

  const switchRestaurant = async (restaurantId: string) => {
    if (!user) return;
    
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
    }
    
    // Refresh permissions for the new restaurant context
    await refreshPermissions();
  };

  const createRestaurant = async (name: string): Promise<Restaurant | null> => {
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
      console.error('Error creating restaurant:', error);
      return null;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCurrentRestaurant(null);
    setUserRestaurants([]);
    setPermissions(null);
  };

  return (
    <RestaurantContext.Provider value={{
      user,
      session,
      currentRestaurant,
      userRestaurants,
      permissions,
      isLoading,
      switchRestaurant,
      createRestaurant,
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
