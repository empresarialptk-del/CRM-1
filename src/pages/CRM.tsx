import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  STATUS_COLOR, STATUS_LABELS, FUNNEL_STAGES, FUNNEL_STAGE, LOST_STATUSES,
  OUTCOMES_BY_STAGE, STATUS_FROM_OUTCOME, formatPhone,
} from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import {
  Search, PhoneCall, Pencil, GripVertical, Phone,
  MessageSquare, RefreshCw, Clock, CalendarClock, ChevronRight,
  Trophy, AlertTriangle, X,
} from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string; nome: string; telefone: string; status: string;
  observacoes: string | null; origem: string | null; list_id: string | null;
  proximo_followup?: string | null; last_call_at?: string | null;
  call_count?: number; positive_count?: number;
};
type LeadList = { id: string; nome: string };
type KanbanTab = "captacao" | "conversao";
type KanbanCol = {
  id: string; label: string; emoji: string; color: string; light: string;
  statuses: string[]; stageKey: string; urgente?: boolean;
};

const CAPTACAO_COLS: KanbanCol[] = [
  { id:"A_novo",       label:"Sem contato",   emoji:"📵", color:"#94a3b8", light:"#f1f5f9", statuses:["novo"],                                                    stageKey:"A" },
  { id:"A_nao",        label:"Não atendeu",   emoji:"🔇", color:"#f59e0b", light:"#fffbeb", statuses:["nao_atendeu"],                                              stageKey:"A" },
  { id:"B_atendeu",    label:"Atendeu",       emoji:"📞", color:"#f97316", light:"#fff7ed", statuses:["retornar","respondeu","mensagem_zap"],                       stageKey:"B" },
  { id:"C_interesse",  label:"Interesse",     emoji:"💬", color:"#0ea5e9", light:"#f0f9ff", statuses:["interesse"],                                                stageKey:"C" },
  { id:"D_visitar",    label:"Quer visitar",  emoji:"🎯", color:"#f59e0b", light:"#fffbeb", statuses:["visita_pendente","visita"],                                  stageKey:"D" },
  { id:"D_aguardando", label:"Aguard. data",  emoji:"⏳", color:"#d97706", light:"#fffbeb", statuses:["aguardando_visita"],                                        stageKey:"D" },
  { id:"E_agendada",   label:"Agendada",      emoji:"📅", color:"#8b5cf6", light:"#f5f3ff", statuses:["visita_agendada","visita_confirmada","agendado"],             stageKey:"E" },
  { id:"E_remarcada",  label:"Remarcada",     emoji:"🔄", color:"#a78bfa", light:"#f5f3ff", statuses:["visita_remarcada"],                                         stageKey:"E" },
  { id:"E_problema",   label:"Não veio",      emoji:"⚠️", color:"#f43f5e", light:"#fff1f2", statuses:["visita_faltou","visita_cancelada"],                          stageKey:"E", urgente:true },
];

const CONVERSAO_COLS: KanbanCol[] = [
  { id:"F_visitou",    label:"Visitou",       emoji:"🏠", color:"#10b981", light:"#ecfdf5", statuses:["visitou","proposta","convertido"],                         stageKey:"F" },
  { id:"F_aguardando", label:"Aguard. docs",  emoji:"⏳", color:"#059669", light:"#f0fdf4", statuses:["aguardando_documento"],                                    stageKey:"F" },
  { id:"G_docs",       label:"Enviando docs", emoji:"📄", color:"#6d28d9", light:"#f5f3ff", statuses:["envio_documentos","envio_doc","proposta_aceita"],           stageKey:"G" },
  { id:"G_analise",    label:"CPF análise",   emoji:"🔍", color:"#5b21b6", light:"#f5f3ff", statuses:["cpf_em_analise"],                                         stageKey:"G" },
  { id:"H_cpf",        label:"CPF analisado", emoji:"🔍", color:"#2563eb", light:"#eff6ff", statuses:["cpf_analisado","analise_credito"],                         stageKey:"H" },
  { id:"H_aprovacao",  label:"Aguard. aprov.",emoji:"⏳", color:"#1d4ed8", light:"#eff6ff", statuses:["aguardando_aprovacao"],                                    stageKey:"H" },
  { id:"I_credito",    label:"Crédito aprov.", emoji:"✅", color:"#0891b2", light:"#ecfeff", statuses:["credito_aprovado","aprovacao_credito"],                   stageKey:"I" },
  { id:"I_contrato",   label:"Contrato prep.", emoji:"⏳", color:"#0e7490", light:"#ecfeff", statuses:["contrato_preparado"],                                     stageKey:"I" },
  { id:"J_contrato",   label:"Contrato",      emoji:"📝", color:"#4338ca", light:"#eef2ff", statuses:["contrato_gerado"],                                         stageKey:"J" },
  { id:"K_assinado",   label:"Assinado",      emoji:"✍️", color:"#1d4ed8", light:"#eff6ff", statuses:["contrato_assinado","chaves_entregues"],                    stageKey:"K" },
  { id:"L_boleto",     label:"Boleto pago",   emoji:"💰", color:"#0f766e", light:"#f0fdfa", statuses:["boleto_pago"],                                             stageKey:"L" },
  { id:"M_repasse",    label:"Repasse",       emoji:"🏦", color:"#0369a1", light:"#f0f9ff", statuses:["repasse"],                                                 stageKey:"M" },
  { id:"N_registro",   label:"Registro",      emoji:"🏆", color:"#059669", light:"#ecfdf5", statuses:["registro"],                                                stageKey:"N" },
];

// LOST_LIST → usar LOST_STATUSES importado do crm.ts
const LOST_LIST = LOST_STATUSES;

function formatLastCall(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 60)   return `${diff}min atrás`;
  if (diff < 1440) return `${Math.floor(diff/60)}h atrás`;
  return `${Math.floor(diff/1440)}d atrás`;
}

export default function CRM() {
  const navigate = useNavigate();
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [lists, setLists]             = useState<LeadList[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [listFilter, setListFilter]   = useState("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab]     = useState<KanbanTab>("captacao");
  const [dragTarget, setDragTarget]   = useState<string | null>(null);
  const dragLeadId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const fetchAllLeads = async () => {
      let all: any[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase.from("leads")
          .select("id,nome,telefone,status,observacoes,origem,list_id,proximo_followup")
          .order("created_at", { ascending: false })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < size) break;
        from += size;
      }
      return all;
    };

    const [leadsData, { data: listsData }, { data: callsData }] = await Promise.all([
      fetchAllLeads(),
      supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false }),
      supabase.from("calls").select("lead_id,started_at,outcome").order("started_at", { ascending: false }),
    ]);
    const lastCallMap = new Map<string, string>();
    const callCountMap = new Map<string, number>();
    const positiveSet = new Set(["interesse","visita_pendente","visita_agendada","visita_confirmada","visita_remarcada","visitou","proposta","envio_documentos","cpf_analisado","credito_aprovado","contrato_gerado","contrato_assinado","boleto_pago","repasse","registro","respondeu","mensagem_zap"]);
    const positiveCountMap = new Map<string, number>();
    for (const c of (callsData ?? []) as { lead_id: string; started_at: string; outcome?: string }[]) {
      if (!lastCallMap.has(c.lead_id)) lastCallMap.set(c.lead_id, c.started_at);
      callCountMap.set(c.lead_id, (callCountMap.get(c.lead_id) ?? 0) + 1);
      if (c.outcome && positiveSet.has(c.outcome))
        positiveCountMap.set(c.lead_id, (positiveCountMap.get(c.lead_id) ?? 0) + 1);
    }
    const enriched: Lead[] = ((leadsData ?? []) as Lead[]).map(l => ({
      ...l,
      last_call_at:   lastCallMap.get(l.id) ?? null,
      call_count:     callCountMap.get(l.id) ?? 0,
      positive_count: positiveCountMap.get(l.id) ?? 0,
    }));
    setLeads(enriched);
    setLists((listsData ?? []) as LeadList[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(l => l.nome.toLowerCase().includes(q) || l.telefone.includes(q));
    }
    if (listFilter !== "all")
      r = listFilter === "none" ? r.filter(l => !l.list_id) : r.filter(l => l.list_id === listFilter);
    return r;
  }, [leads, search, listFilter]);

  const leadsByCol = useMemo(() => {
    const allCols = [...CAPTACAO_COLS, ...CONVERSAO_COLS];
    const map: Record<string, Lead[]> = { perdido: [] };
    for (const col of allCols) map[col.id] = [];
    for (const lead of filtered) {
      if (LOST_LIST.includes(lead.status)) { map["perdido"].push(lead); continue; }
      const col = allCols.find(c => c.statuses.includes(lead.status));
      if (col) map[col.id].push(lead);
      else map["A_novo"].push(lead);
    }
    return map;
  }, [filtered]);

  function onDragStart(e: React.DragEvent, id: string) {
    dragLeadId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropCol(colId: string) {
    setDragTarget(null);
    const id = dragLeadId.current;
    if (!id) return;
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    const allCols = [...CAPTACAO_COLS, ...CONVERSAO_COLS];
    let newStatus: string;
    if (colId === "perdido") { newStatus = "perdido"; }
    else {
      const col = allCols.find(c => c.id === colId);
      if (!col) return;
      newStatus = col.statuses[0];
    }
    if (lead.status === newStatus) return;
    await advanceLead(lead, newStatus);
    dragLeadId.current = null;
  }

  async function advanceLead(lead: Lead, novoStatus: string) {
    const prev = lead.status;
    setLeads(p => p.map(l => l.id === lead.id ? { ...l, status: novoStatus } : l));
    const { error } = await supabase.from("leads").update({ status: novoStatus }).eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, status: prev } : l));
    } else {
      toast.success(`✅ ${lead.nome.split(" ")[0]} → ${STATUS_LABELS[novoStatus] ?? novoStatus}`);
    }
  }

  async function saveLead(id: string, patch: Partial<Lead>) {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    setEditingLead(null);
    toast.success("Lead atualizado");
  }

  const activeCols     = activeTab === "captacao" ? CAPTACAO_COLS : CONVERSAO_COLS;
  const captacaoCount  = CAPTACAO_COLS.reduce((a, c) => a + (leadsByCol[c.id]?.length ?? 0), 0);
  const conversaoCount = CONVERSAO_COLS.reduce((a, c) => a + (leadsByCol[c.id]?.length ?? 0), 0);
  const urgenteCount   = (leadsByCol["E_problema"]?.length ?? 0);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl">CRM Kanban</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              Qualquer mudança é registrada no histórico automaticamente
              {search && <span className="ml-2 text-primary font-semibold">· {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para "{search}"</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar lead por nome ou telefone…"
                className="pl-8 h-9 w-72 text-sm"/>
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5"/>
                </button>
              )}
            </div>
            <Select value={listFilter} onValueChange={setListFilter}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as listas</SelectItem>
                <SelectItem value="none">Sem lista</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}/>
              Atualizar
            </Button>
          </div>
        </div>

        <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
          {([
            { key:"captacao"  as KanbanTab, label:"📞 Captação",  sub:"A → E", count:captacaoCount, alert:urgenteCount > 0 },
            { key:"conversao" as KanbanTab, label:"🏠 Conversão", sub:"F → N", count:conversaoCount, alert:false },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {tab.label}
              <span className="text-[10px] text-muted-foreground font-normal">{tab.sub}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
              }`}>{tab.count}</span>
              {tab.alert && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                  ⚠ {urgenteCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-4">
        <div className="flex gap-3 h-full" style={{ minWidth: `${activeCols.length * 240 + 220}px` }}>
          {activeCols.map(col => {
            const colLeads = leadsByCol[col.id] ?? [];
            const isDragOver = dragTarget === col.id;
            return (
              <div key={col.id}
                className={`flex flex-col rounded-2xl border-2 transition-all shrink-0 w-[236px] ${
                  isDragOver ? "border-primary/60 bg-primary/5 scale-[1.01]" :
                  col.urgente ? "border-rose-200 bg-rose-50/30" : "border-transparent bg-muted/40"
                }`}
                onDragOver={e => { e.preventDefault(); setDragTarget(col.id); }}
                onDragLeave={() => setDragTarget(prev => prev === col.id ? null : prev)}
                onDrop={e => { e.preventDefault(); onDropCol(col.id); }}>
                <div className="px-3 pt-3 pb-2 shrink-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base leading-none">{col.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: col.light, color: col.color }}>{col.stageKey}</span>
                        <span className="text-xs font-semibold text-foreground truncate">{col.label}</span>
                      </div>
                    </div>
                    <span className="text-base font-black tabular-nums shrink-0"
                      style={{ color: colLeads.length > 0 ? col.color : "#94a3b8" }}>{colLeads.length}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-1 rounded-full transition-all duration-500"
                      style={{ background: col.urgente ? "#f43f5e" : col.color, width: `${Math.min(100, colLeads.length * 8)}%` }}/>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                  {colLeads.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground/40 border-2 border-dashed rounded-xl mx-1">
                      Arraste leads aqui
                    </div>
                  ) : colLeads.map(lead => (
                    <KanbanCard key={lead.id} lead={lead} col={col}
                      onDragStart={onDragStart} onAdvance={advanceLead}
                      onCall={() => navigate(`/dialer?lead=${lead.id}`)}
                      onEdit={() => setEditingLead(lead)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex flex-col rounded-2xl border-2 border-dashed border-red-200 bg-red-50/30 shrink-0 w-[210px]"
            onDragOver={e => { e.preventDefault(); setDragTarget("perdido"); }}
            onDragLeave={() => setDragTarget(prev => prev === "perdido" ? null : prev)}
            onDrop={e => {
              e.preventDefault(); setDragTarget(null);
              const id = dragLeadId.current; if (!id) return;
              const lead = leads.find(l => l.id === id);
              if (lead) advanceLead(lead, "perdido");
              dragLeadId.current = null;
            }}>
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">❌</span>
                <div className="flex-1">
                  <div className="text-xs font-bold text-red-600">Perdidos</div>
                  <div className="text-[10px] text-muted-foreground">Fora do funil</div>
                </div>
                <span className="text-base font-black tabular-nums text-red-500">{leadsByCol["perdido"]?.length ?? 0}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5 min-h-0">
              {(leadsByCol["perdido"] ?? []).map(lead => (
                <div key={lead.id} draggable onDragStart={e => onDragStart(e, lead.id)}
                  className="bg-white border border-red-100 rounded-xl p-2.5 cursor-grab active:cursor-grabbing group">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{lead.nome}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{STATUS_LABELS[lead.status] ?? lead.status}</p>
                    </div>
                    <button onClick={() => setEditingLead(lead)}
                      className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-muted transition-colors shrink-0 opacity-0 group-hover:opacity-100">
                      <Pencil className="h-3 w-3 text-muted-foreground"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editingLead && (
        <EditDialog lead={editingLead} lists={lists} onSave={saveLead} onClose={() => setEditingLead(null)}/>
      )}
    </div>
  );
}

// ── Helpers WhatsApp ──────────────────────────────────────────────────────────
function cleanFirstName(nome: string): string {
  const parts = (nome ?? "").trim().split(/\s+/);
  for (const p of parts) {
    const c = p.replace(/^[^a-zA-ZÀ-ÿ]+/, "").trim();
    if (c.length >= 2) return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  }
  return parts[0] ?? nome;
}

function toWA(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

const MAPS_URL = "https://maps.app.goo.gl/C3Vjs1sXz6S3dAFt8";

function getMsgs(nome: string, stageKey: string): { label: string; text: string }[] {
  const n = cleanFirstName(nome);
  const loc = `Localizacao da loja MRV:\n${MAPS_URL}`;

  const msgsMap: Record<string, { label: string; text: string }[]> = {
    A: [
      { label: "📞 Primeiro contato",    text: `Oi ${n}! Sou o Pedro da MRV, tentei te ligar mas não consegui falar. Você tem interesse em conhecer nossos imóveis?` },
      { label: "🔄 Resistente",          text: `Oi ${n}! Pedro da MRV. Sei que é difícil atender ligação desconhecida. Mas tenho uma oportunidade incrível de imóvel pra te mostrar. Vale 2 minutinhos?` },
    ],
    B: [
      { label: "💬 Retomar contato",     text: `Oi ${n}! Pedro da MRV aqui. Conversamos rapidinho — queria saber se ainda tem interesse em conhecer nossos imóveis.` },
      { label: "🔄 Resistente",          text: `Oi ${n}! Pedro da MRV. Sei que você está ocupado, mas não queria deixar passar essa oportunidade sem te mostrar. É rapidinho, prometo!` },
    ],
    C: [
      { label: "📅 Marcar visita",       text: `Oi ${n}! Pedro da MRV aqui. Você demonstrou interesse nos nossos imóveis — quando conseguimos marcar uma visita rápida à loja?` },
      { label: "🔄 Resistente",          text: `Oi ${n}! Pedro da MRV. Entendo que está avaliando — mas uma visita de 15 minutos pode mudar tudo. Sem compromisso! Quando fica bom?` },
      { label: "📍 Visita + local",      text: `Oi ${n}! Pedro da MRV. Vamos marcar uma visita? Fica fácil de chegar:\n${loc}` },
    ],
    D: [
      { label: "📅 Confirmar data",      text: `Oi ${n}! Pedro da MRV aqui. Você queria visitar a loja — quando fica bom pra você? Tenho horários essa semana!` },
      { label: "📍 Localização",         text: `Oi ${n}! Segue a localização da loja MRV pra facilitar:\n${loc}` },
      { label: "📅 Data + local",        text: `Oi ${n}! Pedro da MRV. Vamos confirmar sua visita? Quando fica bom?\n\n${loc}` },
      { label: "🔄 Resistente",          text: `Oi ${n}! Pedro da MRV. Sei que está difícil encaixar na agenda, mas vale muito a pena conhecer pessoalmente. 15 minutinhos só! Quando consegue?` },
    ],
    E: [
      { label: "✅ Confirmar visita",    text: `Oi ${n}! Pedro da MRV aqui, passando para confirmar sua visita à loja MRV. Confirma presença?` },
      { label: "🔔 Lembrete",           text: `Oi ${n}! Pedro da MRV. Só um lembrete da sua visita à loja MRV amanhã. Estamos te esperando!` },
      { label: "📍 Como chegar",        text: `Oi ${n}! Segue a localização da loja MRV para facilitar sua chegada:\n${loc}` },
      { label: "✅ Confirmar + local",  text: `Oi ${n}! Passando para confirmar sua visita à loja MRV. Confirma presença?\n\n${loc}` },
    ],
    F: [
      { label: "📋 Solicitar docs",      text: `Oi ${n}! Pedro da MRV aqui. Que ótimo que você visitou! Para darmos continuidade, precisamos de alguns documentos. Posso te passar a lista?` },
      { label: "💬 Dúvidas pós-visita",  text: `Oi ${n}! Pedro da MRV. Ficou com alguma dúvida sobre o imóvel que visitou? Estou à disposição!` },
      { label: "🔄 Resistente",          text: `Oi ${n}! Pedro da MRV. Sei que pós-visita tem muito a pensar, mas não quero que você perca essa oportunidade. Posso te ajudar?` },
    ],
    G: [
      { label: "📄 Cobrar documentos",   text: `Oi ${n}! Pedro da MRV aqui. Passando para saber se conseguiu reunir os documentos necessários. Posso te ajudar com alguma dúvida?` },
      { label: "🔄 Urgência",            text: `Oi ${n}! Pedro da MRV. Os documentos estão pendentes e não quero que você perca a oportunidade. Me avisa o que está faltando!` },
    ],
    H: [
      { label: "🔍 Status CPF",          text: `Oi ${n}! Pedro da MRV aqui. Seu CPF está em análise — assim que tiver retorno te aviso imediatamente!` },
      { label: "✅ CPF aprovado",        text: `Oi ${n}! Ótima notícia! Seu CPF foi aprovado! Podemos dar continuidade ao processo. Quando podemos conversar?` },
    ],
    I: [
      { label: "✅ Crédito aprovado",    text: `Oi ${n}! Pedro da MRV com ótima notícia — seu crédito foi aprovado! Vamos para a próxima etapa?` },
      { label: "📝 Próximos passos",     text: `Oi ${n}! Pedro da MRV aqui. Crédito aprovado! Agora vamos gerar o contrato. Quando fica bom para assinarmos?` },
    ],
    J: [
      { label: "📝 Assinar contrato",    text: `Oi ${n}! Pedro da MRV aqui. Seu contrato está pronto para assinatura! Quando podemos resolver isso?` },
      { label: "🔄 Urgência",            text: `Oi ${n}! Pedro da MRV. O contrato está aguardando sua assinatura — não deixa para depois! Me avisa quando consegue?` },
    ],
    K: [
      { label: "💰 Boleto gerado",       text: `Oi ${n}! Pedro da MRV aqui. Contrato assinado! Seu boleto foi gerado. Qualquer dúvida estou à disposição!` },
    ],
    L: [
      { label: "🏦 Repasse",             text: `Oi ${n}! Pedro da MRV aqui. Boleto pago! Estamos encaminhando o repasse. Em breve terei novidades!` },
    ],
    M: [
      { label: "🏦 Status repasse",      text: `Oi ${n}! Pedro da MRV aqui. Seu repasse está em andamento — assim que tiver novidade te aviso!` },
      { label: "📋 Próximos passos",     text: `Oi ${n}! Pedro da MRV. O repasse está sendo processado, em breve você terá o registro do imóvel. Alguma dúvida?` },
    ],
    N: [
      { label: "🏆 Parabéns!",           text: `Oi ${n}! Pedro da MRV aqui. Parabéns! Seu imóvel está registrado! Foi um prazer fazer parte dessa conquista!` },
      { label: "⭐ Indicação",           text: `Oi ${n}! Pedro da MRV. Seu imóvel está registrado! Se conhecer alguém buscando o primeiro imóvel, pode me indicar — ficarei feliz em ajudar!` },
    ],
  };

  return msgsMap[stageKey] ?? [
    { label: "💬 Entrar em contato",     text: `Oi ${n}! Pedro da MRV aqui. Passando para saber como está o andamento do seu processo.` },
  ];
}

function WaDropdown({ lead, stageKey }: { lead: { nome: string; telefone: string }; stageKey: string }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos]   = React.useState({ top: 0, left: 0 });
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const wa   = toWA(lead.telefone);
  const msgs = getMsgs(lead.nome, stageKey);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top:  r.top - 8,   // acima do botão
        left: Math.max(8, r.left - 280 + r.width), // à esquerda
      });
    }
    setOpen(v => !v);
  }

  function abrirWeb(text: string) { window.open(`https://web.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(text)}`, "_blank"); setOpen(false); }
  function abrirApp(text: string) { window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank"); setOpen(false); }

  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        className="h-7 w-7 flex items-center justify-center rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors shrink-0"
        title="WhatsApp">
        <MessageSquare className="h-3 w-3 text-green-600"/>
      </button>
      {open && (
        <>
          {/* Overlay para fechar ao clicar fora */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)}/>
          <div className="fixed z-[9999] bg-popover border rounded-xl shadow-2xl overflow-hidden"
            style={{ width: "288px", top: pos.top, left: pos.left, transform: "translateY(-100%)" }}>
            <div className="px-3 py-2 border-b bg-green-50 flex items-center justify-between">
              <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">WhatsApp</p>
              <div className="flex gap-1 text-[9px] font-semibold">
                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">💻 Web</span>
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📱 App</span>
              </div>
            </div>
            {msgs.map(m => (
              <div key={m.label} className="flex items-center border-b last:border-0 hover:bg-muted/30 transition-colors">
                <span className="flex-1 px-3 py-2.5 text-xs font-medium leading-snug">{m.label}</span>
                <div className="flex border-l shrink-0">
                  <button onClick={() => abrirWeb(m.text)} className="px-2.5 py-2 text-[10px] font-bold text-blue-600 hover:bg-blue-50 transition-colors border-r">💻</button>
                  <button onClick={() => abrirApp(m.text)} className="px-2.5 py-2 text-[10px] font-bold text-green-600 hover:bg-green-50 transition-colors">📱</button>
                </div>
              </div>
            ))}
            <button onClick={() => setOpen(false)} className="w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors">Fechar</button>
          </div>
        </>
      )}
    </>
  );
}

function KanbanCard({ lead, col, onDragStart, onAdvance, onCall, onEdit }: {
  lead: Lead; col: KanbanCol;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAdvance: (lead: Lead, novoStatus: string) => void;
  onCall: () => void; onEdit: () => void;
}) {
  const isRegistro   = col.stageKey === "N";
  const hasFollowup  = !!lead.proximo_followup;
  const followupPast = hasFollowup && new Date(lead.proximo_followup!) < new Date();
  const score = calcLeadScore({ callCount: lead.call_count, positiveCount: lead.positive_count, status: lead.status, hasFollowup });
  const sl    = scoreLabel(score);
  const outcomes  = OUTCOMES_BY_STAGE[col.stageKey as keyof typeof OUTCOMES_BY_STAGE] ?? [];
  const positives = outcomes.filter(o => o.type === "positive");
  const neutrals  = outcomes.filter(o => o.type === "neutral" && o.outcome !== "nao_atendeu");
  const negatives = outcomes.filter(o => o.type === "negative");

  return (
    <div draggable onDragStart={e => onDragStart(e, lead.id)}
      className={`group bg-white dark:bg-card rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
        col.urgente ? "border-l-4 border-l-rose-500 border-rose-200" : "border-black/8"
      }`}>
      <div className="h-1 rounded-t-xl" style={{ background: col.urgente ? "#f43f5e" : col.color }}/>
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-1.5">
          <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 mt-0.5 shrink-0 transition-colors"/>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{lead.nome}</p>
            {lead.origem && <p className="text-[10px] text-muted-foreground truncate">{lead.origem}</p>}
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {(lead.call_count ?? 0) > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{lead.call_count}x</span>}
            {score > 0 && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sl.bg} ${sl.color}`}>{sl.emoji}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_COLOR[lead.status] ?? "bg-muted text-muted-foreground"}`}>
            {STATUS_LABELS[lead.status] ?? lead.status}
          </span>
          {col.urgente && <span className="text-[9px] font-bold text-rose-600 flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5"/> Ação urgente</span>}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3 shrink-0"/>
          <span className="tabular-nums">{formatPhone(lead.telefone)}</span>
        </div>

        {lead.last_call_at && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground/60"/>
            <span className="text-[11px] text-muted-foreground">{formatLastCall(lead.last_call_at)}</span>
          </div>
        )}

        {hasFollowup && (
          <div className={`flex items-center gap-1.5 ${followupPast ? "text-rose-600" : "text-amber-600"}`}>
            <CalendarClock className="h-3 w-3 shrink-0"/>
            <span className="text-[11px] font-medium">
              {followupPast ? "⚠ " : ""}
              {new Date(lead.proximo_followup!).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" })}
              {" às "}
              {new Date(lead.proximo_followup!).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
            </span>
          </div>
        )}

        {lead.observacoes && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ChevronRight className="h-3 w-3 shrink-0 mt-0.5"/>
            <span className="line-clamp-2 leading-tight">{lead.observacoes}</span>
          </div>
        )}

        <div className="space-y-1 pt-2 border-t">
          {isRegistro && (
            <div className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
              <Trophy className="h-3.5 w-3.5"/> Venda concluída!
            </div>
          )}
          {!isRegistro && (
            <>
              {positives.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {positives.map(o => { const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome; return (
                    <button key={o.outcome} onClick={() => onAdvance(lead, ns)}
                      className="flex-1 min-w-0 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/20 transition-colors text-center truncate px-1">
                      ✅ {o.label}
                    </button>
                  ); })}
                </div>
              )}
              {neutrals.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {neutrals.slice(0, 3).map(o => { const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome; return (
                    <button key={o.outcome} onClick={() => onAdvance(lead, ns)}
                      className="flex-1 min-w-0 py-1 rounded-lg text-[9px] font-semibold bg-amber-500/8 text-amber-700 border border-amber-100 hover:bg-amber-500/15 transition-colors text-center truncate px-1">
                      ⏳ {o.label}
                    </button>
                  ); })}
                </div>
              )}
              {negatives.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {negatives.slice(0, 2).map(o => { const ns = STATUS_FROM_OUTCOME[o.outcome] ?? o.outcome; return (
                    <button key={o.outcome} onClick={() => onAdvance(lead, ns)}
                      className="flex-1 min-w-0 py-1 rounded-lg text-[9px] font-semibold bg-rose-500/8 text-rose-600 border border-rose-100 hover:bg-rose-500/15 transition-colors text-center truncate px-1">
                      ❌ {o.label}
                    </button>
                  ); })}
                </div>
              )}
            </>
          )}
          <div className="flex gap-1.5 pt-0.5">
            <button onClick={onCall}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold border border-muted bg-background hover:bg-muted transition-colors">
              <PhoneCall className="h-3 w-3"/> Discar
            </button>
            <WaDropdown lead={lead} stageKey={col.stageKey}/>
            <button onClick={onEdit}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-muted bg-background hover:bg-muted transition-colors shrink-0">
              <Pencil className="h-3 w-3 text-muted-foreground"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditDialog({ lead, lists, onSave, onClose }: {
  lead: Lead; lists: LeadList[];
  onSave: (id: string, patch: Partial<Lead>) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(lead.status);
  const [obs, setObs]       = useState(lead.observacoes ?? "");
  const [listId, setListId] = useState(lead.list_id ?? "none");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(lead.id, { status, observacoes: obs.trim() || null, list_id: listId === "none" ? null : listId });
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar lead
            <span className="text-muted-foreground font-normal text-sm">— {lead.nome}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4"/> {formatPhone(lead.telefone)}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent className="max-h-72">
                {FUNNEL_STAGES.map(stage => (
                  <div key={stage.key}>
                    <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider sticky top-0 bg-background">
                      {stage.key} · {stage.label}
                    </div>
                    {stage.statuses.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                    ))}
                  </div>
                ))}
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Perdidos</div>
                {LOST_LIST.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Lista</label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem lista</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Observações</label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} maxLength={500}/>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors flex items-center gap-1.5">
            <X className="h-3.5 w-3.5"/> Cancelar
          </button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}