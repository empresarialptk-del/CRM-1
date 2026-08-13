import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// ── Configuração via variáveis de ambiente (nunca hardcoded) ─────────────────
// No painel do Supabase: Settings → Edge Functions → Secrets
// Adicione: SPREADSHEET_ID = 1Gnh83p4Frw3Tb2e9WVvF8ilezbrfLEwdqaJHrTL2zw8
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DASHBOARD_SHEET = "DASHBOARD";

const STATUS_TO_SHEET: Record<string, string> = {
  novo:             "Novo",
  retornar:         "LIGAÇÃO",
  numero_errado:    "NUMERO ERRADO",
  ja_comprou:       "JÁ COMPROU",
  nao_atendeu:      "Não atendeu",
  respondeu:        "Respondeu",
  visita:           "Visita",
  proposta:         "Proposta",
  perdido:          "Perdido?",
  ignorado:         "Ignorado",
  mensagem_zap:     "Mensagem Zap",
  comprou_carro:    "COMPROU CARRO",
  quer_casa:        "QUER CASA",
  agendado:         "Proposta",
  convertido:       "JÁ COMPROU",
  sem_interesse:    "Ignorado",
  numero_bloqueado: "NUMERO ERRADO",
  nao_quer_mais:    "Ignorado",
};

// Status que contam como "encerrados" para o dashboard
const STATUS_LABELS_PT: Record<string, string> = {
  novo: "Novo", retornar: "Retornar", nao_atendeu: "Não atendeu",
  respondeu: "Respondeu", visita: "Visita", proposta: "Proposta",
  agendado: "Agendado", convertido: "Convertido", sem_interesse: "Sem interesse",
  numero_errado: "Nº errado", numero_bloqueado: "Bloqueado",
  ja_comprou: "Já comprou", comprou_carro: "Comprou carro",
  nao_quer_mais: "Não quer mais", perdido: "Perdido", ignorado: "Ignorado",
  mensagem_zap: "Mensagem Zap", quer_casa: "Quer casa",
};

const LEAD_HEADER = [
  "ID", "Nome", "Telefone", "Status", "",
  "Origem", "Perfil", "Renda estimada", "Último contato",
  "Próximo follow-up", "Canal", "Objeção principal",
  "Observações", "Responsável", "Prioridade", "Gatilho emocional",
];

const DASHBOARD_LEAD_HEADER = [...LEAD_HEADER, "Lista"];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^0/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

async function getServiceAccountToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj: any) => {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  };

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${enc(header)}.${enc(payload)}`;
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `${signingInput}.${sigBase64}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!tokenResp.ok) throw new Error(`Falha ao obter token OAuth: ${await tokenResp.text()}`);
  return (await tokenResp.json()).access_token;
}

// ── Garante que a aba existe — cria se não existir ───────────────────────────
async function ensureSheetExists(token: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const metaUrl = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`;
  const metaResp = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaResp.ok) throw new Error(`Erro ao buscar metadados: ${await metaResp.text()}`);
  const meta = await metaResp.json();
  const existingTitles: string[] = (meta.sheets ?? []).map((s: any) => s.properties.title);

  if (existingTitles.includes(sheetName)) return; // já existe

  console.log(`[INFO] Criando aba "${sheetName}" na planilha`);
  const createResp = await fetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    }),
  });
  if (!createResp.ok) throw new Error(`Erro ao criar aba "${sheetName}": ${await createResp.text()}`);
}

// ── Escreve dados em uma aba ─────────────────────────────────────────────────
async function writeSheet(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  rows: string[][]
): Promise<{ ok: boolean; error?: string; updatedCells?: number }> {
  // Garante que a aba existe antes de escrever
  try {
    await ensureSheetExists(token, spreadsheetId, sheetName);
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const range = `${sheetName}!A1:Q${rows.length}`;
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ range, majorDimension: "ROWS", values: rows }),
  });
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}` };
  const data = await resp.json();
  return { ok: true, updatedCells: data.updatedCells ?? 0 };
}

// ── Constrói cabeçalho do DASHBOARD com totais por status ────────────────────
function buildDashboardSummary(allLeads: any[]): string[][] {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Contagem por status
  const statusCount: Record<string, number> = {};
  for (const lead of allLeads) {
    statusCount[lead.status] = (statusCount[lead.status] ?? 0) + 1;
  }

  const rows: string[][] = [
    ["DASHBOARD — CRM de Lista Fria", "", `Atualizado em: ${now}`],
    ["", "", ""],
    ["Total de leads", String(allLeads.length), ""],
    ["", "", ""],
    ["Status", "Quantidade", ""],
  ];

  // Ordena por quantidade decrescente
  const sorted = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
  for (const [status, count] of sorted) {
    rows.push([STATUS_LABELS_PT[status] ?? status, String(count), ""]);
  }

  rows.push(["", "", ""]);
  rows.push(["─── Todos os leads ───", "", ""]);
  rows.push(["", "", ""]);

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Segredos via env vars ────────────────────────────────────────────────
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ausente nos secrets");

    const spreadsheetId = Deno.env.get("SPREADSHEET_ID");
    if (!spreadsheetId) throw new Error("SPREADSHEET_ID ausente nos secrets do Supabase");

    const sa = JSON.parse(saJson);
    console.log(`[INFO] Obtendo token OAuth2 para ${sa.client_email}`);
    const token = await getServiceAccountToken(sa);
    console.log(`[INFO] Token obtido com sucesso`);

    // ── Autenticação do usuário ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(
      JSON.stringify({ error: "Não autenticado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(
      JSON.stringify({ error: "Não autenticado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Busca todas as listas ─────────────────────────────────────────────────
    const { data: lists, error: listsErr } = await supabase
      .from("lead_lists")
      .select("id, nome")
      .order("created_at", { ascending: true });

    if (listsErr) throw new Error("Erro ao buscar listas: " + listsErr.message);
    if (!lists?.length) return new Response(
      JSON.stringify({ success: true, message: "Nenhuma lista encontrada", rows: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    let totalRows = 0;
    const results: Record<string, any> = {};
    const allDashboardLeads: any[] = [];
    const dashboardLeadRows: string[][] = [];

    // ── Processa cada lista → escreve aba própria ─────────────────────────────
    for (const list of lists) {
      const sheetName = list.nome;

      const { data: leads, error: leadsErr } = await supabase
        .from("leads")
        .select("*")
        .eq("list_id", list.id)
        .order("nome", { ascending: true });

      if (leadsErr) {
        console.log(`[ERRO] Lista "${sheetName}": ${leadsErr.message}`);
        results[sheetName] = { error: leadsErr.message };
        continue;
      }

      if (!leads?.length) {
        console.log(`[INFO] Lista "${sheetName}": sem leads, pulando`);
        results[sheetName] = { rows: 0, skipped: true };
        continue;
      }

      const dataRows: string[][] = [LEAD_HEADER];
      for (const lead of leads) {
        const statusLabel = STATUS_TO_SHEET[lead.status] ?? "Novo";
        const phone = formatPhone(lead.telefone ?? "");
        const row = [
          lead.id ?? "", lead.nome ?? "", phone, statusLabel, "",
          lead.origem ?? "", "", "", "",
          lead.proximo_followup ?? "", "", "",
          lead.observacoes ?? "", lead.gerente ?? "", lead.prioridade ?? "", "",
        ];
        dataRows.push(row);
        allDashboardLeads.push(lead);
        dashboardLeadRows.push([...row, sheetName]);
      }

      console.log(`[INFO] Escrevendo aba "${sheetName}": ${leads.length} leads`);
      const result = await writeSheet(token, spreadsheetId, sheetName, dataRows);
      if (!result.ok) {
        console.log(`[ERRO] "${sheetName}": ${result.error}`);
        results[sheetName] = { error: result.error };
      } else {
        console.log(`[INFO] "${sheetName}": ${result.updatedCells} células atualizadas`);
        results[sheetName] = { rows: leads.length, updatedCells: result.updatedCells };
        totalRows += leads.length;
      }
    }

    // ── Escreve DASHBOARD com totais por status + todos os leads ─────────────
    if (allDashboardLeads.length > 0) {
      const summaryRows = buildDashboardSummary(allDashboardLeads);

      // Ordena leads por nome para o dashboard
      dashboardLeadRows.sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? "", "pt-BR", { sensitivity: "base" }));

      const dashData = [
        ...summaryRows,
        DASHBOARD_LEAD_HEADER,
        ...dashboardLeadRows,
      ];

      console.log(`[INFO] Escrevendo DASHBOARD: ${allDashboardLeads.length} leads + resumo por status`);
      const dashResult = await writeSheet(token, spreadsheetId, DASHBOARD_SHEET, dashData);
      if (!dashResult.ok) {
        console.log(`[ERRO] DASHBOARD: ${dashResult.error}`);
        results[DASHBOARD_SHEET] = { error: dashResult.error };
      } else {
        console.log(`[INFO] DASHBOARD: ${dashResult.updatedCells} células atualizadas`);
        results[DASHBOARD_SHEET] = { rows: allDashboardLeads.length, updatedCells: dashResult.updatedCells };
      }
    }

    return new Response(
      JSON.stringify({ success: true, rows: totalRows, columns: LEAD_HEADER.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[ERRO GERAL] ${msg}`);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});