
DROP POLICY IF EXISTS "leads update assigned or manager" ON public.leads;
DROP POLICY IF EXISTS "leads delete manager" ON public.leads;

CREATE POLICY "leads update auth" ON public.leads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "leads delete auth" ON public.leads
  FOR DELETE TO authenticated USING (true);
