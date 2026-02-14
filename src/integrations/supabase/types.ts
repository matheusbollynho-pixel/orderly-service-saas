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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      materials: {
        Row: {
          id: string
          order_id: string
          descricao: string
          quantidade: string
          valor: number
          // Optional fields may exist in DB; keep lenient for client
          is_service?: boolean | null
          mechanic_id?: string | null
          paid_at?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          descricao: string
          quantidade: string
          valor?: number
          is_service?: boolean | null
          mechanic_id?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          descricao?: string
          quantidade?: string
          valor?: number
          is_service?: boolean | null
          mechanic_id?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      },
      checklist_items: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          label: string
          order_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          label: string
          order_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          label?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ,
      payments: {
        Row: {
          id: string
          order_id: string
          amount: number
          method: 'dinheiro' | 'pix' | 'cartao' | 'credito' | 'debito' | 'transferencia' | 'outro'
          reference: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          amount: number
          method: 'dinheiro' | 'pix' | 'cartao' | 'credito' | 'debito' | 'transferencia' | 'outro'
          reference?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          amount?: number
          method?: 'dinheiro' | 'pix' | 'cartao' | 'credito' | 'debito' | 'transferencia' | 'outro'
          reference?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey",
            columns: ["order_id"],
            isOneToOne: false,
            referencedRelation: "service_orders",
            referencedColumns: ["id"],
          },
        ]
      },
      cash_flow: {
        Row: {
          id: string
          date: string
          type: 'entrada' | 'saida' | 'retirada'
          amount: number
          description: string
          category: string | null
          payment_method: 'dinheiro' | 'pix' | 'credito' | 'debito' | 'transferencia' | 'outro' | null
          order_id: string | null
          payment_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          type: 'entrada' | 'saida' | 'retirada'
          amount: number
          description: string
          category?: string | null
          payment_method?: 'dinheiro' | 'pix' | 'credito' | 'debito' | 'transferencia' | 'outro' | null
          order_id?: string | null
          payment_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          type?: 'entrada' | 'saida' | 'retirada'
          amount?: number
          description?: string
          category?: string | null
          payment_method?: 'dinheiro' | 'pix' | 'credito' | 'debito' | 'transferencia' | 'outro' | null
          order_id?: string | null
          payment_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_order_id_fkey",
            columns: ["order_id"],
            isOneToOne: false,
            referencedRelation: "service_orders",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "cash_flow_payment_id_fkey",
            columns: ["payment_id"],
            isOneToOne: false,
            referencedRelation: "payments",
            referencedColumns: ["id"],
          },
        ]
      },
      clients: {
        Row: {
          id: string
          name: string
          cpf: string
          phone: string | null
          email: string | null
          whatsapp: string | null
          apelido: string | null
          instagram: string | null
          autoriza_instagram: boolean
          birth_date: string | null
          endereco: string | null
          cidade: string | null
          state: string | null
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          cpf: string
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          apelido?: string | null
          instagram?: string | null
          autoriza_instagram?: boolean
          birth_date?: string | null
          endereco?: string | null
          cidade?: string | null
          state?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          cpf?: string
          phone?: string | null
          email?: string | null
          whatsapp?: string | null
          apelido?: string | null
          instagram?: string | null
          autoriza_instagram?: boolean
          birth_date?: string | null
          endereco?: string | null
          cidade?: string | null
          state?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      },
      motorcycles: {
        Row: {
          id: string
          client_id: string
          placa: string
          marca: string
          modelo: string
          ano: number | null
          cilindrada: string | null
          cor: string | null
          motor: string | null
          chassi: string | null
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          placa: string
          marca: string
          modelo: string
          ano?: number | null
          cilindrada?: string | null
          cor?: string | null
          motor?: string | null
          chassi?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          placa?: string
          marca?: string
          modelo?: string
          ano?: number | null
          cilindrada?: string | null
          cor?: string | null
          motor?: string | null
          chassi?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorcycles_client_id_fkey",
            columns: ["client_id"],
            isOneToOne: false,
            referencedRelation: "clients",
            referencedColumns: ["id"],
          },
        ]
      }
      service_orders: {
        Row: {
          id: string
          client_id: string | null
          motorcycle_id: string | null
          client_address: string
          client_apelido: string
          client_cpf: string
          client_instagram: string
          autoriza_instagram: boolean
          client_name: string
          client_phone: string
          client_birth_date: string | null
          equipment: string
          problem_description: string
          status: Database["public"]["Enums"]["order_status"]
          signature_data: string | null
          terms_accepted: boolean
          entry_date: string | null
          exit_date: string | null
          mechanic_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          motorcycle_id?: string | null
          client_address: string
          client_apelido?: string
          client_cpf?: string
          client_instagram?: string
          autoriza_instagram?: boolean
          client_name: string
          client_phone: string
          client_birth_date?: string | null
          equipment: string
          problem_description: string
          status?: Database["public"]["Enums"]["order_status"]
          signature_data?: string | null
          terms_accepted?: boolean
          entry_date?: string | null
          exit_date?: string | null
          mechanic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          motorcycle_id?: string | null
          client_address?: string
          client_apelido?: string
          client_cpf?: string
          client_instagram?: string
          autoriza_instagram?: boolean
          client_name?: string
          client_phone?: string
          client_birth_date?: string | null
          equipment?: string
          problem_description?: string
          status?: Database["public"]["Enums"]["order_status"]
          signature_data?: string | null
          terms_accepted?: boolean
          entry_date?: string | null
          exit_date?: string | null
          mechanic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_client_id_fkey",
            columns: ["client_id"],
            isOneToOne: false,
            referencedRelation: "clients",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "service_orders_motorcycle_id_fkey",
            columns: ["motorcycle_id"],
            isOneToOne: false,
            referencedRelation: "motorcycles",
            referencedColumns: ["id"],
          },
        ]
      }
      checklist_photos: {
        Row: {
          id: string
          checklist_item_id: string
          order_id: string
          photo_url: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          checklist_item_id: string
          order_id: string
          photo_url: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          checklist_item_id?: string
          order_id?: string
          photo_url?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_photos_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
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
      order_status: "aberta" | "em_andamento" | "concluida"
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
      order_status: ["aberta", "em_andamento", "concluida"],
    },
  },
} as const
