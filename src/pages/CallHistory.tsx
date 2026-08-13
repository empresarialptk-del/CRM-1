import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuration, formatPhone, OUTCOME_LABELS, STATUS_COLOR, FUNNEL_STAGE, FUNNEL_STAGES } from "@/lib/crm";
import {
  Search, PhoneCall, Clock, CalendarDays, ChevronLeft, ChevronRight,
  RefreshCw, Phone, TrendingUp, CheckCircle2, X, Eye,
} from "lucide-react";
import { toast } from "sonner";

type Call = {
  id: string;
  lead_id: string;
  started_at: string;
  duracao_segundos: number | null;
  outcome: string;
  outcome_label: string | null;
  observacao: string | null;
  lead?: { nome: string; telefone: string; list_id: string | null };
};

type LeadList = { id: string; nome: string };

const OUTCOME_LABELS: Record<string, string> = {
  proposta: "Proposta", visita: "Visita", agendado: "Agendado",
  convertido: "Convertido", respondeu: "Respondeu", mensagem_zap: "Msg Zap",
  nao_atendeu: "Não atendeu", retornar: "Retornar",
  sem_interesse: "Sem interesse", numero_errado: "Nº errado",
  numero_bloqueado: "Bloqueado", ja_comprou: "Já comprou",
  comprou_carro: "Comprou carro", nao_quer_mais: "Não quer mais",
  perdido: "Perdido", ignorado: "Ignorado", quer_casa: "Quer casa",
  personalizado: "Personalizado",
};

const OUTCOME_COLOR: Record<string, string> = {
  proposta: "bg-emerald-500/15 text-emerald-700", visita: "bg-emerald-500/15 text-emerald-700",
  agendado: "bg-emerald-500/15 text-emerald-700", convertido: "bg-emerald-500/15 text-emerald-700",
  respondeu: "bg-emerald-500/15 text-emerald-700", mensagem_zap: "bg-emerald-500/15 text-emerald-700",
  nao_atendeu: "bg-amber-500/15 text-amber-700", retornar: "bg-amber-500/15 text-amber-700",
  personalizado: "bg-violet-500/15 text-violet-700",
  sem_interesse: "bg-rose-500/15 text-rose-700", numero_errado: "bg-rose-500/15 text-rose-700",
  numero_bloqueado: "bg-rose-500/15 text-rose-700", ja_comprou: "bg-rose-500/15 text-rose-700",
  comprou_carro: "bg-rose-500/15 text-rose-700", nao_quer_mais: "bg-rose-500/15 text-rose-700",
  perdido: "bg-rose-500/15 text-rose-700", ignorado: "bg-rose-500/15 text-rose-700",
  quer_casa: "bg-rose-500/15 text-rose-700",
};

const POSITIVE_OUTCOMES = new Set(["proposta","visita","agendado","convertido","respondeu","mensagem_zap"]);
const PAGE_SIZE = 50;
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── Calendário ────────────────────────────────────────────────────────────────
function CalendarPicker({ selectedDate, onChange, onClear }: {
  selectedDate: Date | null; onChange: (d: Date) => void; onClear: () => void;
}) {
  const [open, setOpen]         = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() { viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1); }
  function nextMonth() { viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y+1)) : setViewMonth(m => m+1); }

  const label = selectedDate
    ? selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "Filtrar por dia";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors whitespace-nowrap
          ${open || selectedDate ? "border-primary bg-primary/5 text-primary" : "border-input bg-background hover:bg-muted/50 text-foreground"}`}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        {label}
        {selectedDate && (
          <span role="button" onClick={e => { e.stopPropagation(); onClear(); }} className="ml-1 text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-xl border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="p-3 select-none">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = new Date(viewYear, viewMonth, i + 1);
                const isToday    = isSameDay(day, today);
                const isSelected = !!selectedDate && isSameDay(day, selectedDate);
                const future     = day > today;
                return (
                  <button key={i} disabled={future}
                    onClick={() => { onChange(day); setOpen(false); }}
                    className={`relative h-8 text-xs font-medium transition-all rounded-full
                      ${future ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}
                      ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "text-primary font-bold hover:bg-muted" : "hover:bg-muted text-foreground"}`}
                  >
                    {i + 1}
                    {isToday && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CallHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [calls, setCalls]               = useState<Call[]>([]);
  const [totalCount, setTotalCount]     = useState(0);
  const [page, setPage]                 = useState(0);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [activeList, setActiveList]     = useState("all");
  const [dateFrom, setDateFrom]         = useState<Date | null>(null);
  const [dateTo, setDateTo]             = useState<Date | null>(null);
  const [datePreset, setDatePreset]     = useState<string>("all");
  const [lists, setLists]               = useState<LeadList[]>([]);
  const [stats, setStats]               = useState({ total: 0, totalSec: 0, positivos: 0, avgSec: 0 });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false })
      .then(({ data }) => setLists((data ?? []) as LeadList[]));
  }, []);

  // Aplica filtros de data e outcome na query do Supabase
  const applyServerFilters = useCallback((q: any) => {
    if (dateFrom) {
      const start = new Date(dateFrom); start.setHours(0, 0, 0, 0);
      q = q.gte("started_at", start.toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      q = q.lte("started_at", end.toISOString());
    }
    if (outcomeFilter !== "all") q = q.eq("outcome", outcomeFilter);
    return q;
  }, [dateFrom, dateTo, outcomeFilter]);

  // Filtro client-side por lista e busca (join)
  const applyClientFilters = useCallback((data: Call[]) => {
    let r = data;
    if (activeList !== "all") r = r.filter(c => c.lead?.list_id === activeList);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(c => c.lead?.nome?.toLowerCase().includes(q) || c.lead?.telefone?.includes(q));
    }
    return r;
  }, [activeList, search]);

  // Carrega página da tabela
  const loadCalls = useCallback(async (targetPage = 0) => {
    if (!user) return;
    setLoading(true);
    const from = targetPage * PAGE_SIZE;

    let q = supabase
      .from("calls")
      .select("id,lead_id,started_at,duracao_segundos,outcome,outcome_label,observacao,lead:leads(nome,telefone,list_id)", { count: "exact" })
      .eq("atendente_id", user.id)
      .order("started_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    q = applyServerFilters(q);

    const { data, count, error } = await q;
    if (error) { toast.error("Erro: " + error.message); setLoading(false); return; }

    setCalls(applyClientFilters((data ?? []) as Call[]));
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [user, applyServerFilters, applyClientFilters]);

  // Carrega stats — só count e soma, sem JOIN pesado
  const loadStats = useCallback(async () => {
    if (!user) return;

    let q = supabase
      .from("calls")
      .select("duracao_segundos,outcome,lead_id")
      .eq("atendente_id", user.id);

    q = applyServerFilters(q);

    const { data } = await q;
    let list = (data ?? []) as any[];

    // Filtro por lista (precisa dos lead_ids da lista)
    if (activeList !== "all") {
      const { data: leadIds } = await supabase
        .from("leads").select("id").eq("list_id", activeList);
      const ids = new Set((leadIds ?? []).map((l: any) => l.id));
      list = list.filter(c => ids.has(c.lead_id));
    }

    const totalSec = list.reduce((a, c) => a + (c.duracao_segundos || 0), 0);
    setStats({
      total: list.length,
      totalSec,
      positivos: list.filter(c => POSITIVE_OUTCOMES.has(c.outcome)).length,
      avgSec: list.length ? Math.round(totalSec / list.length) : 0,
    });
  }, [user, applyServerFilters, activeList]);

  useEffect(() => { setPage(0); loadCalls(0); loadStats(); }, [dateFrom, dateTo, outcomeFilter, activeList]);
  useEffect(() => { const t = setTimeout(() => { setPage(0); loadCalls(0); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadCalls(page); }, [page]);

  function applyPreset(preset: string) {
    setDatePreset(preset);
    const today = new Date();
    if (preset === "all")    { setDateFrom(null); setDateTo(null); }
    if (preset === "today")  { setDateFrom(today); setDateTo(today); }
    if (preset === "week")   { const s = new Date(today); s.setDate(today.getDate() - 6); setDateFrom(s); setDateTo(today); }
    if (preset === "month")  { const s = new Date(today.getFullYear(), today.getMonth(), 1); setDateFrom(s); setDateTo(today); }
    if (preset === "custom") { /* handled by pickers */ }
    setPage(0);
  }

  const periodLabel = dateFrom || dateTo
    ? [dateFrom?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), dateTo?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })]
        .filter(Boolean).join(" → ")
    : "Todo o histórico";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Histórico de Ligações</h1>
          <p className="text-muted-foreground capitalize">{periodLabel} · {stats.total} ligações</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatBox icon={<Phone className="h-4 w-4" />}        label="Ligações"   value={String(stats.total)} />
          <StatBox icon={<Clock className="h-4 w-4" />}        label="Tempo total" value={formatDuration(stats.totalSec)} />
          <StatBox icon={<TrendingUp className="h-4 w-4" />}   label="Tempo médio" value={formatDuration(stats.avgSec)} />
          <StatBox icon={<CheckCircle2 className="h-4 w-4" />} label="Positivos"   value={String(stats.positivos)} />
        </div>
      </header>

      <Card className="p-4 mb-4 shadow-card flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" className="pl-9" />
        </div>

        <Select value={activeList} onValueChange={v => { setActiveList(v); setPage(0); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Todas as listas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">📋 Todas as listas</SelectItem>
            {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Presets rápidos */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key: "all",   label: "Tudo"    },
            { key: "today", label: "Hoje"    },
            { key: "week",  label: "7 dias"  },
            { key: "month", label: "Mês"     },
            { key: "custom",label: "Período" },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                datePreset === p.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:border-foreground/30"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Range personalizado */}
        {datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom ? dateFrom.toISOString().slice(0,10) : ""}
              onChange={e => { setDateFrom(e.target.value ? new Date(e.target.value + "T12:00:00") : null); setPage(0); }}
              className="h-9 text-xs w-36"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input
              type="date"
              value={dateTo ? dateTo.toISOString().slice(0,10) : ""}
              onChange={e => { setDateTo(e.target.value ? new Date(e.target.value + "T12:00:00") : null); setPage(0); }}
              className="h-9 text-xs w-36"
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(null); setDateTo(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <Select value={outcomeFilter} onValueChange={v => { setOutcomeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos os resultados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os resultados</SelectItem>
            {Object.entries(OUTCOME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => { loadCalls(page); loadStats(); }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead className="w-16 text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <PhoneCall className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  Nenhuma ligação encontrada para esse filtro.
                </TableCell>
              </TableRow>
            ) : calls.map(call => {
              const outcomeLabel = call.outcome === "personalizado" && call.outcome_label
                ? call.outcome_label : (OUTCOME_LABELS[call.outcome] ?? call.outcome);
              const badgeColor = STATUS_COLOR[call.outcome] ?? "bg-muted text-muted-foreground";
              const date = new Date(call.started_at);
              return (
                <TableRow key={call.id} className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => call.lead_id && navigate(`/dialer?lead=${call.lead_id}`)}>
                  <TableCell className="font-medium">
                    {call.lead?.nome ?? <span className="text-muted-foreground italic">Lead removido</span>}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {call.lead?.telefone ? formatPhone(call.lead.telefone) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {call.duracao_segundos != null ? formatDuration(call.duracao_segundos) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-xs ${badgeColor}`}>{outcomeLabel}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{call.observacao ?? "—"}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Ver lead"
                        onClick={() => call.lead_id && navigate(`/lead/${call.lead_id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Discar novamente"
                        onClick={() => call.lead_id && navigate(`/dialer?lead=${call.lead_id}`)}>
                        <PhoneCall className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">
              Página <strong className="text-foreground">{page + 1}</strong> de{" "}
              <strong className="text-foreground">{totalPages}</strong>
              {" · "}{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
                Próxima<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="px-4 py-3 shadow-card flex items-center gap-3 min-w-[120px]">
      <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-lg tabular-nums">{value}</div>
      </div>
    </Card>
  );
}