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
import {
  formatPhone, MENSAGEM_CATEGORIAS, MENSAGEM_CATEGORIA_LABELS, MENSAGEM_CATEGORIA_COLOR,
  MENSAGEM_CATEGORIA_EMOJI, MENSAGEM_STATUS_CONTATO_ORDER, MENSAGEM_STATUS_CONTATO_LABELS,
  MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  type MensagemCategoria, type MensagemStatusContato,
} from "@/lib/crm";
import {
  Search, MessageCircle, CalendarDays, ChevronLeft, ChevronRight,
  RefreshCw, MessageSquare, CheckCircle2, X, Eye, Send,
} from "lucide-react";
import { toast } from "sonner";

type Mensagem = {
  id: string;
  lead_id: string;
  categoria: MensagemCategoria;
  texto: string;
  status_contato: MensagemStatusContato;
  observacao: string | null;
  enviada_em: string;
  lead?: { nome: string; telefone: string; list_id: string | null };
};

type LeadList = { id: string; nome: string };

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

  const [mensagens, setMensagens]         = useState<Mensagem[]>([]);
  const [totalCount, setTotalCount]       = useState(0);
  const [page, setPage]                   = useState(0);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [activeList, setActiveList]       = useState("all");
  const [dateFrom, setDateFrom]           = useState<Date | null>(null);
  const [dateTo, setDateTo]               = useState<Date | null>(null);
  const [datePreset, setDatePreset]       = useState<string>("all");
  const [lists, setLists]                 = useState<LeadList[]>([]);
  const [stats, setStats]                 = useState({ total: 0, respondidas: 0, taxaResposta: 0 });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false })
      .then(({ data }) => setLists((data ?? []) as LeadList[]));
  }, []);

  const applyServerFilters = useCallback((q: any) => {
    if (dateFrom) {
      const start = new Date(dateFrom); start.setHours(0, 0, 0, 0);
      q = q.gte("enviada_em", start.toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      q = q.lte("enviada_em", end.toISOString());
    }
    if (categoriaFilter !== "all") q = q.eq("categoria", categoriaFilter);
    return q;
  }, [dateFrom, dateTo, categoriaFilter]);

  const applyClientFilters = useCallback((data: Mensagem[]) => {
    let r = data;
    if (activeList !== "all") r = r.filter(m => m.lead?.list_id === activeList);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(m => m.lead?.nome?.toLowerCase().includes(q) || m.lead?.telefone?.includes(q));
    }
    return r;
  }, [activeList, search]);

  const loadMensagens = useCallback(async (targetPage = 0) => {
    if (!user) return;
    setLoading(true);
    const from = targetPage * PAGE_SIZE;

    let q = supabase
      .from("mensagens")
      .select("id,lead_id,categoria,texto,status_contato,observacao,enviada_em,lead:leads(nome,telefone,list_id)", { count: "exact" })
      .eq("atendente_id", user.id)
      .order("enviada_em", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    q = applyServerFilters(q);

    const { data, count, error } = await q;
    if (error) { toast.error("Erro: " + error.message); setLoading(false); return; }

    setMensagens(applyClientFilters((data ?? []) as unknown as Mensagem[]));
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [user, applyServerFilters, applyClientFilters]);

  const loadStats = useCallback(async () => {
    if (!user) return;

    let q = supabase
      .from("mensagens")
      .select("status_contato,lead_id")
      .eq("atendente_id", user.id);

    q = applyServerFilters(q);

    const { data } = await q;
    let list = (data ?? []) as any[];

    if (activeList !== "all") {
      const { data: leadIds } = await supabase
        .from("leads").select("id").eq("list_id", activeList);
      const ids = new Set((leadIds ?? []).map((l: any) => l.id));
      list = list.filter(m => ids.has(m.lead_id));
    }

    const respondidas = list.filter(m => m.status_contato === "respondida").length;
    setStats({
      total: list.length,
      respondidas,
      taxaResposta: list.length ? Math.round((respondidas / list.length) * 100) : 0,
    });
  }, [user, applyServerFilters, activeList]);

  useEffect(() => { setPage(0); loadMensagens(0); loadStats(); }, [dateFrom, dateTo, categoriaFilter, activeList]);
  useEffect(() => { const t = setTimeout(() => { setPage(0); loadMensagens(0); }, 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadMensagens(page); }, [page]);

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

  async function setStatusContato(msg: Mensagem, status_contato: MensagemStatusContato) {
    if (msg.status_contato === status_contato) return;
    const { error } = await supabase.from("mensagens").update({ status_contato }).eq("id", msg.id);
    if (error) { toast.error(error.message); return; }
    setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, status_contato } : m));
    loadStats();
  }

  const periodLabel = dateFrom || dateTo
    ? [dateFrom?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), dateTo?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })]
        .filter(Boolean).join(" → ")
    : "Todo o histórico";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Histórico de Mensagens</h1>
          <p className="text-muted-foreground capitalize">{periodLabel} · {stats.total} mensagens</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatBox icon={<MessageCircle className="h-4 w-4" />} label="Enviadas"      value={String(stats.total)} />
          <StatBox icon={<CheckCircle2 className="h-4 w-4" />}  label="Respondidas"   value={String(stats.respondidas)} />
          <StatBox icon={<Send className="h-4 w-4" />}          label="Taxa resposta" value={`${stats.taxaResposta}%`} />
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

        <Select value={categoriaFilter} onValueChange={v => { setCategoriaFilter(v); setPage(0); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {MENSAGEM_CATEGORIAS.map(c => (
              <SelectItem key={c} value={c}>{MENSAGEM_CATEGORIA_EMOJI[c]} {MENSAGEM_CATEGORIA_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" onClick={() => { loadMensagens(page); loadStats(); }} disabled={loading}>
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
              <TableHead>Categoria</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Ação</TableHead>
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
            ) : mensagens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  Nenhuma mensagem encontrada para esse filtro.
                </TableCell>
              </TableRow>
            ) : mensagens.map(msg => {
              const date = new Date(msg.enviada_em);
              return (
                <TableRow key={msg.id} className="hover:bg-muted/40 cursor-pointer"
                  onClick={() => msg.lead_id && navigate(`/dialer?lead=${msg.lead_id}`)}>
                  <TableCell className="font-medium">
                    {msg.lead?.nome ?? <span className="text-muted-foreground italic">Lead removido</span>}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {msg.lead?.telefone ? formatPhone(msg.lead.telefone) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-xs ${MENSAGEM_CATEGORIA_COLOR[msg.categoria]}`}>
                      {MENSAGEM_CATEGORIA_EMOJI[msg.categoria]} {MENSAGEM_CATEGORIA_LABELS[msg.categoria]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{msg.texto}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex gap-0.5">
                      {MENSAGEM_STATUS_CONTATO_ORDER.map(s => (
                        <button
                          key={s}
                          onClick={() => setStatusContato(msg, s)}
                          title={MENSAGEM_STATUS_CONTATO_LABELS[s]}
                          className={`h-6 w-6 flex items-center justify-center rounded-full text-[11px] transition-colors ${
                            msg.status_contato === s ? MENSAGEM_STATUS_CONTATO_COLOR[s] + " ring-1 ring-inset ring-current" : "text-muted-foreground/40 hover:bg-muted"
                          }`}
                        >
                          {MENSAGEM_STATUS_CONTATO_EMOJI[s]}
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Ver lead"
                        onClick={() => msg.lead_id && navigate(`/lead/${msg.lead_id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Enviar nova mensagem"
                        onClick={() => msg.lead_id && navigate(`/dialer?lead=${msg.lead_id}`)}>
                        <MessageCircle className="h-4 w-4" />
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
