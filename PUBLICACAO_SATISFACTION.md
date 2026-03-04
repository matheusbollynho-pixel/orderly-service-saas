# 📋 Documentação: Página Pública de Satisfação

## 🎯 Visão Geral

A página pública de satisfação permite que clientes avaliem seu atendimento e serviço através de um link único (`public_token`) enviado via WhatsApp. O sistema carrega automaticamente os nomes do atendente e mecânico responsáveis, personalizando completamente a experiência.

---

## 🔗 URL da Página

```
https://os-bandara.vercel.app/avaliar/{public_token}
```

**Exemplo:**
```
https://os-bandara.vercel.app/avaliar/4c89e9ff5d594fc19fe4bdedefbd7b1ef29430e0213c40aa941c713b1bc6b0d6
```

---

## 📱 Fluxo de Dados

### 1. Carregamento da Página (GET)
Quando o cliente abre o link, o frontend faz uma requisição GET:

```javascript
const res = await fetch(
  `${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token || '')}`
);
```

### 2. Edge Function retorna os dados (`satisfaction-public`)

A função busca:
- **satisfaction_ratings**: Record com `public_token`
- **service_orders**: Dados da ordem de serviço
- **mechanics**: Nome do mecânico responsável
- **staff_members**: Nome do atendente do balcão

```json
{
  "success": true,
  "order": {
    "client_name": "JULIA VITORIA",
    "equipment": "Moto XYZ",
    "client_phone": "75991637892"
  },
  "mechanic": {
    "name": "João Silva"
  },
  "atendimento": {
    "name": "Maria Santos"
  },
  "rating": {
    "atendimento_rating": null,
    "servico_rating": null,
    "tags": {
      "atendimento": [],
      "servico": []
    }
  }
}
```

### 3. Frontend Renderiza com Nomes Dinâmicos

Os nomes carregados são usados em **todos os lugares**:

```jsx
// Seção Balcão
<p className="font-medium">{atendimento?.name}</p>
<p className="font-medium text-base">
  Como foi o atendimento de {atendimento?.name} no balcão?
</p>

// Seção Oficina
<p className="font-medium">{mechanic?.name}</p>
<p className="font-medium text-base">
  Como ficou o serviço de {mechanic?.name} na sua moto?
</p>

// Tela de Sucesso
<p>
  Ficamos muito felizes, {order?.client_name}! 🎉
  O {mechanic?.name} vai adorar saber disso.
</p>
```

### 4. Cliente Submete Avaliação (POST)

```javascript
const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token,
    atendimento_rating: 5,        // 1-5 para balcão
    servico_rating: 4,             // 1-5 para oficina
    tags: {
      atendimento: ['Educação', 'Rapidez'],
      servico: ['Qualidade', 'Bem Feito']
    },
    comment: 'Ótimo atendimento!',
    recommends: true
  })
});
```

### 5. Dados Salvos no Banco

```sql
UPDATE satisfaction_ratings SET
  atendimento_rating = 5,
  servico_rating = 4,
  tags = '{"atendimento":["Educação","Rapidez"],"servico":["Qualidade","Bem Feito"]}'::jsonb,
  comment = 'Ótimo atendimento!',
  recommends = true,
  status = 'pendente',
  responded_at = '2026-03-03T10:30:00Z'
WHERE public_token = '{token}'
```

---

## 🎨 Componentes Principais

### `PublicSatisfactionPage.tsx`

#### States
```typescript
const [atendimento, setAtendimento] = useState<any>(null);  // Staff member
const [mechanic, setMechanic] = useState<any>(null);        // Mechanic
const [order, setOrder] = useState<any>(null);              // Service order
const [atendimentoRating, setAtendimentoRating] = useState(0);
const [servicoRating, setServicoRating] = useState(0);
const [atendimentoTags, setAtendimentoTags] = useState<string[]>([]);
const [servicoTags, setServicoTags] = useState<string[]>([]);
```

#### Carregamento de Dados
```typescript
useEffect(() => {
  const load = async () => {
    // Fetch a partir do token
    const res = await fetch(
      `${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token || '')}`
    );
    const data = await res.json();
    
    // Popula os estados com dados do banco
    setOrder(data.order || null);
    setMechanic(data.mechanic || null);
    setAtendimento(data.atendimento || null);
    // ... continua carregando ratings anteriores se existirem
  };
  
  load();
}, [token]);
```

#### Lógica de Sucesso Condicional
```typescript
const isHighRating = useMemo(() => {
  return atendimentoRating >= 4 && servicoRating >= 4;
}, [atendimentoRating, servicoRating]);

const isLowRating = useMemo(() => {
  return atendimentoRating <= 3 || servicoRating <= 3;
}, [atendimentoRating, servicoRating]);

// Na renderização:
{isHighRating ? (
  <>
    <p className="font-medium text-green-700">
      Ficamos muito felizes, {order?.client_name}! 🎉
    </p>
    <Button onClick={() => window.open('https://g.page/r/CeBandaraMotos/review', '_blank')}>
      ⭐ Avaliar no Google Maps
    </Button>
  </>
) : isLowRating ? (
  <>
    <p className="font-medium text-orange-700">
      Obrigado pelo feedback sincero, {order?.client_name} 🙏
    </p>
    <p>Lamentamos que a experiência não tenha sido ideal...</p>
  </>
) : (
  <p>Obrigado! Sua avaliação foi registrada com sucesso. 💚</p>
)}
```

### `TagPills` Component

```typescript
function TagPills({
  area,           // 'balcao' | 'oficina'
  score,          // 1-5
  selected,       // string[]
  onToggle,       // (tag: string) => void
}) {
  const isPositive = score >= 4;
  
  const options = area === 'balcao' 
    ? (isPositive ? BALCAO_POSITIVE_TAGS : BALCAO_IMPROVEMENT_TAGS)
    : (isPositive ? OFICINA_POSITIVE_TAGS : OFICINA_IMPROVEMENT_TAGS);
  
  // Renderiza botões clicáveis para cada tag
}
```

#### Tags Configuradas

**Balcão - Positivas (4-5⭐)**
- Educação
- Rapidez
- Transparência
- Simpatia
- Agilidade

**Balcão - Melhorias (1-3⭐)**
- Demora no balcão
- Falta de Atenção
- Falta de Informação
- Preço Caro
- Não Entendia

**Oficina - Positivas (4-5⭐)**
- Qualidade
- Prazo Cumprido
- Moto Limpa
- Bem Feito
- Perfeição

**Oficina - Melhorias (1-3⭐)**
- Problema não resolvido
- Sujeira
- Demora
- Moto com Defeito
- Peças Trocadas Sem Avisar

---

## 📊 Estrutura do Banco de Dados

### Tabela: `satisfaction_ratings`

```sql
CREATE TABLE public.satisfaction_ratings (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,                    -- FK service_orders
  client_id UUID,                            -- FK clients
  atendimento_id UUID,                       -- FK staff_members
  mechanic_id UUID,                          -- FK mechanics
  
  atendimento_rating INT,                    -- 1-5
  servico_rating INT,                        -- 1-5
  
  tags JSONB DEFAULT '{"atendimento":[],"servico":[]}'::jsonb,
  comment TEXT,
  recommends BOOLEAN,
  
  status TEXT DEFAULT 'pendente',            -- 'pendente' | 'resolvido'
  responded_at TIMESTAMPTZ,
  
  public_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Exemplo de Record Salvo

```json
{
  "id": "12345-abc-def",
  "order_id": "671408a2-e572-406d-8800-d07e70a9d7ea",
  "client_id": "c001",
  "atendimento_id": "s001",
  "mechanic_id": "m001",
  "atendimento_rating": 5,
  "servico_rating": 4,
  "tags": {
    "atendimento": ["Educação", "Rapidez", "Simpatia"],
    "servico": ["Qualidade", "Bem Feito"]
  },
  "comment": "Excelente trabalho!",
  "recommends": true,
  "status": "pendente",
  "responded_at": "2026-03-03T10:30:00Z",
  "public_token": "4c89e9ff5d594fc19fe4bdedefbd7b1ef29430e0213c40aa941c713b1bc6b0d6"
}
```

---

## 🔐 Edge Function: `satisfaction-public`

### GET - Carregar Avaliação

```typescript
if (req.method === 'GET') {
  const token = url.searchParams.get('token');
  
  // 1. Busca satisfaction_ratings pelo token
  const { data: rating } = await supabase
    .from('satisfaction_ratings')
    .select('id, order_id, client_id, atendimento_id, mechanic_id, ...')
    .eq('public_token', token)
    .single();
  
  // 2. Busca dados da OS
  const { data: order } = await supabase
    .from('service_orders')
    .select('id, client_name, equipment, ...')
    .eq('id', rating.order_id)
    .single();
  
  // 3. Busca nome do mecânico
  const { data: mechanic } = row.mechanic_id
    ? await supabase
        .from('mechanics')
        .select('id, name')
        .eq('id', row.mechanic_id)
        .single()
    : { data: null };
  
  // 4. Busca nome do atendente
  const { data: atendimento } = row.atendimento_id
    ? await supabase
        .from('staff_members')
        .select('id, name, photo_url')
        .eq('id', row.atendimento_id)
        .single()
    : { data: null };
  
  return json({
    success: true,
    order,
    mechanic,
    atendimento,
    rating: { /* dados da avaliação */ }
  });
}
```

### POST - Salvar Avaliação

```typescript
if (req.method === 'POST') {
  const body = await req.json();
  const { token, atendimento_rating, servico_rating, tags, comment, recommends } = body;
  
  // 1. Valida notas
  if (!(atendimento_rating >= 1 && atendimento_rating <= 5)) {
    return json({ success: false, message: 'Notas inválidas' }, 400);
  }
  
  // 2. Verifica se já respondeu
  const { data: existing } = await supabase
    .from('satisfaction_ratings')
    .select('id, responded_at')
    .eq('public_token', token)
    .single();
  
  if (existing.responded_at) {
    return json({ success: false, message: 'Já respondida' }, 409);
  }
  
  // 3. Salva resposta (SEMPRE com status 'pendente')
  await supabase
    .from('satisfaction_ratings')
    .update({
      atendimento_rating,
      servico_rating,
      tags,
      comment,
      recommends,
      status: 'pendente',                    // ← IMPORTANTE
      responded_at: new Date().toISOString()
    })
    .eq('id', existing.id);
  
  return json({ success: true, message: 'Avaliação registrada' });
}
```

---

## 🎯 Personalização Completa

Todos os nomes são **100% dinâmicos**:

```
┌─────────────────────────────────────────────────┐
│         Você está avaliando:                    │
├─────────────────────────────────────────────────┤
│ 🎤 Atendimento no Balcão                        │
│    → [Nome do Atendente carregado do BD]        │
│                                                 │
│ 🔧 Mecânico Responsável                         │
│    → [Nome do Mecânico carregado do BD]         │
└─────────────────────────────────────────────────┘

🎤 SEÇÃO BALCÃO
├─ Como foi o atendimento de [Nome]? 
│  (Carregado dinamicamente)
├─ [5 Estrelas]
└─ [Tags específicas do balcão]

─────────────────────────────────────

🔧 SEÇÃO OFICINA
├─ Como ficou o serviço de [Nome]?
│  (Carregado dinamicamente)
├─ [5 Estrelas]
└─ [Tags específicas da oficina]

─────────────────────────────────────

SUCESSO (Dinâmico baseado na nota):
├─ Se 4-5⭐: "Ficamos felizes, [Cliente]!"
│            "O [Mecânico] vai adorar!"
│            [Botão Google]
│
├─ Se 1-3⭐: "Feedback sincero, [Cliente]"
│            "Nossa gerência vai analisar"
│
└─ Se outro: "Obrigado, sua avaliação foi registrada"
```

---

## 🚀 Como Usar

### 1. Criar Avaliação e Enviar Link

```javascript
// Seu backend cria a satisfaction_ratings e gera o token
const token = "4c89e9ff5d594fc19fe4bdedefbd7b1ef29430e0213c40aa941c713b1bc6b0d6";

// Envia via WhatsApp
const message = `Olá, JULIA! Sua opinião importa. Avalie aqui em 1 minuto: https://os-bandara.vercel.app/avaliar/${token}`;
await sendWhatsApp(message);
```

### 2. Cliente Acessa o Link

```
Cliente abre no WhatsApp → Carrega página →
Frontend busca dados (token) → API retorna nomes →
Cliente vê: "Como foi o atendimento de Maria Santos?"
             "Como ficou o serviço de João Silva?"
```

### 3. Cliente Avalia

```
Cliente clica 5 estrelas no balcão →
Sistema mostra tags positivas do balcão →
Cliente clica 4 estrelas na oficina →
Sistema mostra tags positivas da oficina →
Cliente submete → Vê mensagem de sucesso personalizada
```

### 4. Você Acompanha no Dashboard

```
Dashboard → Satisfação →
Filtrar por Atendente → Clique em "Maria Santos" →
Veja todas as avaliações dela com status "pendente" →
Clique em cada uma para marcar como "resolvido"
```

---

## ✅ Checklist de Implementação

- ✅ Nomes dinâmicos carregados via `public_token`
- ✅ Atendente e mecânico mostram nomes reais
- ✅ Tags separadas por área (balcão vs oficina)
- ✅ Telas de sucesso condicionais (high/low/medium rating)
- ✅ Status sempre salvo como 'pendente'
- ✅ Dados salvos com separação de tags (atendimento + servico)
- ✅ Edge Function retorna nomes corretamente
- ✅ Frontend renderiza nomes sem fallbacks

---

## 📝 Exemplo de Uso Completo

**URL:** `https://os-bandara.vercel.app/avaliar/4c89e9ff5d594fc19fe4bdedefbd7b1ef29430e0213c40aa941c713b1bc6b0d6`

**Página carrega:**
```
Cliente: JULIA VITORIA
Moto: Moto XYZ

Você está avaliando:
🎤 Maria Santos (balcão)
🔧 João Silva (mecânico)

───────────────────────────

🎤 ATENDIMENTO NO BALCÃO
Como foi o atendimento de Maria Santos no balcão?
[⭐⭐⭐⭐⭐]

Cliente clica na 5ª estrela:
✓ Educação
✓ Rapidez
✓ Transparência
✓ Simpatia
✓ Agilidade

───────────────────────────

🔧 SERVIÇO NA OFICINA
Como ficou o serviço de João Silva na sua moto?
[⭐⭐⭐⭐]

Cliente clica na 4ª estrela:
✓ Qualidade
✓ Bem Feito
✓ Prazo Cumprido
✓ Moto Limpa
✓ Perfeição

───────────────────────────

[Sim / Não] Recomendaria Bandara Motos?
[Comentário - opcional]
[Enviar avaliação]
```

**Cliente submete:**

```
Sucesso!

🎉 Ficamos muito felizes, JULIA VITORIA!
O João Silva vai adorar saber disso.

[⭐ Avaliar no Google Maps]
```

**Banco fica com:**
```json
{
  "atendimento_rating": 5,
  "servico_rating": 4,
  "tags": {
    "atendimento": ["Educação", "Rapidez", "Transparência", "Simpatia", "Agilidade"],
    "servico": ["Qualidade", "Bem Feito", "Prazo Cumprido", "Moto Limpa", "Perfeição"]
  },
  "status": "pendente",
  "responded_at": "2026-03-03T10:30:00Z"
}
```

---

## 🔧 Troubleshooting

**Problema:** Ainda vendo "Nossa Equipe" ou "Nossa Oficina"

**Solução:** 
1. Verifique se `atendimento_id` ou `mechanic_id` estão NULL na OS
2. Confirme que staff_members e mechanics têm registros no banco
3. Teste chamando a API diretamente:
```bash
curl "https://xqndblstrblqleraepzs.supabase.co/functions/v1/satisfaction-public?token=4c89e9ff5d594fc19fe4bdedefbd7b1ef29430e0213c40aa941c713b1bc6b0d6"
```
Procure por `"mechanic": { "name": "..." }` na resposta.

---

## 📂 Arquivos Modificados

- `src/pages/PublicSatisfactionPage.tsx` - Frontend da avaliação pública
- `supabase/functions/satisfaction-public/index.ts` - API que carrega os dados

---

**Última atualização:** 3 de março de 2026
**Status:** ✅ Produção
**URL:** https://os-bandara.vercel.app/avaliar/{token}
