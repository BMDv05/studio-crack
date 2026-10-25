CREATE TABLE public.rate_limits(key text PRIMARY KEY,window_start timestamptz NOT NULL,hits integer NOT NULL DEFAULT 1);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.rate_limits TO studio_worker;
CREATE POLICY studio_backend ON public.rate_limits FOR ALL TO studio_worker USING(true) WITH CHECK(true);
