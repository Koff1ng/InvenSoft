export type UserRole = 'admin' | 'service_manager' | 'kitchen_manager' | 'bar_manager';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  area_id: string | null;
  sede_id: string | null;
  created_at: string;
}

export interface Area {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
}

export interface Sede {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  area_id: string;
  sede_id: string | null;
  name: string;
  unit: string;
  category: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  area_id: string;
  sede_id: string | null;
  quantity: number;
  updated_at: string;
  updated_by: string;
  // Joined fields
  product?: Product;
  area?: Area;
  sede?: Sede;
  updater?: Profile;
}

export interface InventoryUpdate {
  id: string;
  inventory_item_id: string;
  previous_qty: number;
  new_qty: number;
  updated_by: string;
  updated_at: string;
  notes: string | null;
}
