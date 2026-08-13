
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'atendente');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Lead status enum
CREATE TYPE public.lead_status AS ENUM (
  'novo','nao_atendeu','retornar','agendado','convertido','sem_interesse','numero_errado'
);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  gerente TEXT,
  observacoes TEXT,
  status lead_status NOT NULL DEFAULT 'novo',
  prioridade SMALLINT NOT NULL DEFAULT 2,
  proximo_followup TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_assigned ON public.leads(assigned_to);

-- Call outcomes
CREATE TYPE public.call_outcome AS ENUM (
  'atendeu','nao_atendeu','retornar','agendado','convertido','sem_interesse','numero_errado'
);

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  atendente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome call_outcome NOT NULL,
  duracao_segundos INTEGER NOT NULL DEFAULT 0,
  observacao TEXT,
  agendado_para TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_atendente ON public.calls(atendente_id);
CREATE INDEX idx_calls_lead ON public.calls(lead_id);
CREATE INDEX idx_calls_started ON public.calls(started_at);

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- updated_at trigger for leads
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'atendente');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- profiles policies
CREATE POLICY "profiles select self or manager" ON public.profiles FOR SELECT
TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE
TO authenticated USING (auth.uid() = id);

-- user_roles policies
CREATE POLICY "roles select self or manager" ON public.user_roles FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles manage admin" ON public.user_roles FOR ALL
TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- leads policies
CREATE POLICY "leads select all auth" ON public.leads FOR SELECT
TO authenticated USING (true);
CREATE POLICY "leads insert managers" ON public.leads FOR INSERT
TO authenticated WITH CHECK (public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "leads update assigned or manager" ON public.leads FOR UPDATE
TO authenticated USING (
  assigned_to = auth.uid()
  OR public.has_role(auth.uid(),'gerente')
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "leads delete manager" ON public.leads FOR DELETE
TO authenticated USING (public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));

-- calls policies
CREATE POLICY "calls select own or manager" ON public.calls FOR SELECT
TO authenticated USING (
  atendente_id = auth.uid()
  OR public.has_role(auth.uid(),'gerente')
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "calls insert own" ON public.calls FOR INSERT
TO authenticated WITH CHECK (atendente_id = auth.uid());
CREATE POLICY "calls update own or manager" ON public.calls FOR UPDATE
TO authenticated USING (
  atendente_id = auth.uid()
  OR public.has_role(auth.uid(),'gerente')
  OR public.has_role(auth.uid(),'admin')
);
