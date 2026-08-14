import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Dialer from "./pages/Dialer.tsx";
import Leads from "./pages/Leads.tsx";
import CRM from "./pages/CRM.tsx";
import CallHistory from "./pages/CallHistory.tsx";
import MyDashboard from "./pages/MyDashboard.tsx";
import LeadDetail from "./pages/LeadDetail.tsx";
import Settings from "./pages/Settings.tsx";
import HistoricoAlteracoes from "./pages/HistoricoAlteracoes.tsx";
import Pipeline from "./pages/Pipeline.tsx";
import Home from "./pages/Home.tsx";
import Relacionamento from "./pages/Relacionamento.tsx";
import Calendario from "./pages/Calendario.tsx";
import Pedidos from "./pages/Pedidos.tsx";
import AppLayout from "./components/AppLayout.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/home"                  element={<Home />} />
            <Route path="/dialer"                element={<Dialer />} />
            <Route path="/leads"                 element={<Leads />} />
            <Route path="/crm"                   element={<CRM />} />
            <Route path="/relacionamento"        element={<Relacionamento />} />
            <Route path="/pedidos"               element={<Pedidos />} />
            <Route path="/calendario"            element={<Calendario />} />
            <Route path="/historico"             element={<CallHistory />} />
            <Route path="/dashboard"             element={<MyDashboard />} />
            <Route path="/lead/:id"              element={<LeadDetail />} />
            <Route path="/settings"              element={<Settings />} />
            <Route path="/historico-alteracoes"  element={<HistoricoAlteracoes />} />
            <Route path="/pipeline"              element={<Pipeline />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;