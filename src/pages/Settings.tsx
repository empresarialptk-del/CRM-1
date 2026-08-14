import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadProfile, saveProfile, resetProfile, type UserProfile } from "@/lib/profile";
import {
  User, MapPin, Clock, Target, Save, RotateCcw, LogOut,
  Bell, Settings, CheckCircle2, Palette, Gem,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<"perfil" | "metas" | "segmentacao" | "notificacoes" | "conta">("perfil");

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile(p => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveProfile(profile);
    setSaved(true);
    toast.success("Configurações salvas!");
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    resetProfile();
    setProfile(loadProfile());
    toast.info("Configurações restauradas para o padrão");
  }

  const sections = [
    { key: "perfil",        label: "Perfil",        icon: <User className="h-4 w-4" /> },
    { key: "metas",         label: "Metas",         icon: <Target className="h-4 w-4" /> },
    { key: "segmentacao",   label: "Segmentação",   icon: <Gem className="h-4 w-4" /> },
    { key: "notificacoes",  label: "Notificações",  icon: <Bell className="h-4 w-4" /> },
    { key: "conta",         label: "Conta",         icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md">
            <Settings className="h-5 w-5 text-white" />
          </div>
          Configurações
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Personalize o sistema para o seu jeito de trabalhar
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">

        {/* Sidebar de seções */}
        <nav className="space-y-1">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key as any)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                activeSection === s.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo */}
        <div className="space-y-5">

          {/* ── PERFIL ── */}
          {activeSection === "perfil" && (
            <>
              <Card className="shadow-card">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center gap-3 mb-2">
                    <User className="h-5 w-5 text-primary" />
                    <h2 className="font-display font-semibold">Seus dados</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Seu nome</Label>
                      <Input
                        value={profile.nome}
                        onChange={e => update("nome", e.target.value)}
                        placeholder="Ex: Pedro"
                      />
                      <p className="text-[11px] text-muted-foreground">Usado nos scripts de ligação e WhatsApp</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Empresa</Label>
                      <Input
                        value={profile.empresa}
                        onChange={e => update("empresa", e.target.value)}
                        placeholder="Ex: Renata Perfumes"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      Endereço da loja
                    </Label>
                    <Input
                      value={profile.endereco}
                      onChange={e => update("endereco", e.target.value)}
                      placeholder="Ex: Renata Perfumes — endereço da loja"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Aparece nas mensagens de confirmação de visita pelo WhatsApp
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Preview dos scripts */}
              <Card className="shadow-card border-dashed">
                <CardContent className="p-5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Prévia do script</p>
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <p className="text-[10px] text-muted-foreground mb-1">Abertura da ligação:</p>
                      <p className="italic">"{`{firstName}`}? Oi, aqui é o <strong>{profile.nome}</strong>. Tudo bem?..."</p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
                      <p className="text-[10px] text-muted-foreground mb-1">Mensagem WhatsApp:</p>
                      <p className="italic">"Boa tarde, {`{firstName}`}. <strong>{profile.nome}</strong> da <strong>{profile.empresa}</strong> aqui! ... <strong>{profile.endereco}</strong>"</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── METAS ── */}
          {activeSection === "metas" && (
            <Card className="shadow-card">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="h-5 w-5 text-primary" />
                  <h2 className="font-display font-semibold">Metas diárias</h2>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">
                  Aparecem nas barras de progresso do Dashboard
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>📞 Meta de ligações/dia</Label>
                    <Input
                      type="number" min="1" max="500"
                      value={profile.metaLigacoes}
                      onChange={e => update("metaLigacoes", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>🏠 Meta de visitas/dia</Label>
                    <Input
                      type="number" min="1" max="50"
                      value={profile.metaVisitas}
                      onChange={e => update("metaVisitas", Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Barras de preview */}
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Prévia das metas</p>
                  {[
                    { label: "Ligações", meta: profile.metaLigacoes, color: "bg-blue-500" },
                    { label: "Visitas",  meta: profile.metaVisitas,  color: "bg-emerald-500" },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="font-medium">0 / {m.meta}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── SEGMENTAÇÃO ── */}
          {activeSection === "segmentacao" && (
            <Card className="shadow-card">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <Gem className="h-5 w-5 text-primary" />
                  <h2 className="font-display font-semibold">Faixas de ticket</h2>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">
                  Definem os grupos automáticos de clientes (Relacionamento) com base no ticket médio de compras.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>💎 Ticket alto a partir de (R$)</Label>
                    <Input
                      type="number" min="0" step="10"
                      value={profile.ticketAltoMin}
                      onChange={e => update("ticketAltoMin", Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>🏷️ Ticket médio a partir de (R$)</Label>
                    <Input
                      type="number" min="0" step="10"
                      value={profile.ticketMedioMin}
                      onChange={e => update("ticketMedioMin", Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                  <p>💎 <strong>Ticket alto</strong>: ticket médio ≥ R$ {profile.ticketAltoMin}</p>
                  <p>🏷️ <strong>Ticket médio</strong>: ticket médio entre R$ {profile.ticketMedioMin} e R$ {profile.ticketAltoMin}</p>
                  <p>🪙 <strong>Ticket baixo</strong>: ticket médio abaixo de R$ {profile.ticketMedioMin}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── NOTIFICAÇÕES ── */}
          {activeSection === "notificacoes" && (
            <Card className="shadow-card">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <h2 className="font-display font-semibold">Horário de trabalho</h2>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">
                  Notificações de follow-up só disparam neste intervalo
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      Início do expediente
                    </Label>
                    <Input
                      type="number" min="0" max="23"
                      value={profile.horarioInicio}
                      onChange={e => update("horarioInicio", Number(e.target.value))}
                    />
                    <p className="text-[11px] text-muted-foreground">{profile.horarioInicio}:00h</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      Fim do expediente
                    </Label>
                    <Input
                      type="number" min="0" max="23"
                      value={profile.horarioFim}
                      onChange={e => update("horarioFim", Number(e.target.value))}
                    />
                    <p className="text-[11px] text-muted-foreground">{profile.horarioFim}:00h</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-800">
                    ⏰ Follow-ups serão notificados entre <strong>{profile.horarioInicio}h</strong> e <strong>{profile.horarioFim}h</strong>.
                    Fora deste horário, as notificações ficam silenciosas.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── CONTA ── */}
          {activeSection === "conta" && (
            <Card className="shadow-card">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <Settings className="h-5 w-5 text-primary" />
                  <h2 className="font-display font-semibold">Sua conta</h2>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{user?.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID</span>
                    <span className="font-mono text-xs text-muted-foreground">{user?.id?.slice(0, 8)}…</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" /> Restaurar configurações padrão
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Sair da conta
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botão salvar fixo */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {saved
                ? <><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-300" /> Salvo!</>
                : <><Save className="h-4 w-4 mr-2" /> Salvar configurações</>
              }
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}