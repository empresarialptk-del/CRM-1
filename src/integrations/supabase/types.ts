export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      compras: {
        Row: {
          created_at: string
          data_compra: string
          id: string
          lead_id: string
          origem: string
          produto: string
          quantidade: number
          valor: number
        }
        Insert: {
          created_at?: string
          data_compra?: string
          id?: string
          lead_id: string
          origem?: string
          produto: string
          quantidade?: number
          valor?: number
        }
        Update: {
          created_at?: string
          data_compra?: string
          id?: string
          lead_id?: string
          origem?: string
          produto?: string
          quantidade?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_lists: {
        Row: {
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          created_at: string
          gerente: string | null
          id: string
          list_id: string | null
          nome: string
          observacoes: string | null
          origem: string | null
          prioridade: number
          proximo_followup: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          gerente?: string | null
          id?: string
          list_id?: string | null
          nome: string
          observacoes?: string | null
          origem?: string | null
          prioridade?: number
          proximo_followup?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          gerente?: string | null
          id?: string
          list_id?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string | null
          prioridade?: number
          proximo_followup?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          atendente_id: string
          canal: string
          categoria: Database["public"]["Enums"]["mensagem_categoria"]
          enviada_em: string
          id: string
          lead_id: string
          observacao: string | null
          respondida: boolean
          texto: string
        }
        Insert: {
          atendente_id: string
          canal?: string
          categoria: Database["public"]["Enums"]["mensagem_categoria"]
          enviada_em?: string
          id?: string
          lead_id: string
          observacao?: string | null
          respondida?: boolean
          texto: string
        }
        Update: {
          atendente_id?: string
          canal?: string
          categoria?: Database["public"]["Enums"]["mensagem_categoria"]
          enviada_em?: string
          id?: string
          lead_id?: string
          observacao?: string | null
          respondida?: boolean
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "atendente"
      lead_status:
        | "novo"
        | "nao_atendeu"
        | "retornar"
        | "respondeu"
        | "mensagem_zap"
        | "interesse"
        | "negociacao"
        | "aguardando_pagamento"
        | "pago"
        | "entregue"
        | "pos_venda"
        | "sem_interesse"
        | "numero_errado"
        | "perdido"
      mensagem_categoria: "recompra" | "novidade" | "desconto" | "promocao"
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
    Enums: {
      app_role: ["admin", "gerente", "atendente"],
      lead_status: [
        "novo",
        "nao_atendeu",
        "retornar",
        "respondeu",
        "mensagem_zap",
        "interesse",
        "negociacao",
        "aguardando_pagamento",
        "pago",
        "entregue",
        "pos_venda",
        "sem_interesse",
        "numero_errado",
        "perdido",
      ],
      mensagem_categoria: ["recompra", "novidade", "desconto", "promocao"],
    },
  },
} as const
