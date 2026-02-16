import os
import psycopg2

# Connection string
conn_str = "postgresql://postgres:[password]@db.xqndblstrblqleraepzs.supabase.co:5432/postgres"

# Read the SQL file
with open('supabase/migrations/202602162000_create_test_satisfaction_rpc.sql', 'r') as f:
    sql = f.read()

try:
    conn = psycopg2.connect(conn_str)
    cursor = conn.cursor()
    cursor.execute(sql)
    conn.commit()
    print("✅ RPC function created successfully!")
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    if conn:
        cursor.close()
        conn.close()
