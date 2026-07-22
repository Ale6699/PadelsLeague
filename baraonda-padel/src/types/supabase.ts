export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bet_markets: {
        Row: {
          created_at: string
          id: string
          kind: string
          line: number | null
          liquidity: number
          match_id: string | null
          params: Json
          status: string
          tournament_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          line?: number | null
          liquidity?: number
          match_id?: string | null
          params?: Json
          status?: string
          tournament_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          line?: number | null
          liquidity?: number
          match_id?: string | null
          params?: Json
          status?: string
          tournament_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bet_markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_markets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_markets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      bet_selections: {
        Row: {
          code: string
          id: string
          is_winner: boolean | null
          label: string
          market_id: string
          odds: number
          prior_probability: number
          stake_pool: number
        }
        Insert: {
          code: string
          id?: string
          is_winner?: boolean | null
          label: string
          market_id: string
          odds: number
          prior_probability?: number
          stake_pool?: number
        }
        Update: {
          code?: string
          id?: string
          is_winner?: boolean | null
          label?: string
          market_id?: string
          odds?: number
          prior_probability?: number
          stake_pool?: number
        }
        Relationships: [
          {
            foreignKeyName: "bet_selections_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "bet_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          id: string
          market_id: string
          odds_at_placement: number
          placed_at: string
          potential_payout: number
          selection_id: string
          settled_at: string | null
          stake: number
          status: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          id?: string
          market_id: string
          odds_at_placement: number
          placed_at?: string
          potential_payout: number
          selection_id: string
          settled_at?: string | null
          stake: number
          status?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          id?: string
          market_id?: string
          odds_at_placement?: number
          placed_at?: string
          potential_payout?: number
          selection_id?: string
          settled_at?: string | null
          stake?: number
          status?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bets_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "bet_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_selection_id_fkey"
            columns: ["selection_id"]
            isOneToOne: false
            referencedRelation: "bet_selections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "betting_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      betting_ledger: {
        Row: {
          bet_id: string | null
          created_at: string
          delta: number
          id: string
          market_id: string | null
          reason: string
          wallet_id: string
        }
        Insert: {
          bet_id?: string | null
          created_at?: string
          delta: number
          id?: string
          market_id?: string | null
          reason: string
          wallet_id: string
        }
        Update: {
          bet_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          market_id?: string | null
          reason?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "betting_ledger_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betting_ledger_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "bet_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betting_ledger_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "betting_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      betting_wallets: {
        Row: {
          balance: number
          created_at: string
          display_name: string
          id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          display_name?: string
          id?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          display_name?: string
          id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "betting_wallets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betting_wallets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_score_actions: {
        Row: {
          action_type: string
          client_action_id: string | null
          created_at: string
          id: string
          match_id: string
          next_score: Json
          previous_score: Json
        }
        Insert: {
          action_type: string
          client_action_id?: string | null
          created_at?: string
          id?: string
          match_id: string
          next_score: Json
          previous_score: Json
        }
        Update: {
          action_type?: string
          client_action_id?: string | null
          created_at?: string
          id?: string
          match_id?: string
          next_score?: Json
          previous_score?: Json
        }
        Relationships: [
          {
            foreignKeyName: "match_score_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_score_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          balance_label: string | null
          balance_score: number | null
          completed_at: string | null
          created_at: string
          ends_at: string
          id: string
          is_locked: boolean
          live_advantage_team: string | null
          live_state: Json | null
          live_team_a_points: string
          live_team_b_points: string
          sequence_number: number
          serving_team: string | null
          starts_at: string
          status: string
          team_a_games: number | null
          team_a_player_1_id: string | null
          team_a_player_2_id: string | null
          team_b_games: number | null
          team_b_player_1_id: string | null
          team_b_player_2_id: string | null
          timer_duration_ms: number | null
          timer_ends_at: string | null
          timer_remaining_ms: number | null
          timer_started_at: string | null
          timer_status: string
          tournament_id: string
          updated_at: string
          version: number
        }
        Insert: {
          balance_label?: string | null
          balance_score?: number | null
          completed_at?: string | null
          created_at?: string
          ends_at: string
          id?: string
          is_locked?: boolean
          live_advantage_team?: string | null
          live_state?: Json | null
          live_team_a_points?: string
          live_team_b_points?: string
          sequence_number: number
          serving_team?: string | null
          starts_at: string
          status?: string
          team_a_games?: number | null
          team_a_player_1_id?: string | null
          team_a_player_2_id?: string | null
          team_b_games?: number | null
          team_b_player_1_id?: string | null
          team_b_player_2_id?: string | null
          timer_duration_ms?: number | null
          timer_ends_at?: string | null
          timer_remaining_ms?: number | null
          timer_started_at?: string | null
          timer_status?: string
          tournament_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          balance_label?: string | null
          balance_score?: number | null
          completed_at?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          is_locked?: boolean
          live_advantage_team?: string | null
          live_state?: Json | null
          live_team_a_points?: string
          live_team_b_points?: string
          sequence_number?: number
          serving_team?: string | null
          starts_at?: string
          status?: string
          team_a_games?: number | null
          team_a_player_1_id?: string | null
          team_a_player_2_id?: string | null
          team_b_games?: number | null
          team_b_player_1_id?: string | null
          team_b_player_2_id?: string | null
          timer_duration_ms?: number | null
          timer_ends_at?: string | null
          timer_remaining_ms?: number | null
          timer_started_at?: string | null
          timer_status?: string
          tournament_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_availability: {
        Row: {
          available_from: string
          available_until: string
          created_at: string
          id: string
          player_id: string
        }
        Insert: {
          available_from: string
          available_until: string
          created_at?: string
          id?: string
          player_id: string
        }
        Update: {
          available_from?: string
          available_until?: string
          created_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
        ]
      }
      player_constraints: {
        Row: {
          constraint_type: string
          created_at: string
          id: string
          player_a_id: string
          player_b_id: string
          tournament_id: string
        }
        Insert: {
          constraint_type?: string
          created_at?: string
          id?: string
          player_a_id: string
          player_b_id: string
          tournament_id: string
        }
        Update: {
          constraint_type?: string
          created_at?: string
          id?: string
          player_a_id?: string
          player_b_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_constraints_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_constraints_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_constraints_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_constraints_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_constraints_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_constraints_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_constraints_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_constraints_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_constraints_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_constraints_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          first_name: string
          gender: string
          id: string
          last_name: string
          level: string
          notes: string | null
          sort_order: number
          status: string
          tournament_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          first_name: string
          gender: string
          id?: string
          last_name?: string
          level: string
          notes?: string | null
          sort_order?: number
          status?: string
          tournament_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          first_name?: string
          gender?: string
          id?: string
          last_name?: string
          level?: string
          notes?: string | null
          sort_order?: number
          status?: string
          tournament_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms_at: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          marketing_consent: boolean
          privacy_version: string | null
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          accepted_terms_at?: string | null
          created_at?: string
          first_name: string
          id: string
          last_name: string
          marketing_consent?: boolean
          privacy_version?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          accepted_terms_at?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          marketing_consent?: boolean
          privacy_version?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tournament_breaks: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          starts_at: string
          title: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          starts_at: string
          title?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          starts_at?: string
          title?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_breaks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_breaks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          betting_enabled: boolean
          betting_initial_balance: number
          betting_over_under_enabled: boolean
          created_at: string
          dashboard_settings: Json
          defeat_points: number
          draw_points: number
          end_time: string
          generator_preferences: Json
          id: string
          is_public: boolean
          killer_point_after_deuces: number
          killer_point_enabled: boolean
          match_duration_minutes: number
          max_games_per_match: number
          name: string
          notes: string | null
          owner_id: string
          public_slug: string
          public_title: string
          schedule_needs_regeneration: boolean
          scoring_mode: string
          start_time: string
          status: string
          timer_sound_enabled: boolean
          tournament_date: string | null
          transition_duration_minutes: number
          updated_at: string
          version: number
          victory_points: number
        }
        Insert: {
          betting_enabled?: boolean
          betting_initial_balance?: number
          betting_over_under_enabled?: boolean
          created_at?: string
          dashboard_settings?: Json
          defeat_points?: number
          draw_points?: number
          end_time: string
          generator_preferences?: Json
          id?: string
          is_public?: boolean
          killer_point_after_deuces?: number
          killer_point_enabled?: boolean
          match_duration_minutes?: number
          max_games_per_match?: number
          name: string
          notes?: string | null
          owner_id: string
          public_slug: string
          public_title?: string
          schedule_needs_regeneration?: boolean
          scoring_mode?: string
          start_time: string
          status?: string
          timer_sound_enabled?: boolean
          tournament_date?: string | null
          transition_duration_minutes?: number
          updated_at?: string
          version?: number
          victory_points?: number
        }
        Update: {
          betting_enabled?: boolean
          betting_initial_balance?: number
          betting_over_under_enabled?: boolean
          created_at?: string
          dashboard_settings?: Json
          defeat_points?: number
          draw_points?: number
          end_time?: string
          generator_preferences?: Json
          id?: string
          is_public?: boolean
          killer_point_after_deuces?: number
          killer_point_enabled?: boolean
          match_duration_minutes?: number
          max_games_per_match?: number
          name?: string
          notes?: string | null
          owner_id?: string
          public_slug?: string
          public_title?: string
          schedule_needs_regeneration?: boolean
          scoring_mode?: string
          start_time?: string
          status?: string
          timer_sound_enabled?: boolean
          tournament_date?: string | null
          transition_duration_minutes?: number
          updated_at?: string
          version?: number
          victory_points?: number
        }
        Relationships: []
      }
    }
    Views: {
      public_betting_leaderboard: {
        Row: {
          balance: number | null
          display_name: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "betting_wallets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "betting_wallets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_matches: {
        Row: {
          ends_at: string | null
          id: string | null
          live_advantage_team: string | null
          live_state: Json | null
          live_team_a_points: string | null
          live_team_b_points: string | null
          sequence_number: number | null
          serving_team: string | null
          starts_at: string | null
          status: string | null
          team_a_games: number | null
          team_a_player_1_id: string | null
          team_a_player_2_id: string | null
          team_b_games: number | null
          team_b_player_1_id: string | null
          team_b_player_2_id: string | null
          timer_remaining_ms: number | null
          timer_status: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_1_id_fkey"
            columns: ["team_a_player_1_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_a_player_2_id_fkey"
            columns: ["team_a_player_2_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_1_id_fkey"
            columns: ["team_b_player_1_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "public_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_team_b_player_2_id_fkey"
            columns: ["team_b_player_2_id"]
            isOneToOne: false
            referencedRelation: "tournament_standings"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_players: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_standings: {
        Row: {
          draws: number | null
          first_name: string | null
          games_against: number | null
          games_for: number | null
          last_name: string | null
          losses: number | null
          played: number | null
          player_id: string | null
          points: number | null
          tournament_id: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_tournaments: {
        Row: {
          betting_enabled: boolean | null
          betting_initial_balance: number | null
          betting_over_under_enabled: boolean | null
          end_time: string | null
          id: string | null
          match_duration_minutes: number | null
          max_games_per_match: number | null
          name: string | null
          public_slug: string | null
          public_title: string | null
          start_time: string | null
          status: string | null
          tournament_date: string | null
          transition_duration_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          betting_enabled?: boolean | null
          betting_initial_balance?: number | null
          betting_over_under_enabled?: boolean | null
          end_time?: string | null
          id?: string | null
          match_duration_minutes?: number | null
          max_games_per_match?: number | null
          name?: string | null
          public_slug?: string | null
          public_title?: string | null
          start_time?: string | null
          status?: string | null
          tournament_date?: string | null
          transition_duration_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          betting_enabled?: boolean | null
          betting_initial_balance?: number | null
          betting_over_under_enabled?: boolean | null
          end_time?: string | null
          id?: string | null
          match_duration_minutes?: number | null
          max_games_per_match?: number | null
          name?: string | null
          public_slug?: string | null
          public_title?: string | null
          start_time?: string | null
          status?: string | null
          tournament_date?: string | null
          transition_duration_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tournament_standings: {
        Row: {
          draws: number | null
          first_name: string | null
          games_against: number | null
          games_for: number | null
          last_name: string | null
          losses: number | null
          played: number | null
          player_id: string | null
          points: number | null
          tournament_id: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_balance: {
        Args: { p_delta: number; p_reason?: string; p_wallet: string }
        Returns: undefined
      }
      betting_apply_settlement: {
        Args: { p_market: string; p_winning_selection: string }
        Returns: undefined
      }
      betting_credit: {
        Args: {
          p_bet?: string
          p_delta: number
          p_market?: string
          p_reason: string
          p_wallet: string
        }
        Returns: undefined
      }
      betting_generate_match_markets_internal: {
        Args: { p_match: string }
        Returns: undefined
      }
      betting_is_owner: { Args: { p_tournament: string }; Returns: boolean }
      betting_level_value: { Args: { p_level: string }; Returns: number }
      betting_logistic: { Args: { p_x: number }; Returns: number }
      betting_prob_to_odds: {
        Args: { p_margin?: number; p_max_odds?: number; p_probability: number }
        Returns: number
      }
      betting_reprice_market: { Args: { p_market: string }; Returns: undefined }
      betting_sync_open_market: {
        Args: { p_tournament: string }
        Returns: undefined
      }
      betting_void_market: { Args: { p_market: string }; Returns: undefined }
      claim_unowned_tournaments: { Args: never; Returns: number }
      close_market: { Args: { p_market: string }; Returns: undefined }
      create_head_to_head_market: {
        Args: { p_player_a: string; p_player_b: string; p_tournament: string }
        Returns: string
      }
      delete_tournament: {
        Args: { p_expected_version?: number; p_tournament_id: string }
        Returns: Json
      }
      ensure_own_profile: { Args: never; Returns: undefined }
      generate_match_markets: { Args: { p_match: string }; Returns: undefined }
      generate_tournament_markets: {
        Args: { p_tournament: string }
        Returns: undefined
      }
      import_tournament_snapshot: {
        Args: { p_snapshot: Json }
        Returns: string
      }
      is_public_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      join_tournament_betting: {
        Args: { p_tournament: string }
        Returns: {
          balance: number
          created_at: string
          display_name: string
          id: string
          tournament_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "betting_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_market: { Args: { p_market: string }; Returns: undefined }
      place_bet: {
        Args: { p_market: string; p_selection: string; p_stake: number }
        Returns: {
          id: string
          market_id: string
          odds_at_placement: number
          placed_at: string
          potential_payout: number
          selection_id: string
          settled_at: string | null
          stake: number
          status: string
          user_id: string
          wallet_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_tournament_schedule: {
        Args: {
          p_expected_version: number
          p_matches: Json
          p_tournament_id: string
        }
        Returns: undefined
      }
      save_live_match_state: {
        Args: {
          p_last_updated: number
          p_live_state: Json
          p_match_id: string
          p_status: string
        }
        Returns: boolean
      }
      set_betting_config: {
        Args: {
          p_enabled: boolean
          p_initial_balance: number
          p_over_under_enabled?: boolean
          p_tournament: string
        }
        Returns: undefined
      }
      settle_market: {
        Args: { p_market: string; p_winning_selection: string }
        Returns: undefined
      }
      void_market: { Args: { p_market: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
