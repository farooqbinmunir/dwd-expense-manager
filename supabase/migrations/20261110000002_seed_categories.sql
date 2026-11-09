-- Initial categories, based on the kinds of entries found in the DWD spreadsheet.
-- Admins can rename, add or deactivate categories in the app.
insert into public.categories (name, applies_to, sort_order) values
  ('Construction Materials', 'out', 10),   -- cement, building material
  ('Floor Chips',            'out', 20),   -- floor chips material + floor labour
  ('Ceiling',                'out', 30),
  ('Electrical',             'out', 40),
  ('Paint & Colour',         'out', 50),
  ('Plumbing & Sanitary',    'out', 60),   -- santri materials, plumber, water motor
  ('Labour',                 'out', 70),   -- general mistri / mazdoor work
  ('Furnishing & Fittings',  'out', 80),   -- carpet, curtains, locks, office indoor items
  ('Tools & Equipment Rental','out', 90),
  ('Transport & Fuel',       'out', 100),
  ('Food & Refreshments',    'out', 110),
  ('Other',                  'out', 200),
  ('Funds Received',         'in',  10),   -- money provided for the project
  ('Refunds & Returns',      'in',  20),   -- material returned to vendors
  ('Rent Income',            'in',  30)    -- shop rent received
on conflict do nothing;
