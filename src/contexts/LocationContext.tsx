import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRestaurant } from './RestaurantContext';

interface LocationContextType {
  selectedLocationId: string | null;
  setSelectedLocationId: (locationId: string | null) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

const LOCATION_STORAGE_KEY = 'selectedLocation';

export function LocationProvider({ children }: { children: ReactNode }) {
  const { currentRestaurant } = useRestaurant();
  const [selectedLocationId, setSelectedLocationIdState] = useState<string | null>(null);

  // Load location from localStorage when restaurant changes
  useEffect(() => {
    if (currentRestaurant) {
      const storageKey = `${LOCATION_STORAGE_KEY}_${currentRestaurant.id}`;
      const stored = localStorage.getItem(storageKey);
      setSelectedLocationIdState(stored || null);
    } else {
      setSelectedLocationIdState(null);
    }
  }, [currentRestaurant?.id]);

  const setSelectedLocationId = useCallback((locationId: string | null) => {
    setSelectedLocationIdState(locationId);
    if (currentRestaurant) {
      const storageKey = `${LOCATION_STORAGE_KEY}_${currentRestaurant.id}`;
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
