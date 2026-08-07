-- ============================================================
-- TUAH Test Data: 10 Tournaments with various configurations
-- Run on tuah.com: psql -h 127.0.0.1 -U tuah_user -d tuah -f seed_test_data.sql
-- ============================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
  org_id UUID := '00000000-0000-0000-0000-000000000001';
  
  -- Tournament IDs
  t1_id UUID := '10000000-0000-0000-0000-000000000001';
  t2_id UUID := '10000000-0000-0000-0000-000000000002';
  t3_id UUID := '10000000-0000-0000-0000-000000000003';
  t4_id UUID := '10000000-0000-0000-0000-000000000004';
  t5_id UUID := '10000000-0000-0000-0000-000000000005';
  t6_id UUID := '10000000-0000-0000-0000-000000000006';
  t7_id UUID := '10000000-0000-0000-0000-000000000007';
  t8_id UUID := '10000000-0000-0000-0000-000000000008';
  t9_id UUID := '10000000-0000-0000-0000-000000000009';
  t10_id UUID := '10000000-0000-0000-0000-000000000010';

  -- Category IDs
  cat1 UUID; cat2 UUID; cat3 UUID; cat4 UUID; cat5 UUID;
  cat6 UUID; cat7 UUID; cat8 UUID; cat9 UUID; cat10 UUID;
  cat11 UUID; cat12 UUID;

  -- Entry IDs for each tournament
  e_id UUID;
  
  -- Match counter
  match_count INT := 0;
BEGIN

-- ==================== TOURNAMENT 1: Singapore Junior Championships ====================
-- 4 courts, 21pts best-of-3, deuce ON, 2 categories (U12, U14)
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t1_id, org_id, 'Singapore Junior Championships 2026', 'National junior badminton tournament', 'Singapore Sports Hub', '2026-08-15', 'draft', 4, NOW(), NOW());

cat1 := '20000000-0000-0000-0000-000000000001';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat1, t1_id, 'U12 Boys Singles', 'singles', 'beginner', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

cat2 := '20000000-0000-0000-0000-000000000002';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat2, t1_id, 'U14 Girls Singles', 'singles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

-- U12 entries (8 players)
INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000101', t1_id, cat1, 'p1_u12', NULL, 'Alex Tan', 1, NOW()),
  ('30000000-0000-0000-0000-000000000102', t1_id, cat1, 'p2_u12', NULL, 'Benny Lim', 2, NOW()),
  ('30000000-0000-0000-0000-000000000103', t1_id, cat1, 'p3_u12', NULL, 'Cheng Wei', 3, NOW()),
  ('30000000-0000-0000-0000-000000000104', t1_id, cat1, 'p4_u12', NULL, 'Daryl Ong', 4, NOW()),
  ('30000000-0000-0000-0000-000000000105', t1_id, cat1, 'p5_u12', NULL, 'Ethan Ng', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000106', t1_id, cat1, 'p6_u12', NULL, 'Farhan Ali', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000107', t1_id, cat1, 'p7_u12', NULL, 'Gavin Koh', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000108', t1_id, cat1, 'p8_u12', NULL, 'Hafiz Bin', NULL, NOW());

-- U14 entries (4 players)
INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000201', t1_id, cat2, 'p9_u14', NULL, 'Isabella Wu', 1, NOW()),
  ('30000000-0000-0000-0000-000000000202', t1_id, cat2, 'p10_u14', NULL, 'Jessie Loo', 2, NOW()),
  ('30000000-0000-0000-0000-000000000203', t1_id, cat2, 'p11_u14', NULL, 'Kylie Tan', 3, NOW()),
  ('30000000-0000-0000-0000-000000000204', t1_id, cat2, 'p12_u14', NULL, 'Lynn Ho', 4, NOW());

-- ==================== TOURNAMENT 2: TUAH Corporate Cup ====================
-- 6 courts, 15pts best-of-3 (BWF new), deuce OFF, doubles only
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t2_id, org_id, 'TUAH Corporate Cup 2026', 'Inter-company badminton tournament', 'OCBC Arena', '2026-09-01', 'published', 6, NOW(), NOW());

cat3 := '20000000-0000-0000-0000-000000000003';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat3, t2_id, 'Men Doubles Open', 'doubles', 'advanced', '{"points_per_game":15,"best_of":3,"deuce":false}', NOW());

cat4 := '20000000-0000-0000-0000-000000000004';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat4, t2_id, 'Mixed Doubles', 'doubles', 'intermediate', '{"points_per_game":15,"best_of":3,"deuce":false}', NOW());

-- MD entries (8 teams)
INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, player_2_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000301', t2_id, cat3, 'm1a', 'm1b', 'Google Smash', 'Alpha', 1, NOW()),
  ('30000000-0000-0000-0000-000000000302', t2_id, cat3, 'm2a', 'm2b', 'Meta Birds', 'Beta', 2, NOW()),
  ('30000000-0000-0000-0000-000000000303', t2_id, cat3, 'm3a', 'm3b', 'Amazon Drop', 'Charlie', 3, NOW()),
  ('30000000-0000-0000-0000-000000000304', t2_id, cat3, 'm4a', 'm4b', 'Netflix Rally', 'Delta', 4, NOW()),
  ('30000000-0000-0000-0000-000000000305', t2_id, cat3, 'm5a', 'm5b', 'Spotify Smash', 'Echo', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000306', t2_id, cat3, 'm6a', 'm6b', 'Apple Net', 'Foxtrot', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000307', t2_id, cat3, 'm7a', 'm7b', 'Oracle Strike', 'Golf', NULL, NOW()),
  ('30000000-0000-0000-0000-000000000308', t2_id, cat3, 'm8a', 'm8b', 'NVIDIA Smash', 'Hotel', NULL, NOW());

-- XD entries (4 teams)
INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, player_2_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000401', t2_id, cat4, 'x1m', 'x1f', 'Power Couple', 'Ace', 1, NOW()),
  ('30000000-0000-0000-0000-000000000402', t2_id, cat4, 'x2m', 'x2f', 'Mixed Masters', 'Queen', 2, NOW()),
  ('30000000-0000-0000-0000-000000000403', t2_id, cat4, 'x3m', 'x3f', 'Dynamic Duo', 'King', 3, NOW()),
  ('30000000-0000-0000-0000-000000000404', t2_id, cat4, 'x4m', 'x4f', 'Rally Royal', 'Jack', 4, NOW());

-- ==================== TOURNAMENT 3: Weekend Warrior Open ====================
-- 8 courts, 11pts fast format, best-of-1 (single game knockout)
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t3_id, org_id, 'Weekend Warrior Open', 'Fast-paced weekend tournament for all levels', 'Bukit Gombak Sports Hall', '2026-07-25', 'live', 8, NOW(), NOW());

cat5 := '20000000-0000-0000-0000-000000000005';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat5, t3_id, 'Open Singles', 'singles', 'mixed', '{"points_per_game":11,"best_of":1,"deuce":true,"max_cap":15}', NOW());

-- 16 players - full bracket
INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, seed, created_at)
SELECT '30000000-0000-0000-0000-00000000' || LPAD((500 + n)::text, 3, '0'), t3_id, cat5, 'p_w' || n, NULL, 'Warrior_' || n, CASE WHEN n <= 4 THEN n ELSE NULL END, NOW()
FROM generate_series(1, 16) n;

-- ==================== TOURNAMENT 4: Seniors Masters 40+ ====================
-- 2 courts, 21pts best-of-3, deuce ON
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t4_id, org_id, 'Seniors Masters 40+', 'Badminton for seniors above 40', 'Our Tampines Hub', '2026-08-20', 'draft', 2, NOW(), NOW());

cat6 := '20000000-0000-0000-0000-000000000006';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat6, t4_id, 'Men Singles 40+', 'singles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000601', t4_id, cat6, 's1', NULL, 'Uncle Sam', 1, NOW()),
  ('30000000-0000-0000-0000-000000000602', t4_id, cat6, 's2', NULL, 'Uncle Bob', 2, NOW()),
  ('30000000-0000-0000-0000-000000000603', t4_id, cat6, 's3', NULL, 'Uncle Joe', 3, NOW()),
  ('30000000-0000-0000-0000-000000000604', t4_id, cat6, 's4', NULL, 'Uncle Max', 4, NOW());

-- ==================== TOURNAMENT 5: Youth Development Series ====================
-- 10 courts, 21pts best-of-3, multiple age groups
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t5_id, org_id, 'Youth Development Series #3', 'BSA youth tournament series', 'Bishan Sports Hall', '2026-09-10', 'draft', 10, NOW(), NOW());

cat7 := '20000000-0000-0000-0000-000000000007';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat7, t5_id, 'U10 Mixed', 'singles', 'beginner', '{"points_per_game":15,"best_of":3,"deuce":false}', NOW());

cat8 := '20000000-0000-0000-0000-000000000008';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat8, t5_id, 'U16 Girls Doubles', 'doubles', 'advanced', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

-- ==================== TOURNAMENT 6: Community Centre League ====================
-- 3 courts, round-robin format
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t6_id, org_id, 'CC Badminton League 2026', 'Inter-CC league', 'Cheng San CC', '2026-08-01', 'published', 3, NOW(), NOW());

cat9 := '20000000-0000-0000-0000-000000000009';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat9, t6_id, 'Men Doubles League', 'doubles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, player_2_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000701', t6_id, cat9, 'cc1a', 'cc1b', 'CC Eagles', 'T1', 1, NOW()),
  ('30000000-0000-0000-0000-000000000702', t6_id, cat9, 'cc2a', 'cc2b', 'CC Phoenix', 'T2', 2, NOW()),
  ('30000000-0000-0000-0000-000000000703', t6_id, cat9, 'cc3a', 'cc3b', 'CC Dragons', 'T3', 3, NOW());

-- ==================== TOURNAMENT 7: School Championships ====================
-- 12 courts, multiple categories
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t7_id, org_id, 'Inter-School Badminton Championships', 'Secondary school tournament', 'Singapore Sports School', '2026-07-28', 'live', 12, NOW(), NOW());

cat10 := '20000000-0000-0000-0000-000000000010';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat10, t7_id, 'B Division Boys Singles', 'singles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

cat11 := '20000000-0000-0000-0000-000000000011';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat11, t7_id, 'B Division Girls Singles', 'singles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

cat12 := '20000000-0000-0000-0000-000000000012';
INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES (cat12, t7_id, 'B Division Mixed Doubles', 'doubles', 'intermediate', '{"points_per_game":21,"best_of":3,"deuce":true}', NOW());

-- ==================== TOURNAMENT 8: Friday Night Smash ====================
-- 1 court only (small session)
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t8_id, org_id, 'Friday Night Smash #42', 'Weekly social tournament', 'Kallang CC', '2026-07-26', 'draft', 1, NOW(), NOW());

INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES ('20000000-0000-0000-0000-000000000013', t8_id, 'Social Singles', 'singles', 'mixed', '{"points_per_game":11,"best_of":3,"deuce":true,"max_cap":15}', NOW());

-- ==================== TOURNAMENT 9: Empty Tournament (no players) ====================
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t9_id, org_id, 'Test Event - Empty', 'Tournament with no players entered', 'Test Location', '2026-12-01', 'draft', 4, NOW(), NOW());

-- ==================== TOURNAMENT 10: Tournament with 31pt scoring (Deuce OFF) ====================
INSERT INTO tournaments (id, organizer_id, name, description, location, start_date, status, number_of_courts, created_at, updated_at)
VALUES (t10_id, org_id, 'Extreme Rally Challenge', '31-point straight games', 'Max Sports Centre', '2026-10-01', 'published', 4, NOW(), NOW());

INSERT INTO categories (id, tournament_id, name, type, skill_level, scoring_config, created_at)
VALUES ('20000000-0000-0000-0000-000000000014', t10_id, '31pt No Deuce', 'singles', 'advanced', '{"points_per_game":31,"best_of":1,"deuce":false}', NOW());

INSERT INTO entries (id, tournament_id, category_id, player_1_id, player_2_id, player_1_name, seed, created_at)
VALUES
  ('30000000-0000-0000-0000-000000000801', t10_id, '20000000-0000-0000-0000-000000000014', 'e1', NULL, 'Endurance King', 1, NOW()),
  ('30000000-0000-0000-0000-000000000802', t10_id, '20000000-0000-0000-0000-000000000014', 'e2', NULL, 'Stamina Queen', 2, NOW()),
  ('30000000-0000-0000-0000-000000000803', t10_id, '20000000-0000-0000-0000-000000000014', 'e3', NULL, 'Iron Lung', 3, NOW()),
  ('30000000-0000-0000-0000-000000000804', t10_id, '20000000-0000-0000-0000-000000000014', 'e4', NULL, 'Endless Runner', 4, NOW());

-- ==================== VERIFICATION ====================
RAISE NOTICE '===== TEST DATA SEED SUMMARY =====';
RAISE NOTICE 'Tournament 1: Singapore Junior (4 courts, draft) - 2 categories, 12 entries';
RAISE NOTICE 'Tournament 2: Corporate Cup (6 courts, published) - 2 categories, 12 entries';
RAISE NOTICE 'Tournament 3: Weekend Warrior (8 courts, live) - 1 category, 16 entries';
RAISE NOTICE 'Tournament 4: Seniors Masters (2 courts, draft) - 1 category, 4 entries';
RAISE NOTICE 'Tournament 5: Youth Series (10 courts, draft) - 2 categories, 0 entries';
RAISE NOTICE 'Tournament 6: CC League (3 courts, published) - 1 category, 3 entries';
RAISE NOTICE 'Tournament 7: School Champs (12 courts, live) - 3 categories, 0 entries';
RAISE NOTICE 'Tournament 8: Friday Night Smash (1 court, draft) - 1 category, 0 entries';
RAISE NOTICE 'Tournament 9: Empty Event (4 courts, draft) - NO CATEGORIES, NO ENTRIES';
RAISE NOTICE 'Tournament 10: Extreme Rally (4 courts, published) - 1 category (31pts), 4 entries';
RAISE NOTICE '====================================';
END $$;

