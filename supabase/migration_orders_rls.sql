-- Harden public.orders RLS (replaces permissive allow_all_orders).
-- Run in Supabase SQL Editor if your project still has allow_all_orders.

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_area_id()
RETURNS UUID AS $$
  SELECT area_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "allow_all_orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin" ON public.orders;
DROP POLICY IF EXISTS "orders_update_creator_send" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin_sent" ON public.orders;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR area_id = public.get_user_area_id()
    OR area_id IN (SELECT id FROM public.areas WHERE parent_id = public.get_user_area_id())
  );

CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.get_user_role() = 'admin'
      OR area_id = public.get_user_area_id()
      OR area_id IN (SELECT id FROM public.areas WHERE parent_id = public.get_user_area_id())
    )
  );

CREATE POLICY "orders_update_admin" ON public.orders FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

CREATE POLICY "orders_update_creator_send" ON public.orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'borrador')
  WITH CHECK (created_by = auth.uid() AND status = 'enviado');

CREATE POLICY "orders_delete_admin_sent" ON public.orders FOR DELETE TO authenticated
  USING (public.get_user_role() = 'admin' AND status = 'enviado');
