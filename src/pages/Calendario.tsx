import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  EVENTO_CALENDARIO_TIPOS, EVENTO_CALENDARIO_LABELS, EVENTO_CALENDARIO_COLOR, EVENTO_CALENDARIO_EMOJI,
  MENSAGEM_CATEGORIA_EMOJI, TICKET_TIER_LABELS, TICKET_TIER_EMOJI,
  formatCurrency, type EventoCalendarioTipo, type MensagemCategoria, type TicketTier,
} from "@/lib/crm";
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, MessageCircle, ShoppingBag,
  X, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";

type Evento = {
  id: string; titulo: string; tipo: EventoCalendarioTipo; descricao: string | null;
  data: string; data_fim: string | null; alvo_list_id: string | null; alvo_ticket_tier: string | null;
};
type LeadList = { id: string; nome: string };
type DayStats = { total: number; byCategoria: Partial<Record<MensagemCategoria, number>>; comprasTotal: number; comprasValor: number };

const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const TICKET_TIERS: TicketTier[] = ["alto", "medio", "baixo"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function eventCoversDay(ev: Evento, key: string): boolean {
  const end = ev.data_fim ?? ev.data;
  return key >= ev.data && key <= end;
}

export default function Calendario() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewYear, setViewYear]   = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [statsByDay, setStatsByDay] = useState<Map<string, DayStats>>(new Map());
  const [eventos, setEventos]     = useState<Evento[]>([]);
  const [lists, setLists]         = useState<LeadList[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const today = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd   = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59, 999);

    const [{ data: msgData }, { data: comprasData }, { data: eventosData }, { data: listsData }] = await Promise.all([
      supabase.from("mensagens").select("categoria,enviada_em")
        .gte("enviada_em", monthStart.toISOString()).lte("enviada_em", monthEnd.toISOString()),
      supabase.from("compras").select("valor,data_compra")
        .gte("data_compra", monthStart.toISOString()).lte("data_compra", monthEnd.toISOString()),
      supabase.from("eventos_calendario").select("id,titulo,tipo,descricao,data,data_fim,alvo_list_id,alvo_ticket_tier")
        .order("data", { ascending: true }),
      supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false }),
    ]);

    const map = new Map<string, DayStats>();
    for (const m of (msgData ?? []) as { categoria: MensagemCategoria; enviada_em: string }[]) {
      const key = dateKey(new Date(m.enviada_em));
      const cur = map.get(key) ?? { total: 0, byCategoria: {}, comprasTotal: 0, comprasValor: 0 };
      cur.total++;
      cur.byCategoria[m.categoria] = (cur.byCategoria[m.categoria] ?? 0) + 1;
      map.set(key, cur);
    }
    for (const c of (comprasData ?? []) as { valor: number; data_compra: string }[]) {
      const key = dateKey(new Date(c.data_compra));
      const cur = map.get(key) ?? { total: 0, byCategoria: {}, comprasTotal: 0, comprasValor: 0 };
      cur.comprasTotal++;
      cur.comprasValor += c.valor;
      map.set(key, cur);
    }

    setStatsByDay(map);
    setEventos((eventosData ?? []) as Evento[]);
    setLists((listsData ?? []) as LeadList[]);
    setLoading(false);
  }, [viewYear, viewMonth]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1); }
  function nextMonth() { viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1); }
  function goToday() { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); setSelectedDay(today); }

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthTotals = useMemo(() => {
    let mensagens = 0, compras = 0, valor = 0;
    for (const s of statsByDay.values()) { mensagens += s.total; compras += s.comprasTotal; valor += s.comprasValor; }
    return { mensagens, compras, valor };
  }, [statsByDay]);

  async function saveEvento(patch: { titulo: string; tipo: EventoCalendarioTipo; descricao: string; data: string; data_fim: string | null; alvo_list_id: string | null; alvo_ticket_tier: string | null }) {
    if (!user) return;
    const { data, error } = await supabase.from("eventos_calendario").insert({
      titulo: patch.titulo,
      tipo: patch.tipo,
      descricao: patch.descricao || null,
      data: patch.data,
      data_fim: patch.data_fim,
      alvo_list_id: patch.alvo_list_id,
      alvo_ticket_tier: patch.alvo_ticket_tier,
      criado_por: user.id,
    }).select("id,titulo,tipo,descricao,data,data_fim,alvo_list_id,alvo_ticket_tier").single();
    if (error) { toast.error(error.message); return; }
    setEventos(prev => [...prev, data as Evento].sort((a, b) => a.data.localeCompare(b.data)));
    toast.success("Adicionado ao calendário");
  }

  async function deleteEvento(id: string) {
    const { error } = await supabase.from("eventos_calendario").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEventos(prev => prev.filter(e => e.id !== id));
    toast.success("Removido");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary"/> Calendário
          </h1>
          <p className="text-muted-foreground mt-1">
            {monthTotals.mensagens} mensagens · {monthTotals.compras} compras ({formatCurrency(monthTotals.valor)}) em {MONTHS[viewMonth]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <div className="flex items-center gap-1 border rounded-lg">
            <button onClick={prevMonth} className="p-2 hover:bg-muted transition-colors rounded-l-lg"><ChevronLeft className="h-4 w-4"/></button>
            <span className="text-sm font-semibold px-2 min-w-[140px] text-center">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="p-2 hover:bg-muted transition-colors rounded-r-lg"><ChevronRight className="h-4 w-4"/></button>
          </div>
        </div>
      </header>

      <Card className="shadow-card overflow-x-auto">
        <div className="grid grid-cols-7 border-b bg-muted/30 min-w-[700px]">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 min-w-[700px]">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} className="min-h-[104px] border-b border-r bg-muted/10"/>)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = new Date(viewYear, viewMonth, i + 1);
            const key = dateKey(day);
            const stats = statsByDay.get(key);
            const dayEventos = eventos.filter(e => eventCoversDay(e, key));
            const isToday = isSameDay(day, today);
            return (
              <button key={i} onClick={() => setSelectedDay(day)}
                className={`min-h-[104px] border-b border-r p-1.5 text-left hover:bg-muted/40 transition-colors flex flex-col gap-1 ${isToday ? "bg-primary/5" : ""}`}>
                <span className={`text-xs font-bold h-5 w-5 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {i + 1}
                </span>
                {stats && stats.total > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MessageCircle className="h-2.5 w-2.5"/> {stats.total}
                  </span>
                )}
                {stats && stats.comprasTotal > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <ShoppingBag className="h-2.5 w-2.5"/> {formatCurrency(stats.comprasValor)}
                  </span>
                )}
                <div className="flex flex-col gap-0.5">
                  {dayEventos.slice(0, 2).map(ev => (
                    <span key={ev.id} className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate border ${EVENTO_CALENDARIO_COLOR[ev.tipo]}`}>
                      {EVENTO_CALENDARIO_EMOJI[ev.tipo]} {ev.titulo}
                    </span>
                  ))}
                  {dayEventos.length > 2 && <span className="text-[9px] text-muted-foreground">+{dayEventos.length - 2}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay && (
        <DayDetailDialog
          day={selectedDay}
          stats={statsByDay.get(dateKey(selectedDay))}
          eventos={eventos.filter(e => eventCoversDay(e, dateKey(selectedDay)))}
          lists={lists}
          onClose={() => setSelectedDay(null)}
          onSave={saveEvento}
          onDelete={deleteEvento}
          onMessage={() => navigate("/dialer")}
        />
      )}
    </div>
  );
}

function DayDetailDialog({ day, stats, eventos, lists, onClose, onSave, onDelete, onMessage }: {
  day: Date; stats: DayStats | undefined; eventos: Evento[]; lists: LeadList[];
  onClose: () => void;
  onSave: (patch: { titulo: string; tipo: EventoCalendarioTipo; descricao: string; data: string; data_fim: string | null; alvo_list_id: string | null; alvo_ticket_tier: string | null }) => Promise<void>;
  onDelete: (id: string) => void;
  onMessage: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo]     = useState("");
  const [tipo, setTipo]         = useState<EventoCalendarioTipo>("promocao");
  const [descricao, setDescricao] = useState("");
  const [multiDia, setMultiDia] = useState(false);
  const [dataFim, setDataFim]   = useState("");
  const [alvoTipo, setAlvoTipo] = useState<"nenhum" | "lista" | "segmento">("nenhum");
  const [alvoListId, setAlvoListId] = useState<string>("");
  const [alvoTier, setAlvoTier] = useState<TicketTier>("alto");
  const [saving, setSaving]     = useState(false);

  const dataKey = dateKey(day);

  async function handleSave() {
    if (!titulo.trim()) { toast.error("Dê um título."); return; }
    setSaving(true);
    await onSave({
      titulo: titulo.trim(),
      tipo,
      descricao,
      data: dataKey,
      data_fim: multiDia && dataFim ? dataFim : null,
      alvo_list_id: alvoTipo === "lista" ? (alvoListId || null) : null,
      alvo_ticket_tier: alvoTipo === "segmento" ? alvoTier : null,
    });
    setSaving(false);
    setShowForm(false);
    setTitulo(""); setDescricao(""); setMultiDia(false); setDataFim(""); setAlvoTipo("nenhum");
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Atividade do dia */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Mensagens</p>
              {!stats || stats.total === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(stats.byCategoria).map(([cat, n]) => (
                    <span key={cat} className="text-xs font-medium bg-background border px-1.5 py-0.5 rounded">
                      {MENSAGEM_CATEGORIA_EMOJI[cat as MensagemCategoria]} {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Compras</p>
              {!stats || stats.comprasTotal === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma</p>
              ) : (
                <p className="text-sm font-bold">{stats.comprasTotal} · {formatCurrency(stats.comprasValor)}</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onMessage} className="w-full">
            <MessageCircle className="h-3.5 w-3.5 mr-2"/> Ir pro Enviador de Mensagens
          </Button>

          {/* Eventos do dia */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">Promoções / eventos / novidades</p>
              {!showForm && (
                <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5"/> Adicionar
                </button>
              )}
            </div>

            {eventos.length === 0 && !showForm && (
              <p className="text-xs text-muted-foreground italic">Nada marcado para este dia.</p>
            )}

            {eventos.map(ev => (
              <div key={ev.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${EVENTO_CALENDARIO_COLOR[ev.tipo]}`}>
                <span className="text-base leading-none">{EVENTO_CALENDARIO_EMOJI[ev.tipo]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{ev.titulo}</p>
                  {ev.descricao && <p className="text-xs opacity-80 mt-0.5">{ev.descricao}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {ev.data_fim && ev.data_fim !== ev.data && (
                      <span className="text-[10px] opacity-70">
                        até {new Date(ev.data_fim + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    )}
                    {ev.alvo_list_id && (
                      <span className="text-[10px] font-medium flex items-center gap-1 opacity-80">
                        <Users className="h-2.5 w-2.5"/> {lists.find(l => l.id === ev.alvo_list_id)?.nome ?? "lista"}
                      </span>
                    )}
                    {ev.alvo_ticket_tier && (
                      <span className="text-[10px] font-medium opacity-80">
                        {TICKET_TIER_EMOJI[ev.alvo_ticket_tier as TicketTier]} {TICKET_TIER_LABELS[ev.alvo_ticket_tier as TicketTier]}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => onDelete(ev.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3.5 w-3.5"/>
                </button>
              </div>
            ))}

            {showForm && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                <div className="flex gap-2">
                  {EVENTO_CALENDARIO_TIPOS.map(t => (
                    <button key={t} onClick={() => setTipo(t)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        tipo === t ? EVENTO_CALENDARIO_COLOR[t] + " ring-1 ring-inset ring-current" : "bg-background text-muted-foreground"
                      }`}>
                      {EVENTO_CALENDARIO_EMOJI[t]} {EVENTO_CALENDARIO_LABELS[t]}
                    </button>
                  ))}
                </div>
                <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex: Dia das Mães)"/>
                <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)" rows={2}/>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={multiDia} onChange={e => setMultiDia(e.target.checked)}/>
                  Vai até outra data (evento de vários dias)
                </label>
                {multiDia && (
                  <Input type="date" value={dataFim} min={dataKey} onChange={e => setDataFim(e.target.value)}/>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Direcionar para</p>
                  <Select value={alvoTipo} onValueChange={v => setAlvoTipo(v as any)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Ninguém — só um lembrete</SelectItem>
                      <SelectItem value="lista">Uma lista de leads</SelectItem>
                      <SelectItem value="segmento">Um segmento de ticket</SelectItem>
                    </SelectContent>
                  </Select>
                  {alvoTipo === "lista" && (
                    <Select value={alvoListId} onValueChange={setAlvoListId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha a lista"/></SelectTrigger>
                      <SelectContent>
                        {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {alvoTipo === "segmento" && (
                    <Select value={alvoTier} onValueChange={v => setAlvoTier(v as TicketTier)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue/></SelectTrigger>
                      <SelectContent>
                        {TICKET_TIERS.map(t => <SelectItem key={t} value={t}>{TICKET_TIER_EMOJI[t]} {TICKET_TIER_LABELS[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors flex items-center gap-1">
                    <X className="h-3 w-3"/> Cancelar
                  </button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors">Fechar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
