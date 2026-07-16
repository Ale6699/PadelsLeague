/*
 * Generated from the local Supabase schema with `npm run supabase:types`.
 * This checked-in minimum declaration lets adapter code refer to the database
 * boundary without leaking `any` through the application domain.
 */
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      tournaments: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      players: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      player_availability: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      player_constraints: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      tournament_breaks: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      matches: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      match_score_actions: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Views: { public_tournaments: { Row: Record<string, unknown> }; tournament_standings: { Row: Record<string, unknown> } };
    Functions: { replace_tournament_schedule: { Args: { p_tournament_id: string; p_expected_version: number; p_matches: unknown }; Returns: undefined }; delete_tournament: { Args: { p_tournament_id: string; p_expected_version: number | null }; Returns: { deleted: boolean; conflict: boolean } }; import_tournament_snapshot: { Args: { p_snapshot: unknown }; Returns: string }; ensure_own_profile: { Args: Record<PropertyKey, never>; Returns: undefined }; save_live_match_state: { Args: { p_match_id: string; p_live_state: unknown; p_status: string; p_last_updated: number }; Returns: boolean } };
  };
};
