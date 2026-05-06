-- ============================================
-- Migración: Linkear sub-áreas existentes con parent_id
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================

-- 1. Agregar columna parent_id
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.areas(id);

-- 2. Linkear sub-áreas de COCINA
UPDATE public.areas SET parent_id = (SELECT id FROM public.areas WHERE slug = 'cocina')
WHERE slug IN ('pescados', 'parrilla', 'fritos', 'bodega-cocina', 'emplatado', 'salsas', 'desayuno', 'cocina-fria');

-- 3. Linkear sub-áreas de BAR
UPDATE public.areas SET parent_id = (SELECT id FROM public.areas WHERE slug = 'bar')
WHERE slug IN ('bar-fyl');

-- 4. Linkear sub-áreas de SERVICIO
UPDATE public.areas SET parent_id = (SELECT id FROM public.areas WHERE slug = 'servicio')
WHERE slug IN ('bodega-oficina');

-- 5. Verificar
SELECT a.name AS area, a.slug, p.name AS parent
FROM public.areas a
LEFT JOIN public.areas p ON a.parent_id = p.id
ORDER BY COALESCE(p.name, a.name), a.parent_id NULLS FIRST, a.name;
