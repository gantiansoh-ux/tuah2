// ============================================================
// TUAH2 — Database Types (Multi-Role Platform)
// ============================================================

// ---- Auth / Profiles ----
export interface Profile {
  id: string;           // Supabase Auth UID
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  roles: UserRole[];
  created_at: string;
}

export type UserRole = 'organizer' | 'player' | 'umpire' | 'coach' | 'court_owner';

// ---- Organizer ----
export interface OrganizerProfile {
  id: string;           // FK → profiles.id
  organization_name?: string;
  logo_url?: string;
  description?: string;
  verified: boolean;
}

export interface Tournament {
  id: string;
  organizer_id: string;
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date: string;
  registration_open?: string;
  registration_close?: string;
  entry_fee: number;
  status: 'draft' | 'published' | 'registration' | 'live' | 'completed';
  logo_url?: string;
  banner_url?: string;
  created_at: string;
}

export interface Category {
  id: string;
  tournament_id: string;
  name: string;
  gender: 'mens' | 'womens' | 'mixed' | 'open';
  age_group: string;   // u8, u10, u12, u14, u16, open
  type: 'singles' | 'doubles';
  scoring_config: ScoringConfig;
  max_players: number;
  created_at: string;
}

export interface ScoringConfig {
  points_per_game: number;
  best_of: number;
  deuce: boolean;
  max_cap?: number;
}

// ---- Player ----
export interface PlayerProfile {
  id: string;           // FK → profiles.id
  date_of_birth?: string;
  gender?: string;
  bio?: string;
  photo_url?: string;
  video_url?: string;
  seeking_sponsor: boolean;
  ranking_points: number;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  player_id: string;
  category_id: string;
  partner_id?: string;  // for doubles
  status: 'pending' | 'approved' | 'rejected';
  registration_date: string;
}

// ---- Entries (tournament participants) ----
export interface Entry {
  id: string;
  category_id: string;
  player_1_id: string;
  player_2_id: string | null;
  seed: number | null;
  created_at: string;
}

// ---- Umpire ----
export interface UmpireProfile {
  id: string;
  certification_level?: string;
  experience_years: number;
  rate_per_match: number;
  rate_per_day: number;
  bio?: string;
  availability?: any;   // JSONB
}

export interface UmpireReview {
  id: string;
  umpire_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

// ---- Coach ----
export interface CoachProfile {
  id: string;
  certifications: string[];
  specialization: string[];
  rate_per_session: number;
  bio?: string;
  availability?: any;
}

export interface CoachReview {
  id: string;
  coach_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

// ---- Court ----
export interface CourtProfile {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  number_of_courts: number;
  hourly_rate: number;
  facilities?: any;
  photos: string[];
  availability?: any;
}

export interface CourtBooking {
  id: string;
  court_id: string;
  booker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  total_price: number;
}

export interface CourtReview {
  id: string;
  court_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
}

// ---- Match / Scoring (from TUAH1) ----
export interface Match {
  id: string;
  tournament_id: string;
  category_id: string;
  entry_1_id: string | null;
  entry_2_id: string | null;
  next_match_id: string | null;
  round: string;
  match_number: number;
  status: 'scheduled' | 'playing' | 'completed';
  court_name: string | null;
  scheduled_time: string | null;
  umpire_id?: string | null;
  winner_id?: string | null;
  created_at: string;
}

export interface Game {
  id: string;
  match_id: string;
  game_number: number;
  score_entry_1: number;
  score_entry_2: number;
  status: 'playing' | 'completed';
  winner_id: string | null;
  current_server: number;
  created_at: string;
}

export interface PointLog {
  id: string;
  game_id: string;
  scoring_entry_id: string | null;
  action: string;
  created_at: string;
}

export interface CardLog {
  id: string;
  match_id: string;
  player_id: string;
  card_type: string;
  note: string | null;
  created_at: string;
}

// ---- Notifications ----
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
}

// UI State
export type Side = 'left' | 'right';
export type WinnerType = 'entry_1' | 'entry_2' | null;
