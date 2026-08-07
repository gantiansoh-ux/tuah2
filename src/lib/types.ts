// ============================================================
// TUAH2 — Database Types (Multi-Role Platform)
// ============================================================

// ============================================================
// Auth / Profiles
// ============================================================
export interface Profile {
  id: string;           // Profile UUID (primary key)
  email: string;
  full_name: string;
  nickname?: string;
  phone?: string;
  country?: string;
  state?: string;
  city?: string;
  gender?: string;
  date_of_birth?: string;
  playing_hand?: PlayingHand;
  club?: string;
  school?: string;
  occupation?: string;
  social_media?: Record<string, string>;
  website?: string;
  avatar_url?: string;
  roles: UserRole[];
  created_at: string;
}

export type UserRole = 'organizer' | 'player' | 'umpire' | 'coach' | 'court_owner';

export type PlayingHand = 'left' | 'right' | 'ambidextrous';

// ---- Profile Verification ----
export interface ProfileVerification {
  id: string;
  profile_id: string;
  verification_type: VerificationType;
  verified: boolean;
  verified_at?: string;
  document_url?: string;
  notes?: string;
  created_at: string;
}

export type VerificationType = 'identity' | 'association' | 'coach' | 'umpire' | 'organizer';

// ============================================================
// Organizer
// ============================================================
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
  title?: string;
  name: string;
  description?: string;
  venue?: string;
  location?: string;
  start_date: string;
  end_date: string;
  registration_open?: string;
  registration_close?: string;
  registration_deadline?: string;
  tournament_type?: TournamentType;
  poster_url?: string;
  banner_url?: string;
  logo_url?: string;
  rules?: string;
  prize?: string;
  entry_fee: number;
  status: TournamentStatus;
  created_at: string;
}

export type TournamentType =
  | 'junior'
  | 'open'
  | 'school'
  | 'corporate'
  | 'veteran'
  | 'team_event'
  | 'league'
  | 'knockout'
  | 'round_robin'
  | 'ladder'
  | 'festival';

export type TournamentStatus =
  | 'draft'
  | 'published'
  | 'registration'
  | 'live'
  | 'completed'
  | 'in_progress'
  | 'cancelled';

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
  deuce_cap?: number;
  serve_switch?: number;
}

// ============================================================
// Player
// ============================================================
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

// ============================================================
// Entries (tournament participants)
// ============================================================
export interface Entry {
  id: string;
  category_id: string;
  player_1_id: string;
  player_2_id: string | null;
  player_1_name?: string;
  player_2_name?: string;
  seed: number | null;
  ic_document_url?: string;
  passport_url?: string;
  student_card_url?: string;
  payment_status?: PaymentStatus;
  payment_method?: string;
  payment_reference?: string;
  registration_status?: RegistrationStatus;
  confirmed_at?: string;
  created_at: string;
}

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

// ============================================================
// Coach
// ============================================================
export interface CoachProfile {
  id: string;
  profile_id: string;
  coaching_license?: string;
  years_experience: number;
  current_club?: string;
  students: string[];
  coaching_fees: number;
  training_schedule?: Record<string, any>;
  rating: number;
  bio?: string;
  created_at: string;
}

export interface CoachReview {
  id: string;
  coach_profile_id: string;
  reviewer_id: string;
  rating: number;       // 1-5
  comment?: string;
  created_at: string;
}

// ============================================================
// Umpire
// ============================================================
export interface UmpireProfile {
  id: string;
  profile_id: string;
  certification?: string;
  license_number?: string;
  experience_years: number;
  matches_controlled: number;
  accuracy_rating: number;
  availability?: Record<string, any>;
  languages: string[];
  bio?: string;
  created_at: string;
}

export interface UmpireReview {
  id: string;
  umpire_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

// ============================================================
// Court
// ============================================================
export interface CourtProfile {
  id: string;
  owner_id: string;
  hall_name: string;
  address?: string;
  gps_lat?: number;
  gps_lng?: number;
  photos: string[];
  court_surface?: string;
  court_lighting?: string;
  parking?: string;
  air_conditioning: boolean;
  cafe: boolean;
  toilet: boolean;
  shower: boolean;
  wheelchair_access: boolean;
  available_time?: Record<string, any>;
  rental_price: number;
  created_at: string;
}

export interface CourtBooking {
  id: string;
  court_id: string;
  booker_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  total_price: number;
  created_at: string;
}

export interface CourtReview {
  id: string;
  court_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string;
}

// ============================================================
// Sponsor
// ============================================================
export interface SponsorProfile {
  id: string;
  profile_id: string;
  company_name?: string;
  banner_url?: string;
  video_url?: string;
  promotion?: string;
  website?: string;
  created_at: string;
}

// ============================================================
// Payments
// ============================================================
export interface Payment {
  id: string;
  user_id: string;
  tournament_id?: string;
  entry_id?: string;
  amount: number;
  currency: string;
  payment_method?: string;  // 'fpx', 'duitnow'
  payment_reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  invoice_url?: string;
  receipt_url?: string;
  paid_at?: string;
  created_at: string;
}

// ============================================================
// Match / Scoring
// ============================================================
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
  line_judge_id?: string | null;
  camera_assigned: boolean;
  court_status: CourtStatus;
  winner_id?: string | null;
  winner_entry_id?: string | null;
  created_at: string;
}

export type CourtStatus = 'available' | 'playing' | 'cleaning' | 'maintenance';

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

// ============================================================
// Notifications
// ============================================================
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

// ============================================================
// UI State
// ============================================================
export type Side = 'left' | 'right';
export type WinnerType = 'entry_1' | 'entry_2' | null;
