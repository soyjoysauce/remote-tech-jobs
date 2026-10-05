
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "companies": {
                  Row: {
                    "board_token": string,"created_at": string,"id": number,"is_active": boolean,"last_verified_at": string | null,"logo_url": string | null,"name": string,"slug": string,"source_id": string,"updated_at": string,"website_url": string | null
                  }
                  Insert: {
                    "board_token": string,"created_at"?: string,"id"?: never,"is_active"?: boolean,"last_verified_at"?: string | null,"logo_url"?: string | null,"name": string,"slug": string,"source_id": string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "board_token"?: string,"created_at"?: string,"id"?: never,"is_active"?: boolean,"last_verified_at"?: string | null,"logo_url"?: string | null,"name"?: string,"slug"?: string,"source_id"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_runs": {
                  Row: {
                    "closed_count": number,"error": string | null,"fetched_count": number,"finished_at": string | null,"id": number,"inserted_count": number,"source_id": string,"started_at": string,"status": Database["public"]['Enums']["ingestion_run_status"],"updated_count": number
                  }
                  Insert: {
                    "closed_count"?: number,"error"?: string | null,"fetched_count"?: number,"finished_at"?: string | null,"id"?: never,"inserted_count"?: number,"source_id": string,"started_at"?: string,"status"?: Database["public"]['Enums']["ingestion_run_status"],"updated_count"?: number
                  }
                  Update: {
                    "closed_count"?: number,"error"?: string | null,"fetched_count"?: number,"finished_at"?: string | null,"id"?: never,"inserted_count"?: number,"source_id"?: string,"started_at"?: string,"status"?: Database["public"]['Enums']["ingestion_run_status"],"updated_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingestion_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "apply_url": string,"closed_at": string | null,"company_id": number | null,"company_name": string,"content_hash": string | null,"created_at": string,"dedupe_key": string | null,"department": string | null,"description_html": string | null,"description_text": string | null,"employment_type": string | null,"external_id": string,"first_seen_at": string,"id": number,"is_remote": boolean,"last_seen_at": string,"location_raw": string | null,"posted_at": string | null,"raw": Json | null,"remote_region": string,"salary_currency": string | null,"salary_max": number | null,"salary_min": number | null,"salary_period": string | null,"source_id": string,"source_url": string | null,"status": Database["public"]['Enums']["job_status"],"tags": (string)[],"title": string,"updated_at": string
                  }
                  Insert: {
                    "apply_url": string,"closed_at"?: string | null,"company_id"?: number | null,"company_name": string,"content_hash"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"department"?: string | null,"description_html"?: string | null,"description_text"?: string | null,"employment_type"?: string | null,"external_id": string,"first_seen_at"?: string,"id"?: never,"is_remote": boolean,"last_seen_at"?: string,"location_raw"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_region"?: string,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source_id": string,"source_url"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"tags"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "apply_url"?: string,"closed_at"?: string | null,"company_id"?: number | null,"company_name"?: string,"content_hash"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"department"?: string | null,"description_html"?: string | null,"description_text"?: string | null,"employment_type"?: string | null,"external_id"?: string,"first_seen_at"?: string,"id"?: never,"is_remote"?: boolean,"last_seen_at"?: string,"location_raw"?: string | null,"posted_at"?: string | null,"raw"?: Json | null,"remote_region"?: string,"salary_currency"?: string | null,"salary_max"?: number | null,"salary_min"?: number | null,"salary_period"?: string | null,"source_id"?: string,"source_url"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"tags"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "api_base_url": string,"attribution_required": boolean,"attribution_text": string | null,"created_at": string,"display_name": string,"id": string,"kind": Database["public"]['Enums']["source_kind"],"updated_at": string
                  }
                  Insert: {
                    "api_base_url": string,"attribution_required"?: boolean,"attribution_text"?: string | null,"created_at"?: string,"display_name": string,"id": string,"kind": Database["public"]['Enums']["source_kind"],"updated_at"?: string
                  }
                  Update: {
                    "api_base_url"?: string,"attribution_required"?: boolean,"attribution_text"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["source_kind"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "ingestion_run_status": "running"|"succeeded"|"failed","job_status": "open"|"closed","source_kind": "ats"|"aggregator"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "ingestion_run_status": ["running", "succeeded", "failed"],"job_status": ["open", "closed"],"source_kind": ["ats", "aggregator"]
          }
        }
} as const
