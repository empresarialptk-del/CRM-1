import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OUTCOME_LABELS, formatDuration } from "@/lib/crm";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Phone, Clock, Trophy, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [calls, setCalls] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string,string>>({});

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate()-30);
      const { data: c } = await supabase.from("calls").select("*").gte("started_at", since.toISOString()).order("started_at",{ascending:false});
      const { data: p } = await supabase.from("profiles").select("id,full_name,email");
      setCalls(c ?? []);
      const map: Record<string,string> = {};
      (p ?? []).forEach((x:any)=> map[x.id] = x.full_name || x.email || "—");
      setProfiles(map);
    })();
  }, []);

  const totals = useMemo(()=>{
    const total = calls.length;
    const sec = calls.reduce((a,c)=>a+(c.duracao_segundos||0),0);
    const conv = calls.filter(c=>c.outcome==="convertido").length;
    const rate = total ? Math.round((conv/total)*100) : 0;
    return { total, sec, conv, rate };
  },[calls]);

  const perAgent = useMemo(()=>{
    const m: Record<string, {nome:string; ligacoes:number; tempo:number; conv:number}> = {};
    calls.forEach(c => {
      const id = c.atendente_id;
      m[id] ??= { nome: profiles[id] ?? "—", ligacoes:0, tempo:0, conv:0 };
      m[id].ligacoes++;
      m[id].tempo += c.duracao_segundos || 0;
      if (c.outcome==="convertido") m[id].conv++;
    });
    return Object.values(m).sort((a,b)=>b.ligacoes-a.ligacoes);
  },[calls, profiles]);

  const outcomeData = useMemo(()=>{
    const m: Record<string,number> = {};
    calls.forEach(c => { m[c.outcome] = (m[c.outcome]||0)+1; });
    return Object.entries(m).map(([k,v])=>({ name: OUTCOME_LABELS[k] ?? k, value: v }));
  },[calls]);

  const byDay = useMemo(()=>{
    const m: Record<string,number> = {};
    calls.forEach(c=>{
      const d = new Date(c.started_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
      m[d] = (m[d]||0)+1;
    });
    return Object.entries(m).reverse().map(([d,v])=>({ dia:d, ligacoes:v }));
  },[calls]);

  const COLORS = ["hsl(var(--primary))","hsl(var(--secondary))","hsl(var(--success))","hsl(var(--warning))","hsl(var(--destructive))","hsl(var(--muted-foreground))","hsl(var(--accent-foreground))"];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Dashboard do gerente</h1>
        <p className="text-muted-foreground">Últimos 30 dias</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={<Phone/>} label="Ligações" value={String(totals.total)} />
        <KPI icon={<Clock/>} label="Tempo total" value={formatDuration(totals.sec)} />
        <KPI icon={<Trophy/>} label="Convertidos" value={String(totals.conv)} />
        <KPI icon={<TrendingUp/>} label="Taxa de conversão" value={`${totals.rate}%`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-4">Ligações por dia</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byDay}>
                <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12}/>
                <Tooltip contentStyle={{ background:"hsl(var(--card))", border:"1px solid hsl(var(--border))", borderRadius: 8 }}/>
                <Bar dataKey="ligacoes" fill="hsl(var(--primary))" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6 shadow-card">
          <h3 className="font-display font-semibold mb-4">Distribuição de resultados</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={outcomeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {outcomeData.map((_,i)=> <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="shadow-card overflow-hidden">
        <div className="p-6 pb-3">
          <h3 className="font-display font-semibold">Desempenho por atendente</h3>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Atendente</TableHead><TableHead>Ligações</TableHead>
            <TableHead>Tempo total</TableHead><TableHead>Tempo médio</TableHead>
            <TableHead>Convertidos</TableHead><TableHead>Taxa</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {perAgent.map((a,i)=>(
              <TableRow key={i}>
                <TableCell className="font-medium">{a.nome}</TableCell>
                <TableCell className="tabular-nums">{a.ligacoes}</TableCell>
                <TableCell className="tabular-nums">{formatDuration(a.tempo)}</TableCell>
                <TableCell className="tabular-nums">{formatDuration(Math.round(a.tempo/Math.max(a.ligacoes,1)))}</TableCell>
                <TableCell className="tabular-nums">{a.conv}</TableCell>
                <TableCell><Badge variant="secondary" className="bg-success/15 text-success">{a.ligacoes ? Math.round(a.conv/a.ligacoes*100) : 0}%</Badge></TableCell>
              </TableRow>
            ))}
            {perAgent.length===0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem ligações registradas ainda.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KPI({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return (
    <Card className="p-5 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="h-9 w-9 rounded-lg bg-gradient-brand text-primary-foreground flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</div>
      </div>
      <div className="font-display text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}