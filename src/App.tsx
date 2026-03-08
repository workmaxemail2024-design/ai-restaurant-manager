import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RestaurantProvider } from "@/contexts/RestaurantContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import { AuthGuard } from "@/components/AuthGuard";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
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
import AIInsightsPage from "./pages/AIInsightsPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import CostAnalysisPage from "./pages/CostAnalysisPage";
import POSIntegrationsPage from "./pages/POSIntegrationsPage";
import MultiLocationIntelligencePage from "./pages/MultiLocationIntelligencePage";
import ChainMenuPerformancePage from "./pages/ChainMenuPerformancePage";
import ForecastDashboardPage from "./pages/ForecastDashboardPage";
import RoleBuilderPage from "./pages/RoleBuilderPage";
import AutomationRulesPage from "./pages/AutomationRulesPage";
import NotificationsPage from "./pages/NotificationsPage";
import AuditLogPage from "./pages/AuditLogPage";
import SystemQAPage from "./pages/SystemQAPage";
import OverheadsPage from "./pages/settings/OverheadsPage";
import DemoSettingsPage from "./pages/settings/DemoSettingsPage";
import DocumentsPage from "./pages/DocumentsPage";
import ReservationsPage from "./pages/ReservationsPage";
import ReservationFloorPage from "./pages/ReservationFloorPage";
import ReservationCustomersPage from "./pages/ReservationCustomersPage";
import ReservationSettingsPage from "./pages/ReservationSettingsPage";

const queryClient = new QueryClient();

// Wrapper component for protected routes
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RestaurantProvider>
        <LocationProvider>
          <DateRangeProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <DemoBanner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              
              {/* Protected routes */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/locations" element={<ProtectedRoute><LocationsPage /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
              <Route path="/ingredients" element={<ProtectedRoute><IngredientsPage /></ProtectedRoute>} />
              <Route path="/stock" element={<ProtectedRoute><StockPage /></ProtectedRoute>} />
              <Route path="/dishes" element={<ProtectedRoute><DishesPage /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
              <Route path="/operations/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
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
              <Route path="/ai/insights" element={<ProtectedRoute><AIInsightsPage /></ProtectedRoute>} />
              <Route path="/ai/assistant" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />
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
              {/* Reservations */}
              <Route path="/reservations" element={<ProtectedRoute><ReservationsPage /></ProtectedRoute>} />
              <Route path="/reservations/floor" element={<ProtectedRoute><ReservationFloorPage /></ProtectedRoute>} />
              <Route path="/reservations/customers" element={<ProtectedRoute><ReservationCustomersPage /></ProtectedRoute>} />
              <Route path="/reservations/settings" element={<ProtectedRoute><ReservationSettingsPage /></ProtectedRoute>} />
              {/* Settings Routes */}
              <Route path="/settings/pos" element={<ProtectedRoute><POSIntegrationsPage /></ProtectedRoute>} />
              <Route path="/settings/roles" element={<ProtectedRoute><RoleBuilderPage /></ProtectedRoute>} />
              <Route path="/settings/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
              <Route path="/settings/system-qa" element={<ProtectedRoute><SystemQAPage /></ProtectedRoute>} />
              <Route path="/settings/financial/overheads" element={<ProtectedRoute><OverheadsPage /></ProtectedRoute>} />
              <Route path="/settings/demo" element={<ProtectedRoute><DemoSettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </BrowserRouter>
          </TooltipProvider>
          </DateRangeProvider>
        </LocationProvider>
      </RestaurantProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
