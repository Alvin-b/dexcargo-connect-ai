
ALTER TABLE public.rates ADD COLUMN IF NOT EXISTS transit_days_min int;
ALTER TABLE public.rates ADD COLUMN IF NOT EXISTS transit_days_max int;
ALTER TABLE public.rates ADD COLUMN IF NOT EXISTS origin_country text DEFAULT 'China';

INSERT INTO public.rates (mode, destination_country, category, price_per_kg, price_per_cbm, currency, transit_days_min, transit_days_max, origin_country, active, notes)
SELECT 'air'::shipping_mode, 'Kenya', 'general', 11, NULL, 'USD', 7, 14, 'China', true, 'Air freight China to Kenya'
WHERE NOT EXISTS (SELECT 1 FROM public.rates WHERE destination_country='Kenya' AND mode='air' AND COALESCE(category,'')='general');

INSERT INTO public.rates (mode, destination_country, category, price_per_kg, price_per_cbm, currency, transit_days_min, transit_days_max, origin_country, active, notes)
SELECT 'sea'::shipping_mode, 'Kenya', 'general', NULL, 54000, 'KES', 30, 45, 'China', true, 'Sea freight China to Kenya'
WHERE NOT EXISTS (SELECT 1 FROM public.rates WHERE destination_country='Kenya' AND mode='sea' AND COALESCE(category,'')='general');
