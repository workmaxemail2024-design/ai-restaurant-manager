import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LocationsPage from "./pages/LocationsPage";
import SuppliersPage from "./pages/SuppliersPage";
import IngredientsPage from "./pages/IngredientsPage";
import StockPage from "./pages/StockPage";
import DishesPage from "./pages/DishesPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import SalesPage from "./pages/SalesPage";
import ReportsPage from "./pages/ReportsPage";
import StaffPage from "./pages/StaffPage";
import ShiftSchedulerPage from "./pages/ShiftSchedulerPage";
import AttendancePage from "./pages/AttendancePage";
import StaffKPIsPage from "./pages/StaffKPIsPage";
import MenuEngineeringPage from "./pages/MenuEngineeringPage";
import InventoryForecastPage from "./pages/InventoryForecastPage";
import AIDailySummaryPage from "./pages/AIDailySummaryPage";
import AISchedulingPage from "./pages/AISchedulingPage";
import CostAnalysisPage from "./pages/CostAnalysisPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/ingredients" element={<IngredientsPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/dishes" element={<DishesPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* Staff Routes */}
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/staff/shifts" element={<ShiftSchedulerPage />} />
          <Route path="/staff/attendance" element={<AttendancePage />} />
          <Route path="/staff/kpis" element={<StaffKPIsPage />} />
          {/* Menu Routes */}
          <Route path="/menu/cost-analysis" element={<CostAnalysisPage />} />
          <Route path="/menu/engineering" element={<MenuEngineeringPage />} />
          {/* Inventory Routes */}
          <Route path="/inventory/forecast" element={<InventoryForecastPage />} />
          {/* AI Routes */}
          <Route path="/ai/daily-summary" element={<AIDailySummaryPage />} />
          <Route path="/ai/scheduling" element={<AISchedulingPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
