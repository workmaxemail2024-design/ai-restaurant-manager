import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurant } from "@/contexts/RestaurantContext";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useStockLevels } from "@/hooks/useStock";
import { useIngredients } from "@/hooks/useIngredients";
import { useDishes } from "@/hooks/useDishes";
import { format, subDays } from "date-fns";

export interface AIInsightResult {
  summary?: string;
  recommendations?: string[];
  watchItems?: string[];
  items?: string[];
  forecasts?: any[];
  alerts?: any[];
  insights?: string[];
  error?: string;
}

export function useAIInsights() {
  const { currentRestaurant } = useRestaurant();
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const { data: metrics } = useDashboardMetrics(yesterday);
  const { data: stockLevels = [] } = useStockLevels();
  const { data: ingredients = [] } = useIngredients();
  const { data: dishes = [] } = useDishes();

  // Daily Summary
  const [dailySummary, setDailySummary] = useState<AIInsightResult | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const [dailySummaryUpdated, setDailySummaryUpdated] = useState<Date | null>(null);

  const generateDailySummary = useCallback(async () => {
    if (!currentRestaurant?.id) return;
    setDailySummaryLoading(true);
    try {
      const lowStockItems = ingredients.filter((ingredient) => {
        const stock = stockLevels.find((s) => s.ingredient_id === ingredient.id);
        return stock && Number(stock.quantity) < 10;
      });

      const { data, error } = await supabase.functions.invoke("ai-daily-summary", {
        body: {
          restaurant_id: currentRestaurant.id,
          revenue: metrics?.totalRevenue || 0,
          foodCost: metrics?.foodCostPercent || 0,
          profitMargin: metrics?.totalProfit ? (metrics.totalProfit / metrics.totalRevenue) * 100 : 0,
          topDishes: metrics?.topDishes || [],
          bottomDishes: metrics?.worstDishes || [],
          stockAlerts: lowStockItems.map(i => ({
            name: i.name,
            quantity: stockLevels.find(s => s.ingredient_id === i.id)?.quantity || 0,
            unit: i.unit
          })),
        },
      });

      if (error) throw error;
      setDailySummary(data);
      setDailySummaryUpdated(new Date());
    } catch (err) {
      setDailySummary({ error: err instanceof Error ? err.message : "Failed to generate summary" });
    } finally {
      setDailySummaryLoading(false);
    }
  }, [currentRestaurant?.id, metrics, ingredients, stockLevels]);

  // Stock Forecast
  const [stockForecast, setStockForecast] = useState<AIInsightResult | null>(null);
  const [stockForecastLoading, setStockForecastLoading] = useState(false);
  const [stockForecastUpdated, setStockForecastUpdated] = useState<Date | null>(null);

  const generateStockForecast = useCallback(async () => {
    if (!currentRestaurant?.id) return;
    setStockForecastLoading(true);
    try {
      const ingredientUsage = ingredients.map(ing => {
        const stock = stockLevels.find(s => s.ingredient_id === ing.id);
        return {
          id: ing.id,
          name: ing.name,
          currentStock: stock?.quantity || 0,
          avgDailyUsage: 5, // Would come from actual usage data
          recentUsage: [5, 6, 4, 7, 5, 6, 5], // Mock data
        };
      });

      const { data, error } = await supabase.functions.invoke("ai-inventory-forecast", {
        body: {
          restaurant_id: currentRestaurant.id,
          ingredients: ingredientUsage,
          forecastDays: 14,
        },
      });

      if (error) throw error;
      setStockForecast(data);
      setStockForecastUpdated(new Date());
    } catch (err) {
      setStockForecast({ error: err instanceof Error ? err.message : "Failed to generate forecast" });
    } finally {
      setStockForecastLoading(false);
    }
  }, [currentRestaurant?.id, ingredients, stockLevels]);

  // Menu Engineering
  const [menuInsights, setMenuInsights] = useState<AIInsightResult | null>(null);
  const [menuInsightsLoading, setMenuInsightsLoading] = useState(false);
  const [menuInsightsUpdated, setMenuInsightsUpdated] = useState<Date | null>(null);

  const generateMenuInsights = useCallback(async () => {
    if (!currentRestaurant?.id || dishes.length === 0) return;
    setMenuInsightsLoading(true);
    try {
      const dishData = dishes.map(dish => ({
        id: dish.id,
        name: dish.name,
        sellingPrice: dish.selling_price,
        cost: dish.dish_cost || 0,
        margin: dish.profit_margin || 0,
        salesVolume: Math.floor(Math.random() * 100) + 10, // Would come from actual sales
        category: dish.category,
      }));

      const { data, error } = await supabase.functions.invoke("ai-menu-engineering", {
        body: {
          restaurant_id: currentRestaurant.id,
          dishes: dishData,
        },
      });

      if (error) throw error;
      setMenuInsights(data);
      setMenuInsightsUpdated(new Date());
    } catch (err) {
      setMenuInsights({ error: err instanceof Error ? err.message : "Failed to analyze menu" });
    } finally {
      setMenuInsightsLoading(false);
    }
  }, [currentRestaurant?.id, dishes]);

  // Cost Analysis
  const [costAnalysis, setCostAnalysis] = useState<AIInsightResult | null>(null);
  const [costAnalysisLoading, setCostAnalysisLoading] = useState(false);
  const [costAnalysisUpdated, setCostAnalysisUpdated] = useState<Date | null>(null);

  const generateCostAnalysis = useCallback(async () => {
    if (!currentRestaurant?.id || dishes.length === 0) return;
    setCostAnalysisLoading(true);
    try {
      const dishData = dishes.map(dish => ({
        id: dish.id,
        name: dish.name,
        sellingPrice: dish.selling_price,
        cost: dish.dish_cost || 0,
        margin: dish.profit_margin || 0,
        foodCostPercent: dish.dish_cost && dish.selling_price ? (dish.dish_cost / dish.selling_price) * 100 : 0,
        salesVolume: Math.floor(Math.random() * 100) + 10,
      }));

      const { data, error } = await supabase.functions.invoke("ai-cost-analysis", {
        body: {
          restaurant_id: currentRestaurant.id,
          dishes: dishData,
        },
      });

      if (error) throw error;
      setCostAnalysis(data);
      setCostAnalysisUpdated(new Date());
    } catch (err) {
      setCostAnalysis({ error: err instanceof Error ? err.message : "Failed to analyze costs" });
    } finally {
      setCostAnalysisLoading(false);
    }
  }, [currentRestaurant?.id, dishes]);

  // Staff Forecasting
  const [staffForecast, setStaffForecast] = useState<AIInsightResult | null>(null);
  const [staffForecastLoading, setStaffForecastLoading] = useState(false);
  const [staffForecastUpdated, setStaffForecastUpdated] = useState<Date | null>(null);

  const generateStaffForecast = useCallback(async () => {
    if (!currentRestaurant?.id) return;
    setStaffForecastLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-staff-forecasting", {
        body: {
          restaurant_id: currentRestaurant.id,
          forecastDays: 7,
        },
      });

      if (error) throw error;
      setStaffForecast(data);
      setStaffForecastUpdated(new Date());
    } catch (err) {
      setStaffForecast({ error: err instanceof Error ? err.message : "Failed to forecast staffing" });
    } finally {
      setStaffForecastLoading(false);
    }
  }, [currentRestaurant?.id]);

  // Purchase Suggestions
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<AIInsightResult | null>(null);
  const [purchaseSuggestionsLoading, setPurchaseSuggestionsLoading] = useState(false);
  const [purchaseSuggestionsUpdated, setPurchaseSuggestionsUpdated] = useState<Date | null>(null);

  const generatePurchaseSuggestions = useCallback(async () => {
    if (!currentRestaurant?.id) return;
    setPurchaseSuggestionsLoading(true);
    try {
      const stockData = ingredients.map(ing => {
        const stock = stockLevels.find(s => s.ingredient_id === ing.id);
        return {
          id: ing.id,
          name: ing.name,
          currentStock: stock?.quantity || 0,
          unit: ing.unit,
          avgDailyUsage: 5,
          supplier_id: ing.supplier_id,
        };
      });

      const { data, error } = await supabase.functions.invoke("ai-purchase-suggestions", {
        body: {
          restaurant_id: currentRestaurant.id,
          ingredients: stockData,
        },
      });

      if (error) throw error;
      setPurchaseSuggestions(data);
      setPurchaseSuggestionsUpdated(new Date());
    } catch (err) {
      setPurchaseSuggestions({ error: err instanceof Error ? err.message : "Failed to generate suggestions" });
    } finally {
      setPurchaseSuggestionsLoading(false);
    }
  }, [currentRestaurant?.id, ingredients, stockLevels]);

  return {
    // Daily Summary
    dailySummary,
    dailySummaryLoading,
    dailySummaryUpdated,
    generateDailySummary,
    
    // Stock Forecast
    stockForecast,
    stockForecastLoading,
    stockForecastUpdated,
    generateStockForecast,
    
    // Menu Insights
    menuInsights,
    menuInsightsLoading,
    menuInsightsUpdated,
    generateMenuInsights,
    
    // Cost Analysis
    costAnalysis,
    costAnalysisLoading,
    costAnalysisUpdated,
    generateCostAnalysis,
    
    // Staff Forecast
    staffForecast,
    staffForecastLoading,
    staffForecastUpdated,
    generateStaffForecast,
    
    // Purchase Suggestions
    purchaseSuggestions,
    purchaseSuggestionsLoading,
    purchaseSuggestionsUpdated,
    generatePurchaseSuggestions,
  };
}
