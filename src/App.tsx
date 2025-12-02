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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
