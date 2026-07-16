import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
import { useRestaurant } from './RestaurantContext';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, parseISO, startOfDay, endOfDay } from 'date-fns';

export type DatePreset = 
  | 'today' 
  | 'yesterday' 
  | '7d' 
  | '30d' 
  | 'this_month' 
  | 'last_month' 
  | 'ytd' 
  | 'custom';

interface DateRangeContextType {
  preset: DatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  setDateRange: (startDate: string, endDate: string, preset: DatePreset) => void;
  presetLabel: string;
  // Query bounds (for Supabase queries)
  queryStartDate: string; // ISO datetime start of day
  queryEndDate: string;   // ISO datetime end of day
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

const DATE_RANGE_STORAGE_PREFIX = 'selectedDateRange_';

function getPresetDates(preset: DatePreset): { startDate: string; endDate: string } {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      return { startDate: yesterday, endDate: yesterday };
    }
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
    case 'this_month':
      return { 
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), 
        endDate: today 
      };
    case 'last_month': {
      const lastMonth = subMonths(new Date(), 1);
      return { 
        startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), 
        endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd') 
      };
    }
    case 'ytd':
      return { 
        startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'), 
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
    case 'yesterday':
      return 'Yesterday';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case 'this_month':
      return 'This month';
    case 'last_month':
      return 'Last month';
    case 'ytd':
      return 'Year to date';
    case 'custom':
      return 'Custom';
    default:
      return 'Last 7 days';
  }
}

interface StoredDateRange {
  preset: DatePreset;
  startDate?: string;
  endDate?: string;
}

// Helper to get/set URL params
function getUrlDateParams(): { from: string | null; to: string | null } {
  if (typeof window === 'undefined') return { from: null, to: null };
  const params = new URLSearchParams(window.location.search);
  return {
    from: params.get('from'),
    to: params.get('to')
  };
}

function setUrlDateParams(startDate: string, endDate: string) {
  if (typeof window === 'undefined') return;
  
  const url = new URL(window.location.href);
  url.searchParams.set('from', startDate);
  url.searchParams.set('to', endDate);
  
  // Use replaceState to avoid polluting browser history
  window.history.replaceState({}, '', url.toString());
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { currentRestaurant } = useRestaurant();
  
  // Compute the initial state synchronously so refreshes never flash today's default.
  // Priority: URL query params → global last-used localStorage → 7d default.
  const computeInitial = (): { preset: DatePreset; startDate: string; endDate: string } => {
    if (typeof window !== 'undefined') {
      const urlParams = getUrlDateParams();
      if (urlParams.from && urlParams.to) {
        try {
          const f = parseISO(urlParams.from);
          const t = parseISO(urlParams.to);
          if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
            return { preset: 'custom', startDate: urlParams.from, endDate: urlParams.to };
          }
        } catch { /* ignore */ }
      }
      try {
        const raw = localStorage.getItem(`${DATE_RANGE_STORAGE_PREFIX}last`);
        if (raw) {
          const parsed: StoredDateRange = JSON.parse(raw);
          if (parsed.preset === 'custom' && parsed.startDate && parsed.endDate) {
            return { preset: 'custom', startDate: parsed.startDate, endDate: parsed.endDate };
          }
          if (parsed.preset) {
            const d = getPresetDates(parsed.preset);
            return { preset: parsed.preset, startDate: d.startDate, endDate: d.endDate };
          }
        }
      } catch { /* ignore */ }
    }
    const d = getPresetDates('7d');
    return { preset: '7d', startDate: d.startDate, endDate: d.endDate };
  };

  const initial = computeInitial();
  const [preset, setPresetState] = useState<DatePreset>(initial.preset);
  const [startDate, setStartDate] = useState<string>(initial.startDate);
  const [endDate, setEndDate] = useState<string>(initial.endDate);
  const previousRestaurantId = useRef<string | null>(null);
  const initialized = useRef(false);

  // Sync URL to state on mount (so navigation that strips query still shows dates)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setUrlDateParams(initial.startDate, initial.endDate);
  }, []);

  // Load date range from localStorage when restaurant changes
  useEffect(() => {
    if (currentRestaurant) {
      const storageKey = `${DATE_RANGE_STORAGE_PREFIX}${currentRestaurant.id}`;
      
      // If switching restaurants, try to load stored preference for new restaurant
      if (previousRestaurantId.current !== currentRestaurant.id) {
        // Check URL first (takes precedence)
        const urlParams = getUrlDateParams();
        if (urlParams.from && urlParams.to) {
          try {
            const fromDate = parseISO(urlParams.from);
            const toDate = parseISO(urlParams.to);
            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
              setPresetState('custom');
              setStartDate(urlParams.from);
              setEndDate(urlParams.to);
              previousRestaurantId.current = currentRestaurant.id;
              return;
            }
          } catch {
            // Invalid dates
          }
        }
        
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed: StoredDateRange = JSON.parse(stored);
            setPresetState(parsed.preset);
            
            if (parsed.preset === 'custom' && parsed.startDate && parsed.endDate) {
              setStartDate(parsed.startDate);
              setEndDate(parsed.endDate);
              setUrlDateParams(parsed.startDate, parsed.endDate);
            } else {
              const dates = getPresetDates(parsed.preset);
              setStartDate(dates.startDate);
              setEndDate(dates.endDate);
              setUrlDateParams(dates.startDate, dates.endDate);
            }
          } else {
            // Default to 7d for new restaurants
            setPresetState('7d');
            const dates = getPresetDates('7d');
            setStartDate(dates.startDate);
            setEndDate(dates.endDate);
            setUrlDateParams(dates.startDate, dates.endDate);
          }
        } catch {
          // Reset to default on parse error
          setPresetState('7d');
          const dates = getPresetDates('7d');
          setStartDate(dates.startDate);
          setEndDate(dates.endDate);
          setUrlDateParams(dates.startDate, dates.endDate);
        }
      }
      
      previousRestaurantId.current = currentRestaurant.id;
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
      setUrlDateParams(dates.startDate, dates.endDate);
      persistToStorage(newPreset);
    }
  }, [persistToStorage]);

  const setCustomRange = useCallback((newStartDate: string, newEndDate: string) => {
    setPresetState('custom');
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    setUrlDateParams(newStartDate, newEndDate);
    persistToStorage('custom', newStartDate, newEndDate);
  }, [persistToStorage]);

  // Combined setter for DateRangePicker component
  const setDateRange = useCallback((newStartDate: string, newEndDate: string, newPreset: DatePreset) => {
    setPresetState(newPreset);
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    setUrlDateParams(newStartDate, newEndDate);
    persistToStorage(newPreset, newStartDate, newEndDate);
  }, [persistToStorage]);

  const presetLabel = getPresetLabel(preset);

  // Compute query bounds (start of day, end of day) for inclusive querying
  const queryStartDate = useMemo(() => `${startDate}T00:00:00`, [startDate]);
  const queryEndDate = useMemo(() => `${endDate}T23:59:59.999`, [endDate]);

  return (
    <DateRangeContext.Provider value={{ 
      preset, 
      startDate, 
      endDate, 
      setPreset, 
      setCustomRange,
      setDateRange,
      presetLabel,
      queryStartDate,
      queryEndDate
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
