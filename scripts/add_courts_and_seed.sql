-- Add number_of_courts column if not exists
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS number_of_courts INTEGER DEFAULT 4;

-- Add 10 test tournaments with various court counts
-- Use existing organizer from profiles
DO $$
DECLARE
  org_id UUID;
BEGIN
  SELECT id INTO org_id FROM profiles WHERE full_name = 'Gan' LIMIT 1;
  IF org_id IS NULL THEN
    SELECT id INTO org_id FROM profiles ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO tournaments (organizer_id, title, venue, start_date, end_date, status, number_of_courts, description)
  VALUES
    (org_id, 'Singapore Junior Championships 2026', 'Singapore Sports Hub', '2026-08-15', '2026-08-16', 'draft', 4, 'National junior badminton tournament - 4 courts'),
    (org_id, 'TUAH Corporate Cup 2026', 'OCBC Arena', '2026-09-01', '2026-09-02', 'published', 6, 'Inter-company tournament - 6 courts'),
    (org_id, 'Weekend Warrior Open', 'Bukit Gombak Sports Hall', '2026-07-25', '2026-07-25', 'in_progress', 8, 'Fast weekend tournament - 8 courts'),
    (org_id, 'Seniors Masters 40+', 'Our Tampines Hub', '2026-08-20', '2026-08-20', 'draft', 2, 'Badminton for seniors - 2 courts'),
    (org_id, 'Youth Development Series #3', 'Bishan Sports Hall', '2026-09-10', '2026-09-11', 'draft', 10, 'BSA youth tournament - 10 courts'),
    (org_id, 'CC Badminton League 2026', 'Cheng San CC', '2026-08-01', '2026-08-30', 'published', 3, 'Inter-CC league - 3 courts'),
    (org_id, 'Inter-School Championships', 'Singapore Sports School', '2026-07-28', '2026-07-29', 'in_progress', 12, 'Secondary school tournament - 12 courts'),
    (org_id, 'Friday Night Smash #42', 'Kallang CC', '2026-07-26', '2026-07-26', 'draft', 1, 'Weekly social tournament - 1 court'),
    (org_id, 'Test Event - Empty', 'Test Location', '2026-12-01', '2026-12-01', 'draft', 4, 'Tournament with no entries'),
    (org_id, 'Extreme Rally Challenge', 'Max Sports Centre', '2026-10-01', '2026-10-01', 'published', 4, '31-point straight games');
END $$;

