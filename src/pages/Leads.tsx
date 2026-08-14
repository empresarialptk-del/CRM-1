import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  LEAD_STATUS_LABELS, LEAD_STATUS_COLOR, LEAD_STATUSES, LEAD_STATUS_LOST,
  LEAD_FUNNEL_COLUMNS, LEAD_FUNNEL_LOST_COLUMN, getLeadFunnelColumn,
  MENSAGEM_CATEGORIA_LABELS, MENSAGEM_CATEGORIA_EMOJI,
  MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  formatPhone, type MensagemStatusContato, type MensagemCategoria,
} from "@/lib/crm";
import { calcLeadScore, scoreLabel } from "@/lib/leadScore";
import { Search, Plus, Upload, ListPlus, AlertTriangle, Copy, Pencil, Trash2, ChevronDown, ArrowUp, ArrowDown, Layers, X as XIcon, ChevronRight, PhoneCall, MessageCircle, RefreshCw, ExternalLink, Download, ChevronLeft, Eye, UserCircle2, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Profile = { id: string; full_name: string };
type LastMensagem = { status_contato: MensagemStatusContato; enviada_em: string };

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type LeadList = { id: string; nome: string; descricao: string | null; created_by: string };

const PAGE_SIZE = 1000;

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

function normalizePhone(raw: string) {
  const cleaned = raw.replace(/\D/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("0") ? cleaned : `0${cleaned}`;
}
function isValidBRPhone(d: string) {
  const phoneWithoutZero = d.startsWith("0") ? d.slice(1) : d;
  if (phoneWithoutZero.length === 10) return true;
  if (phoneWithoutZero.length === 11) return phoneWithoutZero[2] === "9";
  return false;
}

// ── Formata data como DD/MM/AAAA ─────────────────────────────────────────────
function formatDatePrefix(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

type ColKey = "nome" | "telefone" | "status" | "list_id" | "observacoes";
const COL_LABELS: Record<ColKey, string> = {
  nome: "Nome",
  telefone: "Telefone",
  status: "Status",
  list_id: "Lista",
  observacoes: "Última observação",
};

export default function Leads() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState<LeadList[]>([]);
  const [activeList, setActiveList] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 300); // dispara query só 300ms após parar de digitar
  const [status, setStatus]           = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all"); // "all" | "A"..."N" | "perdido"
  const [openCreateList, setOpenCreateList] = useState(false);
  const [openAddLeads, setOpenAddLeads] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const [sort, setSort] = useState<{ col: ColKey; dir: "asc" | "desc" } | null>(null);
  const [groupBy, setGroupBy] = useState<ColKey | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [duplicates, setDuplicates] = useState<{phone: string; count: number; leads: any[]}[]>([]);
  const [showDupAlert, setShowDupAlert]   = useState(true);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [expandedMensagens, setExpandedMensagens] = useState<any[]>([]);
  const [loadingMensagens, setLoadingMensagens]   = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [lastMsgByLead, setLastMsgByLead] = useState<Map<string, LastMensagem>>(new Map());

  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  async function loadLeadMensagens(leadId: string) {
    setLoadingMensagens(true);
    const { data } = await supabase
      .from("mensagens")
      .select("id,categoria,texto,status_contato,observacao,enviada_em")
      .eq("lead_id", leadId)
      .order("enviada_em", { ascending: false })
      .limit(20);
    setExpandedMensagens((data ?? []) as any[]);
    setLoadingMensagens(false);
  }

  async function loadLists() {
    const { data, error } = await supabase.from("lead_lists").select("*").order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar listas: " + error.message); return; }
    setLists((data ?? []) as LeadList[]);
  }

  async function loadProfiles() {
    const { data } = await supabase.from("profiles").select("id,full_name").order("full_name", { ascending: true });
    setProfiles((data ?? []) as Profile[]);
  }

  async function loadLastMessages() {
    const { data } = await supabase.from("mensagens").select("lead_id,status_contato,enviada_em").order("enviada_em", { ascending: false });
    const map = new Map<string, LastMensagem>();
    for (const m of (data ?? []) as { lead_id: string; status_contato: MensagemStatusContato; enviada_em: string }[]) {
      if (!map.has(m.lead_id)) map.set(m.lead_id, { status_contato: m.status_contato, enviada_em: m.enviada_em });
    }
    setLastMsgByLead(map);
  }

  async function assignLead(lead: any, userId: string | null) {
    const { error } = await supabase.from("leads").update({ assigned_to: userId }).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(r => r.id === lead.id ? { ...r, assigned_to: userId } : r));
    toast.success(userId ? `Atribuído a ${profileById.get(userId)?.full_name || "atendente"}` : "Atribuição removida");
  }

  async function checkDuplicates() {
    const { data } = await supabase.from("leads").select("id,nome,telefone,status");
    if (!data) return;
    const phoneMap = new Map<string, any[]>();
    data.forEach((l: any) => {
      const phone = l.telefone.replace(/\D/g, "");
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(l);
    });
    const dups = Array.from(phoneMap.entries())
      .filter(([, leads]) => leads.length > 1)
      .map(([phone, leads]) => ({ phone, count: leads.length, leads }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    setDuplicates(dups);
  }

  const loadRows = useCallback(async (targetPage: number) => {
    const from = targetPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .range(from, to);

    // Sort server-side para funcionar corretamente com paginação
    if (sort) {
      // Ordenação: status ordena pela letra da etapa do funil no cliente
    // (DB ordena por texto, client-side reordena pela etapa depois)
    query = query.order(sort.col === "list_id" ? "list_id" : sort.col === "status" ? "status" : sort.col, { ascending: sort.dir === "asc" });
    } else {
      query = query.order("nome", { ascending: true });
    }

    // Filtro por etapa do funil ou por status específico
    if (stageFilter !== "all") {
      if (stageFilter === "perdido") {
        query = query.in("status", LEAD_STATUS_LOST);
      } else {
        const col = LEAD_FUNNEL_COLUMNS.find(c => c.key === stageFilter);
        if (col) query = query.in("status", col.statuses);
      }
    } else if (status !== "all") {
      query = query.eq("status", status as any);
    }
    if (activeList !== "all") {
      if (activeList === "none") query = query.is("list_id", null);
      else query = query.eq("list_id", activeList);
    }
    if (debouncedQ) query = query.or(`nome.ilike.%${debouncedQ}%,telefone.ilike.%${debouncedQ}%`);

    const { data, count, error } = await query;
    if (error) { toast.error("Erro ao carregar leads: " + error.message); return; }
    setRows(data ?? []);
    setTotalCount(count ?? 0);
  }, [debouncedQ, status, stageFilter, activeList, sort]);

  // Quando filtros ou sort mudam, volta pra página 0
  useEffect(() => {
    setPage(0);
    loadRows(0);
  }, [debouncedQ, status, stageFilter, activeList, sort]);

  // Quando página muda
  useEffect(() => {
    loadRows(page);
  }, [page]);

  useEffect(() => { loadLists(); checkDuplicates(); loadProfiles(); loadLastMessages(); }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const counts = useMemo(() => {
    const errados = rows.filter(r => r.status === "numero_errado").length;
    const convertidos = rows.filter(r => ["pago", "entregue", "pos_venda"].includes(r.status)).length;
    return { errados, convertidos };
  }, [rows]);

  // ── Exportar CSV (página atual) ───────────────────────────────────────────
  function exportCSV() {
    if (!rows.length) { toast.error("Nenhum contato para exportar."); return; }

    const header = ["Nome", "Telefone", "Status", "Lista", "Observação", "Origem", "Criado em"];
    const csvRows = rows.map(r => {
      const listName = lists.find(l => l.id === r.list_id)?.nome ?? "";
      const statusLabel = LEAD_STATUS_LABELS[r.status] ?? r.status;
      const phone = formatPhone(r.telefone);
      const obs = (r.observacoes ?? "").replace(/"/g, '""');
      const createdAt = r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "";
      return [
        `"${(r.nome ?? "").replace(/"/g, '""')}"`,
        `"${phone}"`,
        `"${statusLabel}"`,
        `"${listName}"`,
        `"${obs}"`,
        `"${r.origem ?? ""}"`,
        `"${createdAt}"`,
      ].join(",");
    });

    const csv = [header.join(","), ...csvRows].join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const listLabel = activeList === "all" ? "todos" : activeList === "none" ? "sem-lista" : (lists.find(l => l.id === activeList)?.nome ?? "lista");
    const statusLabel = status === "all" ? "todos-status" : (LEAD_STATUS_LABELS[status] ?? status);
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    a.href = url;
    a.download = `leads_${listLabel}_${statusLabel}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} contatos exportados`);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            {totalCount} contatos · {counts.convertidos} convertidos · {counts.errados} números errados
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <a href="https://docs.google.com/spreadsheets/d/1Gnh83p4Frw3Tb2e9WVvF8ilezbrfLEwdqaJHrTL2zw8/edit" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />Abrir planilha
            </a>
          </Button>
          <ImportFromSheetsButton onDone={async () => { await loadLists(); await loadRows(0); setPage(0); }} />
          <SheetsSyncButton />
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
          <Dialog open={openCreateList} onOpenChange={setOpenCreateList}>
            <DialogTrigger asChild>
              <Button variant="outline"><ListPlus className="h-4 w-4 mr-2" />Nova lista</Button>
            </DialogTrigger>
            <CreateListDialog
              onCreated={async (id) => { await loadLists(); setActiveList(id); setOpenCreateList(false); }}
              userId={user?.id}
            />
          </Dialog>
          <Dialog open={openAddLeads} onOpenChange={setOpenAddLeads}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-brand"><Plus className="h-4 w-4 mr-2" />Adicionar leads</Button>
            </DialogTrigger>
            <AddLeadsDialog
              lists={lists}
              defaultListId={activeList !== "all" && activeList !== "none" ? activeList : undefined}
              onDone={async () => { await loadRows(0); setPage(0); setOpenAddLeads(false); }}
            />
          </Dialog>
        </div>
      </header>

      <Card className="p-4 mb-4 flex gap-3 shadow-card flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome ou telefone…" className="pl-9" />
        </div>
        <Select value={activeList} onValueChange={setActiveList}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as listas</SelectItem>
            <SelectItem value="none">Sem lista</SelectItem>
            {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {LEAD_STATUSES.map(k => <SelectItem key={k} value={k}>{LEAD_STATUS_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {(status !== "all" || activeList !== "all" || debouncedQ) && (
        <div className="mb-3 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>Mostrando <strong className="text-foreground">{totalCount}</strong> contatos</span>
          {status !== "all" && <Badge variant="secondary">{LEAD_STATUS_LABELS[status]}</Badge>}
          {activeList !== "all" && <Badge variant="secondary">{activeList === "none" ? "Sem lista" : lists.find(l => l.id === activeList)?.nome}</Badge>}
          {debouncedQ && <Badge variant="secondary">"{debouncedQ}"</Badge>}
          {stageFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Etapa {stageFilter}
              <button onClick={() => setStageFilter("all")} className="ml-1 hover:text-destructive">×</button>
            </Badge>
          )}
          <span className="text-xs">— clique em <strong>Exportar CSV</strong> para baixar esses contatos</span>
        </div>
      )}

      <Card className="shadow-card overflow-hidden">
        {(sort || groupBy) && (
          <div className="px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            {groupBy && (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> Agrupado por <strong className="text-foreground">{COL_LABELS[groupBy]}</strong>
                <button onClick={() => setGroupBy(null)} className="ml-1 hover:text-destructive"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
            {sort && (
              <span className="inline-flex items-center gap-1">
                Ordenado por <strong className="text-foreground">{COL_LABELS[sort.col]}</strong> ({sort.dir === "asc" ? "A→Z" : "Z→A"})
                <button onClick={() => setSort(null)} className="ml-1 hover:text-destructive"><XIcon className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
                {/* ── Filtro por etapa do funil ────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Etapa:</span>
          <button
            onClick={() => { setStageFilter("all"); setStatus("all"); setPage(0); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              stageFilter === "all" ? "bg-foreground text-background border-foreground" : "border-muted text-muted-foreground hover:border-foreground/40"
            }`}>
            Todas
          </button>
          {LEAD_FUNNEL_COLUMNS.map(col => (
            <button key={col.key}
              onClick={() => { setStageFilter(col.key); setStatus("all"); setPage(0); }}
              title={col.label}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                stageFilter === col.key
                  ? "text-white border-transparent"
                  : "border-muted text-muted-foreground hover:border-foreground/30"
              }`}
              style={stageFilter === col.key ? { backgroundColor: col.color, borderColor: col.color } : {}}>
              <span>{col.emoji}</span>
              <span className="hidden sm:inline">{col.label}</span>
            </button>
          ))}
          <button
            onClick={() => { setStageFilter("perdido"); setStatus("all"); setPage(0); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              stageFilter === "perdido" ? "bg-red-500 text-white border-red-500" : "border-muted text-muted-foreground hover:border-red-300"
            }`}>
            ❌ Perdidos
          </button>
        </div>

        <Table>
          <TableHeader><TableRow>
            {(["nome", "telefone", "status", "list_id"] as ColKey[]).map(col => (
              <TableHead key={col}>
                <ColumnMenu
                  col={col}
                  sort={sort}
                  groupBy={groupBy}
                  onSort={(dir) => setSort({ col, dir })}
                  onClearSort={() => setSort(null)}
                  onGroup={() => setGroupBy(col)}
                  onUngroup={() => setGroupBy(null)}
                  statusFilter={status}
                  onStatusFilter={setStatus}
                />
              </TableHead>
            ))}
            <TableHead>Responsável</TableHead>
            <TableHead>Último contato</TableHead>
            {(["observacoes"] as ColKey[]).map(col => (
              <TableHead key={col}>
                <ColumnMenu
                  col={col}
                  sort={sort}
                  groupBy={groupBy}
                  onSort={(dir) => setSort({ col, dir })}
                  onClearSort={() => setSort(null)}
                  onGroup={() => setGroupBy(col)}
                  onUngroup={() => setGroupBy(null)}
                  statusFilter={status}
                  onStatusFilter={setStatus}
                />
              </TableHead>
            ))}
            <TableHead className="w-24 text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(() => {
              const renderRow = (r: any) => {
                const listName = lists.find(l => l.id === r.list_id)?.nome ?? "—";
                const invalid = !isValidBRPhone(normalizePhone(r.telefone));
                const isExpanded = expandedLeadId === r.id;

                return (
                  <React.Fragment key={r.id}>
                    <TableRow onClick={() => setEditingLead(r)} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          {formatPhone(r.telefone)}
                          {invalid && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Número inválido" />}
                        </span>
                      </TableCell>
                      <TableCell><div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className={LEAD_STATUS_COLOR[r.status]}>{LEAD_STATUS_LABELS[r.status] ?? r.status}</Badge>
                      </div></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{listName}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1.5 px-1.5 py-1 -mx-1.5 rounded-lg hover:bg-muted transition-colors">
                              {r.assigned_to && profileById.get(r.assigned_to) ? (
                                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {initials(profileById.get(r.assigned_to)!.full_name)}
                                </span>
                              ) : (
                                <UserCircle2 className="h-5 w-5 text-muted-foreground/40 shrink-0"/>
                              )}
                              <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                {r.assigned_to ? (profileById.get(r.assigned_to)?.full_name || "—") : "Sem responsável"}
                              </span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                            <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
                            <DropdownMenuSeparator/>
                            {profiles.map(p => (
                              <DropdownMenuItem key={p.id} onClick={() => assignLead(r, p.id)}>
                                {r.assigned_to === p.id ? "✓ " : ""}{p.full_name || "Sem nome"}
                              </DropdownMenuItem>
                            ))}
                            {r.assigned_to && (
                              <>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onClick={() => assignLead(r, null)}>Remover responsável</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const last = lastMsgByLead.get(r.id);
                          if (!last) return <span className="text-xs text-muted-foreground/50">—</span>;
                          return (
                            <Badge variant="secondary" className={`text-[10px] ${MENSAGEM_STATUS_CONTATO_COLOR[last.status_contato]}`}>
                              {MENSAGEM_STATUS_CONTATO_EMOJI[last.status_contato]} {MENSAGEM_STATUS_CONTATO_LABELS[last.status_contato]}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md truncate">{r.observacoes ?? "—"}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Histórico completo"
                            onClick={e => { e.stopPropagation(); if (isExpanded) { setExpandedLeadId(null); } else { setExpandedLeadId(r.id); loadLeadMensagens(r.id); } }}
                            className={isExpanded ? "bg-primary/10 text-primary" : ""}>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                          <Button size="icon" variant="ghost" title="Ver lead" onClick={() => navigate(`/lead/${r.id}`)}><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" title="Enviar mensagem" onClick={() => navigate(`/dialer?lead=${r.id}`)}><MessageCircle className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingLead(r)}><Pencil className="h-4 w-4" /></Button>
                          <DeleteLeadButton lead={r} onDeleted={() => loadRows(page)} />
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Dropdown expansível */}
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0 bg-muted/20">
                          <div className="px-6 py-4 space-y-4">
                            {/* Info rápida */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div className="p-2.5 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Data de adição</p>
                                <p className="font-semibold">{r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" }) : "—"}</p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Lista</p>
                                <p className="font-semibold">{listName}</p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Origem</p>
                                <p className="font-semibold">{r.origem ?? "—"}</p>
                              </div>
                              <div className="p-2.5 rounded-lg bg-background border">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Próximo follow-up</p>
                                <p className="font-semibold text-amber-700">
                                  {r.proximo_followup ? new Date(r.proximo_followup).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" }) + " " + new Date(r.proximo_followup).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }) : "—"}
                                </p>
                              </div>
                            </div>

                            {/* Observações permanentes */}
                            {r.observacoes && (
                              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">📌 Observação do lead</p>
                                <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">{r.observacoes}</p>
                              </div>
                            )}

                            {/* Histórico de mensagens */}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                💬 Histórico de mensagens {loadingMensagens ? "(carregando...)" : `(${expandedMensagens.length})`}
                              </p>
                              {loadingMensagens ? (
                                <div className="h-8 bg-muted animate-pulse rounded"/>
                              ) : expandedMensagens.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Nenhuma mensagem registrada</p>
                              ) : (
                                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                  {expandedMensagens.map((m) => {
                                    const emoji = MENSAGEM_CATEGORIA_EMOJI[m.categoria as MensagemCategoria] ?? "💬";
                                    const date = new Date(m.enviada_em);
                                    return (
                                      <div key={m.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-background border text-xs">
                                        <span className="text-base leading-none shrink-0">{emoji}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{MENSAGEM_CATEGORIA_LABELS[m.categoria as MensagemCategoria] ?? m.categoria}</span>
                                            <Badge variant="secondary" className={`text-[10px] ${MENSAGEM_STATUS_CONTATO_COLOR[m.status_contato as MensagemStatusContato]}`}>
                                              {MENSAGEM_STATUS_CONTATO_EMOJI[m.status_contato as MensagemStatusContato]} {MENSAGEM_STATUS_CONTATO_LABELS[m.status_contato as MensagemStatusContato]}
                                            </Badge>
                                          </div>
                                          <p className="text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{m.texto}</p>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                          {date.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" })} {date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Ações */}
                            <div className="flex gap-2 pt-1 border-t flex-wrap">
                              <button onClick={() => navigate(`/lead/${r.id}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                                👁 Perfil completo
                              </button>
                              <button onClick={() => navigate(`/dialer?lead=${r.id}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors">
                                💬 Enviar mensagem
                              </button>
                              <a href={`https://wa.me/55${r.telefone.replace(/\D/g,"")}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors">
                                💬 WhatsApp
                              </a>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              };

              if (!groupBy) return rows.map(renderRow);

              const groupKey = (r: any): string => {
                if (groupBy === "list_id") return lists.find(l => l.id === r.list_id)?.nome ?? "Sem lista";
                if (groupBy === "status") return LEAD_STATUS_LABELS[r.status] ?? r.status;
                if (groupBy === "observacoes") return r.observacoes ? "Com observação" : "Sem observação";
                if (groupBy === "telefone") return isValidBRPhone(normalizePhone(r.telefone)) ? "Válidos" : "Inválidos";
                if (groupBy === "nome") return (r.nome?.[0] ?? "—").toUpperCase();
                return "—";
              };
              const groups = new Map<string, any[]>();
              for (const r of rows) {
                const k = groupKey(r);
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k)!.push(r);
              }
              const sortedKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
              return sortedKeys.flatMap(k => {
                const isCollapsed = collapsed[k];
                const header = (
                  <TableRow key={`g-${k}`} className="bg-muted/40 hover:bg-muted/50 cursor-pointer" onClick={() => setCollapsed(s => ({ ...s, [k]: !s[k] }))}>
                    <TableCell colSpan={8} className="font-semibold text-sm">
                      <span className="inline-flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {k}
                        <Badge variant="outline" className="ml-2">{groups.get(k)!.length}</Badge>
                      </span>
                    </TableCell>
                  </TableRow>
                );
                return isCollapsed ? [header] : [header, ...groups.get(k)!.map(renderRow)];
              });
            })()}
          </TableBody>
        </Table>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">
              Página <strong className="text-foreground">{page + 1}</strong> de <strong className="text-foreground">{totalPages}</strong>
              {" · "}
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount} contatos
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />Anterior
              </Button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i).map(i => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-8 h-8 rounded text-sm font-medium transition-colors ${i === page ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
                Próxima<ChevronDown className="h-4 w-4 ml-1 rotate-[-90deg]" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {editingLead && (
        <EditLeadDialog
          lead={editingLead}
          lists={lists}
          open={!!editingLead}
          onOpenChange={(o) => { if (!o) setEditingLead(null); }}
          onSaved={() => { setEditingLead(null); loadRows(page); }}
        />
      )}
    </div>
  );
}

function EditLeadDialog({ lead, lists, onSaved, open, onOpenChange }: { lead: any; lists: LeadList[]; onSaved: () => void; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open! : internalOpen;
  const setOpen = (o: boolean) => { isControlled ? onOpenChange?.(o) : setInternalOpen(o); };

  const [nome, setNome] = useState(lead.nome);
  const [telefone, setTelefone] = useState(lead.telefone);
  const [observacoes, setObservacoes] = useState(lead.observacoes ?? "");
  const [status, setStatus] = useState(lead.status);
  const [listId, setListId] = useState<string>(lead.list_id ?? "none");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("leads").update({
      nome, telefone: normalizePhone(telefone), observacoes: observacoes || null,
      status: status as any, list_id: listId === "none" ? null : listId,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead atualizado");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Nome</label>
            <Input value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Telefone</label>
            <Input value={telefone} onChange={e => setTelefone(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map(k => <SelectItem key={k} value={k}>{LEAD_STATUS_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Lista</label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem lista</SelectItem>
                  {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Observação</label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLeadButton({ lead, onDeleted }: { lead: any; onDeleted: () => void }) {
  async function del() {
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lead excluído");
    onDeleted();
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {lead.nome}?</AlertDialogTitle>
          <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={del} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateListDialog({ onCreated, userId }: { onCreated: (id: string) => void; userId?: string }) {
  const today = formatDatePrefix();
  // Nome começa já com a data de hoje no formato DD/MM/AAAA
  const [nome, setNome] = useState(`${today} - `);
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!nome.trim() || !userId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("lead_lists")
      .insert({ nome: nome.trim(), descricao: descricao.trim() || null, created_by: userId })
      .select("id")
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Lista criada");
    onCreated(data!.id);
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova lista de leads</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Nome</label>
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder={`${today} - Nome da campanha`} />
          <p className="text-xs text-muted-foreground mt-1">Formato sugerido: DD/MM/AAAA - Nome da campanha</p>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Descrição (opcional)</label>
          <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !nome.trim()}>Criar lista</Button>
      </DialogFooter>
    </DialogContent>
  );
}

type ParsedRow = { nome: string; telefone: string; raw: string };

function parseInput(text: string): ParsedRow[] {
  return text.split(/\r?\n/).map(line => {
    const t = line.trim();
    if (!t) return null;
    const parts = t.split(/\t|;|,/).map(p => p.trim()).filter(Boolean);
    let nome = "", telefone = "";
    if (parts.length >= 2) { nome = parts[0]; telefone = parts.slice(1).join(" "); }
    else { telefone = parts[0]; nome = ""; }
    return { nome, telefone, raw: t };
  }).filter(Boolean) as ParsedRow[];
}

function AddLeadsDialog({ lists, defaultListId, onDone }: { lists: LeadList[]; defaultListId?: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<{ inserted: number; duplicates: number; invalid: number } | null>(null);
  const [useCustomList, setUseCustomList] = useState(false);
  const [customListId, setCustomListId] = useState<string>(defaultListId ?? "none");

  const parsed = useMemo(() => parseInput(text), [text]);
  const analyzed = useMemo(() => {
    const seen = new Set<string>();
    return parsed.map(p => {
      const d = normalizePhone(p.telefone);
      const valid = isValidBRPhone(d);
      const dupInBatch = seen.has(d);
      if (d) seen.add(d);
      return { ...p, digits: d, valid, dupInBatch };
    });
  }, [parsed]);

  async function getTodayListId(): Promise<string> {
    const today = formatDatePrefix();
    const { data: existing } = await supabase.from("lead_lists").select("id").eq("nome", today).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: user } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("lead_lists")
      .insert({ nome: today, descricao: `Leads do dia ${today}`, created_by: user.user?.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return created!.id;
  }

  async function save() {
    if (!analyzed.length) return;
    setSaving(true);
    try {
      const listId = useCustomList
        ? (customListId === "none" ? null : customListId)
        : await getTodayListId();

      const validRows = analyzed.filter(r => r.valid && !r.dupInBatch);
      const phones = Array.from(new Set(validRows.map(r => r.digits)));

      // Checagem de duplicatas em lotes de 200 para não estourar o .in()
      const BATCH = 200;
      const existingSet = new Set<string>();
      for (let i = 0; i < phones.length; i += BATCH) {
        const chunk = phones.slice(i, i + BATCH);
        const { data: existing, error } = await supabase.from("leads").select("telefone").in("telefone", chunk);
        if (error) throw new Error(error.message);
        (existing ?? []).forEach((e: any) => existingSet.add(e.telefone));
      }

      const toInsert = validRows.filter(r => !existingSet.has(r.digits)).map(r => ({
        nome: r.nome || `Lead ${r.digits.slice(-4)}`,
        telefone: r.digits,
        status: "novo" as const,
        list_id: listId,
        origem: "manual",
      }));

      let insertedCount = 0;
      if (toInsert.length) {
        const { error, count } = await supabase.from("leads").insert(toInsert, { count: "exact" });
        if (error) throw new Error(error.message);
        insertedCount = count ?? toInsert.length;
      }
      const duplicates = analyzed.filter(r => r.valid && (r.dupInBatch || existingSet.has(r.digits))).length;
      const invalid = analyzed.filter(r => !r.valid).length;
      setReport({ inserted: insertedCount, duplicates, invalid });
      toast.success(`${insertedCount} adicionados · ${duplicates} duplicados · ${invalid} inválidos`);
      if (insertedCount > 0) onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const previewInvalid = analyzed.filter(r => !r.valid).slice(0, 5);
  const previewDup = analyzed.filter(r => r.valid && r.dupInBatch).slice(0, 5);
  const todayName = formatDatePrefix();

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Adicionar leads</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {useCustomList ? (
                <span className="text-muted-foreground">Lista selecionada manualmente</span>
              ) : (
                <>
                  <Badge variant="secondary">{todayName}</Badge>
                  <span className="text-muted-foreground">Lista de hoje (automático)</span>
                </>
              )}
            </div>
            <button
              onClick={() => setUseCustomList(v => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {useCustomList ? "Usar lista de hoje" : "Escolher outra lista"}
            </button>
          </div>
          {useCustomList && (
            <Select value={customListId} onValueChange={setCustomListId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma lista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem lista</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block flex items-center gap-2">
            <Upload className="h-4 w-4" /> Cole nome e telefone (um por linha)
          </label>
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={8}
            placeholder={"João Silva, 22988887777\nMaria, 22933224455\n..."} />
          <p className="text-xs text-muted-foreground mt-1">Separe nome e telefone por vírgula. Se só houver telefone, será criado um nome padrão.</p>
        </div>

        {analyzed.length > 0 && (
          <Card className="p-3 text-sm space-y-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span><strong>{analyzed.length}</strong> linhas</span>
              <span className="text-success">✓ {analyzed.filter(r => r.valid && !r.dupInBatch).length} válidos</span>
              <span className="text-warning flex items-center gap-1"><Copy className="h-3 w-3" /> {analyzed.filter(r => r.dupInBatch).length} duplicados na lista</span>
              <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {analyzed.filter(r => !r.valid).length} inválidos</span>
            </div>
            {previewInvalid.length > 0 && <div className="text-xs text-destructive">Inválidos: {previewInvalid.map(r => r.raw).join(" · ")}</div>}
            {previewDup.length > 0 && <div className="text-xs text-warning">Duplicados: {previewDup.map(r => r.raw).join(" · ")}</div>}
          </Card>
        )}

        {report && (
          <div className="text-sm text-muted-foreground">
            Resultado: <strong className="text-success">{report.inserted}</strong> adicionados, <strong>{report.duplicates}</strong> já existiam, <strong>{report.invalid}</strong> inválidos.
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !analyzed.length}>Importar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ColumnMenu({ col, sort, groupBy, onSort, onClearSort, onGroup, onUngroup, statusFilter, onStatusFilter }: {
  col: ColKey; sort: { col: ColKey; dir: "asc" | "desc" } | null; groupBy: ColKey | null;
  onSort: (dir: "asc" | "desc") => void; onClearSort: () => void;
  onGroup: () => void; onUngroup: () => void;
  statusFilter?: string; onStatusFilter?: (s: string) => void;
}) {
  const isSorted = sort?.col === col;
  const isGrouped = groupBy === col;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1 -mx-2 px-2 py-1 rounded hover:bg-muted/60 text-sm font-medium">
          {COL_LABELS[col]}
          {isSorted && (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          {isGrouped && <Layers className="h-3 w-3" />}
          {col === "status" && statusFilter && statusFilter !== "all" && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Ordenar</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onSort("asc")}><ArrowUp className="h-4 w-4 mr-2" />Crescente (A→Z)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSort("desc")}><ArrowDown className="h-4 w-4 mr-2" />Decrescente (Z→A)</DropdownMenuItem>
        {isSorted && <DropdownMenuItem onClick={onClearSort}>Limpar ordenação</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Agrupar</DropdownMenuLabel>
        {!isGrouped ? (
          <DropdownMenuItem onClick={onGroup}><Layers className="h-4 w-4 mr-2" />Agrupar por {COL_LABELS[col]}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onUngroup}><XIcon className="h-4 w-4 mr-2" />Desagrupar</DropdownMenuItem>
        )}
        {col === "status" && onStatusFilter && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onStatusFilter("all")}>{statusFilter === "all" && "✓ "}Todos</DropdownMenuItem>
            {LEAD_STATUSES.map(k => (
              <DropdownMenuItem key={k} onClick={() => onStatusFilter(k)}>{statusFilter === k && "✓ "}{LEAD_STATUS_LABELS[k]}</DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const LEAD_FIELDS = [
  { value: "nome", label: "Nome" }, { value: "telefone", label: "Telefone" },
  { value: "status", label: "Status" }, { value: "list_name", label: "Lista (nome)" },
  { value: "list_id", label: "Lista (ID)" }, { value: "observacoes", label: "Última observação" },
  { value: "origem", label: "Origem" }, { value: "gerente", label: "Gerente" },
  { value: "prioridade", label: "Prioridade" }, { value: "proximo_followup", label: "Próximo follow-up" },
  { value: "created_at", label: "Criado em" }, { value: "updated_at", label: "Atualizado em" },
];
const DEFAULT_MAPPING = [
  { field: "nome", label: "Nome" }, { field: "telefone", label: "Telefone" },
  { field: "status", label: "Status" }, { field: "list_name", label: "Lista" },
  { field: "observacoes", label: "Última observação" },
  { field: "created_at", label: "Criado em" }, { field: "updated_at", label: "Atualizado em" },
];
const MAP_KEY = "sheets_mapping_v1";

function SheetsSyncButton() {
  const [open, setOpen] = useState(false);
  const [mapping, setMapping] = useState<{ field: string; label: string }[]>(() => {
    try {
      const s = localStorage.getItem(MAP_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        // Valida que é um array com ao menos um item com field e label
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].field && parsed[0].label) return parsed;
      }
    } catch {}
    return DEFAULT_MAPPING;
  });
  const [syncing, setSyncing] = useState(false);

  const save = (m: typeof mapping) => { setMapping(m); localStorage.setItem(MAP_KEY, JSON.stringify(m)); };

  async function doSync() {
    setSyncing(true);
    const t = toast.loading("Sincronizando com Google Sheets...");
    const { data, error } = await supabase.functions.invoke("sheets-sync", { body: { mapping } });
    toast.dismiss(t);
    setSyncing(false);
    if (error || !data?.success) toast.error("Falha: " + (data?.error ?? error?.message ?? "erro"));
    else toast.success(`Sincronizado: ${data.rows} linhas, ${data.columns} colunas`);
  }

  return (
    <>
      <Button variant="outline" onClick={doSync} disabled={syncing}>
        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />Sincronizar Sheets
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} title="Configurar colunas">
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Mapeamento de colunas — Google Sheets</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            <p className="text-sm text-muted-foreground">Defina a ordem e o nome das colunas que serão escritas na planilha.</p>
            {mapping.map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-6">{i + 1}</span>
                <Select value={m.field} onValueChange={v => save(mapping.map((x, j) => j === i ? { ...x, field: v } : x))}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={m.label} onChange={e => save(mapping.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Título da coluna" className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => save(mapping.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                <div className="flex flex-col">
                  <button className="text-xs px-1" disabled={i === 0} onClick={() => { const c = [...mapping]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; save(c); }}>▲</button>
                  <button className="text-xs px-1" disabled={i === mapping.length - 1} onClick={() => { const c = [...mapping]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; save(c); }}>▼</button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => save([...mapping, { field: "nome", label: "Nova coluna" }])}>
              <Plus className="h-4 w-4 mr-1" />Adicionar coluna
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => save(DEFAULT_MAPPING)}>Restaurar padrão</Button>
            <Button onClick={() => { setOpen(false); doSync(); }}>Salvar e sincronizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportFromSheetsButton({ onDone }: { onDone: () => void | Promise<void> }) {
  const [loading, setLoading] = useState(false);
  async function run() {
    if (!confirm("Importar leads das abas 'Leads dia 1/2/3' da planilha matriz? Leads existentes (mesmo telefone na mesma lista) serão atualizados.")) return;
    setLoading(true);
    const t = toast.loading("Importando da planilha...");
    const { data, error } = await supabase.functions.invoke("sheets-import", { body: {} });
    toast.dismiss(t);
    setLoading(false);
    if (error || !data?.success) { toast.error("Falha: " + (data?.error ?? error?.message ?? "erro")); return; }
    toast.success(`Importado: ${data.imported} novos · ${data.updated} atualizados · ${data.skipped} ignorados`);
    await onDone();
  }
  return (
    <Button variant="outline" onClick={run} disabled={loading}>
      <Upload className={`h-4 w-4 mr-2 ${loading ? "animate-pulse" : ""}`} />Importar da planilha
    </Button>
  );
}