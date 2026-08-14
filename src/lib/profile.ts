// ── Perfil do usuário — configurações globais do sistema ─────────────────────
// Usado em: Dialer (scripts, WA), Checkup, notificações

export type UserProfile = {
  nome: string;           // Ex: "Pedro"
  empresa: string;        // Ex: "Renata Joias"
  endereco: string;       // Ex: "ao lado da Rodoviária — Roberto Silvério"
  horarioInicio: number;  // hora (0-23) para notificações
  horarioFim: number;
  metaLigacoes: number;
  metaVisitas: number;
};

const PROFILE_KEY = "renatajoias_profile_v1";

const DEFAULT_PROFILE: UserProfile = {
  nome:          "Pedro",
  empresa:       "Renata Joias",
  endereco:      "Renata Joias — endereço da loja",
  horarioInicio: 8,
  horarioFim:    18,
  metaLigacoes:  150,
  metaVisitas:   8,
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch { return DEFAULT_PROFILE; }
}

export function saveProfile(p: UserProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

export function resetProfile(): void {
  try { localStorage.removeItem(PROFILE_KEY); } catch {}
}