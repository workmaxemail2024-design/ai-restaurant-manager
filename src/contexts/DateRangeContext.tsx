import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useRestaurant } from './RestaurantContext';
import { format, subDays, startOfDay } from 'date-fns';

export type DatePreset = 'today' | '7d' | '30d' | 'custom';

interface DateRangeContextType {
  preset: DatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  presetLabel: string;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

const DATE_RANGE_STORAGE_PREFIX = 'selectedDateRange_';

function getPresetDates(preset: DatePreset): { startDate: string; endDate: string } {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7d':
      return { 
        startDate: format(subDays(new Date(), 6), 'yyyy-MM-dd'), 
        endDate: today 
      };
    case '30d':
      return { 
        startDate: format(subDays(new Date(), 29), 'yyyy-MM-dd'), 
        endDate: today 
      };
    case 'custom':
    default:
      return { startDate: today, endDate: today };
  }
}

function getPresetLabel(preset: DatePreset): string {
  switch (preset) {
    case 'today':
      return 'Today';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case 'custom':
      return 'Custom';
    default:
      return 'Today';
  }
}

interface StoredDateRange {
  preset: DatePreset;
  startDate?: string;
  endDate?: string;
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { currentRestaurant } = useRestaurant();
  const [preset, setPresetState] = useState<DatePreset>('today');
  const [startDate, setStartDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const previousRestaurantId = useRef<string | null>(null);

  // Load date range from localStorage when restaurant changes
  useEffect(() => {
    if (currentRestaurant) {
      const storageKey = `${DATE_RANGE_STORAGE_PREFIX}${currentRestaurant.id}`;
      
      // If switching restaurants, try to load stored preference for new restaurant
      if (previousRestaurantId.current !== currentRestaurant.id) {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed: StoredDateRange = JSON.parse(stored);
            setPresetState(parsed.preset);
            
            if (parsed.preset === 'custom' && parsed.startDate && parsed.endDate) {
              setStartDate(parsed.startDate);
              setEndDate(parsed.endDate);
            } else {
              const dates = getPresetDates(parsed.preset);
              setStartDate(dates.startDate);
              setEndDate(dates.endDate);
            }
          } else {
            // Default to 'today' for new restaurants
            setPresetState('today');
            const dates = getPresetDates('today');
            setStartDate(dates.startDate);
            setEndDate(dates.endDate);
          }
        } catch {
          // Reset to default on parse error
          setPresetState('today');
          const dates = getPresetDates('today');
          setStartDate(dates.startDate);
          setEndDate(dates.endDate);
        }
      }
      
      previousRestaurantId.current = currentRestaurant.id;
    } else {
      // No restaurant - reset to default
      setPresetState('today');
      const dates = getPresetDates('today');
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      previousRestaurantId.current = null;
    }
  }, [currentRestaurant?.id]);

  // Persist to localStorage whenever preset or custom dates change
  const persistToStorage = useCallback((newPreset: DatePreset, newStart?: string, newEnd?: string) => {
    if (currentRestaurant) {
      const storageKey = `${DATE_RANGE_STORAGE_PREFIX}${currentRestaurant.id}`;
      const data: StoredDateRange = { 
        preset: newPreset,
        ...(newPreset === 'custom' && { startDate: newStart, endDate: newEnd })
      };
      localStorage.setItem(storageKey, JSON.stringify(data));
    }
  }, [currentRestaurant?.id]);

  const setPreset = useCallback((newPreset: DatePreset) => {
    setPresetState(newPreset);
    
    if (newPreset !== 'custom') {
      const dates = getPresetDates(newPreset);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
      persistToStorage(newPreset);
    }
  }, [persistToStorage]);

  const setCustomRange = useCallback((newStartDate: string, newEndDate: string) => {
    setPresetState('custom');
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    persistToStorage('custom', newStartDate, newEndDate);
  }, [persistToStorage]);

  const presetLabel = getPresetLabel(preset);

  return (
    <DateRangeContext.Provider value={{ 
      preset, 
      startDate, 
      endDate, 
      setPreset, 
      setCustomRange,
      presetLabel 
    }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (context === undefined) {
    throw new Error('useDateRange must be used within a DateRangeProvider');
  }
  return context;
}
