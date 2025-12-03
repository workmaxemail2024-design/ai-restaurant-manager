import { Toaster } from "@/components/ui/toaster";
import { DebugPanel } from "@/components/DebugPanel";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RestaurantProvider } from "@/contexts/RestaurantContext";
import { AuthGuard } from "@/components/AuthGuard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
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
import POSIntegrationsPage from "./pages/POSIntegrationsPage";
import MultiLocationIntelligencePage from "./pages/MultiLocationIntelligencePage";
import ChainMenuPerformancePage from "./pages/ChainMenuPerformancePage";
import ForecastDashboardPage from "./pages/ForecastDashboardPage";
import RoleBuilderPage from "./pages/RoleBuilderPage";
import AutomationRulesPage from "./pages/AutomationRulesPage";
import NotificationsPage from "./pages/NotificationsPage";
import AuditLogPage from "./pages/AuditLogPage";

const queryClient = new QueryClient();

// Wrapper component for protected routes
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RestaurantProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <DebugPanel />
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Protected routes */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/locations" element={<ProtectedRoute><LocationsPage /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
              <Route path="/ingredients" element={<ProtectedRoute><IngredientsPage /></ProtectedRoute>} />
              <Route path="/stock" element={<ProtectedRoute><StockPage /></ProtectedRoute>} />
              <Route path="/dishes" element={<ProtectedRoute><DishesPage /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
              {/* Staff Routes */}
              <Route path="/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
              <Route path="/staff/shifts" element={<ProtectedRoute><ShiftSchedulerPage /></ProtectedRoute>} />
              <Route path="/staff/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
              <Route path="/staff/kpis" element={<ProtectedRoute><StaffKPIsPage /></ProtectedRoute>} />
              {/* Menu Routes */}
              <Route path="/menu/cost-analysis" element={<ProtectedRoute><CostAnalysisPage /></ProtectedRoute>} />
              <Route path="/menu/engineering" element={<ProtectedRoute><MenuEngineeringPage /></ProtectedRoute>} />
              {/* Inventory Routes */}
              <Route path="/inventory/forecast" element={<ProtectedRoute><InventoryForecastPage /></ProtectedRoute>} />
              {/* AI Routes */}
              <Route path="/ai/daily-summary" element={<ProtectedRoute><AIDailySummaryPage /></ProtectedRoute>} />
              <Route path="/ai/scheduling" element={<ProtectedRoute><AISchedulingPage /></ProtectedRoute>} />
              {/* Analytics Routes */}
              <Route path="/analytics/multi-location" element={<ProtectedRoute><MultiLocationIntelligencePage /></ProtectedRoute>} />
              <Route path="/analytics/menu-performance" element={<ProtectedRoute><ChainMenuPerformancePage /></ProtectedRoute>} />
              <Route path="/analytics/forecast" element={<ProtectedRoute><ForecastDashboardPage /></ProtectedRoute>} />
              {/* Automation Routes */}
              <Route path="/automation/rules" element={<ProtectedRoute><AutomationRulesPage /></ProtectedRoute>} />
              {/* Notifications */}
              <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              {/* Settings Routes */}
              <Route path="/settings/pos" element={<ProtectedRoute><POSIntegrationsPage /></ProtectedRoute>} />
              <Route path="/settings/roles" element={<ProtectedRoute><RoleBuilderPage /></ProtectedRoute>} />
              <Route path="/settings/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </RestaurantProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
