/*
 * Generated from the local Supabase schema with `npm run supabase:types`.
 * This checked-in minimum declaration lets adapter code refer to the database
 * boundary without leaking `any` through the application domain.
 */
export type Database = {
  public: {
    Tables: {
      tournaments: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      players: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      player_availability: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      player_constraints: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      tournament_breaks: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      matches: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      match_score_actions: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Views: { public_tournaments: { Row: Record<string, unknown> }; tournament_standings: { Row: Record<string, unknown> } };
    Functions: { replace_tournament_schedule: { Args: { p_tournament_id: string; p_expected_version: number; p_matches: unknown }; Returns: undefined }; import_tournament_snapshot: { Args: { p_snapshot: unknown }; Returns: string } };
  };
};
