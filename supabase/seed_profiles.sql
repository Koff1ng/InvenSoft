-- ============================================
-- Insert Profiles for Auth Users
-- Run this in Supabase SQL Editor AFTER schema_complete.sql
-- ============================================

INSERT INTO public.profiles (id, full_name, role, area_id, sede_id) VALUES
  ('7db0296c-2f76-4049-ab62-eb412334075a', 'Admin La Comitiva', 'admin', NULL, NULL),
  ('2f030dd2-0385-44b5-992c-07d7c4ec64c7', 'Jefe de Servicio', 'service_manager', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('9557d08a-cc4a-482f-9e7b-edd778c6cb8c', 'Jefe de Cocina', 'kitchen_manager', 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('cb02a6cf-4827-4754-99c6-f882b4883ae1', 'Jefe de Bar', 'bar_manager', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001');

-- Update inventory items to set updated_by to admin
UPDATE public.inventory_items SET updated_by = '7db0296c-2f76-4049-ab62-eb412334075a';
