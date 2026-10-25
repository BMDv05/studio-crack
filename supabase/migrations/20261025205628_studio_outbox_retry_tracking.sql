ALTER TABLE public.email_outbox ADD COLUMN "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
