import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDuration, FUNNEL_STAGES, OUTCOME_LABELS } from "@/lib/crm";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  Phone, Clock, Trophy, TrendingUp, Target, Users,
  PhoneMissed, CalendarCheck, Flame, Star, Activity, Filter,
  ChevronLeft, ChevronRight, CalendarDays, X, Award, Pencil, Save, Zap,
} from "lucide-react";

// ── Metas editáveis ──────────────────────────────────────────────────────────
const META_KEY = "dashboard_metas_v2";
function loadMetas() {
  try { const r = localStorage.getItem(META_KEY); return r ? JSON.parse(r) : { ligacoes: 50, visitas: 3, checkup: 8 }; }
  catch { return { ligacoes: 50, visitas: 3, checkup: 8 }; }
}
function saveMetas(m: { ligacoes: number; visitas: number; checkup: number }) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {}
}

// ── Cores outcomes ────────────────────────────────────────────────────────
const OUTCOME_META: Record<string, { label: string; color: string; category: "positivo" | "retorno" | "encerrado" }> = {
  proposta:           { label: "Proposta",          color: "#10b981", category: "positivo"  },
  visita:             { label: "Visita (leg)",      color: "#059669", category: "positivo"  },
  agendado:           { label: "Agendado (leg)",    color: "#34d399", category: "positivo"  },
  visita_pendente:    { label: "Quer visitar",      color: "#f97316", category: "positivo"  },
  visita_agendada:    { label: "Visita agendada",   color: "#3b82f6", category: "positivo"  },
  visita_confirmada:  { label: "Visita confirmada", color: "#059669", category: "positivo"  },
  visita_cancelada:   { label: "Visita cancelada",  color: "#ef4444", category: "retorno"   },
  convertido:         { label: "Convertido",        color: "#065f46", category: "positivo"  },
  respondeu:          { label: "Respondeu",         color: "#6ee7b7", category: "positivo"  },
  mensagem_zap:       { label: "Msg Zap",           color: "#a7f3d0", category: "positivo"  },
  nao_atendeu:      { label: "Não atendeu",    color: "#f59e0b", category: "retorno"   },
  retornar:         { label: "Retornar",       color: "#fbbf24", category: "retorno"   },
  sem_interesse:    { label: "Sem interesse",  color: "#f87171", category: "encerrado" },
  numero_errado:    { label: "Nº errado",      color: "#ef4444", category: "encerrado" },
  numero_bloqueado: { label: "Bloqueado",      color: "#dc2626", category: "encerrado" },
  ja_comprou:       { label: "Já comprou",     color: "#b91c1c", category: "encerrado" },
  comprou_carro:    { label: "Comprou carro",  color: "#991b1b", category: "encerrado" },
  nao_quer_mais:    { label: "Não quer mais",  color: "#7f1d1d", category: "encerrado" },
  perdido:          { label: "Perdido",        color: "#fca5a5", category: "encerrado" },
  ignorado:         { label: "Ignorado",       color: "#fcd34d", category: "encerrado" },
  quer_casa:        { label: "Quer casa",      color: "#d97706", category: "encerrado" },
  personalizado:    { label: "Personalizado",  color: "#a78bfa", category: "retorno"   },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  novo:             { label: "Novo",           color: "#6366f1" },
  nao_atendeu:      { label: "Não atendeu",    color: "#f59e0b" },
  retornar:         { label: "Retornar",       color: "#3b82f6" },
  agendado:         { label: "Agendado",       color: "#8b5cf6" },
  convertido:       { label: "Convertido",     color: "#10b981" },
  interesse:        { label: "Interesse",      color: "#0ea5e9" },
  visita_pendente:  { label: "Quer visitar",   color: "#f97316" },
  visita_agendada:  { label: "V. agendada",    color: "#8b5cf6" },
  visita_confirmada:{ label: "V. confirmada",  color: "#10b981" },
  visita_faltou:    { label: "Não veio",       color: "#f43f5e" },
  visita_cancelada: { label: "Cancelou",       color: "#ef4444" },
  visita_remarcada: { label: "Remarcada",      color: "#a78bfa" },
  visitou:          { label: "Visitou",        color: "#059669" },
  envio_documentos: { label: "Envio docs",     color: "#6d28d9" },
  cpf_analisado:    { label: "CPF analisado",  color: "#2563eb" },
  credito_aprovado: { label: "Crédito aprov.", color: "#0891b2" },
  contrato_gerado:  { label: "Contrato",       color: "#4338ca" },
  contrato_assinado:{ label: "Assinado",       color: "#1d4ed8" },
  boleto_pago:      { label: "Boleto pago",    color: "#0f766e" },
  repasse:          { label: "Repasse",        color: "#0369a1" },
  registro:         { label: "Registro 🏆",   color: "#059669" },
  sem_interesse:    { label: "Sem interesse",  color: "#6b7280" },
  numero_errado:    { label: "Nº errado",      color: "#ef4444" },
  ignorado:         { label: "Ignorado",       color: "#9ca3af" },
  perdido:          { label: "Perdido",        color: "#9ca3af" },
  proposta:         { label: "Proposta",       color: "#059669" },
  visita:           { label: "Visita",         color: "#0d9488" },
  quer_casa:        { label: "Quer casa",      color: "#d97706" },
  ja_comprou:       { label: "Já comprou",     color: "#16a34a" },
  comprou_carro:    { label: "Comprou carro",  color: "#15803d" },
  nao_quer_mais:    { label: "Não quer mais",  color: "#dc2626" },
  respondeu:        { label: "Respondeu",      color: "#0ea5e9" },
  mensagem_zap:     { label: "Msg Zap",        color: "#22c55e" },
  numero_bloqueado: { label: "Bloqueado",      color: "#7f1d1d" },
};

// ── localStorage ─────────────────────────────────────────────────────────────
const CONTACTED_KEY = "dialer_contacted_ids";
function todayPrefix() { return new Date().toISOString().slice(0, 10); }
function loadContactedToday(): string[] {
  try {
    const raw = localStorage.getItem(CONTACTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayPrefix()) return [];
    return parsed.ids ?? [];
  } catch { return []; }
}

// ── Helpers de data ───────────────────────────────────────────────────────────
function localMidnight(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function localEndOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function rangeFromPreset(preset: string, custom: { start: Date | null; end: Date | null }) {
  const today = new Date();
  if (preset === "today")     return { start: localMidnight(today), end: localEndOfDay(today) };
  if (preset === "yesterday") { const y = addDays(today, -1); return { start: localMidnight(y), end: localEndOfDay(y) }; }
  if (preset === "7d")        return { start: localMidnight(addDays(today, -6)), end: localEndOfDay(today) };
  if (preset === "14d")       return { start: localMidnight(addDays(today, -13)), end: localEndOfDay(today) };
  if (preset === "month")     return { start: localMidnight(new Date(today.getFullYear(), today.getMonth(), 1)), end: localEndOfDay(today) };
  if (preset === "year")      return { start: localMidnight(new Date(today.getFullYear(), 0, 1)), end: localEndOfDay(today) };
  if (preset === "custom" && custom.start) {
    const end = custom.end ?? custom.start;
    return { start: localMidnight(custom.start), end: localEndOfDay(end) };
  }
  return { start: null, end: null };
}

const PRESETS = [
  { value: "today",     label: "Hoje"        },
  { value: "yesterday", label: "Ontem"       },
  { value: "7d",        label: "Últ. 7 dias" },
  { value: "14d",       label: "Últ. 14 dias"},
  { value: "month",     label: "Este mês"    },
  { value: "year",      label: "Este ano"    },
];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS   = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── CalendarPopover (original refinado) ──────────────────────────────────────
function CalendarPopover({ preset, setPreset, customRange, setCustomRange }: {
  preset: string; setPreset: (v: string) => void;
  customRange: { start: Date | null; end: Date | null };
  setCustomRange: (r: { start: Date | null; end: Date | null }) => void;
}) {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [hovered, setHovered]     = useState<Date | null>(null);
  const ref                       = useRef<HTMLDivElement>(null);
  const today                     = new Date();

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function handleDayClick(day: Date) {
    if (!customRange.start || (customRange.start && customRange.end)) {
      setCustomRange({ start: day, end: null }); setPreset("custom");
    } else {
      const start = day < customRange.start ? day : customRange.start;
      const end   = day < customRange.start ? customRange.start : day;
      setCustomRange({ start, end }); setPreset("custom"); setOpen(false);
    }
  }

  function isInRange(day: Date) {
    const s = customRange.start; const e = customRange.end ?? hovered;
    if (!s || !e) return false;
    const lo = s < e ? s : e; const hi = s < e ? e : s;
    return day > lo && day < hi;
  }

  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }

  function buttonLabel() {
    if (preset !== "custom") return PRESETS.find(p => p.value === preset)?.label ?? "Período";
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (customRange.start && customRange.end) {
      if (isSameDay(customRange.start, customRange.end)) return fmt(customRange.start);
      return `${fmt(customRange.start)} – ${fmt(customRange.end)}`;
    }
    if (customRange.start) return `${fmt(customRange.start)} – ...`;
    return "Selecionar";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 h-9 px-3 rounded-md border text-sm font-medium transition-colors whitespace-nowrap
          ${open ? "border-primary bg-primary/5 text-primary" : "border-input bg-background hover:bg-muted/50 text-foreground"}`}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        {buttonLabel()}
        {preset === "custom" && customRange.start && (
          <span role="button" onClick={e => { e.stopPropagation(); setPreset("today"); setCustomRange({ start: null, end: null }); }}
            className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] rounded-xl border bg-card shadow-xl overflow-hidden">
          <div className="flex flex-wrap gap-1.5 p-3 border-b bg-muted/30">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => { setPreset(p.value); setCustomRange({ start: null, end: null }); setOpen(false); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                  ${preset === p.value ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold">{MONTHS[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="p-3 select-none">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day     = new Date(viewYear, viewMonth, i + 1);
                const isToday = isSameDay(day, today);
                const isStart = !!customRange.start && isSameDay(day, customRange.start);
                const isEnd   = !!customRange.end   && isSameDay(day, customRange.end);
                const inRange = isInRange(day);
                const future  = day > today;
                return (
                  <button key={i} disabled={future} onClick={() => handleDayClick(day)}
                    onMouseEnter={() => setHovered(day)} onMouseLeave={() => setHovered(null)}
                    className={`relative h-8 text-xs font-medium transition-all
                      ${future ? "opacity-25 cursor-not-allowed" : "cursor-pointer"}
                      ${isStart || isEnd ? "bg-primary text-primary-foreground rounded-full z-10"
                        : inRange ? "bg-primary/15 text-primary"
                        : isToday ? "text-primary font-bold hover:bg-muted rounded-full"
                        : "hover:bg-muted rounded-full text-foreground"}`}
                  >
                    {i + 1}
                    {isToday && !isStart && !isEnd && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {preset === "custom" && customRange.start && !customRange.end && (
            <div className="px-4 pb-3 text-center text-xs text-muted-foreground">Clique em outro dia para definir o intervalo</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MetaBar ───────────────────────────────────────────────────────────────────
function MetaBar({ label, current, meta, color }: { label: string; current: number; meta: number; color: string }) {
  const pct = Math.min(100, meta > 0 ? Math.round((current / meta) * 100) : 0);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className={pct >= 100 ? "text-emerald-600 font-bold" : "text-foreground font-semibold"}>
          {current} / {meta} {pct >= 100 ? "🎉" : ""}
        </span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
        {pct >= 100 ? "Meta batida!" : `${pct}% — faltam ${meta - current}`}
      </div>
    </div>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function MyDashboard() {
  const { user } = useAuth();

  const [preset, setPreset]           = useState("today");
  const [customRange, setCustomRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [activeList, setActiveList]   = useState("all");
  const [calls, setCalls]             = useState<any[]>([]);
  const [leads, setLeads]             = useState<any[]>([]);
  const [lists, setLists]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [metas, setMetas]             = useState(loadMetas);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft]     = useState(loadMetas);
  const [checkupHistory, setCheckupHistory] = useState<{ date: string; nota: number }[]>([]);
  const [lastWeekCalls, setLastWeekCalls]   = useState<any[]>([]);

  const contactedTodayIds = useMemo(() => new Set(loadContactedToday()), [calls]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const { start, end } = rangeFromPreset(preset, customRange);

    Promise.all([
      (async () => {
        let q = supabase.from("calls").select("*").eq("atendente_id", user.id).order("started_at", { ascending: true });
        if (start) q = q.gte("started_at", start.toISOString());
        if (end)   q = q.lte("started_at", end.toISOString());
        const { data } = await q;
        setCalls(data ?? []);
      })(),
      (async () => {
        let q = supabase.from("leads").select("id,status,list_id,created_at,observacoes").order("created_at", { ascending: false });
        if (activeList !== "all") q = q.eq("list_id", activeList);
        const { data } = await q;
        setLeads(data ?? []);
        // Parse checkup history
        const history: { date: string; nota: number }[] = [];
        (data ?? []).forEach((lead: any) => {
          if (!lead.observacoes) return;
          lead.observacoes.split("\n").forEach((line: string) => {
            const m = line.match(/\[CHECK-UP (\d{2}\/\d{2}\/\d{4})\] Nota: ([\d.]+)\/10/);
            if (m) { const [d,mo,y] = m[1].split("/"); history.push({ date: `${y}-${mo}-${d}`, nota: parseFloat(m[2]) }); }
          });
        });
        history.sort((a, b) => a.date.localeCompare(b.date));
        setCheckupHistory(history);
      })(),
      (async () => {
        const { data } = await supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false });
        setLists(data ?? []);
      })(),
    ]).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, preset, customRange.start?.toISOString(), customRange.end?.toISOString(), activeList]);

  const filteredCalls = useMemo(() => {
    let base = calls;
    if (activeList !== "all") {
      const leadIds = new Set(leads.map(l => l.id));
      base = base.filter(c => leadIds.has(c.lead_id));
    }
    if (preset === "today") base = base.filter(c => contactedTodayIds.has(c.lead_id));
    return base;
  }, [calls, leads, activeList, preset, contactedTodayIds]);

  const metrics = useMemo(() => {
    const total       = filteredCalls.length;
    const totalSec    = filteredCalls.reduce((a, c) => a + (c.duracao_segundos || 0), 0);
    const avgSec      = total ? Math.round(totalSec / total) : 0;
    const positivos   = filteredCalls.filter(c => OUTCOME_META[c.outcome]?.category === "positivo").length;
    const convertidos = filteredCalls.filter(c => c.outcome === "convertido").length;
    const visitas     = filteredCalls.filter(c => ["visita","agendado","visita_pendente","visita_agendada","visita_confirmada"].includes(c.outcome)).length;
    const naoAtendeu  = filteredCalls.filter(c => c.outcome === "nao_atendeu").length;
    const taxaPos     = total ? Math.round((positivos / total) * 100) : 0;
    const taxaVisita  = total ? Math.round((visitas / total) * 100) : 0;
    return { total, totalSec, avgSec, positivos, convertidos, visitas, naoAtendeu, taxaPos, taxaVisita };
  }, [filteredCalls]);

  const byHour = useMemo(() => {
    const m: Record<number, number> = {};
    for (let h = 8; h <= 20; h++) m[h] = 0;
    filteredCalls.forEach(c => { const h = new Date(c.started_at).getHours(); if (h >= 8 && h <= 20) m[h] = (m[h] || 0) + 1; });
    return Object.entries(m).map(([h, v]) => ({ hora: `${h}h`, ligacoes: v }));
  }, [filteredCalls]);

  const byWeekday = useMemo(() => {
    const m: Record<number, number> = {};
    for (let i = 0; i < 7; i++) m[i] = 0;
    filteredCalls.forEach(c => { const d = new Date(c.started_at).getDay(); m[d] = (m[d] || 0) + 1; });
    return Object.entries(m).map(([d, v]) => ({ dia: WEEKDAYS[Number(d)], ligacoes: v }));
  }, [filteredCalls]);

  const melhorHora = useMemo(() => byHour.length ? byHour.reduce((a, b) => b.ligacoes > a.ligacoes ? b : a) : null, [byHour]);
  const melhorDia  = useMemo(() => byWeekday.length ? byWeekday.reduce((a, b) => b.ligacoes > a.ligacoes ? b : a) : null, [byWeekday]);

  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    filteredCalls.forEach(c => { const d = new Date(c.started_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); m[d] = (m[d] || 0) + 1; });
    return Object.entries(m).map(([d, v]) => ({ dia: d, ligacoes: v }));
  }, [filteredCalls]);

  const outcomeData = useMemo(() => {
    const m: Record<string, number> = {};
    filteredCalls.forEach(c => { m[c.outcome] = (m[c.outcome] || 0) + 1; });
    return Object.entries(m).map(([k, v]) => ({ key: k, name: OUTCOME_META[k]?.label ?? k, value: v, color: OUTCOME_META[k]?.color ?? "#9ca3af" })).sort((a, b) => b.value - a.value);
  }, [filteredCalls]);

  const categoryData = useMemo(() => {
    const pos = filteredCalls.filter(c => OUTCOME_META[c.outcome]?.category === "positivo").length;
    const ret = filteredCalls.filter(c => OUTCOME_META[c.outcome]?.category === "retorno").length;
    const enc = filteredCalls.filter(c => OUTCOME_META[c.outcome]?.category === "encerrado").length;
    return [
      { name: "Positivo",  value: pos, color: "#10b981" },
      { name: "Retorno",   value: ret, color: "#f59e0b" },
      { name: "Encerrado", value: enc, color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [filteredCalls]);

  const leadsByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    leads.forEach(l => { m[l.status] = (m[l.status] || 0) + 1; });
    return Object.entries(m).map(([k, v]) => ({ key: k, status: STATUS_META[k]?.label ?? k, value: v, color: STATUS_META[k]?.color ?? "#9ca3af" })).sort((a, b) => b.value - a.value);
  }, [leads]);

  const leadsByList = useMemo(() => {
    const m: Record<string, { nome: string; total: number; pendentes: number; convertidos: number }> = {};
    const listMap = Object.fromEntries(lists.map(l => [l.id, l.nome]));
    leads.forEach(l => {
      const nome = listMap[l.list_id] ?? "Sem lista";
      m[nome] ??= { nome, total: 0, pendentes: 0, convertidos: 0 };
      m[nome].total++;
      if (["novo", "retornar", "nao_atendeu"].includes(l.status)) m[nome].pendentes++;
      if (l.status === "convertido") m[nome].convertidos++;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [leads, lists]);

  const isDaily = preset === "today" || preset === "yesterday" ||
    (preset === "custom" && !!customRange.start && (!customRange.end || isSameDay(customRange.start, customRange.end)));

  const { start: periodStart, end: periodEnd } = rangeFromPreset(preset, customRange);
  const checkupPeriodo = useMemo(() => {
    return checkupHistory.filter(h => {
      const d = new Date(h.date + "T12:00:00");
      return (!periodStart || d >= periodStart) && (!periodEnd || d <= periodEnd);
    });
  }, [checkupHistory, periodStart, periodEnd]);

  const notaMediaCheckup = checkupPeriodo.length
    ? Math.round(checkupPeriodo.reduce((a, b) => a + b.nota, 0) / checkupPeriodo.length * 10) / 10
    : null;

  function saveMetaEdit() { setMetas(metaDraft); saveMetas(metaDraft); setEditingMeta(false); }

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8"><Activity className="h-8 w-8 text-primary animate-pulse" /><h1 className="font-display text-3xl font-bold">Dashboard Discador</h1></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Card key={i} className="p-5 h-24 animate-pulse bg-muted/40" />)}</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3"><Activity className="h-8 w-8 text-primary" />Dashboard Discador</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe seu desempenho em tempo real
            {activeList !== "all" && <span className="ml-2 text-foreground font-medium">— Lista: {lists.find(l => l.id === activeList)?.nome}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={activeList} onValueChange={setActiveList}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todas as listas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📋 Todas as listas</SelectItem>
              {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <CalendarPopover preset={preset} setPreset={setPreset} customRange={customRange} setCustomRange={setCustomRange} />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={<Phone />}         label={preset === "today" ? "Já contactados hoje" : "Total de ligações"} value={String(metrics.total)}          color="bg-blue-500/10 text-blue-600"    />
        <KPI icon={<Clock />}         label="Tempo total"          value={formatDuration(metrics.totalSec)}   color="bg-violet-500/10 text-violet-600" />
        <KPI icon={<Clock />}         label="Tempo médio"          value={formatDuration(metrics.avgSec)}     color="bg-indigo-500/10 text-indigo-600" />
        <KPI icon={<Trophy />}        label="Convertidos"          value={String(metrics.convertidos)}        color="bg-emerald-500/10 text-emerald-600"/>
        <KPI icon={<Star />}          label="Positivos"            value={String(metrics.positivos)}          color="bg-green-500/10 text-green-600"   />
        <KPI icon={<CalendarCheck />} label="Visitas / Agendados"  value={String(metrics.visitas)}            color="bg-teal-500/10 text-teal-600"     />
        <KPI icon={<TrendingUp />}    label="Taxa de positivos"    value={`${metrics.taxaPos}%`}              color="bg-cyan-500/10 text-cyan-600"     />
        <KPI icon={<Award />}         label="Nota check-up"        value={notaMediaCheckup ? `${notaMediaCheckup}/10` : "—"} color="bg-purple-500/10 text-purple-600" />
      </div>

      {/* ── Relatório do dia (aparece após 17h no preset hoje) ─────────── */}
      {isDaily && preset === "today" && metrics.total > 0 && new Date().getHours() >= 17 && (
        <Card className="p-5 shadow-card bg-gradient-to-r from-slate-800 to-slate-700 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-5 w-5 text-amber-400" />
            <h3 className="font-display font-semibold">Fechamento do dia</h3>
            <span className="ml-auto text-xs text-white/50">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label: "Ligações",     value: String(metrics.total),              icon: "📞" },
              { label: "Visitas",      value: String(metrics.visitas),            icon: "🏠" },
              { label: "Taxa positiva",value: `${metrics.taxaPos}%`,              icon: "📈" },
              { label: "Tempo total",  value: formatDuration(metrics.totalSec),   icon: "⏱" },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-lg p-2.5 text-center">
                <div className="text-lg mb-0.5">{s.icon}</div>
                <div className="font-display font-bold text-lg tabular-nums">{s.value}</div>
                <div className="text-[10px] text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/60 text-center">
            {metrics.total >= 50 ? "🎉 Meta batida! Ótimo dia!" : metrics.total >= 30 ? "💪 Bom ritmo, continue amanhã!" : "📌 Amanhã é uma nova oportunidade."}
          </p>
        </Card>
      )}

      {/* ── NOVO: Metas editáveis ─────────────────────────────────────────── */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold">Metas {isDaily ? "do dia" : "do período"}</h3>
          </div>
          {!editingMeta ? (
            <button onClick={() => { setMetaDraft(metas); setEditingMeta(true); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="h-3.5 w-3.5" /> Editar metas
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setEditingMeta(false)} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700"><X className="h-3.5 w-3.5" /> Cancelar</button>
              <button onClick={saveMetaEdit} className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:text-emerald-800"><Save className="h-3.5 w-3.5" /> Salvar</button>
            </div>
          )}
        </div>
        {editingMeta ? (
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: "ligacoes", label: "📞 Ligações/dia" },
              { key: "visitas",  label: "🏠 Visitas/dia"  },
              { key: "checkup",  label: "⭐ Nota check-up" },
            ].map(m => (
              <div key={m.key}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{m.label}</label>
                <Input type="number" min="1" value={(metaDraft as any)[m.key]}
                  onChange={e => setMetaDraft(d => ({ ...d, [m.key]: Number(e.target.value) }))} className="h-9 text-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <MetaBar label="Ligações" current={metrics.total} meta={metas.ligacoes} color="bg-blue-500" />
            <MetaBar label="Visitas agendadas" current={metrics.visitas} meta={metas.visitas} color="bg-emerald-500" />
            {notaMediaCheckup !== null && <MetaBar label="Nota check-up" current={notaMediaCheckup} meta={metas.checkup} color="bg-purple-500" />}
          </div>
        )}
      </Card>

      {/* ── NOVO: Destaques do período ────────────────────────────────────── */}
      {metrics.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {melhorHora && melhorHora.ligacoes > 0 && (
            <Card className="p-5 shadow-card bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
              <div className="flex items-center gap-2 mb-2"><Zap className="h-4 w-4 text-amber-600" /><span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Melhor horário</span></div>
              <div className="text-3xl font-display font-bold text-amber-800">{melhorHora.hora}</div>
              <div className="text-sm text-amber-700 mt-0.5">{melhorHora.ligacoes} ligações neste horário</div>
            </Card>
          )}
          {melhorDia && melhorDia.ligacoes > 0 && (
            <Card className="p-5 shadow-card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <div className="flex items-center gap-2 mb-2"><Flame className="h-4 w-4 text-blue-600" /><span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Melhor dia</span></div>
              <div className="text-3xl font-display font-bold text-blue-800">{melhorDia.dia}</div>
              <div className="text-sm text-blue-700 mt-0.5">{melhorDia.ligacoes} ligações neste dia</div>
            </Card>
          )}
          {metrics.taxaVisita > 0 && (
            <Card className="p-5 shadow-card bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
              <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Taxa visita</span></div>
              <div className="text-3xl font-display font-bold text-emerald-800">{metrics.taxaVisita}%</div>
              <div className="text-sm text-emerald-700 mt-0.5">ligações → visita (pendente+agendada)</div>
            </Card>
          )}
        </div>
      )}

      {/* ── Funil por etapa ────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-14 gap-2">
        {FUNNEL_STAGES.map(stage => {
          const statusMap: Record<string,number> = {};
          leads.forEach(l => { statusMap[l.status] = (statusMap[l.status] || 0) + 1; });
          const count = stage.statuses.reduce((acc, s) => acc + (statusMap[s] ?? 0), 0);
          return (
            <div key={stage.key} className="rounded-xl p-3 border text-center"
              style={{ backgroundColor: stage.light, borderColor: stage.color + "30" }}>
              <div className="text-lg font-bold" style={{ color: stage.color }}>{count}</div>
              <div className="text-[10px] font-bold" style={{ color: stage.color }}>{stage.key}</div>
              <div className="text-[9px] text-muted-foreground truncate">{stage.label}</div>
            </div>
          );
        })}
      </div>

      {/* Gráficos linha 1 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-1">Resultado geral</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribuição por categoria</p>
          {categoryData.length === 0 ? <Empty /> : (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                      {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 13 }} /><Tooltip formatter={(v: any) => [`${v} ligações`]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-3 mt-2 flex-wrap">
                {categoryData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">({Math.round((d.value / metrics.total) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-1">Detalhamento por resultado</h3>
          <p className="text-xs text-muted-foreground mb-4">Todos os outcomes do período</p>
          {outcomeData.length === 0 ? <Empty /> : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={90} paddingAngle={2}>
                    {outcomeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v} ligações`]} /><Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Gráficos linha 2 */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-1">Ligações por dia</h3>
          <p className="text-xs text-muted-foreground mb-4">Volume diário no período</p>
          {byDay.length === 0 ? <Empty /> : (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={byDay} barSize={24}>
                  <XAxis dataKey="dia" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="ligacoes" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-1">Ligações por hora</h3>
          <p className="text-xs text-muted-foreground mb-4">Melhor horário destacado em verde</p>
          {byHour.every(h => h.ligacoes === 0) ? <Empty /> : (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={byHour} barSize={18}>
                  <XAxis dataKey="hora" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="ligacoes" radius={[4, 4, 0, 0]}>
                    {byHour.map((h, i) => (
                      <Cell key={i} fill={h.ligacoes === Math.max(...byHour.map(x => x.ligacoes)) && h.ligacoes > 0 ? "#10b981" : "hsl(var(--primary)/0.6)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ── Comparativo semana passada vs esta semana ───────────────────── */}
      {(() => {
        const thisWeekStart = localMidnight(addDays(new Date(), -6));
        const thisWeekCalls = calls.filter(c => new Date(c.started_at) >= thisWeekStart);
        const lastWeekMetrics = {
          total:   lastWeekCalls.length,
          visitas: lastWeekCalls.filter(c => c.outcome === "visita" || c.outcome === "agendado").length,
          taxaPos: lastWeekCalls.length ? Math.round((lastWeekCalls.filter(c => ["proposta","visita","agendado","convertido","respondeu","mensagem_zap"].includes(c.outcome)).length / lastWeekCalls.length) * 100) : 0,
        };
        const thisWeekMetrics = {
          total:   thisWeekCalls.length,
          visitas: thisWeekCalls.filter(c => c.outcome === "visita" || c.outcome === "agendado").length,
          taxaPos: thisWeekCalls.length ? Math.round((thisWeekCalls.filter(c => ["proposta","visita","agendado","convertido","respondeu","mensagem_zap"].includes(c.outcome)).length / thisWeekCalls.length) * 100) : 0,
        };
        if (thisWeekMetrics.total === 0 && lastWeekMetrics.total === 0) return null;
        function Diff({ curr, prev, suffix = "" }: { curr: number; prev: number; suffix?: string }) {
          const diff = curr - prev;
          if (diff === 0) return <span className="text-[10px] text-muted-foreground">= igual</span>;
          return <span className={`text-[10px] font-semibold ${diff > 0 ? "text-emerald-600" : "text-rose-600"}`}>{diff > 0 ? "▲" : "▼"} {Math.abs(diff)}{suffix}</span>;
        }
        return (
          <Card className="p-6 shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h3 className="font-display font-semibold">Esta semana vs semana passada</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Ligações",    curr: thisWeekMetrics.total,   prev: lastWeekMetrics.total,   suffix: "" },
                { label: "Visitas",     curr: thisWeekMetrics.visitas,  prev: lastWeekMetrics.visitas,  suffix: "" },
                { label: "Taxa positivos", curr: thisWeekMetrics.taxaPos, prev: lastWeekMetrics.taxaPos, suffix: "%" },
              ].map(item => (
                <div key={item.label} className="text-center p-3 rounded-xl bg-muted/40">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
                  <p className="text-2xl font-display font-bold">{item.curr}{item.suffix}</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{item.prev}{item.suffix} semana ant.</span>
                    <Diff curr={item.curr} prev={item.prev} suffix={item.suffix} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* ── NOVO: Evolução do Check-up ────────────────────────────────────── */}
      {checkupHistory.length > 0 && (
        <Card className="p-6 shadow-card">
          <div className="flex items-center gap-2 mb-1"><Award className="h-5 w-5 text-purple-600" /><h3 className="font-display font-semibold">Evolução do Check-up ACELERA</h3></div>
          <p className="text-xs text-muted-foreground mb-4">
            {checkupHistory.length} avaliações
            {notaMediaCheckup !== null && <span className="ml-2 font-semibold text-purple-600">· Média: {notaMediaCheckup}/10</span>}
          </p>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={checkupHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} />
                <YAxis domain={[0, 10]} fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip labelFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })} formatter={(v: any) => [`${v}/10`, "Nota"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey={() => metas.checkup} stroke="#e9d5ff" strokeDasharray="4 4" dot={false} name="Meta" />
                <Line type="monotone" dataKey="nota" stroke="#8b5cf6" strokeWidth={2.5} dot={{ fill: "#8b5cf6", r: 4 }} activeDot={{ r: 6 }} name="Nota" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Status dos leads */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold">Leads por status</h3>
          <span className="ml-auto text-sm text-muted-foreground">{leads.length} leads{activeList !== "all" ? " nessa lista" : " no total"}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {leadsByStatus.map(s => (
            <div key={s.key} className="rounded-xl p-3 border flex flex-col gap-1" style={{ borderColor: s.color + "40", background: s.color + "10" }}>
              <div className="text-2xl font-display font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs font-medium text-foreground">{s.status}</div>
              <div className="text-xs text-muted-foreground">{leads.length ? Math.round((s.value / leads.length) * 100) : 0}% do total</div>
            </div>
          ))}
          {leadsByStatus.length === 0 && <div className="col-span-5"><Empty /></div>}
        </div>
      </Card>

      {/* Leads por lista */}
      {activeList === "all" && leadsByList.length > 0 && (
        <Card className="p-6 shadow-card">
          <div className="flex items-center gap-2 mb-4"><Flame className="h-5 w-5 text-primary" /><h3 className="font-display font-semibold">Leads por lista</h3></div>
          <div className="space-y-3">
            {leadsByList.map(l => {
              const pct = l.total ? Math.round((l.pendentes / l.total) * 100) : 0;
              return (
                <div key={l.nome}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{l.nome}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-amber-600 font-medium">{l.pendentes} pendentes</span>
                      <span className="text-emerald-600 font-medium">{l.convertidos} convertidos</span>
                      <span>{l.total} total</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${100 - pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{100 - pct}% trabalhados</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tabela detalhada */}
      <Card className="p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4"><Activity className="h-5 w-5 text-primary" /><h3 className="font-display font-semibold">Detalhamento completo</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-xs uppercase text-muted-foreground font-medium">Resultado</th>
                <th className="text-left py-2 pr-4 text-xs uppercase text-muted-foreground font-medium">Categoria</th>
                <th className="text-right py-2 pr-4 text-xs uppercase text-muted-foreground font-medium">Qtd</th>
                <th className="text-right py-2 text-xs uppercase text-muted-foreground font-medium">% do total</th>
              </tr>
            </thead>
            <tbody>
              {outcomeData.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sem ligações no período</td></tr>
              ) : outcomeData.map((d, i) => {
                const meta = OUTCOME_META[d.key];
                const pct  = metrics.total ? Math.round((d.value / metrics.total) * 100) : 0;
                return (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="secondary" className={
                        meta?.category === "positivo" ? "bg-emerald-500/10 text-emerald-700" :
                        meta?.category === "retorno"  ? "bg-amber-500/10 text-amber-700" :
                        "bg-rose-500/10 text-rose-700"
                      }>
                        {meta?.category === "positivo" ? "Positivo" : meta?.category === "retorno" ? "Retorno" : "Encerrado"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-bold tabular-nums">{d.value}</td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                        </div>
                        <span className="text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4 ${color}`}>{icon}</div>
      </div>
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function Empty() {
  return <div className="py-12 text-center text-sm text-muted-foreground">Sem dados no período selecionado.</div>;
}