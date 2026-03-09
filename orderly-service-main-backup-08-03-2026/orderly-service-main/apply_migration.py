#!/usr/bin/env python3
"""
Script para aplicar a migração de satisfação ao Supabase
"""
import os
import sys

try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 não instalado. Instalando...")
    os.system("pip install psycopg2-binary")
    import psycopg2

# Supabase connection details
SUPABASE_URL = "xqndblstrblqleraepzs"
DB_HOST = f"db.{SUPABASE_URL}.supabase.co"
DB_PORT = "5432"
DB_NAME = "postgres"
DB_USER = "postgres"

# Try to get password from environment
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")

if not DB_PASSWORD:
    print("❌ Variável SUPABASE_DB_PASSWORD não encontrada!")
    print("\nOpções:")
    print("1. Configure a variável de ambiente: $env:SUPABASE_DB_PASSWORD='sua-senha'")
    print("2. Ou execute a migração manualmente no Supabase Dashboard:")
    print("   - Acesse: https://supabase.com/dashboard/project/xqndblstrblqleraepzs")
    print("   - Vá para SQL Editor → New query")
    print("   - Cole o conteúdo de: supabase/migrations/202603030002_create_satisfaction_ratings_v2.sql")
    print("   - Clique Run")
    sys.exit(1)

# Read migration file
migration_file = "supabase/migrations/202603030002_create_satisfaction_ratings_v2.sql"

if not os.path.exists(migration_file):
    print(f"❌ Arquivo não encontrado: {migration_file}")
    sys.exit(1)

with open(migration_file, 'r') as f:
    sql_content = f.read()

# Connect and execute
try:
    print(f"🔗 Conectando ao Supabase ({DB_HOST})...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cursor = conn.cursor()
    
    print("📝 Executando migração...")
    cursor.execute(sql_content)
    conn.commit()
    
    print("✅ Migração aplicada com sucesso!")
    print("\n📊 Verificando tabelas criadas...")
    
    # Verify tables
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('staff_members', 'satisfaction_ratings')")
    tables = cursor.fetchall()
    
    for table in tables:
        print(f"  ✓ Tabela '{table[0]}' criada")
    
    cursor.close()
    conn.close()
    
except psycopg2.OperationalError as e:
    print(f"❌ Erro de conexão: {e}")
    print("\nVerifique:")
    print("1. A senha está correta")
    print("2. Você tem conexão com a internet")
    sys.exit(1)
except Exception as e:
    print(f"❌ Erro ao executar migração: {e}")
    sys.exit(1)
