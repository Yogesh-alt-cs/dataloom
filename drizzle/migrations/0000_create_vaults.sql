CREATE TABLE public.vaults (
  id text PRIMARY KEY,
  salt text NOT NULL,
  iv text NOT NULL,
  ct text NOT NULL,
  auth_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.vaults TO service_role;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;