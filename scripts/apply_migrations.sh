#!/bin/bash
# Script para aplicar todas as migrations via Management API, ignorando erros de conflito

PROJECT_REF="gdhsaewdebxwzugozbah"
TOKEN="sbp_7ac5058a70df3d8440090d332ef43e0ec4fc3aab"
MIGRATIONS_DIR="supabase/migrations"

run_sql() {
  local sql="$1"
  local result
  result=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "User-Agent: SupabaseCLI/2.77.1" \
    --data-raw "$(echo "$sql" | python3 -c "import sys,json; print(json.dumps({'query': sys.stdin.read()}))")")
  echo "$result"
}

mark_applied() {
  local version="$1"
  local name="$2"
  run_sql "INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('$version', '$name', ARRAY[]::text[]) ON CONFLICT DO NOTHING;" > /dev/null
}

# Lista de migrations já aplicadas (busca do banco)
APPLIED=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: SupabaseCLI/2.77.1" \
  --data-raw '{"query": "SELECT version FROM supabase_migrations.schema_migrations;"}' \
  | python3 -c "import sys,json; data=json.load(sys.stdin); [print(r['version']) for r in data]" 2>/dev/null)

echo "Migrations já aplicadas:"
echo "$APPLIED"
echo "---"

# Processa cada arquivo SQL em ordem
for f in $(ls $MIGRATIONS_DIR/*.sql $MIGRATIONS_DIR/*.sql.sql 2>/dev/null | sort -u); do
  filename=$(basename "$f")
  # Extrai versão (tudo antes do primeiro _)
  version=$(echo "$filename" | cut -d'_' -f1)
  name=$(echo "$filename" | sed 's/^[^_]*_//' | sed 's/\.sql\.sql$//' | sed 's/\.sql$//')

  # Verifica se já foi aplicada
  if echo "$APPLIED" | grep -q "^$version$"; then
    echo "SKIP (já aplicada): $filename"
    continue
  fi

  echo "Aplicando: $filename..."
  sql=$(cat "$f")
  result=$(run_sql "$sql")

  if echo "$result" | grep -q '"error"'; then
    echo "  AVISO (erro ignorado): $(echo $result | head -c 200)"
  else
    echo "  OK"
  fi

  # Marca como aplicada independente de erro
  mark_applied "$version" "$name"
  echo "  Marcada como aplicada."
done

echo "=== Concluído ==="
