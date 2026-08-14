import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Headphones } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
  name: z.string().trim().min(2).max(80).optional(),
});

// Código de acesso visitante — mude para compartilhar com alguém
const VISITOR_CODE = "renatajoias2026";

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("login");
  const [visitorCode, setVisitorCode] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      email: String(fd.get("email")||""),
      password: String(fd.get("password")||""),
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      navigate("/dialer");
    } catch (err: any) {
      toast.error(err.message || "E-mail ou senha incorretos");
    } finally { setLoading(false); }
  }

  function handleVisitorAccess() {
    if (visitorCode.trim() === VISITOR_CODE) {
      localStorage.setItem("renatajoias_visitor", "true");
      navigate("/pipeline");
      toast.success("Acesso visitante ativado — somente visualização");
    } else {
      toast.error("Código inválido");
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-gradient-deep text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-brand flex items-center justify-center shadow-elegant">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display font-bold text-xl">Renata Joias</div>
            <div className="text-xs text-white/60 uppercase tracking-widest">Central de atendimento</div>
          </div>
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight mb-4">
            Cada ligação<br/>conta uma história.
          </h1>
          <p className="text-white/70 max-w-md">
            Discagem ágil, feedback instantâneo e métricas claras para você e sua equipe.
          </p>
        </div>
        <div className="text-xs text-white/50">© Renata Joias</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-card">
          <h2 className="font-display text-2xl font-bold mb-1">Entrar</h2>
          <p className="text-sm text-muted-foreground mb-6">Acesse sua conta de atendente</p>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <form onSubmit={onSubmit} className="space-y-4">
              <TabsContent value="signup" className="space-y-4 m-0">
                <div><Label htmlFor="name">Nome completo</Label>
                  <Input id="name" name="name" placeholder="Maria Silva" /></div>
              </TabsContent>
              <div><Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" placeholder="voce@renatajoias.com" required /></div>
              <div><Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" required /></div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-brand hover:opacity-95 shadow-elegant">
                {loading ? "Carregando…" : tab === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
          </Tabs>

          {/* Acesso visitante */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-xs text-muted-foreground text-center mb-3">
              👁 Acesso de visitante — somente visualização
            </p>
            <div className="flex gap-2">
              <Input
                value={visitorCode}
                onChange={e => setVisitorCode(e.target.value)}
                placeholder="Código de visitante"
                onKeyDown={e => e.key === "Enter" && handleVisitorAccess()}
                className="text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleVisitorAccess}
                className="shrink-0">
                Entrar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}