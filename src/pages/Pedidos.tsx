import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PEDIDO_STATUS_PAGAMENTO_ORDER, PEDIDO_STATUS_PAGAMENTO_LABELS, PEDIDO_STATUS_PAGAMENTO_COLOR, PEDIDO_STATUS_PAGAMENTO_EMOJI,
  PEDIDO_STATUS_ENTREGA_ORDER, PEDIDO_STATUS_ENTREGA_LABELS, PEDIDO_STATUS_ENTREGA_COLOR, PEDIDO_STATUS_ENTREGA_EMOJI,
  summarizePedido, formatPhone, formatCurrency,
  type PedidoStatusPagamento, type PedidoStatusEntrega,
} from "@/lib/crm";
import { Search, Package, RefreshCw, TrendingUp, DollarSign, Eye } from "lucide-react";

type PedidoRow = {
  id: string; numero: number; lead_id: string;
  status_pagamento: PedidoStatusPagamento; status_entrega: PedidoStatusEntrega;
  vendedor_id: string | null; desconto: number; frete: number; created_at: string;
};
type LeadRow = { id: string; nome: string; telefone: string };
type ProfileRow = { id: string; full_name: string };
type ItemRow = { pedido_id: string | null; valor: number; custo: number };

export default function Pedidos() {
  const navigate = useNavigate();
  const [pedidos, setPedidos]     = useState<PedidoRow[]>([]);
  const [leads, setLeads]         = useState<LeadRow[]>([]);
  const [profiles, setProfiles]   = useState<ProfileRow[]>([]);
  const [itensByPedido, setItensByPedido] = useState<Map<string, ItemRow[]>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [pagamentoFilter, setPagamentoFilter] = useState("all");
  const [entregaFilter, setEntregaFilter]     = useState("all");

  const leadById    = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads]);
  const profileById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pedidosData }, { data: leadsData }, { data: profilesData }, { data: itensData }] = await Promise.all([
      supabase.from("pedidos")
        .select("id,numero,lead_id,status_pagamento,status_entrega,vendedor_id,desconto,frete,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("leads").select("id,nome,telefone"),
      supabase.from("profiles").select("id,full_name"),
      supabase.from("compras").select("pedido_id,valor,custo").not("pedido_id", "is", null),
    ]);

    const itensMap = new Map<string, ItemRow[]>();
    for (const it of (itensData ?? []) as ItemRow[]) {
      if (!it.pedido_id) continue;
      const arr = itensMap.get(it.pedido_id) ?? [];
      arr.push(it);
      itensMap.set(it.pedido_id, arr);
    }

    setPedidos((pedidosData ?? []) as PedidoRow[]);
    setLeads((leadsData ?? []) as LeadRow[]);
    setProfiles((profilesData ?? []) as ProfileRow[]);
    setItensByPedido(itensMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    return pedidos.map(pedido => {
      const itens  = itensByPedido.get(pedido.id) ?? [];
      const resumo = summarizePedido(itens, pedido);
      const lead   = leadById.get(pedido.lead_id) ?? null;
      return { pedido, itens, resumo, lead };
    });
  }, [pedidos, itensByPedido, leadById]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x =>
        x.lead?.nome.toLowerCase().includes(q) ||
        x.lead?.telefone.includes(q) ||
        String(x.pedido.numero).includes(q)
      );
    }
    if (pagamentoFilter !== "all") r = r.filter(x => x.pedido.status_pagamento === pagamentoFilter);
    if (entregaFilter !== "all")   r = r.filter(x => x.pedido.status_entrega === entregaFilter);
    return r;
  }, [rows, search, pagamentoFilter, entregaFilter]);

  const summary = useMemo(() => {
    const totalVendas = rows.reduce((a, r) => a + r.resumo.total, 0);
    const totalMargem = rows.reduce((a, r) => a + r.resumo.margem, 0);
    const pendentes   = rows.filter(r => r.pedido.status_pagamento === "aguardando").length;
    return { totalVendas, totalMargem, pendentes };
  }, [rows]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7 text-primary"/> Pedidos
          </h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} de {pedidos.length} pedidos · pagamento, entrega e margem de cada venda
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <StatBox icon={<TrendingUp className="h-4 w-4"/>} label="Total em vendas" value={formatCurrency(summary.totalVendas)}/>
          <StatBox icon={<DollarSign className="h-4 w-4"/>} label="Margem estimada" value={formatCurrency(summary.totalMargem)}/>
          <StatBox icon={<Package className="h-4 w-4"/>}    label="Aguardando pagamento" value={String(summary.pendentes)}/>
        </div>
      </header>

      <Card className="p-4 mb-4 shadow-card flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, telefone ou número…" className="pl-9"/>
        </div>
        <Select value={pagamentoFilter} onValueChange={setPagamentoFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos os pagamentos"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os pagamentos</SelectItem>
            {PEDIDO_STATUS_PAGAMENTO_ORDER.map(s => (
              <SelectItem key={s} value={s}>{PEDIDO_STATUS_PAGAMENTO_EMOJI[s]} {PEDIDO_STATUS_PAGAMENTO_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={entregaFilter} onValueChange={setEntregaFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todas as entregas"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as entregas</SelectItem>
            {PEDIDO_STATUS_ENTREGA_ORDER.map(s => (
              <SelectItem key={s} value={s}>{PEDIDO_STATUS_ENTREGA_EMOJI[s]} {PEDIDO_STATUS_ENTREGA_LABELS[s]}</SelectItem>
            ))}
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
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-center">Itens</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="w-12 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded"/></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-16 text-muted-foreground">Nenhum pedido encontrado para esse filtro.</TableCell></TableRow>
            ) : filtered.map(({ pedido, itens, resumo, lead }) => (
              <TableRow key={pedido.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => lead && navigate(`/lead/${lead.id}`)}>
                <TableCell>
                  <div className="font-medium">#{pedido.numero}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(pedido.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </div>
                </TableCell>
                <TableCell>
                  {lead ? (
                    <>
                      <div className="font-medium">{lead.nome}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatPhone(lead.telefone)}</div>
                    </>
                  ) : <span className="text-xs text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="text-center tabular-nums text-muted-foreground">{itens.length}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(resumo.total)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {resumo.margemPct !== null ? `${formatCurrency(resumo.margem)} (${resumo.margemPct}%)` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-[10px] ${PEDIDO_STATUS_PAGAMENTO_COLOR[pedido.status_pagamento]}`}>
                    {PEDIDO_STATUS_PAGAMENTO_EMOJI[pedido.status_pagamento]} {PEDIDO_STATUS_PAGAMENTO_LABELS[pedido.status_pagamento]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-[10px] ${PEDIDO_STATUS_ENTREGA_COLOR[pedido.status_entrega]}`}>
                    {PEDIDO_STATUS_ENTREGA_EMOJI[pedido.status_entrega]} {PEDIDO_STATUS_ENTREGA_LABELS[pedido.status_entrega]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {pedido.vendedor_id ? (profileById.get(pedido.vendedor_id)?.full_name || "—") : "—"}
                </TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <button onClick={() => lead && navigate(`/lead/${lead.id}`)} title="Ver lead" className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                    <Eye className="h-4 w-4 text-muted-foreground"/>
                  </button>
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
