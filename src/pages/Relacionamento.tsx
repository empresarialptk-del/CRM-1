import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LEAD_FUNNEL_COLUMNS, LEAD_FUNNEL_LOST_COLUMN, getLeadFunnelColumn,
  TICKET_TIER_LABELS, TICKET_TIER_COLOR, TICKET_TIER_EMOJI, classifyTicketTier, summarizeCompras,
  MENSAGEM_STATUS_CONTATO_LABELS, MENSAGEM_STATUS_CONTATO_COLOR, MENSAGEM_STATUS_CONTATO_EMOJI,
  estimateNextPurchase, classificarUrgenciaRecompra, URGENCIA_LABEL, URGENCIA_COLOR, daysUntilBirthday,
  formatPhone, formatCurrency, type TicketTier, type MensagemStatusContato, type RecorrenciaUrgencia,
} from "@/lib/crm";
import { loadProfile } from "@/lib/profile";
import { Search, Users, RefreshCw, Gem, TrendingUp, Eye, MessageCircle, Cake } from "lucide-react";
import { toast } from "sonner";

type Lead = { id: string; nome: string; telefone: string; status: string; list_id: string | null; assigned_to: string | null; data_nascimento: string | null };
type LeadList = { id: string; nome: string };
type ProfileRow = { id: string; full_name: string };
type LastMensagem = { status_contato: MensagemStatusContato; enviada_em: string };
type CompraRow = { lead_id: string; valor: number; quantidade: number; data_compra: string };

const ALL_COLS = [...LEAD_FUNNEL_COLUMNS, LEAD_FUNNEL_LOST_COLUMN];
const TICKET_TIERS: TicketTier[] = ["alto", "medio", "baixo", "sem_compras"];
const RECOMPRA_URGENCIAS: RecorrenciaUrgencia[] = ["critica", "atrasada", "proxima", "em_dia"];

export default function Relacionamento() {
  const navigate = useNavigate();
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [lists, setLists]           = useState<LeadList[]>([]);
  const [profiles, setProfiles]     = useState<ProfileRow[]>([]);
  const [comprasByLead, setComprasByLead] = useState<Map<string, CompraRow[]>>(new Map());
  const [lastMsgByLead, setLastMsgByLead] = useState<Map<string, LastMensagem>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [recompraFilter, setRecompraFilter] = useState("all");
  const [sortBy, setSortBy]         = useState<"gasto" | "nome">("gasto");

  const thresholds = loadProfile();
  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const load = useCallback(async () => {
    setLoading(true);
    const fetchAllLeads = async () => {
      let all: any[] = [];
      let from = 0;
      const size = 1000;
      while (true) {
        const { data, error } = await supabase.from("leads")
          .select("id,nome,telefone,status,list_id,assigned_to,data_nascimento")
          .order("nome", { ascending: true })
          .range(from, from + size - 1);
        if (error || !data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < size) break;
        from += size;
      }
      return all;
    };

    const [leadsData, { data: listsData }, { data: profilesData }, { data: comprasData }, { data: msgData }] = await Promise.all([
      fetchAllLeads(),
      supabase.from("lead_lists").select("id,nome").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name").order("full_name", { ascending: true }),
      supabase.from("compras").select("lead_id,valor,quantidade,data_compra"),
      supabase.from("mensagens").select("lead_id,status_contato,enviada_em").order("enviada_em", { ascending: false }),
    ]);

    const comprasMap = new Map<string, CompraRow[]>();
    for (const c of (comprasData ?? []) as CompraRow[]) {
      const arr = comprasMap.get(c.lead_id) ?? [];
      arr.push(c);
      comprasMap.set(c.lead_id, arr);
    }

    const lastMap = new Map<string, LastMensagem>();
    for (const m of (msgData ?? []) as { lead_id: string; status_contato: MensagemStatusContato; enviada_em: string }[]) {
      if (!lastMap.has(m.lead_id)) lastMap.set(m.lead_id, { status_contato: m.status_contato, enviada_em: m.enviada_em });
    }

    setLeads((leadsData ?? []) as Lead[]);
    setLists((listsData ?? []) as LeadList[]);
    setProfiles((profilesData ?? []) as ProfileRow[]);
    setComprasByLead(comprasMap);
    setLastMsgByLead(lastMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return leads.map(lead => {
      const compras = comprasByLead.get(lead.id) ?? [];
      const resumo = summarizeCompras(compras);
      const tier = classifyTicketTier(resumo.ticketMedio, thresholds);
      const col = getLeadFunnelColumn(lead.status);
      const lastMsg = lastMsgByLead.get(lead.id);
      const recompra = estimateNextPurchase(compras);
      const urgencia = recompra.proximaDataEstimada ? classificarUrgenciaRecompra(recompra.proximaDataEstimada) : null;
      const diasAteAniversario = daysUntilBirthday(lead.data_nascimento);
      return { lead, resumo, tier, col, lastMsg, recompra, urgencia, diasAteAniversario };
    });
  }, [leads, comprasByLead, lastMsgByLead, thresholds]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => x.lead.nome.toLowerCase().includes(q) || x.lead.telefone.includes(q));
    }
    if (listFilter !== "all") r = r.filter(x => x.lead.list_id === listFilter);
    if (stageFilter !== "all") r = r.filter(x => x.col?.key === stageFilter);
    if (tierFilter !== "all") r = r.filter(x => x.tier === tierFilter);
    if (recompraFilter !== "all") r = r.filter(x => x.urgencia === recompraFilter);
    const sorted = [...r].sort((a, b) => sortBy === "gasto" ? b.resumo.totalGasto - a.resumo.totalGasto : a.lead.nome.localeCompare(b.lead.nome));
    return sorted;
  }, [rows, search, listFilter, stageFilter, tierFilter, recompraFilter, sortBy]);

  const summary = useMemo(() => {
    const totalGasto = rows.reduce((a, r) => a + r.resumo.totalGasto, 0);
    const comCompras = rows.filter(r => r.resumo.qtdCompras > 0).length;
    const ticketGeral = comCompras > 0 ? totalGasto / rows.reduce((a, r) => a + r.resumo.qtdCompras, 0) : 0;
    return { totalGasto, comCompras, ticketGeral };
  }, [rows]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary"/> Relacionamento
          </h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} de {leads.length} leads · etapa do funil, segmento de compra e último contato num só lugar
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatBox icon={<TrendingUp className="h-4 w-4"/>} label="Total em vendas" value={formatCurrency(summary.totalGasto)}/>
          <StatBox icon={<Gem className="h-4 w-4"/>}        label="Ticket médio geral" value={summary.ticketGeral > 0 ? formatCurrency(summary.ticketGeral) : "—"}/>
          <StatBox icon={<Users className="h-4 w-4"/>}      label="Já compraram" value={String(summary.comCompras)}/>
        </div>
      </header>

      <Card className="p-4 mb-4 shadow-card flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" className="pl-9"/>
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todas as etapas"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as etapas</SelectItem>
            {ALL_COLS.map(c => <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todos os segmentos"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os segmentos</SelectItem>
            {TICKET_TIERS.map(t => <SelectItem key={t} value={t}>{TICKET_TIER_EMOJI[t]} {TICKET_TIER_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={recompraFilter} onValueChange={setRecompraFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Toda recompra"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda recompra</SelectItem>
            {RECOMPRA_URGENCIAS.map(u => <SelectItem key={u} value={u}>{URGENCIA_LABEL[u]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={listFilter} onValueChange={setListFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todas as listas"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">📋 Todas as listas</SelectItem>
            {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
          <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="gasto">Ordenar: maior gasto</SelectItem>
            <SelectItem value="nome">Ordenar: nome (A-Z)</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={load} className="ml-auto h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-muted transition-colors" title="Atualizar">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
        </button>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Etapa do funil</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead className="text-right">Total gasto</TableHead>
              <TableHead className="text-right">Ticket médio</TableHead>
              <TableHead>Recompra prevista</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded"/></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-16 text-muted-foreground">Nenhum lead encontrado para esse filtro.</TableCell></TableRow>
            ) : filtered.map(({ lead, resumo, tier, col, lastMsg, recompra, urgencia, diasAteAniversario }) => (
              <TableRow key={lead.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/lead/${lead.id}`)}>
                <TableCell>
                  <div className="font-medium flex items-center gap-1.5">
                    {lead.nome}
                    {diasAteAniversario !== null && diasAteAniversario <= 7 && (
                      <span title={diasAteAniversario === 0 ? "Aniversário hoje" : `Aniversário em ${diasAteAniversario}d`}>
                        <Cake className={`h-3.5 w-3.5 ${diasAteAniversario === 0 ? "text-pink-600" : "text-pink-400"}`}/>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">{formatPhone(lead.telefone)}</div>
                </TableCell>
                <TableCell>
                  {col && (
                    <Badge variant="secondary" style={{ backgroundColor: col.light, color: col.color }}>
                      {col.emoji} {col.label}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={TICKET_TIER_COLOR[tier]}>{TICKET_TIER_EMOJI[tier]} {TICKET_TIER_LABELS[tier]}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(resumo.totalGasto)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{resumo.ticketMedio !== null ? formatCurrency(resumo.ticketMedio) : "—"}</TableCell>
                <TableCell>
                  {recompra.proximaDataEstimada && urgencia ? (
                    <div className="space-y-0.5">
                      <Badge variant="secondary" className={`text-[10px] ${URGENCIA_COLOR[urgencia]}`}>{URGENCIA_LABEL[urgencia]}</Badge>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(recompra.proximaDataEstimada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                  ) : <span className="text-xs text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell>
                  {lastMsg ? (
                    <Badge variant="secondary" className={`text-[10px] ${MENSAGEM_STATUS_CONTATO_COLOR[lastMsg.status_contato]}`}>
                      {MENSAGEM_STATUS_CONTATO_EMOJI[lastMsg.status_contato]} {MENSAGEM_STATUS_CONTATO_LABELS[lastMsg.status_contato]}
                    </Badge>
                  ) : <span className="text-xs text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.assigned_to ? (profileById.get(lead.assigned_to)?.full_name || "—") : "Sem responsável"}
                </TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => navigate(`/lead/${lead.id}`)} title="Ver lead" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><Eye className="h-4 w-4 text-muted-foreground"/></button>
                    <button onClick={() => navigate(`/dialer?lead=${lead.id}`)} title="Enviar mensagem" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><MessageCircle className="h-4 w-4 text-muted-foreground"/></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="px-4 py-3 shadow-card flex items-center gap-3 min-w-[140px]">
      <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-display font-bold text-lg tabular-nums">{value}</div>
      </div>
    </Card>
  );
}
