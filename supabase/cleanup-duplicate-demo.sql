-- QRguitar duplicate demo cleanup.
-- Safe to run more than once.
-- Hides only the old QRG-0001 Reptile seed so it does not appear in the public catalog.

update public.guitars
set
  visibility = 'private',
  updated_at = now()
where qr_code = 'QRG-0001'
  and name = 'Reptile'
  and brand = 'Proper Instruments'
  and serial_number = 'PI260001';
