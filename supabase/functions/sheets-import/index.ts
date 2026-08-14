import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// ── Configuração via variáveis de ambiente (nunca hardcoded) ─────────────────
// No painel do Supabase: Settings → Edge Functions → Secrets
// SPREADSHEET_ID    = ID da planilha (da URL: .../spreadsheets/d/<ID>/edit)
// GOOGLE_SHEETS_API_KEY = chave de API do Google Cloud com a Sheets API ativada
// SHEET_NAMES (opcional) = nomes das abas a importar, separados por vírgula.
//   Padrão: "Leads"
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const SHEET_STATUS_MAP: Record<string, string> = {
  "novo": "novo",
  "não atendeu": "nao_atendeu", "nao atendeu": "nao_atendeu", "não atende": "nao_atendeu", "nao atende": "nao_atendeu",
  "retornar": "retornar", "ligação": "retornar", "ligacao": "retornar",
  "respondeu": "respondeu", "repondeu": "respondeu",
  "mensagem zap": "mensagem_zap", "msg zap": "mensagem_zap", "whatsapp": "mensagem_zap",
  "interesse": "interesse",
  "negociação": "negociacao", "negociacao": "negociacao",
  "aguardando pagamento": "aguardando_pagamento", "aguardando pgto": "aguardando_pagamento",
  "pago": "pago", "pagamento confirmado": "pago",
  "entregue": "entregue",
  "pós-venda": "pos_venda", "pos venda": "pos_venda", "pos-venda": "pos_venda",
  "sem interesse": "sem_interesse",
  "número errado": "numero_errado", "numero errado": "numero_errado",
  "perdido": "perdido", "perdido?": "perdido",
};

// Lê célula com segurança — nunca quebra em undefined/null
function cell(row: any[], idx: number): string {
  if (idx < 0 || idx >= row.length) return "";
  const v = row[idx];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function normStatus(raw: string): string {
  if (!raw) return "novo";
  return SHEET_STATUS_MAP[raw.toLowerCase()] ?? "novo";
}

function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 12 && d.startsWith("0")) return d;
  if (d.length === 11) return "0" + d;
  if (d.length === 10) return "0" + d.slice(0,2) + "9" + d.slice(2);
  if (d.length === 9) return "031" + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const GS_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!GS_KEY) throw new Error("GOOGLE_SHEETS_API_KEY ausente nos secrets do Supabase");

    const SPREADSHEET_ID = Deno.env.get("SPREADSHEET_ID");
    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente nos secrets do Supabase");

    const SOURCE_SHEETS = (Deno.env.get("SHEET_NAMES") ?? "Leads").split(",").map(s => s.trim()).filter(Boolean);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let imported = 0, updated = 0, skipped = 0;
    const sheetResults: Record<string, any> = {};

    for (const sheetName of SOURCE_SHEETS) {
      console.log(`[INFO] Buscando aba: "${sheetName}"`);

      const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1:Z2000?key=${GS_KEY}`;
      const r = await fetch(url);

      if (!r.ok) {
        const errText = await r.text();
        console.log(`[ERRO] Aba "${sheetName}": HTTP ${r.status} - ${errText}`);
        sheetResults[sheetName] = { error: `HTTP ${r.status}` };
        continue;
      }

      const data = await r.json();
      const rows: any[][] = data.values ?? [];
      console.log(`[INFO] Aba "${sheetName}": ${rows.length} linhas`);

      if (rows.length < 2) {
        sheetResults[sheetName] = { skipped: true, reason: "menos de 2 linhas" };
        continue;
      }

      const header = rows[0].map((h: any) => String(h ?? "").trim().toLowerCase());
      const col = (name: string) => header.indexOf(name);
      const idxNome   = col("nome");
      const idxTel    = col("telefone");
      const idxStatus = col("status");
      const idxOrigem = col("origem");
      const idxObs    = col("observações") >= 0 ? col("observações") : col("observacoes");

      console.log(`[INFO] "${sheetName}" índices — nome:${idxNome} tel:${idxTel} status:${idxStatus}`);

      if (idxNome < 0 || idxTel < 0) {
        console.log(`[ERRO] "${sheetName}": Nome ou Telefone não encontrados no cabeçalho`);
        sheetResults[sheetName] = { error: "Coluna Nome ou Telefone ausente" };
        continue;
      }

      // Cria ou encontra lista
      let listId: string;
      const { data: existingList } = await supabase.from("lead_lists").select("id").eq("nome", sheetName).maybeSingle();
      if (existingList) {
        listId = existingList.id;
      } else {
        const { data: newList, error: le } = await supabase.from("lead_lists")
          .insert({ nome: sheetName, descricao: `Importado da planilha (${sheetName})`, created_by: user.id })
          .select("id").single();
        if (le) {
          console.log(`[ERRO] Falha criando lista "${sheetName}": ${le.message}`);
          sheetResults[sheetName] = { error: le.message };
          continue;
        }
        listId = newList!.id;
      }

      let si = 0, su = 0, ss = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const nome    = cell(row, idxNome);
        const telRaw  = cell(row, idxTel);
        if (!nome || !telRaw) { ss++; skipped++; continue; }
        const telefone = normPhone(telRaw);
        if (!telefone) { ss++; skipped++; continue; }
        const status      = normStatus(cell(row, idxStatus));
        const origem      = cell(row, idxOrigem) || null;
        const observacoes = cell(row, idxObs) || null;

        const { data: ex } = await supabase.from("leads").select("id").eq("telefone", telefone).eq("list_id", listId).maybeSingle();
        if (ex) {
          const { error } = await supabase.from("leads").update({ nome, status: status as any, origem, observacoes }).eq("id", ex.id);
          if (!error) { su++; updated++; } else { ss++; skipped++; }
        } else {
          const { error } = await supabase.from("leads").insert({ nome, telefone, status: status as any, origem, observacoes, list_id: listId });
          if (!error) { si++; imported++; } else { ss++; skipped++; }
        }
      }

      console.log(`[INFO] "${sheetName}" — importados:${si} atualizados:${su} pulados:${ss}`);
      sheetResults[sheetName] = { imported: si, updated: su, skipped: ss };
    }

    return new Response(JSON.stringify({ success: true, imported, updated, skipped, sheetResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[ERRO GERAL] ${msg}`);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
