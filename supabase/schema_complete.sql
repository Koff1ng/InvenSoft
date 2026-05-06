-- ============================================
-- La Comitiva Inventarios — Complete Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- 1. Sedes table
CREATE TABLE IF NOT EXISTS public.sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Areas table
CREATE TABLE IF NOT EXISTS public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'service_manager', 'kitchen_manager', 'bar_manager')),
  area_id UUID REFERENCES public.areas(id),
  sede_id UUID REFERENCES public.sedes(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  sede_id UUID REFERENCES public.sedes(id),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unidades',
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Inventory items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  sede_id UUID REFERENCES public.sedes(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- 6. Inventory updates (audit log)
CREATE TABLE IF NOT EXISTS public.inventory_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  previous_qty NUMERIC NOT NULL,
  new_qty NUMERIC NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- 7. Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id),
  sede_id UUID REFERENCES public.sedes(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'enviado', 'aprobado')),
  category TEXT,
  notes TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Order items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unidades',
  notes TEXT
);

-- ============================================
-- Row Level Security (RLS) - DISABLE for now
-- (enable later once auth is fully tested)
-- ============================================

ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write (permissive for initial setup)
-- You can tighten these later with role-based policies

CREATE POLICY "allow_all_sedes" ON public.sedes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_areas" ON public.areas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_profiles" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_inventory_items" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_inventory_updates" ON public.inventory_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_order_items" ON public.order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- Seed Data
-- ============================================

-- Sedes
INSERT INTO public.sedes (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'La Comitiva Principal');

-- Areas
INSERT INTO public.areas (id, name, slug) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Servicio', 'servicio'),
  ('a0000000-0000-0000-0000-000000000002', 'Cocina', 'cocina'),
  ('a0000000-0000-0000-0000-000000000003', 'Bar', 'bar');

-- Products — La Comitiva insumos
INSERT INTO public.products (area_id, sede_id, name, unit, category, notes) VALUES
  -- Cocina: Cárnicos
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Costilla de Cerdo', 'kg', 'Cárnicos', 'Para costillas BBQ'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Pechuga de Pollo', 'kg', 'Cárnicos', 'Deshuesada'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Carne de Res', 'kg', 'Cárnicos', 'Lomo fino para parrilla'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Chorizo Artesanal', 'unidades', 'Cárnicos', 'Chorizo santarrosano'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Chicharrón', 'kg', 'Cárnicos', 'Para bandeja paisa'),
  -- Cocina: Abarrotes
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Arroz', 'kg', 'Abarrotes', 'Arroz Diana x 5kg'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Frijoles Rojos', 'kg', 'Abarrotes', 'Para bandeja paisa'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Salsa BBQ', 'litros', 'Abarrotes', 'La Comitiva house BBQ'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Aceite Vegetal', 'litros', 'Abarrotes', 'Para freidora'),
  -- Cocina: Fruver
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Plátano Maduro', 'unidades', 'Fruver', 'Para patacón y tajadas'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Papa Criolla', 'kg', 'Fruver', NULL),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Yuca', 'kg', 'Fruver', 'Para yuca frita'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Ajo', 'kg', 'Fruver', NULL),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Cebolla Cabezona', 'kg', 'Fruver', NULL),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Tomate', 'kg', 'Fruver', 'Tomate chonto'),
  -- Bar: Licores
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Aguardiente Antioqueño', 'botellas', 'Licores', '750ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Ron Viejo de Caldas', 'botellas', 'Licores', '750ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Whisky Old Parr', 'botellas', 'Licores', '750ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Tequila José Cuervo', 'botellas', 'Licores', '750ml Reposado'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Vodka Absolut', 'botellas', 'Licores', '750ml'),
  -- Bar: Cervezas
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Cerveza Club Colombia', 'unidades', 'Cervezas', 'Botella 330ml dorada'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Cerveza Poker', 'unidades', 'Cervezas', 'Botella 330ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Cerveza Águila', 'unidades', 'Cervezas', 'Botella 330ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Cerveza Corona', 'unidades', 'Cervezas', 'Botella 355ml'),
  -- Bar: Insumos
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Limones', 'kg', 'Fruver', 'Para cócteles'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Hielo', 'kg', 'Insumos', 'Bolsa x 3kg'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Gaseosa Coca-Cola', 'unidades', 'Bebidas', 'Pet 400ml'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Agua Cristal', 'unidades', 'Bebidas', 'Pet 600ml'),
  -- Servicio: Suministros
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Servilletas', 'paquetes', 'Suministros', 'Paquete x 100'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Vasos Cristal', 'unidades', 'Suministros', 'Vasos highball 350ml'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Platos Principales', 'unidades', 'Suministros', 'Plato llano 27cm'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Cubiertos Set', 'unidades', 'Suministros', 'Cuchillo + tenedor + cuchara'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Mantel Individual', 'unidades', 'Suministros', 'Papel kraft'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Portavasos', 'unidades', 'Suministros', 'Cartón con logo');

-- Create inventory items for each product
INSERT INTO public.inventory_items (product_id, area_id, sede_id, quantity, updated_by)
SELECT p.id, p.area_id, p.sede_id,
  CASE
    WHEN p.name = 'Costilla de Cerdo' THEN 18
    WHEN p.name = 'Pechuga de Pollo' THEN 12
    WHEN p.name = 'Carne de Res' THEN 10
    WHEN p.name = 'Chorizo Artesanal' THEN 40
    WHEN p.name = 'Chicharrón' THEN 8
    WHEN p.name = 'Arroz' THEN 25
    WHEN p.name = 'Frijoles Rojos' THEN 10
    WHEN p.name = 'Salsa BBQ' THEN 5
    WHEN p.name = 'Aceite Vegetal' THEN 20
    WHEN p.name = 'Plátano Maduro' THEN 60
    WHEN p.name = 'Papa Criolla' THEN 15
    WHEN p.name = 'Yuca' THEN 12
    WHEN p.name = 'Ajo' THEN 3
    WHEN p.name = 'Cebolla Cabezona' THEN 8
    WHEN p.name = 'Tomate' THEN 10
    WHEN p.name = 'Aguardiente Antioqueño' THEN 24
    WHEN p.name = 'Ron Viejo de Caldas' THEN 12
    WHEN p.name = 'Whisky Old Parr' THEN 6
    WHEN p.name = 'Tequila José Cuervo' THEN 8
    WHEN p.name = 'Vodka Absolut' THEN 5
    WHEN p.name = 'Cerveza Club Colombia' THEN 96
    WHEN p.name = 'Cerveza Poker' THEN 72
    WHEN p.name = 'Cerveza Águila' THEN 48
    WHEN p.name = 'Cerveza Corona' THEN 36
    WHEN p.name = 'Limones' THEN 6
    WHEN p.name = 'Hielo' THEN 30
    WHEN p.name = 'Gaseosa Coca-Cola' THEN 48
    WHEN p.name = 'Agua Cristal' THEN 60
    WHEN p.name = 'Servilletas' THEN 30
    WHEN p.name = 'Vasos Cristal' THEN 80
    WHEN p.name = 'Platos Principales' THEN 60
    WHEN p.name = 'Cubiertos Set' THEN 50
    WHEN p.name = 'Mantel Individual' THEN 200
    WHEN p.name = 'Portavasos' THEN 500
    ELSE 10
  END,
  NULL
FROM public.products p;
