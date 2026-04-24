-- Add username column to profiles for non-email login support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
