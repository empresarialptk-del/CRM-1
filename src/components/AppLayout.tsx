import { toast } from "sonner";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useFollowupNotifications } from "@/hooks/useFollowupNotifications";
import { Phone, Users, LogOut, Headphones, Activity, Kanban, History, Award, Search, X, TrendingDown, Settings, MapPin, ClipboardList, Home, ShieldCheck, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatPhone, STATUS_LABELS, STATUS_COLOR } from "@/lib/crm";
import { Badge } from "@/components/ui/badge";

const navItem =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground";
const active = "bg-sidebar-accent text-sidebar-foreground";

type SearchResult = {
  id: string;
  nome: string;
  telefone: string;
  status: string;
};

function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Atalho Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Click fora fecha
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Busca com debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("leads")
        .select("id,nome,telefone,status")
        .or(`nome.ilike.%${query}%,telefone.ilike.%${query}%`)
        .limit(8);
      setResults((data ?? []) as SearchResult[]);
      setSelected(0);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function go(id: string) {
    navigate(`/lead/${id}`);
    setOpen(false); setQuery(""); setResults([]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) go(results[selected].id);
  }

  return (
    <div ref={ref} className="relative px-3 mb-2">
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/50 text-xs hover:bg-sidebar-accent transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Buscar lead…</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-foreground/40">Ctrl K</span>
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white dark:bg-card border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Nome ou telefone…"
              className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              autoComplete="off"
            />
            {query && (
              <button onClick={() => { setQuery(""); setResults([]); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {loading && <div className="px-4 py-3 text-xs text-muted-foreground">Buscando…</div>}
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">Nenhum lead encontrado</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b last:border-0 ${i === selected ? "bg-primary/10" : "hover:bg-muted/50"}`}
            >
              <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold shrink-0">
                {r.nome[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nome}</div>
                <div className="text-xs text-muted-foreground">{formatPhone(r.telefone)}</div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[r.status] ?? "bg-muted text-muted-foreground"}`}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </button>
          ))}
          {!query && (
            <div className="px-4 py-3 text-xs text-muted-foreground">Digite para buscar por nome ou telefone</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, loading, isVisitor } = useAuth();
  const navigate = useNavigate();
  useFollowupNotifications(user?.id);

  if (loading && !isVisitor) return <div className="p-8"><Skeleton className="h-10 w-64" /></div>;
  if (!user && !isVisitor) { navigate("/auth"); return null; }

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className={`w-64 bg-sidebar text-sidebar-foreground flex flex-col relative ${isVisitor ? "select-none" : ""}`}>
        {/* Overlay no menu — bloqueia tudo exceto o botão Sair do visitante */}
        {isVisitor && (
          <div className="absolute inset-0 z-30 pointer-events-none"/>
        )}
        <div className="px-5 py-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-brand flex items-center justify-center shadow-elegant">
              <Headphones className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display font-bold text-base leading-tight">Renata Joias</div>
              <div className="text-[11px] text-sidebar-foreground/60 uppercase tracking-wider">Central de atendimento</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
          {/* Busca global */}
          <GlobalSearch />

          {/* ── HOME ── */}
          <NavLink to="/home" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Home className="h-4 w-4" /> Início
          </NavLink>

          {/* ── MENSAGENS ── */}
          <div className="pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 font-semibold">Mensagens</div>
          </div>
          <NavLink to="/dialer" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Phone className="h-4 w-4" /> Enviador de Mensagens
          </NavLink>
          <NavLink to="/historico" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <History className="h-4 w-4" /> Histórico de Mensagens
          </NavLink>
          <NavLink to="/historico-alteracoes" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <ShieldCheck className="h-4 w-4" /> Histórico de Alterações
          </NavLink>

          {/* ── GESTÃO ── */}
          <div className="pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 font-semibold">Gestão</div>
          </div>
          <NavLink to="/leads" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Users className="h-4 w-4" /> Leads
          </NavLink>
          <NavLink to="/leads-captura" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Globe className="h-4 w-4" /> Leads do Site
          </NavLink>
          <NavLink to="/crm" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Kanban className="h-4 w-4" /> CRM Kanban
          </NavLink>

          {/* ── ANÁLISE ── */}
          <div className="pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 font-semibold">Análise</div>
          </div>
          <NavLink to="/pipeline" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <TrendingDown className="h-4 w-4" /> Pipeline
          </NavLink>
          <NavLink to="/dashboard" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Activity className="h-4 w-4" /> Dashboard de Mensagens
          </NavLink>

          {/* ── ATENDIMENTO ── */}
          <div className="pt-3 pb-1">
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 font-semibold">Atendimento</div>
          </div>
          <NavLink to="/checkup" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Award className="h-4 w-4" /> Check-up ACELERA
          </NavLink>
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          {isVisitor && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/20 text-amber-200 text-[11px] font-medium flex items-center justify-between mb-1">
              <span>👁 Modo visitante</span>
              <button onClick={() => { localStorage.removeItem("renatajoias_visitor"); navigate("/auth"); }} className="underline text-[10px]">Sair</button>
            </div>
          )}
          <NavLink to="/settings" className={({ isActive }) => `${navItem} ${isActive ? active : ""}`}>
            <Settings className="h-4 w-4" /> Configurações
          </NavLink>
          <div className="px-3 py-1 text-[11px] text-sidebar-foreground/50 truncate">{user.email}</div>
          <Button
            variant="ghost" size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto relative">
        <Outlet />
        {/* Overlay invisível que bloqueia TODOS os cliques em modo visitante */}
        {isVisitor && (
          <div
            className="absolute inset-0 z-40"
            style={{ cursor: "not-allowed" }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              toast.warning("👁 Modo visitante — somente visualização");
            }}
          />
        )}
      </main>
    </div>
  );
}