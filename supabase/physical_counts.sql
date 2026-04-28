  -- Physical inventory counts table
  -- Jefes submit counts, admin approves/rejects
  CREATE TABLE IF NOT EXISTS public.physical_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id UUID NOT NULL REFERENCES public.areas(id),
    submitted_by UUID NOT NULL REFERENCES public.profiles(id),
    reviewed_by UUID REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
  );

  ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow_all_physical_counts" ON public.physical_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);
