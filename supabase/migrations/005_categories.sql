-- ============================================================
-- Sinau Platform — Migration 005: Kategori Dinamis
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama       TEXT NOT NULL UNIQUE,
  urutan     INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed kategori default
INSERT INTO public.categories (nama, urutan) VALUES
  ('Matematika', 1), ('Fisika', 2), ('Kimia', 3), ('Biologi', 4),
  ('Pemrograman', 5), ('Statistika', 6), ('Ekonomi', 7), ('Bahasa', 8), ('Lainnya', 9)
ON CONFLICT (nama) DO NOTHING;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Semua authenticated bisa baca
CREATE POLICY "categories_select" ON public.categories
  FOR SELECT TO authenticated USING (true);

-- Hanya admin yang bisa insert/update/delete
CREATE POLICY "categories_admin" ON public.categories
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_categories_urutan ON public.categories(urutan);
