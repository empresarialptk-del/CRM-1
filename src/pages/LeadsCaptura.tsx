import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase as crmBanco } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Clock, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Send, Pencil, Check, X,
  MessageCircle, Flame, Phone, Mail, DollarSign,
  Calendar, Package, FileText, ArrowRightCircle
} from "lucide-react";
import { toast } from "sonner";

const siteBanco = createClient(
  "https://okwqamdrgwbfyncqcide.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rd3FhbWRyZ3diZnluY3FjaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTg4NjksImV4cCI6MjA5NDE5NDg2OX0.g31os5TAoLaEPHyGGTg67r6BmxnoSxemMRklkO3d9zM"
);

const FUNIL_OPTIONS = ["parque-ilhabela-v1","parque-ilhabela-v2","parque-ilhabela-v3","parque-ilhabela-jovens","parque-ilhabela-fgts"];

const TEMPERATURA: Record<string,{label:string;color:string;bg:string}> = {
  "Quero comprar agora":      {label:"🔥 Quente",      color:"text-red-700",    bg:"bg-red-50 border-red-200"},
  "Em até 3 meses":           {label:"🌡️ Morno",       color:"text-orange-700", bg:"bg-orange-50 border-orange-200"},
  "Em até 6 meses":           {label:"❄️ Frio",        color:"text-blue-700",   bg:"bg-blue-50 border-blue-200"},
  "Ainda estou pesquisando":  {label:"🔍 Pesquisando", color:"text-gray-600",   bg:"bg-gray-50 border-gray-200"},
};

type Lead = {
  id:string; nome:string; telefone:string; email:string|null;
  renda:string|null; momento:string|null; fgts:string|null;
  obs:string|null; funil:string|null; status:string|null;
  origem:string|null; created_at:string;
};

function InfoChip({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium mb-0.5">{icon} {label}</div>
      <div className="text-sm text-gray-800 font-medium truncate">{value}</div>
    </div>
  );
}

export default function LeadsCaptura() {
  const [leads,setLeads]               = useState<Lead[]>([]);
  const [loading,setLoading]           = useState(true);
  const [filtroFunil,setFiltroFunil]   = useState("todos");
  const [filtroTemp,setFiltroTemp]     = useState("todos");
  const [expandido,setExpandido]       = useState<string|null>(null);
  const [editando,setEditando]         = useState<string|null>(null);
  const [editForm,setEditForm]         = useState<Partial<Lead>>({});
  const [notas,setNotas]               = useState<Record<string,string>>({});
  const [enviados,setEnviados]         = useState<Set<string>>(new Set());
  const [confirmEnvio,setConfirmEnvio] = useState<Lead|null>(null);
  const [enviando,setEnviando]         = useState(false);

  async function fetchLeads() {
    setLoading(true);
    const {data,error} = await siteBanco
      .from("leads")
      .select("id,nome,telefone,email,renda,momento,fgts,obs,funil,status,origem,created_at")
      .order("created_at",{ascending:false})
      .limit(500);
    if(error) console.error(error);
    setLeads(data||[]);
    setLoading(false);
  }

  useEffect(()=>{fetchLeads();},[]);

  async function salvarEdicao(id:string) {
    const {error} = await siteBanco.from("leads").update({
      nome:editForm.nome, telefone:editForm.telefone, email:editForm.email,
      renda:editForm.renda, momento:editForm.momento, fgts:editForm.fgts, obs:editForm.obs,
    }).eq("id",id);
    if(error){toast.error("Erro ao salvar");return;}
    toast.success("Lead atualizado!");
    setEditando(null);
    setLeads(ls=>ls.map(l=>l.id===id?{...l,...editForm}:l));
  }

  async function enviarParaCRM(lead:Lead) {
    setEnviando(true);
    const nota = notas[lead.id]||"";
    const obs = [
      lead.renda   ? `Renda: ${lead.renda}`    : "",
      lead.momento ? `Momento: ${lead.momento}`: "",
      lead.fgts    ? `FGTS: ${lead.fgts}`      : "",
      lead.email   ? `Email: ${lead.email}`    : "",
      lead.obs     ? `Obs site: ${lead.obs}`   : "",
      nota         ? `Nota: ${nota}`           : "",
      `Funil: ${lead.funil||"–"}`,
    ].filter(Boolean).join(" | ");

    const {error} = await crmBanco.from("leads").insert({
      nome:lead.nome,
      telefone:lead.telefone.replace(/\D/g,""),
      observacoes:obs,
      origem:`Site – ${lead.funil||"funil-01"} – ${new Date(lead.created_at).toLocaleDateString("pt-BR")}`,
      status:"interesse",
      prioridade:lead.momento==="Quero comprar agora"?5:3,
    });
    if(error){toast.error("Erro ao enviar para o CRM");console.error(error);}
    else{toast.success(`${lead.nome} enviado para o CRM como Interesse!`);setEnviados(s=>new Set([...s,lead.id]));}
    setEnviando(false);
    setConfirmEnvio(null);
  }

  let filtrados = leads;
  if(filtroFunil!=="todos") filtrados=filtrados.filter(l=>l.funil===filtroFunil);
  if(filtroTemp!=="todos")  filtrados=filtrados.filter(l=>l.momento===filtroTemp);

  const hoje    = leads.filter(l=>l.created_at?.startsWith(new Date().toISOString().slice(0,10))).length;
  const quentes = leads.filter(l=>l.momento==="Quero comprar agora").length;
  const porFunil = FUNIL_OPTIONS
    .map(f=>({f,n:leads.filter(l=>l.funil===f).length}))
    .filter(x=>x.n>0).sort((a,b)=>b.n-a.n);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads do Site</h1>
          <p className="text-sm text-gray-500">Parque Ilha Bela · Gerencie e envie pro CRM</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} className="gap-2">
          <RefreshCw size={14} className={loading?"animate-spin":""}/> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Users size={20} className="text-blue-500 shrink-0"/>
          <div><p className="text-xs text-gray-500">Total</p><p className="text-2xl font-bold">{leads.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock size={20} className="text-green-500 shrink-0"/>
          <div><p className="text-xs text-gray-500">Hoje</p><p className="text-2xl font-bold">{hoje}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Flame size={20} className="text-red-500 shrink-0"/>
          <div><p className="text-xs text-gray-500">🔥 Quentes</p><p className="text-2xl font-bold">{quentes}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp size={20} className="text-purple-500 shrink-0"/>
          <div>
            <p className="text-xs text-gray-500">Melhor funil</p>
            <p className="text-sm font-bold">{porFunil[0]?.f??"–"} <span className="text-gray-400 font-normal">({porFunil[0]?.n??0})</span></p>
          </div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filtroFunil} onValueChange={setFiltroFunil}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os funis</SelectItem>
            {FUNIL_OPTIONS.map(f=><SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTemp} onValueChange={setFiltroTemp}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Temperatura"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Toda temperatura</SelectItem>
            {Object.keys(TEMPERATURA).map(k=>(
              <SelectItem key={k} value={k}>{TEMPERATURA[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400 ml-auto">{filtrados.length} leads</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : filtrados.length===0 ? (
        <div className="text-center py-16 text-gray-400">Nenhum lead encontrado</div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(lead=>{
            const temp     = TEMPERATURA[lead.momento||""]||null;
            const aberto   = expandido===lead.id;
            const emEdicao = editando===lead.id;
            const jaEnviado= enviados.has(lead.id);

            return (
              <Card key={lead.id} className={`border transition-all ${jaEnviado?"opacity-60 border-green-200 bg-green-50":"hover:shadow-md"}`}>
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  onClick={()=>setExpandido(aberto?null:lead.id)}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {lead.nome[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{lead.nome}</span>
                      {temp&&<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${temp.bg} ${temp.color}`}>{temp.label}</span>}
                      {jaEnviado&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">✓ No CRM</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                      <span className="font-mono">{lead.telefone}</span>
                      {lead.funil&&<span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{lead.funil}</span>}
                      <span>{new Date(lead.created_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={e=>e.stopPropagation()}>
                    <a href={`https://wa.me/55${lead.telefone.replace(/\D/g,"")}?text=${encodeURIComponent(`Olá ${lead.nome}! Sou o Pedro, consultor do Parque Ilha Bela. Vi seu interesse e quero te ajudar! 🏠`)}`}
                      target="_blank" rel="noopener"
                      className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors" title="WhatsApp">
                      <MessageCircle size={15} className="text-green-700"/>
                    </a>
                    {!jaEnviado&&(
                      <button onClick={()=>setConfirmEnvio(lead)}
                        className="w-8 h-8 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors" title="Enviar para o CRM">
                        <ArrowRightCircle size={15} className="text-blue-700"/>
                      </button>
                    )}
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {aberto?<ChevronUp size={15} className="text-gray-500"/>:<ChevronDown size={15} className="text-gray-500"/>}
                    </div>
                  </div>
                </div>

                {aberto&&(
                  <div className="border-t px-4 pb-4 pt-3 space-y-4">
                    {!emEdicao?(
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <InfoChip icon={<Phone size={13}/>} label="Telefone" value={lead.telefone}/>
                        <InfoChip icon={<Mail size={13}/>} label="E-mail" value={lead.email||"–"}/>
                        <InfoChip icon={<DollarSign size={13}/>} label="Renda" value={lead.renda||"–"}/>
                        <InfoChip icon={<Calendar size={13}/>} label="Momento" value={lead.momento||"–"}/>
                        <InfoChip icon={<Package size={13}/>} label="FGTS" value={lead.fgts||"–"}/>
                        <InfoChip icon={<FileText size={13}/>} label="Obs. site" value={lead.obs||"–"}/>
                      </div>
                    ):(
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-gray-500 font-medium">Nome</label>
                          <Input value={editForm.nome||""} onChange={e=>setEditForm(f=>({...f,nome:e.target.value}))} className="mt-1 h-8 text-sm"/></div>
                        <div><label className="text-xs text-gray-500 font-medium">Telefone</label>
                          <Input value={editForm.telefone||""} onChange={e=>setEditForm(f=>({...f,telefone:e.target.value}))} className="mt-1 h-8 text-sm"/></div>
                        <div><label className="text-xs text-gray-500 font-medium">E-mail</label>
                          <Input value={editForm.email||""} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))} className="mt-1 h-8 text-sm"/></div>
                        <div><label className="text-xs text-gray-500 font-medium">Renda</label>
                          <Select value={editForm.renda||""} onValueChange={v=>setEditForm(f=>({...f,renda:v}))}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Até R$ 2.000">Até R$ 2.000</SelectItem>
                              <SelectItem value="R$ 2.000 – R$ 4.000">R$ 2.000 – R$ 4.000</SelectItem>
                              <SelectItem value="R$ 4.000 – R$ 8.000">R$ 4.000 – R$ 8.000</SelectItem>
                              <SelectItem value="Acima de R$ 8.000">Acima de R$ 8.000</SelectItem>
                            </SelectContent>
                          </Select></div>
                        <div><label className="text-xs text-gray-500 font-medium">Momento</label>
                          <Select value={editForm.momento||""} onValueChange={v=>setEditForm(f=>({...f,momento:v}))}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Quero comprar agora">Quero comprar agora</SelectItem>
                              <SelectItem value="Em até 3 meses">Em até 3 meses</SelectItem>
                              <SelectItem value="Em até 6 meses">Em até 6 meses</SelectItem>
                              <SelectItem value="Ainda estou pesquisando">Ainda estou pesquisando</SelectItem>
                            </SelectContent>
                          </Select></div>
                        <div><label className="text-xs text-gray-500 font-medium">FGTS</label>
                          <Select value={editForm.fgts||""} onValueChange={v=>setEditForm(f=>({...f,fgts:v}))}>
                            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Sim">Sim</SelectItem>
                              <SelectItem value="Não">Não</SelectItem>
                              <SelectItem value="Não sei">Não sei</SelectItem>
                            </SelectContent>
                          </Select></div>
                        <div className="col-span-2"><label className="text-xs text-gray-500 font-medium">Observações</label>
                          <Textarea value={editForm.obs||""} onChange={e=>setEditForm(f=>({...f,obs:e.target.value}))} className="mt-1 text-sm" rows={2}/></div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mb-1">
                        <FileText size={12}/> Sua nota interna (vai pro CRM)
                      </label>
                      <Textarea value={notas[lead.id]||""} onChange={e=>setNotas(n=>({...n,[lead.id]:e.target.value}))}
                        placeholder="Ex: confirmou FGTS, quer andar alto, prefere apartamento com área privativa..."
                        rows={2} className="text-sm"/>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {!emEdicao?(
                        <Button size="sm" variant="outline" className="gap-1.5 h-8"
                          onClick={()=>{setEditando(lead.id);setEditForm(lead);}}>
                          <Pencil size={13}/> Editar dados
                        </Button>
                      ):(
                        <>
                          <Button size="sm" className="gap-1.5 h-8 bg-green-600 hover:bg-green-700" onClick={()=>salvarEdicao(lead.id)}>
                            <Check size={13}/> Salvar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={()=>setEditando(null)}>
                            <X size={13}/> Cancelar
                          </Button>
                        </>
                      )}
                      <a href={`https://wa.me/55${lead.telefone.replace(/\D/g,"")}?text=${encodeURIComponent(`Olá ${lead.nome}! 👋\n\nSou o Pedro, consultor do *Parque Ilha Bela* em Campos dos Goytacazes.\n\nVi que você tem interesse em sair do aluguel — posso te fazer uma simulação gratuita agora? 🏠`)}`}
                        target="_blank" rel="noopener">
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-green-700 border-green-200 hover:bg-green-50">
                          <MessageCircle size={13}/> WhatsApp
                        </Button>
                      </a>
                      {!jaEnviado?(
                        <Button size="sm" className="gap-1.5 h-8 bg-blue-600 hover:bg-blue-700 ml-auto"
                          onClick={()=>setConfirmEnvio(lead)}>
                          <ArrowRightCircle size={13}/> Enviar para o CRM
                        </Button>
                      ):(
                        <span className="ml-auto text-xs text-green-600 font-medium flex items-center gap-1">
                          <Check size={13}/> Já está no CRM
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!confirmEnvio} onOpenChange={()=>setConfirmEnvio(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightCircle size={18} className="text-blue-600"/> Enviar para o CRM
            </DialogTitle>
          </DialogHeader>
          {confirmEnvio&&(
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1.5 text-sm">
                <p><span className="font-semibold">👤</span> {confirmEnvio.nome}</p>
                <p><span className="font-semibold">📱</span> {confirmEnvio.telefone}</p>
                {confirmEnvio.momento&&<p><span className="font-semibold">🕐</span> {confirmEnvio.momento}</p>}
                {confirmEnvio.renda&&<p><span className="font-semibold">💰</span> {confirmEnvio.renda}</p>}
                {confirmEnvio.fgts&&<p><span className="font-semibold">📦</span> {confirmEnvio.fgts}</p>}
                {notas[confirmEnvio.id]&&<p><span className="font-semibold">📝</span> {notas[confirmEnvio.id]}</p>}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                ⚡ Vai entrar no CRM com status <strong>Interesse</strong> — etapa C do funil. Você trabalha o restante.
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={()=>setConfirmEnvio(null)} disabled={enviando}>Cancelar</Button>
                <Button className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={()=>enviarParaCRM(confirmEnvio)} disabled={enviando}>
                  {enviando?"Enviando...":<><Send size={14}/> Confirmar</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}