import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone, STATUS_COLOR, STATUS_LABELS, FUNNEL_STAGES, FUNNEL_STAGE, LOST_STATUSES, formatFollowup } from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import {
  RefreshCw, PhoneCall, X, AlertTriangle, ChevronLeft, ChevronRight,
  Calendar, Filter, RotateCcw, CalendarCheck, PhoneMissed,
} from "lucide-react";
import { toast } from "sonner";


// FUNNEL_STAGES vem do crm.ts — fonte única de verdade
const FUNNEL = FUNNEL_STAGES;

// LOST_STATUSES vem do crm.ts

const POS_VENDA_STATUSES = ["envio_documentos","cpf_analisado","credito_aprovado","contrato_gerado","contrato_assinado","boleto_pago","repasse","registro","envio_doc","proposta_aceita","analise_credito","aprovacao_credito","chaves_entregues"];

// classifyLead usa FUNNEL_STAGE do crm.ts — fonte única de verdade
function classifyLead(status: string): string {
  if (LOST_STATUSES.includes(status)) return "perdido";
  return FUNNEL_STAGE[status] ?? "A";
}

// isAtendeu: atendeu = não está em A e não é perdido
function isAtendeu(status: string): boolean {
  return classifyLead(status) !== "A" && !LOST_STATUSES.includes(status);
}

export default function Pipeline() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads]         = useState<Lead[]>([]);
  const [lists, setLists]         = useState<LeadList[]>([]);
  const [loading, setLoading]     = useState(true);
  const [listFilter, setListFilter] = useState("all");
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [reagendarLead, setReagendarLead] = useState<Lead | null>(null);
  const [novaData, setNovaData]   = useState("");
  const [saving, setSaving]       = useState<string | null>(null);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [callStats, setCallStats] = useState({ total: 0, answered: 0 });
  const [editingObs, setEditingObs] = useState<string | null>(null);
  const [editObsVal, setEditObsVal] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editDateVal, setEditDateVal] = useState("");

  // ── Carregar ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: cd }, { data: ls }] = await Promise.all([
      supabase.from("calls")
        .select("lead_id,started_at,outcome")
        .order("started_at", { ascending: false })
        .limit(50000),
      supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false }),
    ]);

    // Buscar TODOS os leads sem limite via paginação
    let allLeadsRaw: any[] = [];
    let from = 0;
    while (true) {
      const { data: page, error } = await supabase.from("leads")
        .select("id,nome,telefone,status,observacoes,proximo_followup,list_id,updated_at")
        .order("nome", { ascending: true })
        .range(from, from + 999);
      if (error || !page || page.length === 0) break;
      allLeadsRaw = [...allLeadsRaw, ...page];
      if (page.length < 1000) break;
      from += 1000;
    }

    // Enrich with call count + last call
    const callCount = new Map<string, number>();
    const lastCall  = new Map<string, string>();
    for (const c of (cd ?? [])) {
      callCount.set(c.lead_id, (callCount.get(c.lead_id) ?? 0) + 1);
      if (!lastCall.has(c.lead_id)) lastCall.set(c.lead_id, c.started_at);
    }

    const enriched = allLeadsRaw.map((l: any) => ({
      ...l,
      call_count: callCount.get(l.id) ?? 0,
      last_call_at: lastCall.get(l.id) ?? null,
    }));

    setLeads(enriched);
    setLists((ls ?? []) as LeadList[]);
    const totalCalls = (cd ?? []).length;
    const answeredCalls = (cd ?? []).filter((c: any) => !["nao_atendeu"].includes(c.outcome ?? "")).length;
    setCallStats({ total: totalCalls, answered: answeredCalls });
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Filtrar ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (listFilter === "all") return leads;
    return leads.filter(l => l.list_id === listFilter);
  }, [leads, listFilter]);

  // ── Dados do funil ─────────────────────────────────────────────────────────
  // Ordem das etapas para contagem cumulativa
  const STAGE_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N"];

  const funnelData = useMemo(() => {
    // ── Lógica cumulativa de funil ────────────────────────────────────────────
    // Cada lead conta 1 vez em CADA etapa que já passou ou está agora.
    // Lead em G conta em: A, B, C, D, E, F, G (mas não em H, I, J...)
    // Assim: A=todos, B=quantos atenderam, C=quantos tiveram interesse, etc.
    //
    // Para cada etapa X: conta leads cuja etapa atual é >= X na ordem do funil
    // (excluindo perdidos)

    return FUNNEL.map(stage => {
      const stageIdx = STAGE_ORDER.indexOf(stage.key);
      // Leads que chegaram nesta etapa ou além (etapa atual >= esta etapa)
      const stageLeads = filtered.filter(l => {
        if (LOST_STATUSES.includes(l.status)) return false; // perdidos não entram
        const leadStage = classifyLead(l.status);
        if (leadStage === "perdido") return false;
        const leadIdx = STAGE_ORDER.indexOf(leadStage);
        return leadIdx >= stageIdx;
      });
      // Para o painel de leads detalhado, mostra só quem está nesta etapa exata
      const exactLeads = filtered.filter(l => classifyLead(l.status) === stage.key);
      return { ...stage, count: stageLeads.length, leads: exactLeads };
    });
  }, [filtered]);

  const totalAtivo   = filtered.filter(l => !LOST_STATUSES.includes(l.status)).length;
  const totalPerdido = filtered.filter(l => LOST_STATUSES.includes(l.status)).length;
  const perdidos     = filtered.filter(l => LOST_STATUSES.includes(l.status));

  // ── Métricas de jornada completa ───────────────────────────────────────────
  const emA = funnelData.find(s => s.key === "A")?.count ?? 0;
  const emB = funnelData.find(s => s.key === "B")?.count ?? 0;
  const emC = funnelData.find(s => s.key === "C")?.count ?? 0;
  const emD = funnelData.find(s => s.key === "D")?.count ?? 0;
  const emE = funnelData.find(s => s.key === "E")?.count ?? 0;
  const emF = funnelData.find(s => s.key === "F")?.count ?? 0;
  const emG = funnelData.find(s => s.key === "G")?.count ?? 0;
  const emH = funnelData.find(s => s.key === "H")?.count ?? 0;
  const emI = funnelData.find(s => s.key === "I")?.count ?? 0;
  const emJ = funnelData.find(s => s.key === "J")?.count ?? 0;
  const emK = funnelData.find(s => s.key === "K")?.count ?? 0;
  const emL = funnelData.find(s => s.key === "L")?.count ?? 0;
  const emM = funnelData.find(s => s.key === "M")?.count ?? 0;
  const emN = funnelData.find(s => s.key === "N")?.count ?? 0;

  // Leads que já passaram da prospecção (B em diante)
  const jaAtendidos    = totalAtivo - emA;
  // Leads que chegaram em visita (E em diante, incluindo realizadas)
  const chegaramVisita = emE + emF + emG + emH + emI + emJ + emK + emL + emM + emN;
  // Leads que visitaram de fato (F em diante)
  const visitaram      = emF + emG + emH + emI + emJ + emK + emL + emM + emN;
  // Leads em pós-venda (G em diante)
  const posVenda       = emG + emH + emI + emJ + emK + emL + emM + emN;
  // Vendas fechadas
  const vendas         = emN;

  // Taxas
  const totalVisitaMarcada = emE;
  const taxaConversao = totalAtivo > 0 ? Math.round(chegaramVisita / totalAtivo * 100) : 0;
  const taxaVisitaRealizada = chegaramVisita > 0 ? Math.round(visitaram / chegaramVisita * 100) : 0;
  const taxaFechamento = visitaram > 0 ? Math.round(vendas / visitaram * 100) : 0;

  // Análise de perdas por motivo
  const perdaMotivos = perdidos.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Ações ──────────────────────────────────────────────────────────────────
  async function updateStatus(id: string, status: string, extra?: { proximo_followup?: string | null }) {
    setSaving(id);
    const update: any = { status };
    if (extra?.proximo_followup !== undefined) update.proximo_followup = extra.proximo_followup;
    const { error } = await supabase.from("leads").update(update).eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado ✅");
    setReagendarLead(null); setNovaData("");
    load();
  }

  async function saveDate(id: string) {
    setSaving(id + "_d");
    const iso = editDateVal ? new Date(editDateVal).toISOString() : null;
    const { error } = await supabase.from("leads").update({
      proximo_followup: iso,
      status: iso ? "visita_agendada" : "visita_pendente",
    }).eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(iso ? "Data salva ✅" : "Data removida");
    setEditingDate(null);
    load();
  }

  async function saveObs(id: string) {
    setSaving(id + "_o");
    const { error } = await supabase.from("leads").update({ observacoes: editObsVal || null }).eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Observação salva");
    setEditingObs(null);
    load();
  }

  function toLocal(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Stage atual selecionado
  const activeStageData = funnelData.find(s => s.key === activeStage);
  const hasVisitaActions = activeStage === "C" || activeStage === "D";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-3xl">🏆 Pipeline de Vendas</h1>
          <p className="text-muted-foreground text-sm mt-1">Onde estão seus leads no funil</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="w-48 h-9">
              <SelectValue placeholder="Todas as listas"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📋 Todas as listas</SelectItem>
              {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}/> Atualizar
          </Button>
        </div>
      </div>

      {/* ── Etapas do funil A→E + métricas ── */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-2">
        {funnelData.map(stage => (
          <button key={stage.key}
            onClick={() => setActiveStage(activeStage === stage.key ? null : stage.key)}
            className={`p-3 rounded-xl border-2 text-center transition-all hover:scale-105 ${activeStage === stage.key ? "shadow-lg scale-105" : ""}`}
            style={{
              borderColor: activeStage === stage.key ? stage.color : stage.color + "44",
              background: activeStage === stage.key ? stage.color : stage.light,
            }}
          >
            <div className="text-lg font-display font-bold" style={{ color: activeStage === stage.key ? "white" : stage.color }}>
              {stage.key}
            </div>
            <div className="text-xl font-display font-bold tabular-nums" style={{ color: activeStage === stage.key ? "white" : stage.color }}>
              {stage.count}
            </div>
            <div className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: activeStage === stage.key ? "rgba(255,255,255,0.85)" : stage.color }}>
              {stage.label}
            </div>
          </button>
        ))}
        {/* Ligações */}
        <div className="col-span-3 sm:col-span-2 grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl border bg-muted/40 text-center">
            <div className="text-xl font-display font-bold tabular-nums">{callStats.total}</div>
            <div className="text-[10px] text-muted-foreground">Ligações totais</div>
          </div>
          <div className="p-3 rounded-xl border bg-muted/40 text-center">
            <div className="text-xl font-display font-bold tabular-nums text-emerald-600">{callStats.answered}</div>
            <div className="text-[10px] text-muted-foreground">Atendidas</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Leads ativos", value: totalAtivo,         color: "bg-blue-50 border-blue-200 text-blue-800" },
          { label: "Visita marcada", value: totalVisitaMarcada, color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
          { label: "Taxa conversão", value: `${taxaConversao}%`, color: "bg-violet-50 border-violet-200 text-violet-800" },
          { label: "Perdidos", value: totalPerdido,           color: "bg-rose-50 border-rose-200 text-rose-800" },
        ].map(k => (
          <Card key={k.label} className={`shadow-card border ${k.color}`}>
            <CardContent className="p-4">
              <div className="text-[11px] uppercase tracking-wider opacity-70 mb-1">{k.label}</div>
              <div className="font-display font-bold text-2xl tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Funil em cone */}
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-semibold text-lg">Funil de Vendas</h2>
            <p className="text-xs text-muted-foreground">Clique em uma etapa para ver os leads</p>
          </div>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">Carregando...</div>
          ) : (
            <FunnelCone
              data={funnelData.map(s => ({ key: s.key, label: s.label, count: s.count, color: s.color, light: s.light, emoji: s.emoji }))}
              activeStage={activeStage}
              onSelect={k => setActiveStage(activeStage === k ? null : k)}
            />
          )}
        </CardContent>
      </Card>

      {/* Leads da etapa selecionada */}
      {activeStage && activeStageData && (
        <Card className="shadow-card" style={{ borderColor: activeStageData.color + "66", borderWidth: 2 }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ background: activeStageData.light }}>
            <div>
              <h3 className="font-display font-semibold" style={{ color: activeStageData.color }}>
                {activeStageData.emoji} {activeStageData.label} — {activeStageData.count} leads
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{activeStageData.desc}</p>
            </div>
            <button onClick={() => setActiveStage(null)} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-5 w-5"/>
            </button>
          </div>

          <div className="divide-y max-h-[500px] overflow-y-auto">
            {activeStageData.leads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead nesta etapa</div>
            ) : activeStageData.leads
              .sort((a, b) => {
                // D: ordena por data mais próxima
                if (activeStage === "D" && a.proximo_followup && b.proximo_followup) {
                  return new Date(a.proximo_followup).getTime() - new Date(b.proximo_followup).getTime();
                }
                // Demais: mais recente primeiro
                return (b.last_call_at ?? "").localeCompare(a.last_call_at ?? "");
              })
              .map(l => {
                const score = calcLeadScore({ callCount: l.call_count, status: l.status, hasFollowup: !!l.proximo_followup });
                const sl = scoreLabel(score);
                const isExpanded = expandedLead === l.id;

                return (
                  <div key={l.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                    {/* Linha principal */}
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
                        style={{ background: activeStageData.color }}>
                        {l.nome[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{l.nome}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${sl.bg} ${sl.color}`}>{sl.emoji}</span>
                          <Badge variant="secondary" className={`text-[10px] ${STATUS_COLOR[l.status] ?? ""}`}>
                            {STATUS_LABELS[l.status] ?? l.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatPhone(l.telefone)} · {l.call_count}x
                          {l.proximo_followup && (
                            <span className="ml-2 text-blue-600 font-medium">
                              · 📅 {new Date(l.proximo_followup).toLocaleDateString("pt-BR", { weekday:"short", day:"2-digit", month:"2-digit" })} {new Date(l.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botões de ação */}
                      <div className="flex gap-1 shrink-0">
                        {hasVisitaActions && (
                          <>
                            <button disabled={saving === l.id} onClick={() => updateStatus(l.id, "visita_confirmada")}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1">
                              <CalendarCheck className="h-3 w-3"/> Confirmar
                            </button>
                            <button onClick={() => { setReagendarLead(l); setNovaData(toLocal(l.proximo_followup)); }}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1">
                              <RotateCcw className="h-3 w-3"/> Reagendar
                            </button>
                            <button disabled={saving === l.id} onClick={() => updateStatus(l.id, "visita_cancelada")}
                              className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1">
                              <PhoneMissed className="h-3 w-3"/> Não veio
                            </button>
                          </>
                        )}
                        <button onClick={() => navigate(`/dialer?lead=${l.id}`)}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1">
                          <PhoneCall className="h-3 w-3"/> Ligar
                        </button>
                        <button
                          onClick={() => { setExpandedLead(isExpanded ? null : l.id); setEditingDate(null); setEditingObs(null); }}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${isExpanded ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    {/* Dropdown inline */}
                    {isExpanded && (
                      <div className="mt-3 ml-12 p-4 rounded-xl bg-muted/30 border space-y-4">

                        {/* Data da visita */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">📅 Data da visita</p>
                          {editingDate === l.id ? (
                            <div className="flex items-center gap-2">
                              <Input type="datetime-local" value={editDateVal}
                                onChange={e => setEditDateVal(e.target.value)} className="h-8 text-xs flex-1"/>
                              <button disabled={saving === l.id + "_d"} onClick={() => saveDate(l.id)}
                                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">
                                {saving === l.id + "_d" ? "..." : "Salvar"}
                              </button>
                              <button onClick={() => setEditingDate(null)} className="text-muted-foreground hover:text-foreground">
                                <X className="h-4 w-4"/>
                              </button>
                            </div>
                          ) : l.proximo_followup ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-blue-700">
                                {new Date(l.proximo_followup).toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long" })} às {new Date(l.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                              </span>
                              <button onClick={() => { setEditingDate(l.id); setEditDateVal(toLocal(l.proximo_followup)); }}
                                className="text-xs text-muted-foreground hover:text-foreground underline">alterar</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingDate(l.id); setEditDateVal(""); }}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-medium transition-colors">
                              + Adicionar data de visita
                            </button>
                          )}
                        </div>

                        {/* Observação */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">💬 Observação</p>
                          {editingObs === l.id ? (
                            <div className="space-y-2">
                              <textarea value={editObsVal} onChange={e => setEditObsVal(e.target.value)} rows={3}
                                className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder="Anotações sobre este lead..."/>
                              <div className="flex gap-2">
                                <button disabled={saving === l.id + "_o"} onClick={() => saveObs(l.id)}
                                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">
                                  {saving === l.id + "_o" ? "Salvando..." : "Salvar"}
                                </button>
                                <button onClick={() => setEditingObs(null)}
                                  className="px-3 py-1.5 rounded-lg border text-[11px] hover:bg-muted transition-colors">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              <p className={`flex-1 text-xs leading-relaxed ${l.observacoes ? "text-foreground/80" : "text-muted-foreground italic"}`}>
                                {l.observacoes ?? "Sem observações"}
                              </p>
                              <button onClick={() => { setEditingObs(l.id); setEditObsVal(l.observacoes ?? ""); }}
                                className="text-[10px] text-muted-foreground hover:text-foreground underline shrink-0">editar</button>
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="flex gap-2 pt-2 border-t flex-wrap">
                          <a href={`https://wa.me/55${l.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 text-[11px] font-medium transition-colors">
                            💬 WhatsApp
                          </a>
                          <button onClick={() => navigate(`/lead/${l.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-[11px] font-medium transition-colors">
                            👁 Perfil completo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Análise de perdas */}
      {totalPerdido > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-6">
            <h2 className="font-display font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500"/> Análise de perdas
              <span className="text-xs text-muted-foreground font-normal ml-1">— {totalPerdido} leads</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {LOST_STATUSES.map(status => {
                const count = filtered.filter(l => l.status === status).length;
                if (!count) return null;
                const pct = Math.round((count / totalPerdido) * 100);
                return (
                  <div key={status} className="p-3 rounded-xl bg-muted/40 border">
                    <div className="font-bold text-xl text-rose-600 tabular-nums">{count}</div>
                    <div className="text-xs font-medium mt-0.5">{STATUS_LABELS[status] ?? status}</div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-rose-400 rounded-full" style={{ width: `${pct}%` }}/>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{pct}% dos perdidos</div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal reagendar */}
      {reagendarLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReagendarLead(null)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-base mb-1">Reagendar visita</h3>
            <p className="text-sm text-muted-foreground mb-4">{reagendarLead.nome}</p>
            <Input type="datetime-local" value={novaData} onChange={e => setNovaData(e.target.value)} className="h-9 text-sm mb-4"/>
            <div className="flex gap-2">
              <button onClick={() => setReagendarLead(null)}
                className="flex-1 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">Cancelar</button>
              <button disabled={!novaData || saving === reagendarLead.id}
                onClick={() => updateStatus(reagendarLead.id, "visita_agendada", { proximo_followup: new Date(novaData).toISOString() })}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving === reagendarLead.id ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FunnelCone component ──────────────────────────────────────────────────────
function FunnelCone({
  data, activeStage, onSelect,
}: {
  data: { key: string; label: string; count: number; color: string; light: string; emoji: string }[];
  activeStage: string | null;
  onSelect: (key: string) => void;
}) {
  const widths = [
    "100%","93%","86%","79%","72%","65%","58%","51%","44%","37%","30%","23%","16%","9%"
  ];

  return (
    <div className="flex gap-6 items-start">
      {/* Cone visual */}
      <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
        {data.map((stage, i) => {
          const isActive = activeStage === stage.key;
          const w = widths[i] ?? "8%";
          return (
            <button
              key={stage.key}
              onClick={() => onSelect(stage.key)}
              className="flex items-center justify-center gap-2 rounded-lg transition-all hover:opacity-90 hover:scale-[1.01]"
              style={{
                width: w,
                background: isActive ? stage.color : stage.color + "cc",
                padding: "6px 12px",
                boxShadow: isActive ? `0 0 0 3px ${stage.color}44` : undefined,
              }}
            >
              <span className="text-white text-xs font-bold">{stage.emoji}</span>
              <span className="text-white text-xs font-bold">{stage.key}</span>
              <span className="text-white text-xs font-bold tabular-nums">{stage.count}</span>
            </button>
          );
        })}
        {/* Arrow */}
        <div className="mt-1" style={{ width: 0, height: 0, borderLeft: "16px solid transparent", borderRight: "16px solid transparent", borderTop: "20px solid #166534" }}/>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1 shrink-0 min-w-[160px]">
        {data.map(stage => {
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => onSelect(stage.key)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-all hover:opacity-90"
              style={{
                background: isActive ? stage.color : stage.light,
                border: `1px solid ${stage.color}44`,
              }}
            >
              <span className="font-bold text-xs w-5 shrink-0" style={{ color: isActive ? "white" : stage.color }}>
                {stage.key}
              </span>
              <span className="text-xs font-medium truncate" style={{ color: isActive ? "white" : stage.color }}>
                {stage.label}
              </span>
              <span className="ml-auto text-xs font-bold tabular-nums" style={{ color: isActive ? "white" : stage.color }}>
                {stage.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}