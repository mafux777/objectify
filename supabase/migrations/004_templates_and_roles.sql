-- Migration: Dynamic Templates + Admin Roles
-- Adds role column to profiles and creates templates table

-- 1a. Add role column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

-- 1b. Create templates table
CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  spec jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- 1c. RLS policies
-- Anyone authenticated can read templates
CREATE POLICY "Authenticated users can read templates"
  ON public.templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can insert
CREATE POLICY "Admins can insert templates"
  ON public.templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "Admins can update templates"
  ON public.templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "Admins can delete templates"
  ON public.templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 1d. Auto updated_at trigger
CREATE OR REPLACE FUNCTION public.update_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_templates_updated_at();

-- 1e. Seed existing templates (only if table is empty)
-- To regenerate: node scripts/generate-template-seed.mjs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.templates LIMIT 1) THEN
    RAISE NOTICE 'Seeding templates table with bundled templates...';
    -- Seed data is loaded via supabase/seed.sql (run: node scripts/generate-template-seed.mjs > supabase/seed.sql)
  END IF;
END $$;
