CREATE TABLE public.accounts (
  login_id text PRIMARY KEY,
  display_id text NOT NULL,
  salt text NOT NULL,
  auth_hash text NOT NULL,
  iv text NOT NULL,
  ct text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rate_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_bucket_at ON public.rate_events (bucket, at);
GRANT ALL ON public.rate_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_events_id_seq TO service_role;
ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.vaults IS 'DEPRECATED: replaced by accounts (ID + password login)';