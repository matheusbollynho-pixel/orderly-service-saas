#!/usr/bin/env python3
"""
Script para executar a migration de staff tracking no Supabase
"""
import os
from supabase import create_client, Client

# Configuração do Supabase
SUPABASE_URL = "https://xqndblstrblqleraepzs.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxbmRibHN0cmJscWxlcmFlcHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTIzMjA1NSwiZXhwIjoyMDUwODA4MDU1fQ.JXAYT_JEk_fYZ0GUGpTFLHMHkbdPr0wlHdAkQwCFJao"

# SQL da migration
MIGRATION_SQL = """
-- Add staff tracking columns to service_orders
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Add staff tracking column to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Add comments
COMMENT ON COLUMN public.service_orders.created_by_staff_id IS 'Staff member who created this service order';
COMMENT ON COLUMN public.service_orders.finalized_by_staff_id IS 'Staff member who finalized/received the payment';
COMMENT ON COLUMN public.payments.finalized_by_staff_id IS 'Staff member who finalized this payment';
"""

def main():
    print("🚀 Iniciando execução da migration de staff tracking...")
    
    try:
        # Criar cliente Supabase
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Executar SQL
        print("\n📝 Executando SQL...")
        result = supabase.rpc('exec_sql', {'query': MIGRATION_SQL}).execute()
        
        print("\n✅ Migration executada com sucesso!")
        print("\n📊 Resultado:", result)
        
    except Exception as e:
        print(f"\n❌ Erro ao executar migration: {str(e)}")
        print("\n⚠️ Execute manualmente no SQL Editor:")
        print("https://supabase.com/dashboard/project/xqndblstrblqleraepzs/sql/new")
        print("\n📋 SQL a executar:")
        print(MIGRATION_SQL)
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
