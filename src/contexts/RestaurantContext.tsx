import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface Restaurant {
  id: string;
  name: string;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
}

interface UserRestaurant {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: string;
  is_default: boolean;
  created_at: string;
}

interface RestaurantContextType {
  user: User | null;
  session: Session | null;
  currentRestaurant: Restaurant | null;
  userRestaurants: Restaurant[];
  isLoading: boolean;
  switchRestaurant: (restaurantId: string) => Promise<void>;
  createRestaurant: (name: string) => Promise<Restaurant | null>;
  signOut: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [userRestaurants, setUserRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          loadUserRestaurants(session.user.id);
        }, 0);
      } else {
        setCurrentRestaurant(null);
        setUserRestaurants([]);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserRestaurants(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserRestaurants = async (userId: string) => {
    try {
      const { data: userRests, error: urError } = await supabase
        .from('user_restaurants')
        .select('*, restaurants(*)')
        .eq('user_id', userId);

      if (urError) throw urError;

      if (userRests && userRests.length > 0) {
        const restaurants = userRests.map((ur: any) => ur.restaurants).filter(Boolean);
        setUserRestaurants(restaurants);
        
        const defaultLink = userRests.find((ur: any) => ur.is_default);
        if (defaultLink?.restaurants) {
          setCurrentRestaurant(defaultLink.restaurants);
        } else if (restaurants.length > 0) {
          setCurrentRestaurant(restaurants[0]);
        }
      }
    } catch (error) {
      console.error('Error loading restaurants:', error);
    } finally {
      setIsLoading(false);
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
  };

  return (
    <RestaurantContext.Provider value={{
      user,
      session,
      currentRestaurant,
      userRestaurants,
      isLoading,
      switchRestaurant,
      createRestaurant,
      signOut
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
