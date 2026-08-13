import { useState } from "react";
import { Check, ChevronDown, ChevronUp, FileText, ClipboardList, Copy, MessageCircle } from "lucide-react";

// ── Documentos por perfil ─────────────────────────────────────────────────────
const PERFIS = [
  {
    key: "autonomo",
    label: "Autônomo / Informal",
    emoji: "💼",
    color: "#f97316",
    light: "#fff7ed",
    border: "#fed7aa",
    docs: [
      { id: "a1", texto: "Identidade (RG ou CNH)", obs: "" },
      { id: "a2", texto: "CPF", obs: "" },
      { id: "a3", texto: "Comprovante de Residência", obs: "Conta de água, luz ou gás — últimos 3 meses" },
      { id: "a4", texto: "Certidão de Nascimento", obs: "Ou certidão de casamento, se casado(a)" },
      { id: "a5", texto: "Extrato Bancário", obs: "Últimos 6 meses — com limite especial se houver" },
      { id: "a6", texto: "Imposto de Renda", obs: "Somente se declarar" },
    ],
  },
  {
    key: "clt",
    label: "CLT / Formal",
    emoji: "📋",
    color: "#059669",
    light: "#ecfdf5",
    border: "#6ee7b7",
    docs: [
      { id: "c1", texto: "Identidade (RG ou CNH)", obs: "" },
      { id: "c2", texto: "CPF", obs: "" },
      { id: "c3", texto: "Comprovante de Residência", obs: "Conta de água, luz ou gás — últimos 3 meses" },
      { id: "c4", texto: "3 Últimos Contracheques", obs: "Holerites dos últimos 3 meses" },
      { id: "c5", texto: "Certidão de Nascimento", obs: "Ou certidão de casamento, se casado(a)" },
      { id: "c6", texto: "Extrato do FGTS", obs: "Pode ser gerado pelo app FGTS" },
      { id: "c7", texto: "Carteira de Trabalho", obs: "Todas as páginas assinadas — física ou digital" },
      { id: "c8", texto: "Imposto de Renda", obs: "Somente se declarar" },
    ],
  },
];

export default function Documentacao() {
  const [checked, setChecked]     = useState<Record<string, boolean>>({});
  const [expanded, setExpanded]   = useState<Record<string, boolean>>({ autonomo: true, clt: true });
  const [activeTab, setActiveTab]   = useState<"todos" | "autonomo" | "clt">("todos");
  const [copied, setCopied]         = useState<Record<string, boolean>>({});

  function buildListText(perfil: typeof PERFIS[0]): string {
    const items = perfil.docs.map((d, i) => {
      const obs = d.obs ? ` (${d.obs})` : "";
      return `${i + 1}. ${d.texto}${obs}`;
    }).join("\n");
    const lines = [
      `📋 *Documentação MRV — ${perfil.label}*`,
      "",
      "Para darmos continuidade à sua análise de crédito, preciso dos seguintes documentos:",
      "",
      items,
      "",
      "✅ Documentos legíveis e sem rasuras",
      "✅ Casados: incluir documentos do cônjuge",
      "",
      "Qualquer dúvida estou à disposição! 😊",
      "— Pedro da MRV",
    ];
    return lines.join("\n");
  }

  async function copyList(perfil: typeof PERFIS[0]) {
    await navigator.clipboard.writeText(buildListText(perfil));
    setCopied(prev => ({ ...prev, [perfil.key]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [perfil.key]: false })), 2000);
  }

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function togglePerfil(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function resetPerfil(key: string) {
    const perfil = PERFIS.find(p => p.key === key);
    if (!perfil) return;
    setChecked(prev => {
      const next = { ...prev };
      perfil.docs.forEach(d => { delete next[d.id]; });
      return next;
    });
  }

  const visiblePerfis = activeTab === "todos"
    ? PERFIS
    : PERFIS.filter(p => p.key === activeTab);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl">Documentação MRV</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Análise de crédito — documentos necessários por perfil do cliente
        </p>
      </div>

      {/* ── Abas de perfil ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "todos",    label: "Todos os perfis" },
          { key: "autonomo", label: "💼 Autônomo" },
          { key: "clt",      label: "📋 CLT" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Cards por perfil ───────────────────────────────────────────────── */}
      {visiblePerfis.map(perfil => {
        const total    = perfil.docs.length;
        const done     = perfil.docs.filter(d => checked[d.id]).length;
        const pct      = Math.round((done / total) * 100);
        const isOpen   = expanded[perfil.key] !== false;

        return (
          <div key={perfil.key} className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: perfil.border }}>

            {/* Header do card */}
            <div className="px-5 py-4 flex items-center justify-between cursor-pointer select-none"
              style={{ backgroundColor: perfil.light }}
              onClick={() => togglePerfil(perfil.key)}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{perfil.emoji}</span>
                <div>
                  <div className="font-bold text-base" style={{ color: perfil.color }}>
                    {perfil.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {done} de {total} documentos marcados
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Progresso circular */}
                <div className="relative h-10 w-10">
                  <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none"
                      stroke={perfil.color} strokeWidth="3"
                      strokeDasharray={`${pct} ${100 - pct}`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 0.4s ease" }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ color: perfil.color }}>
                    {pct}%
                  </span>
                </div>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="h-1 bg-gray-100">
              <div className="h-1 transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: perfil.color }} />
            </div>

            {/* Lista de documentos */}
            {isOpen && (
              <div className="bg-white divide-y">
                {perfil.docs.map((doc, i) => {
                  const isDone = !!checked[doc.id];
                  return (
                    <button key={doc.id} onClick={() => toggle(doc.id)}
                      className={`w-full flex items-start gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/30 ${
                        isDone ? "bg-emerald-50/50" : ""
                      }`}>
                      {/* Número / Check */}
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2 transition-all ${
                        isDone
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-gray-200 bg-white"
                      }`} style={!isDone ? { borderColor: perfil.color + "60" } : {}}>
                        {isDone
                          ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                          : <span className="text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                        }
                      </div>
                      {/* Texto */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold leading-tight ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {doc.texto}
                        </div>
                        {doc.obs && (
                          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {doc.obs}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Rodapé com ações */}
                <div className="px-5 py-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {done === total
                        ? "✅ Documentação completa!"
                        : `Faltam ${total - done} documento${total - done > 1 ? "s" : ""}`}
                    </span>
                    {done > 0 && (
                      <button onClick={() => resetPerfil(perfil.key)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Limpar seleção
                      </button>
                    )}
                  </div>
                  {/* Botões de envio */}
                  <div className="flex gap-2">
                    <button onClick={() => copyList(perfil)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border transition-all ${
                        copied[perfil.key]
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-background border-muted text-foreground hover:bg-muted"
                      }`}>
                      {copied[perfil.key]
                        ? <><Check className="h-3.5 w-3.5" /> Copiado!</>
                        : <><Copy className="h-3.5 w-3.5" /> Copiar lista</>
                      }
                    </button>
                    <button
                      onClick={() => {
                        const msg = encodeURIComponent(buildListText(perfil));
                        window.open(`https://web.whatsapp.com/send?text=${msg}`, "_blank");
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-all">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Web
                    </button>
                    <button
                      onClick={() => {
                        const msg = encodeURIComponent(buildListText(perfil));
                        window.open(`https://wa.me/?text=${msg}`, "_blank");
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold border border-green-400 bg-green-600 text-white hover:bg-green-700 transition-all">
                      <MessageCircle className="h-3.5 w-3.5" /> App
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Observação geral ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-2">
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <ClipboardList className="h-4 w-4 shrink-0" />
          Observações importantes
        </div>
        <ul className="text-xs text-amber-900 space-y-1.5 leading-relaxed">
          <li>• Todos os documentos devem estar <strong>legíveis e sem rasuras</strong></li>
          <li>• O comprovante de residência deve estar <strong>no nome do titular</strong></li>
          <li>• Casados devem apresentar documentos do <strong>cônjuge também</strong></li>
          <li>• O extrato FGTS pode ser gerado pelo <strong>app FGTS (Caixa)</strong></li>
          <li>• Dúvidas? Entre em contato com <strong>Pedro da MRV</strong></li>
        </ul>
      </div>

    </div>
  );
}