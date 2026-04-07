#!/usr/bin/env bash
# =============================================================================
# setup-new-client.sh
# Cria e configura projeto Supabase + Vercel para um novo cliente
#
# Uso:
#   ./scripts/setup-new-client.sh \
#     --token sbp_XXXXX \
#     --name "Nome da Oficina" \
#     --db-password "SenhaForte123!" \
#     --plan basico \
#     --vehicle moto \
#     --app-url "https://cliente.vercel.app" \
#     --whatsapp-provider uazapi \
#     --uazapi-server "https://uazapi.cliente.com" \
#     --uazapi-token "TOKEN" \
#     --vercel-token "VERCEL_TOKEN"
#
# --plan:     basico (R$79) | profissional (R$149) | premium (R$219)
# --vehicle:  moto (padrão) | carro
# --whatsapp-provider: uazapi (padrão) | zapi
#
# PLANOS:
#   Básico R$79        — OS, PDF, agenda, histórico de clientes (até 2 usuários)
#   Profissional R$149 — + balcão/PDV, estoque, caixa, satisfação, WhatsApp
#                         automático, lembretes, fiados, boletos
#   Premium R$219      — + IA atendimento 24h, IA estoque, domínio próprio
# =============================================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}━━ $1 ━━${NC}"; }

# ---------- argumentos ----------
TOKEN=""
CLIENT_NAME=""
DB_PASSWORD=""
REGION="sa-east-1"
PLAN="profissional"
VEHICLE="moto"
APP_URL=""
WHATSAPP_PROVIDER="uazapi"

# UazAPI
UAZAPI_SERVER=""
UAZAPI_TOKEN=""
UAZAPI_INSTANCE_TOKEN=""

# ZAPI
ZAPI_INSTANCE_ID=""
ZAPI_TOKEN=""
ZAPI_CLIENT_TOKEN=""

# Vercel
VERCEL_TOKEN=""
VERCEL_TEAM_ID=""
VERCEL_PROJECT_ID=""   # se já tiver projeto criado no Vercel, passar o ID

# Outros opcionais
ANTHROPIC_KEY=""
API_BRASIL_TOKEN=""
ASAAS_KEY=""
LOGO_PATH="logo.png"
ICON_PATH="favicon.ico"
AVISO_HORAS="2"

while [[ $# -gt 0 ]]; do
  case $1 in
    --token)              TOKEN="$2";              shift 2 ;;
    --name)               CLIENT_NAME="$2";        shift 2 ;;
    --db-password)        DB_PASSWORD="$2";        shift 2 ;;
    --region)             REGION="$2";             shift 2 ;;
    --plan)               PLAN="$2";               shift 2 ;;
    --vehicle)            VEHICLE="$2";            shift 2 ;;
    --app-url)            APP_URL="$2";            shift 2 ;;
    --whatsapp-provider)  WHATSAPP_PROVIDER="$2";  shift 2 ;;
    --uazapi-server)      UAZAPI_SERVER="$2";      shift 2 ;;
    --uazapi-token)       UAZAPI_TOKEN="$2";       shift 2 ;;
    --uazapi-instance)    UAZAPI_INSTANCE_TOKEN="$2"; shift 2 ;;
    --zapi-instance)      ZAPI_INSTANCE_ID="$2";  shift 2 ;;
    --zapi-token)         ZAPI_TOKEN="$2";         shift 2 ;;
    --zapi-client-token)  ZAPI_CLIENT_TOKEN="$2";  shift 2 ;;
    --vercel-token)       VERCEL_TOKEN="$2";       shift 2 ;;
    --vercel-team)        VERCEL_TEAM_ID="$2";     shift 2 ;;
    --vercel-project-id)  VERCEL_PROJECT_ID="$2";  shift 2 ;;
    --anthropic-key)      ANTHROPIC_KEY="$2";      shift 2 ;;
    --api-brasil-token)   API_BRASIL_TOKEN="$2";   shift 2 ;;
    --asaas-key)          ASAAS_KEY="$2";          shift 2 ;;
    --logo-path)          LOGO_PATH="$2";          shift 2 ;;
    --icon-path)          ICON_PATH="$2";          shift 2 ;;
    --aviso-horas)        AVISO_HORAS="$2";        shift 2 ;;
    *) error "Argumento desconhecido: $1" ;;
  esac
done

# ---------- validações ----------
[[ -z "$TOKEN" ]]       && error "Falta --token"
[[ -z "$CLIENT_NAME" ]] && error "Falta --name"
[[ -z "$DB_PASSWORD" ]] && error "Falta --db-password"
[[ "$PLAN" != "basico" && "$PLAN" != "profissional" && "$PLAN" != "premium" ]] \
  && error "--plan deve ser 'basico', 'profissional' ou 'premium'"
[[ "$VEHICLE" != "moto" && "$VEHICLE" != "carro" ]] \
  && error "--vehicle deve ser 'moto' ou 'carro'"

if [[ "$WHATSAPP_PROVIDER" == "uazapi" && "$PLAN" != "basico" ]]; then
  [[ -z "$UAZAPI_SERVER" ]] && error "Falta --uazapi-server"
  [[ -z "$UAZAPI_TOKEN" ]]  && error "Falta --uazapi-token"
fi
if [[ "$WHATSAPP_PROVIDER" == "zapi" && "$PLAN" != "basico" ]]; then
  [[ -z "$ZAPI_INSTANCE_ID" ]]  && error "Falta --zapi-instance"
  [[ -z "$ZAPI_TOKEN" ]]        && error "Falta --zapi-token"
  [[ -z "$ZAPI_CLIENT_TOKEN" ]] && error "Falta --zapi-client-token"
fi

# ---------- funções por plano ----------
# Básico: apenas OS, PDF, agenda, histórico de clientes
FUNCTIONS_BASICO=(
  "send-appointment-confirmation"
  "agendamento-lembrete-dia-anterior"
  "os-pronta-aviso"
  "enviar-documento-whatsapp"
  "enviar-imagem-whatsapp"
)

# Profissional: tudo do básico + balcão, estoque, caixa, satisfação,
#               WhatsApp automático, lembretes, fiados, boletos
FUNCTIONS_PROFISSIONAL=(
  "${FUNCTIONS_BASICO[@]}"
  "satisfaction-public"
  "send-satisfaction-survey"
  "send-balcao-followup"
  "send-birthday-messages"
  "check-maintenance-reminders"
  "webhook-whatsapp"
  "boleto-alertas"
  "asaas-webhook"
  "asaas-cobranca"
  "fiado-asaas-cobranca"
  "fiado-cobranca-auto"
  "crisis-alert"
  "zapi-webhook"
)

# Premium: tudo do profissional + IA atendimento + IA estoque
FUNCTIONS_PREMIUM=(
  "${FUNCTIONS_PROFISSIONAL[@]}"
  "ia-atendimento"
  "ai-fill-product"
  "ia-vendas"
)

# Selecionar lista por plano
case "$PLAN" in
  basico)        FUNCTIONS=("${FUNCTIONS_BASICO[@]}") ;;
  profissional)  FUNCTIONS=("${FUNCTIONS_PROFISSIONAL[@]}") ;;
  premium)       FUNCTIONS=("${FUNCTIONS_PREMIUM[@]}") ;;
esac

# ---------- preço do plano ----------
case "$PLAN" in
  basico)       PLANO_LABEL="Básico — R\$79/mês" ;;
  profissional) PLANO_LABEL="Profissional — R\$149/mês" ;;
  premium)      PLANO_LABEL="Premium — R\$219/mês" ;;
esac

# ---------- derivados ----------
SLUG=$(echo "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | cut -c1-30 | sed 's/-$//')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         SETUP NOVO CLIENTE               ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Nome:${NC}     $CLIENT_NAME"
echo -e "  ${BOLD}Plano:${NC}    $PLANO_LABEL"
echo -e "  ${BOLD}Veículo:${NC}  $VEHICLE"
echo -e "  ${BOLD}WhatsApp:${NC} $WHATSAPP_PROVIDER"
echo -e "  ${BOLD}Região:${NC}   $REGION"
echo -e "  ${BOLD}Funções:${NC}  ${#FUNCTIONS[@]}"
echo ""

# =============================================================================
# STEP 1 — Criar projeto Supabase
# =============================================================================
step "1/5 SUPABASE — Criar Projeto"

ORG_ID=$(curl -s "https://api.supabase.com/v1/organizations" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
orgs = json.load(sys.stdin)
if not orgs: exit(1)
print(orgs[0]['id'])
" 2>/dev/null) || error "Não foi possível obter organização. Verifique o token."

info "Organização: $ORG_ID"

CREATE_RESP=$(curl -s -X POST "https://api.supabase.com/v1/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$CLIENT_NAME\",
    \"organization_id\": \"$ORG_ID\",
    \"db_pass\": \"$DB_PASSWORD\",
    \"region\": \"$REGION\",
    \"plan\": \"free\"
  }")

PROJECT_REF=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[[ -z "$PROJECT_REF" ]] && { echo "$CREATE_RESP"; error "Falha ao criar projeto."; }

success "Projeto criado: $PROJECT_REF"

# =============================================================================
# STEP 2 — Aguardar projeto ativo
# =============================================================================
step "2/5 SUPABASE — Aguardando Projeto Ficar Ativo"

for i in $(seq 1 30); do
  STATUS=$(curl -s "https://api.supabase.com/v1/projects/$PROJECT_REF" \
    -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)

  if [[ "$STATUS" == "ACTIVE_HEALTHY" ]]; then
    success "Projeto ativo!"
    break
  fi

  echo "  Status: $STATUS ($i/30)..."
  sleep 5
done

[[ "$STATUS" != "ACTIVE_HEALTHY" ]] && warn "Projeto pode não estar totalmente ativo. Continuando..."

# =============================================================================
# STEP 3 — Rodar migrations
# =============================================================================
step "3/5 SUPABASE — Migrations"

M_OK=0; M_WARN=0

for SQL_FILE in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
  FNAME=$(basename "$SQL_FILE")

  RESULT=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(python3 -c "import json; print(json.dumps(open('$SQL_FILE').read()))")}" 2>/dev/null)

  ERR=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message',''))" 2>/dev/null)

  if [[ -n "$ERR" && "$ERR" != "null" && "$ERR" != "" ]]; then
    warn "$FNAME — $ERR"
    ((M_WARN++)) || true
  else
    success "$FNAME"
    ((M_OK++)) || true
  fi
done

info "Migrations: $M_OK OK, $M_WARN avisos"

# =============================================================================
# STEP 4 — Secrets + Deploy Edge Functions
# =============================================================================
step "4/5 SUPABASE — Secrets e Edge Functions"

SB_URL="https://$PROJECT_REF.supabase.co"

KEYS=$(curl -s "https://api.supabase.com/v1/projects/$PROJECT_REF/api-keys" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
ANON_KEY=$(echo "$KEYS" | python3 -c "import sys,json; [print(k['api_key']) for k in json.load(sys.stdin) if k['name']=='anon']" 2>/dev/null)
SERVICE_KEY=$(echo "$KEYS" | python3 -c "import sys,json; [print(k['api_key']) for k in json.load(sys.stdin) if k['name']=='service_role']" 2>/dev/null)

set_secret() {
  local KEY="$1"; local VAL="$2"
  [[ -z "$VAL" ]] && return
  curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/secrets" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "[{\"name\":\"$KEY\",\"value\":\"$VAL\"}]" > /dev/null 2>&1
  success "Secret: $KEY"
}

# Secrets base (todos os planos)
set_secret "SUPABASE_URL"              "$SB_URL"
set_secret "SB_URL"                    "$SB_URL"
set_secret "SUPABASE_SERVICE_ROLE_KEY" "$SERVICE_KEY"
set_secret "SB_SERVICE_KEY"            "$SERVICE_KEY"
set_secret "APP_BASE_URL"              "${APP_URL:-$SB_URL}"
set_secret "CORS_ALLOWED_ORIGIN"       "${APP_URL:-*}"
set_secret "AVISO_RETIRADA_HORAS"      "$AVISO_HORAS"
set_secret "PLAN"                      "$PLAN"

# WhatsApp (plano profissional+)
if [[ "$PLAN" != "basico" ]]; then
  set_secret "WHATSAPP_PROVIDER" "$WHATSAPP_PROVIDER"

  if [[ "$WHATSAPP_PROVIDER" == "uazapi" ]]; then
    set_secret "UAZAPI_SERVER_URL"   "$UAZAPI_SERVER"
    set_secret "UAZAPI_BASE_URL"     "$UAZAPI_SERVER"
    set_secret "UAZAPI_AUTH_TOKEN"   "$UAZAPI_TOKEN"
    set_secret "UAZAPI_TOKEN"        "$UAZAPI_TOKEN"
    set_secret "UAZAPI_AUTH_HEADER"  "Authorization"
    set_secret "UAZAPI_AUTH_TYPE"    "Bearer"
    set_secret "UAZAPI_TEXT_PATH"    "/message/text"
    set_secret "UAZAPI_MESSAGE_FIELD" "text"
    [[ -n "$UAZAPI_INSTANCE_TOKEN" ]] && set_secret "UAZAPI_INSTANCE_TOKEN" "$UAZAPI_INSTANCE_TOKEN"
  fi

  if [[ "$WHATSAPP_PROVIDER" == "zapi" ]]; then
    set_secret "ZAPI_INSTANCE_ID"  "$ZAPI_INSTANCE_ID"
    set_secret "ZAPI_TOKEN"        "$ZAPI_TOKEN"
    set_secret "ZAPI_CLIENT_TOKEN" "$ZAPI_CLIENT_TOKEN"
  fi
fi

# Asaas (profissional+)
[[ "$PLAN" != "basico" && -n "$ASAAS_KEY" ]] && set_secret "ASAAS_API_KEY" "$ASAAS_KEY"

# IA (apenas premium)
if [[ "$PLAN" == "premium" ]]; then
  [[ -n "$ANTHROPIC_KEY" ]] && set_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_KEY"
fi

# Deploy funções do plano
info "Deployando ${#FUNCTIONS[@]} funções para o plano $PLAN..."
F_OK=0; F_FAIL=0

for FUNC in "${FUNCTIONS[@]}"; do
  RESULT=$(SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase functions deploy "$FUNC" \
    --project-ref "$PROJECT_REF" --no-verify-jwt --use-api 2>&1)

  if echo "$RESULT" | grep -q "Deployed Functions"; then
    success "Function: $FUNC"
    ((F_OK++)) || true
  else
    warn "Function $FUNC: $(echo "$RESULT" | grep -i 'error\|fail\|unexpected' | head -1)"
    ((F_FAIL++)) || true
  fi
done

info "Functions: $F_OK OK, $F_FAIL com erro"

# =============================================================================
# STEP 5 — Vercel
# =============================================================================
step "5/5 VERCEL — Projeto e Variáveis"

if [[ -z "$VERCEL_TOKEN" ]]; then
  warn "Token Vercel não fornecido — pulando."
else
  VERCEL_API="https://api.vercel.com"
  VH=(-H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json")
  TEAM_PARAM=""; [[ -n "$VERCEL_TEAM_ID" ]] && TEAM_PARAM="?teamId=$VERCEL_TEAM_ID"

  # Criar ou usar projeto existente
  if [[ -z "$VERCEL_PROJECT_ID" ]]; then
    info "Criando projeto Vercel: $SLUG..."
    V_RESP=$(curl -s -X POST "$VERCEL_API/v10/projects$TEAM_PARAM" "${VH[@]}" \
      -d "{
        \"name\": \"$SLUG\",
        \"framework\": \"vite\",
        \"gitRepository\": {
          \"type\": \"github\",
          \"repo\": \"matheusbollynho-pixel/orderly-service-saas\"
        }
      }")
    VERCEL_PROJECT_ID=$(echo "$V_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  fi

  if [[ -z "$VERCEL_PROJECT_ID" ]]; then
    warn "Não criou projeto Vercel. Adicione as vars manualmente (listadas no resumo abaixo)."
  else
    success "Projeto Vercel: $VERCEL_PROJECT_ID"

    add_env() {
      local K="$1"; local V="$2"
      [[ -z "$V" ]] && return
      curl -s -X POST "$VERCEL_API/v10/projects/$VERCEL_PROJECT_ID/env$TEAM_PARAM" "${VH[@]}" \
        -d "{\"key\":\"$K\",\"value\":\"$V\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}" > /dev/null 2>&1
      success "Vercel env: $K"
    }

    add_env "VITE_SUPABASE_URL"             "$SB_URL"
    add_env "VITE_SUPABASE_PUBLISHABLE_KEY" "$ANON_KEY"
    add_env "VITE_COMPANY_NAME"             "$CLIENT_NAME"
    add_env "VITE_VEHICLE_LABEL"            "$VEHICLE"
    add_env "VITE_APP_TITLE"               "$CLIENT_NAME"
    add_env "VITE_LOGO_PATH"               "$LOGO_PATH"
    add_env "VITE_ICON_PATH"               "$ICON_PATH"
    [[ -n "$API_BRASIL_TOKEN" ]] && add_env "VITE_API_BRASIL_TOKEN" "$API_BRASIL_TOKEN"

    # Premium: domínio próprio configurado no Vercel
    if [[ "$PLAN" == "premium" && -n "$APP_URL" ]]; then
      DOMAIN=$(echo "$APP_URL" | sed 's|https\?://||')
      info "Configurando domínio: $DOMAIN"
      curl -s -X POST "$VERCEL_API/v10/projects/$VERCEL_PROJECT_ID/domains$TEAM_PARAM" "${VH[@]}" \
        -d "{\"name\":\"$DOMAIN\"}" > /dev/null 2>&1
      success "Domínio adicionado ao Vercel: $DOMAIN"
    fi
  fi
fi

# =============================================================================
# RESUMO
# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║         SETUP CONCLUÍDO!                 ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Cliente:${NC}   $CLIENT_NAME"
echo -e "  ${BOLD}Plano:${NC}     $PLANO_LABEL"
echo -e "  ${BOLD}Veículo:${NC}   $VEHICLE"
echo -e "  ${BOLD}Dashboard:${NC} https://supabase.com/dashboard/project/$PROJECT_REF"
echo ""

echo -e "${YELLOW}${BOLD}Variáveis Vercel (caso precise adicionar manualmente):${NC}"
echo "  VITE_SUPABASE_URL=$SB_URL"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY"
echo "  VITE_COMPANY_NAME=$CLIENT_NAME"
echo "  VITE_VEHICLE_LABEL=$VEHICLE"
echo "  VITE_APP_TITLE=$CLIENT_NAME"
echo "  VITE_LOGO_PATH=$LOGO_PATH"
[[ -n "$API_BRASIL_TOKEN" ]] && echo "  VITE_API_BRASIL_TOKEN=$API_BRASIL_TOKEN"
echo ""

echo -e "${YELLOW}${BOLD}Próximos passos:${NC}"
echo "  1. Configurar dados da oficina no store_settings (Supabase Table Editor)"

if [[ "$PLAN" != "basico" ]]; then
  echo "  2. Configurar webhook WhatsApp → $SB_URL/functions/v1/webhook-whatsapp"
  [[ "$WHATSAPP_PROVIDER" == "zapi" ]] && \
    echo "     ou ZAPI → $SB_URL/functions/v1/zapi-webhook"
fi

if [[ "$PLAN" == "premium" ]]; then
  echo "  3. Confirmar chave Anthropic para IA de atendimento"
  echo "  4. Configurar domínio próprio no Vercel (DNS)"
fi

echo "  $([ "$PLAN" == "basico" ] && echo 2 || echo 3). Fazer deploy no Vercel e testar"
echo ""
