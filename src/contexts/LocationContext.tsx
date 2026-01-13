import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRestaurant } from './RestaurantContext';

interface LocationContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (locationId: string | null) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const LOCATION_STORAGE_PREFIX = 'selectedLocation_';

export function LocationProvider({ children }: { children: ReactNode }) {
  const { currentRestaurant } = useRestaurant();
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(null);
  const previousRestaurantId = useRef<string | null>(null);

  // Load location from localStorage when restaurant changes
  useEffect(() => {
    if (currentRestaurant) {
      // If switching to a different restaurant, reset location
      if (previousRestaurantId.current && previousRestaurantId.current !== currentRestaurant.id) {
        // Clear the old restaurant's location from state
        setSelectedLocationIdState(null);
      }
      
      // Try to load stored location for this restaurant
      const storageKey = `${LOCATION_STORAGE_PREFIX}${currentRestaurant.id}`;
      const stored = localStorage.getItem(storageKey);
      
      // Only set if this is the same restaurant (not a switch) or if switching to a new one
      if (stored && previousRestaurantId.current === currentRestaurant.id) {
        setSelectedLocationIdState(stored);
      } else if (previousRestaurantId.current !== currentRestaurant.id) {
        // Switching restaurants - check if there's a stored value for the new restaurant
        setSelectedLocationIdState(stored || null);
      }
      
      previousRestaurantId.current = currentRestaurant.id;
    } else {
      setSelectedLocationIdState(null);
      previousRestaurantId.current = null;
    }
  }, [currentRestaurant?.id]);

  const setSelectedLocationId = useCallback((locationId: string | null) => {
    setSelectedLocationIdState(locationId);
    if (currentRestaurant) {
      const storageKey = `${LOCATION_STORAGE_PREFIX}${currentRestaurant.id}`;
      if (locationId) {
        localStorage.setItem(storageKey, locationId);
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  }, [currentRestaurant?.id]);

  return (
    <LocationContext.Provider value={{ selectedLocationId, setSelectedLocationId }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
