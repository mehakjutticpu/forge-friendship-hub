-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  uid text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  about text DEFAULT 'Hey there! I am using Shopify Research Tools.',
  last_seen timestamptz DEFAULT now(),
  show_last_seen boolean NOT NULL DEFAULT true,
  show_avatar boolean NOT NULL DEFAULT true,
  allow_requests boolean NOT NULL DEFAULT true,
  read_receipts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- FRIEND REQUESTS
CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own requests" ON public.friend_requests FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "send requests" ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);
CREATE POLICY "respond to requests" ON public.friend_requests FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id OR auth.uid() = sender_id);
CREATE POLICY "delete own requests" ON public.friend_requests FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- FRIENDSHIP HELPER
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE status = 'accepted'
      AND ((sender_id = _a AND receiver_id = _b) OR (sender_id = _b AND receiver_id = _a))
  )
$$;

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text,
  kind text NOT NULL DEFAULT 'text',
  media_url text,
  duration_seconds numeric,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_pair_idx ON public.messages (sender_id, receiver_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own conversation" ON public.messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "send to friends" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.are_friends(sender_id, receiver_id));
CREATE POLICY "update own conversation" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "delete own messages" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- CALL SIGNALING
CREATE TABLE public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  type text NOT NULL,
  media text NOT NULL DEFAULT 'audio',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_signals_to_idx ON public.call_signals (to_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own signals" ON public.call_signals FOR SELECT TO authenticated
  USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "send signals to friends" ON public.call_signals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_id AND public.are_friends(from_id, to_id));
CREATE POLICY "delete own signals" ON public.call_signals FOR DELETE TO authenticated
  USING (auth.uid() = from_id OR auth.uid() = to_id);

-- GATE CONFIG (server-only, no grants to anon/authenticated)
CREATE TABLE public.gate_config (
  id int PRIMARY KEY DEFAULT 1,
  password_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gate_single_row CHECK (id = 1)
);
GRANT ALL ON public.gate_config TO service_role;
ALTER TABLE public.gate_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.gate_config (id, password_hash) VALUES (1, NULL);

-- REALTIME
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;

-- MESSAGE EXTRAS + GATE KEY
ALTER TABLE public.messages
  ADD COLUMN reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN deleted_for_everyone boolean NOT NULL DEFAULT false;

UPDATE public.gate_config
SET password_hash = 'e71727bef5c5d1d1bf1f226927018ae9384a387ba0fd9f801335e0de56f268c4',
    updated_at = now()
WHERE id = 1;

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;