import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_COLOR, STATUS_LABELS } from "@/lib/crm";
import { Search, RefreshCw, FileText, RotateCcw, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type AuditRow = {
  id: string;
  lead_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  alterado_em: string;
  lead?: { nome: string; telefone: string };
};

// ── Labels dos campos ─────────────────────────────────────────────────────────
const CAMPO_LABELS: Record<string, { label: string; emoji: string }> = {
  status:           { label: "Status",          emoji: "🔄" },
  observacoes:      { label: "Observações",      emoji: "📝" },
  proximo_followup: { label: "Próximo follow-up",emoji: "📅" },
  nome:             { label: "Nome",             emoji: "👤" },
  telefone:         { label: "Telefone",         emoji: "📞" },
  origem:           { label: "Origem",           emoji: "🏷️" },
  list_id:          { label: "Lista",            emoji: "📋" },
};

const CAMPOS_FILTRO = [
  { value: "all",             label: "Todos os campos" },
  { value: "status",          label: "Status" },
  { value: "observacoes",     label: "Observações" },
  { value: "proximo_followup",label: "Follow-up" },
  { value: "nome",            label: "Nome" },
  { value: "telefone",        label: "Telefone" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return {
    data: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    rel:  (() => {
      const diff = Math.floor((Date.now() - d.getTime()) / 60000);
      if (diff < 1)    return "agora";
      if (diff < 60)   return `${diff}min atrás`;
      if (diff < 1440) return `${Math.floor(diff/60)}h atrás`;
      return `${Math.floor(diff/1440)}d atrás`;
    })(),
  };
}

function fmtValor(campo: string, val: string | null) {
  if (!val) return null;
  if (campo === "status") return { text: STATUS_LABELS[val] ?? val, badge: STATUS_COLOR[val] };
  if (campo === "proximo_followup") {
    try {
      const d = new Date(val);
      return { text: d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }), badge: null };
    } catch { return { text: val, badge: null }; }
  }
  if (val.length > 80) return { text: val.slice(0, 80) + "…", badge: null };
  return { text: val, badge: null };
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function HistoricoAlteracoes() {
  const navigate  = useNavigate();
  const [rows, setRows]         = useState<AuditRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [campoFiltro, setCampoFiltro] = useState("all");
  const [reverting, setReverting]    = useState<string | null>(null);
  const [page, setPage]         = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("lead_audit")
      .select("id,lead_id,campo,valor_anterior,valor_novo,alterado_em,lead:leads(nome,telefone)")
      .order("alterado_em", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);

    if (campoFiltro !== "all") q = q.eq("campo", campoFiltro);

    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data ?? []) as AuditRow[]);
    setLoading(false);
  }, [page, campoFiltro]);

  useEffect(() => { load(); }, [load]);

  // Filtro de busca local por nome
  const filtered = search.trim()
    ? rows.filter(r => r.lead?.nome.toLowerCase().includes(search.toLowerCase()))
    : rows;

  // Reverter alteração
  async function revert(row: AuditRow) {
    setReverting(row.id);
    const patch: Record<string, string | null> = { [row.campo]: row.valor_anterior };
    const { error } = await supabase.from("leads").update(patch).eq("id", row.lead_id);
    setReverting(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`↩ ${CAMPO_LABELS[row.campo]?.label ?? row.campo} revertido em ${row.lead?.nome}`);
    load();
  }

  // Agrupar por data
  const grupos: Record<string, AuditRow[]> = {};
  for (const row of filtered) {
    const dia = new Date(row.alterado_em).toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
    if (!grupos[dia]) grupos[dia] = [];
    grupos[dia].push(row);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-violet-600"/> Histórico de Alterações
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Todas as edições feitas nos leads — com opção de reverter
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-background hover:bg-muted transition-colors text-sm">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome do lead…" className="pl-8 h-9 text-sm"/>
        </div>
        <Select value={campoFiltro} onValueChange={v => { setCampoFiltro(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue/></SelectTrigger>
          <SelectContent>
            {CAMPOS_FILTRO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-20 text-center">
            <ShieldCheck className="h-14 w-14 mx-auto mb-4 text-muted-foreground/20"/>
            <p className="font-semibold text-foreground">Nenhuma alteração encontrada</p>
            <p className="text-muted-foreground text-sm mt-1">
              As edições nos leads aparecem aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos).map(([dia, items]) => (
            <div key={dia}>
              {/* Label do dia */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border"/>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2">
                  {dia}
                </span>
                <div className="h-px flex-1 bg-border"/>
              </div>

              <div className="space-y-2">
                {items.map(row => {
                  const cfg   = CAMPO_LABELS[row.campo] ?? { label: row.campo, emoji: "✏️" };
                  const dt    = fmtDatetime(row.alterado_em);
                  const vOld  = fmtValor(row.campo, row.valor_anterior);
                  const vNew  = fmtValor(row.campo, row.valor_novo);

                  return (
                    <Card key={row.id} className="shadow-card hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">

                          {/* Ícone do campo */}
                          <div className="h-9 w-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-lg shrink-0">
                            {cfg.emoji}
                          </div>

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0">
                            {/* Nome do lead + campo */}
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <button onClick={() => navigate(`/lead/${row.lead_id}`)}
                                className="font-bold text-sm hover:text-primary transition-colors flex items-center gap-1">
                                {row.lead?.nome ?? "Lead"}
                                <ExternalLink className="h-3 w-3 opacity-50"/>
                              </button>
                              <span className="text-muted-foreground text-xs">·</span>
                              <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                                <FileText className="h-3 w-3 inline mr-1"/>
                                {cfg.label}
                              </span>
                            </div>

                            {/* Antes → Depois */}
                            <div className="flex items-start gap-2 flex-wrap">
                              {/* Antes */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-muted-foreground font-semibold shrink-0">ANTES</span>
                                {vOld ? (
                                  vOld.badge ? (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full line-through ${vOld.badge}`}>
                                      {vOld.text}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded line-through max-w-[200px] truncate">
                                      {vOld.text}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs italic text-muted-foreground/50">vazio</span>
                                )}
                              </div>

                              <span className="text-muted-foreground text-sm shrink-0">→</span>

                              {/* Depois */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] text-muted-foreground font-semibold shrink-0">DEPOIS</span>
                                {vNew ? (
                                  vNew.badge ? (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${vNew.badge}`}>
                                      {vNew.text}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold max-w-[200px] truncate">
                                      {vNew.text}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs italic text-muted-foreground/50">vazio</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Hora + reverter */}
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-medium tabular-nums">{dt.hora}</div>
                              <div className="text-[10px] text-muted-foreground">{dt.rel}</div>
                            </div>
                            {row.valor_anterior !== null && (
                              <button onClick={() => revert(row)} disabled={reverting === row.id}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50">
                                <RotateCcw className="h-3 w-3"/>
                                {reverting === row.id ? "…" : "Reverter"}
                              </button>
                            )}
                          </div>

                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Paginação */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-muted disabled:opacity-40 transition-colors">
              ← Anterior
            </button>
            <span className="text-sm text-muted-foreground">Página {page + 1}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={rows.length < PAGE}
              className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-muted disabled:opacity-40 transition-colors">
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}