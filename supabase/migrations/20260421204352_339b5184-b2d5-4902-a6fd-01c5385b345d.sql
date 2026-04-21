
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'client');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff')) $$;

CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), NEW.phone);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL UNIQUE,
  email TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clients_whatsapp ON public.clients(whatsapp_number);
CREATE POLICY "staff manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view self" ON public.clients FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============ PACKAGES ============
CREATE TYPE public.package_status AS ENUM (
  'pending','received_in_china','processing','in_transit','arrived_destination','out_for_delivery','delivered','on_hold','cancelled'
);
CREATE TYPE public.shipping_mode AS ENUM ('air','sea','express');

CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  description TEXT,
  category TEXT,
  weight_kg NUMERIC(10,2),
  length_cm NUMERIC(10,2),
  width_cm NUMERIC(10,2),
  height_cm NUMERIC(10,2),
  cbm NUMERIC(10,4),
  declared_value NUMERIC(12,2),
  shipping_cost NUMERIC(12,2),
  currency TEXT DEFAULT 'KES',
  mode shipping_mode DEFAULT 'air',
  origin TEXT DEFAULT 'China',
  destination_country TEXT,
  destination_city TEXT,
  status package_status NOT NULL DEFAULT 'pending',
  warehouse_photo_url TEXT,
  received_at TIMESTAMPTZ,
  estimated_arrival DATE,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_packages_tracking ON public.packages(tracking_number);
CREATE INDEX idx_packages_client ON public.packages(client_id);
CREATE POLICY "staff manage packages" ON public.packages FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view own packages" ON public.packages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

-- ============ PACKAGE EVENTS ============
CREATE TABLE public.package_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  status package_status NOT NULL,
  location TEXT,
  notes TEXT,
  photo_url TEXT,
  notified_client BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.package_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pkg_events_pkg ON public.package_events(package_id);
CREATE POLICY "staff manage events" ON public.package_events FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view own events" ON public.package_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.packages p JOIN public.clients c ON c.id = p.client_id
                 WHERE p.id = package_id AND c.user_id = auth.uid()));

-- ============ RATES ============
CREATE TABLE public.rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  mode shipping_mode NOT NULL,
  destination_country TEXT NOT NULL,
  price_per_kg NUMERIC(10,2),
  price_per_cbm NUMERIC(12,2),
  min_charge NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'KES',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authenticated reads rates" ON public.rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff manage rates" ON public.rates FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ CONVERSATIONS & MESSAGES ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  last_message_at TIMESTAMPTZ,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conv_wa ON public.conversations(whatsapp_number);
CREATE POLICY "staff manage conv" ON public.conversations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view own conv" ON public.conversations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE TYPE public.message_role AS ENUM ('user','assistant','system','staff');

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT,
  media_url TEXT,
  evolution_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_msg_conv ON public.messages(conversation_id);
CREATE POLICY "staff manage messages" ON public.messages FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view own messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations cv JOIN public.clients c ON c.id = cv.client_id
                 WHERE cv.id = conversation_id AND c.user_id = auth.uid()));

-- ============ MARKETING POSTS ============
CREATE TYPE public.social_platform AS ENUM ('facebook','instagram','tiktok','x');
CREATE TYPE public.post_status AS ENUM ('draft','approved','scheduled','published','failed');

CREATE TABLE public.marketing_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform social_platform NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  hashtags TEXT,
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  external_post_id TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage marketing" ON public.marketing_posts FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ PAYMENTS ============
CREATE TYPE public.payment_status AS ENUM ('pending','success','failed','cancelled');

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  phone TEXT NOT NULL,
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  mpesa_receipt TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  raw_callback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "client view own payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_clients_upd BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_packages_upd BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_rates_upd BEFORE UPDATE ON public.rates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_marketing_upd BEFORE UPDATE ON public.marketing_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_payments_upd BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('package-photos','package-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read package photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'package-photos');
CREATE POLICY "staff upload package photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'package-photos' AND public.is_staff(auth.uid()));
CREATE POLICY "staff update package photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'package-photos' AND public.is_staff(auth.uid()));
CREATE POLICY "staff delete package photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'package-photos' AND public.is_staff(auth.uid()));
