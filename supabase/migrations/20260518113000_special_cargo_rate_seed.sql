INSERT INTO public.rates (
  mode,
  destination_country,
  category,
  price_per_kg,
  price_per_cbm,
  min_charge,
  currency,
  transit_days_min,
  transit_days_max,
  origin_country,
  active,
  notes,
  cargo_type,
  special_cargo_type,
  billing_unit,
  special_handling_fee
)
SELECT
  'special'::public.shipping_mode,
  'Kenya',
  item.category,
  item.price_per_kg,
  NULL,
  item.min_charge,
  'USD',
  10,
  21,
  'China',
  true,
  item.notes,
  'special',
  item.special_cargo_type,
  'kg',
  item.special_handling_fee
FROM (
  VALUES
    ('phones', 'phone', 13.00, 10.00, 0.00, 'Phones and small electronics with batteries'),
    ('batteries', 'battery', 15.00, 15.00, 0.00, 'Standalone batteries and battery cargo'),
    ('drones', 'drone', 15.00, 15.00, 0.00, 'Drones and battery-powered devices'),
    ('chemicals', 'chemical', 16.00, 20.00, 0.00, 'Accepted chemical cargo after compliance review'),
    ('perfumes', 'perfume', 14.00, 10.00, 0.00, 'Perfumes and fragrance cargo'),
    ('liquids', 'liquid', 14.00, 10.00, 0.00, 'Liquids requiring special handling'),
    ('magnets', 'magnet', 14.00, 10.00, 0.00, 'Magnetic cargo requiring special handling'),
    ('special', 'other', 14.00, 10.00, 0.00, 'Other approved special cargo')
) AS item(category, special_cargo_type, price_per_kg, min_charge, special_handling_fee, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rates r
  WHERE r.destination_country = 'Kenya'
    AND r.mode = 'special'::public.shipping_mode
    AND r.cargo_type = 'special'
    AND r.special_cargo_type = item.special_cargo_type
);
