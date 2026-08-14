import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  LEAD_STATUS_LABELS, LEAD_STATUS_COLOR, LEAD_STATUSES, LEAD_STATUS_LOST,
  LEAD_FUNNEL_COLUMNS, LEAD_FUNNEL_LOST_COLUMN, getLeadFunnelColumn,
  MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  formatPhone, type MensagemStatusContato,
} from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import {
  Search, MessageCircle, Pencil, GripVertical, Eye,
  RefreshCw, CalendarClock, ChevronRight, ArrowRight, X, UserCircle2, UserPlus,
} from "lucide-react";
import { toast } from "sonner";

type Lead = {
  id: string; nome: string; telefone: string; status: string;
  observacoes: string | null; origem: string | null; list_id: string | null;
  proximo_followup: string | null; assigned_to: string | null;
};
type LeadList = { id: string; nome: string };
type Profile = { id: string; full_name: string };
type LastMensagem = { status_contato: MensagemStatusContato; enviada_em: string };

const ALL_COLS = [...LEAD_FUNNEL_COLUMNS, LEAD_FUNNEL_LOST_COLUMN];

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1)    return "agora";
  if (diff < 60)   return `${diff}min atrás`;
  if (diff < 1440) return `${Math.floor(diff/60)}h atrás`;
  return `${Math.floor(diff/1440)}d atrás`;
}

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function CRM() {
  const navigate = useNavigate();
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [lists, setLists]             = useState<LeadList[]>([]);
  const [profiles, setProfiles]       = useState<Profile[]>([]);
  const [lastMsgByLead, setLastMsgByLead] = useState<Map<string, LastMensagem>>(new Map());
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [listFilter, setListFilter]   = useState("all");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
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
          .select("id,nome,telefone,status,observacoes,origem,list_id,proximo_followup,assigned_to")
          .order("created_at", { ascending: false })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < size) break;
        from += size;
      }
      return all;
    };

    const [leadsData, { data: listsData }, { data: profilesData }, { data: msgData }] = await Promise.all([
      fetchAllLeads(),
      supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name").order("full_name", { ascending: true }),
      supabase.from("mensagens").select("lead_id,status_contato,enviada_em").order("enviada_em", { ascending: false }),
    ]);

    const lastMap = new Map<string, LastMensagem>();
    for (const m of (msgData ?? []) as { lead_id: string; status_contato: MensagemStatusContato; enviada_em: string }[]) {
      if (!lastMap.has(m.lead_id)) lastMap.set(m.lead_id, { status_contato: m.status_contato, enviada_em: m.enviada_em });
    }

    setLeads((leadsData ?? []) as Lead[]);
    setLists((listsData ?? []) as LeadList[]);
    setProfiles((profilesData ?? []) as Profile[]);
    setLastMsgByLead(lastMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

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
    const map: Record<string, Lead[]> = {};
    for (const col of ALL_COLS) map[col.key] = [];
    for (const lead of filtered) {
      const col = getLeadFunnelColumn(lead.status);
      (map[col?.key ?? "novo"] ??= []).push(lead);
    }
    return map;
  }, [filtered]);

  function onDragStart(e: React.DragEvent, id: string) {
    dragLeadId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropCol(colKey: string) {
    setDragTarget(null);
    const id = dragLeadId.current;
    dragLeadId.current = null;
    if (!id) return;
    const lead = leads.find(l => l.id === id);
    const col = ALL_COLS.find(c => c.key === colKey);
    if (!lead || !col) return;
    const newStatus = col.statuses[0];
    if (lead.status === newStatus) return;
    await updateLead(lead, { status: newStatus });
  }

  async function updateLead(lead: Lead, patch: Partial<Lead>) {
    const prev = { ...lead };
    setLeads(p => p.map(l => l.id === lead.id ? { ...l, ...patch } : l));
    const { error } = await supabase.from("leads").update(patch as any).eq("id", lead.id);
    if (error) {
      toast.error(error.message);
      setLeads(p => p.map(l => l.id === lead.id ? prev : l));
    } else if (patch.status) {
      toast.success(`✅ ${lead.nome.split(" ")[0]} → ${LEAD_STATUS_LABELS[patch.status as keyof typeof LEAD_STATUS_LABELS] ?? patch.status}`);
    }
  }

  function advanceLead(lead: Lead) {
    const currentCol = getLeadFunnelColumn(lead.status);
    const idx = LEAD_FUNNEL_COLUMNS.findIndex(c => c.key === currentCol?.key);
    if (idx < 0 || idx >= LEAD_FUNNEL_COLUMNS.length - 1) return;
    updateLead(lead, { status: LEAD_FUNNEL_COLUMNS[idx + 1].statuses[0] });
  }

  async function assignLead(lead: Lead, userId: string | null) {
    await updateLead(lead, { assigned_to: userId });
    toast.success(userId ? `Atribuído a ${profileById.get(userId)?.full_name || "atendente"}` : "Atribuição removida");
  }

  async function saveLead(id: string, patch: Partial<Lead>) {
    const { error } = await supabase.from("leads").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    setEditingLead(null);
    toast.success("Lead atualizado");
  }

  const totalLoaded = filtered.length;
  const perdidosCount = leadsByCol["perdido"]?.length ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      <div className="px-6 pt-5 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-2xl">CRM Kanban</h1>
            <p className="text-muted-foreground text-xs mt-0.5">
              {totalLoaded} leads · {perdidosCount} perdidos · mudanças de status ficam no Histórico de Alterações
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
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as listas</SelectItem>
                <SelectItem value="none">Sem lista</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}/>
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-4">
        <div className="flex gap-3 h-full" style={{ minWidth: `${ALL_COLS.length * 250}px` }}>
          {ALL_COLS.map(col => {
            const colLeads = leadsByCol[col.key] ?? [];
            const isDragOver = dragTarget === col.key;
            const isLost = col.key === "perdido";
            return (
              <div key={col.key}
                className={`flex flex-col rounded-2xl border-2 transition-all shrink-0 w-[246px] ${
                  isDragOver ? "border-primary/60 bg-primary/5 scale-[1.01]" :
                  isLost ? "border-dashed border-red-200 bg-red-50/30" : "border-transparent bg-muted/40"
                }`}
                onDragOver={e => { e.preventDefault(); setDragTarget(col.key); }}
                onDragLeave={() => setDragTarget(prev => prev === col.key ? null : prev)}
                onDrop={e => { e.preventDefault(); onDropCol(col.key); }}>
                <div className="px-3 pt-3 pb-2 shrink-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base leading-none">{col.emoji}</span>
                    <span className="flex-1 text-xs font-semibold text-foreground truncate">{col.label}</span>
                    <span className="text-base font-black tabular-nums shrink-0"
                      style={{ color: colLeads.length > 0 ? col.color : "#94a3b8" }}>{colLeads.length}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-1 rounded-full transition-all duration-500"
                      style={{ background: col.color, width: `${Math.min(100, colLeads.length * 8)}%` }}/>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-0">
                  {colLeads.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground/40 border-2 border-dashed rounded-xl mx-1">
                      Arraste leads aqui
                    </div>
                  ) : colLeads.map(lead => (
                    <KanbanCard key={lead.id} lead={lead} col={col}
                      profiles={profiles} profileById={profileById}
                      lastMsg={lastMsgByLead.get(lead.id)}
                      canAdvance={LEAD_FUNNEL_COLUMNS.findIndex(c => c.key === col.key) >= 0 && LEAD_FUNNEL_COLUMNS.findIndex(c => c.key === col.key) < LEAD_FUNNEL_COLUMNS.length - 1}
                      onDragStart={onDragStart}
                      onAdvance={() => advanceLead(lead)}
                      onAssign={(uid) => assignLead(lead, uid)}
                      onMessage={() => navigate(`/dialer?lead=${lead.id}`)}
                      onView={() => navigate(`/lead/${lead.id}`)}
                      onEdit={() => setEditingLead(lead)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingLead && (
        <EditDialog lead={editingLead} lists={lists} onSave={saveLead} onClose={() => setEditingLead(null)}/>
      )}
    </div>
  );
}

function KanbanCard({ lead, col, profiles, profileById, lastMsg, canAdvance, onDragStart, onAdvance, onAssign, onMessage, onView, onEdit }: {
  lead: Lead; col: typeof LEAD_FUNNEL_COLUMNS[number];
  profiles: Profile[]; profileById: Map<string, Profile>;
  lastMsg: LastMensagem | undefined;
  canAdvance: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAdvance: () => void;
  onAssign: (userId: string | null) => void;
  onMessage: () => void; onView: () => void; onEdit: () => void;
}) {
  const isLost       = col.key === "perdido";
  const hasFollowup  = !!lead.proximo_followup;
  const followupPast = hasFollowup && new Date(lead.proximo_followup!) < new Date();
  const score = calcLeadScore({ status: lead.status, hasFollowup });
  const sl    = scoreLabel(score);
  const assignee = lead.assigned_to ? profileById.get(lead.assigned_to) : null;

  return (
    <div draggable onDragStart={e => onDragStart(e, lead.id)}
      className={`group bg-white dark:bg-card rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
        isLost ? "border-red-100" : "border-black/8"
      }`}>
      <div className="h-1 rounded-t-xl" style={{ background: col.color }}/>
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-1.5">
          <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 mt-0.5 shrink-0 transition-colors"/>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{lead.nome}</p>
            {lead.origem && <p className="text-[10px] text-muted-foreground truncate">{lead.origem}</p>}
          </div>
          {!isLost && score > 0 && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${sl.bg} ${sl.color}`}>{sl.emoji}</span>}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${LEAD_STATUS_COLOR[lead.status as keyof typeof LEAD_STATUS_COLOR] ?? "bg-muted text-muted-foreground"}`}>
            {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
          </span>
          {lastMsg && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${MENSAGEM_STATUS_CONTATO_COLOR[lastMsg.status_contato]}`}
              title={`Último contato: ${MENSAGEM_STATUS_CONTATO_LABELS[lastMsg.status_contato]} · ${formatRelative(lastMsg.enviada_em)}`}>
              {MENSAGEM_STATUS_CONTATO_EMOJI[lastMsg.status_contato]} {MENSAGEM_STATUS_CONTATO_LABELS[lastMsg.status_contato]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatPhone(lead.telefone)}</span>
        </div>

        {/* Responsável */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-muted transition-colors">
              {assignee ? (
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                  {initials(assignee.full_name)}
                </span>
              ) : (
                <UserCircle2 className="h-5 w-5 text-muted-foreground/40 shrink-0"/>
              )}
              <span className="text-[11px] text-muted-foreground truncate flex-1">
                {assignee?.full_name || "Sem responsável"}
              </span>
              <UserPlus className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100"/>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
            <DropdownMenuSeparator/>
            {profiles.map(p => (
              <DropdownMenuItem key={p.id} onClick={() => onAssign(p.id)}>
                {lead.assigned_to === p.id ? "✓ " : ""}{p.full_name || "Sem nome"}
              </DropdownMenuItem>
            ))}
            {lead.assigned_to && (
              <>
                <DropdownMenuSeparator/>
                <DropdownMenuItem onClick={() => onAssign(null)}>Remover responsável</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

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

        <div className="flex gap-1.5 pt-2 border-t">
          <button onClick={onMessage}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
            <MessageCircle className="h-3 w-3"/> Mensagem
          </button>
          {canAdvance && (
            <button onClick={onAdvance} title="Avançar etapa"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-muted bg-background hover:bg-muted transition-colors shrink-0">
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground"/>
            </button>
          )}
          <button onClick={onView} title="Ver perfil"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-muted bg-background hover:bg-muted transition-colors shrink-0">
            <Eye className="h-3.5 w-3.5 text-muted-foreground"/>
          </button>
          <button onClick={onEdit} title="Editar"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-muted bg-background hover:bg-muted transition-colors shrink-0">
            <Pencil className="h-3 w-3 text-muted-foreground"/>
          </button>
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
          <div className="text-sm text-muted-foreground">{formatPhone(lead.telefone)}</div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent className="max-h-72">
                {LEAD_STATUSES.filter(s => !LEAD_STATUS_LOST.includes(s)).map(s => (
                  <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
                ))}
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">Perdidos</div>
                {LEAD_STATUS_LOST.map(s => <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>)}
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
