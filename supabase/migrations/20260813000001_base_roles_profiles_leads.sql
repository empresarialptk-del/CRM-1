-- Roles enum + tabelas
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

-- Status do lead, adaptado pro funil de venda de joias (sem etapas de financiamento imobiliário)
CREATE TYPE public.lead_status AS ENUM (
  'novo','nao_atendeu','retornar','respondeu','mensagem_zap',
  'interesse','negociacao',
  'aguardando_pagamento','pago','entregue','pos_venda',
  'sem_interesse','numero_errado','perdido'
);

CREATE TABLE public.lead_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  list_id UUID REFERENCES public.lead_lists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX idx_leads_list_id ON public.leads(list_id);
CREATE INDEX idx_leads_telefone ON public.leads(telefone);

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

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles select self or manager" ON public.profiles FOR SELECT
TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE
TO authenticated USING (auth.uid() = id);

CREATE POLICY "roles select self or manager" ON public.user_roles FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'gerente') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles manage admin" ON public.user_roles FOR ALL
TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "leads select all auth" ON public.leads FOR SELECT
TO authenticated USING (true);
CREATE POLICY "leads insert auth" ON public.leads FOR INSERT
TO authenticated WITH CHECK (true);
CREATE POLICY "leads update auth" ON public.leads FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leads delete auth" ON public.leads FOR DELETE
TO authenticated USING (true);

CREATE POLICY "lists select all auth" ON public.lead_lists FOR SELECT
TO authenticated USING (true);
CREATE POLICY "lists insert auth" ON public.lead_lists FOR INSERT
TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "lists update owner or manager" ON public.lead_lists FOR UPDATE
TO authenticated USING (created_by = auth.uid() OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin'));
CREATE POLICY "lists delete owner or manager" ON public.lead_lists FOR DELETE
TO authenticated USING (created_by = auth.uid() OR has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'admin'));
