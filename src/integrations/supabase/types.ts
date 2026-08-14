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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      compras: {
        Row: {
          created_at: string
          custo: number
          data_compra: string
          id: string
          lead_id: string
          origem: string
          pedido_id: string | null
          produto: string
          quantidade: number
          valor: number
        }
        Insert: {
          created_at?: string
          custo?: number
          data_compra?: string
          id?: string
          lead_id: string
          origem?: string
          pedido_id?: string | null
          produto: string
          quantidade?: number
          valor?: number
        }
        Update: {
          created_at?: string
          custo?: number
          data_compra?: string
          id?: string
          lead_id?: string
          origem?: string
          pedido_id?: string | null
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
          {
            foreignKeyName: "compras_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_calendario: {
        Row: {
          alvo_list_id: string | null
          alvo_ticket_tier: string | null
          created_at: string
          criado_por: string
          data: string
          data_fim: string | null
          descricao: string | null
          id: string
          tipo: Database["public"]["Enums"]["evento_calendario_tipo"]
          titulo: string
        }
        Insert: {
          alvo_list_id?: string | null
          alvo_ticket_tier?: string | null
          created_at?: string
          criado_por: string
          data: string
          data_fim?: string | null
          descricao?: string | null
          id?: string
          tipo: Database["public"]["Enums"]["evento_calendario_tipo"]
          titulo: string
        }
        Update: {
          alvo_list_id?: string | null
          alvo_ticket_tier?: string | null
          created_at?: string
          criado_por?: string
          data?: string
          data_fim?: string | null
          descricao?: string | null
          id?: string
          tipo?: Database["public"]["Enums"]["evento_calendario_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_calendario_alvo_list_id_fkey"
            columns: ["alvo_list_id"]
            isOneToOne: false
            referencedRelation: "lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_audit: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          campo: string
          id: string
          lead_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          campo: string
          id?: string
          lead_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          campo?: string
          id?: string
          lead_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_audit_lead_id_fkey"
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
          status_contato: Database["public"]["Enums"]["mensagem_status_contato"]
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
          status_contato?: Database["public"]["Enums"]["mensagem_status_contato"]
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
          status_contato?: Database["public"]["Enums"]["mensagem_status_contato"]
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
      pedidos: {
        Row: {
          created_at: string
          criado_por: string
          desconto: number
          endereco_entrega: string | null
          forma_pagamento: string | null
          frete: number
          id: string
          lead_id: string
          numero: number
          observacoes: string | null
          status_entrega: Database["public"]["Enums"]["pedido_status_entrega"]
          status_pagamento: Database["public"]["Enums"]["pedido_status_pagamento"]
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          created_at?: string
          criado_por: string
          desconto?: number
          endereco_entrega?: string | null
          forma_pagamento?: string | null
          frete?: number
          id?: string
          lead_id: string
          numero?: number
          observacoes?: string | null
          status_entrega?: Database["public"]["Enums"]["pedido_status_entrega"]
          status_pagamento?: Database["public"]["Enums"]["pedido_status_pagamento"]
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string
          desconto?: number
          endereco_entrega?: string | null
          forma_pagamento?: string | null
          frete?: number
          id?: string
          lead_id?: string
          numero?: number
          observacoes?: string | null
          status_entrega?: Database["public"]["Enums"]["pedido_status_entrega"]
          status_pagamento?: Database["public"]["Enums"]["pedido_status_pagamento"]
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_lead_id_fkey"
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
      evento_calendario_tipo: "promocao" | "evento" | "novidade"
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
      mensagem_status_contato:
        | "enviada"
        | "vista"
        | "respondida"
        | "sem_retorno"
      pedido_status_entrega: "preparando" | "enviado" | "entregue"
      pedido_status_pagamento: "aguardando" | "pago" | "estornado"
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
      evento_calendario_tipo: ["promocao", "evento", "novidade"],
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
      mensagem_status_contato: [
        "enviada",
        "vista",
        "respondida",
        "sem_retorno",
      ],
      pedido_status_entrega: ["preparando", "enviado", "entregue"],
      pedido_status_pagamento: ["aguardando", "pago", "estornado"],
    },
  },
} as const
