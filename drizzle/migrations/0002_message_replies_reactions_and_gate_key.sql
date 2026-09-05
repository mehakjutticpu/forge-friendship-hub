ALTER TABLE public.messages
  ADD COLUMN reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN deleted_for_everyone boolean NOT NULL DEFAULT false;

UPDATE public.gate_config
SET password_hash = 'e71727bef5c5d1d1bf1f226927018ae9384a387ba0fd9f801335e0de56f268c4',
    updated_at = now()
WHERE id = 1;