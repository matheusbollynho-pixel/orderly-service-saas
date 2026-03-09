// src/pages/PublicSatisfactionPage.tsx
// 📋 Página Pública de Satisfação - Nomes Dinâmicos Carregados do Banco

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

// ✅ Tags específicas para BALCÃO
const BALCAO_POSITIVE_TAGS = ['Educação', 'Rapidez', 'Transparência', 'Simpatia', 'Agilidade'];
const BALCAO_IMPROVEMENT_TAGS = ['Demora no balcão', 'Falta de Atenção', 'Falta de Informação', 'Preço Caro', 'Não Entendia'];

// ✅ Tags específicas para OFICINA
const OFICINA_POSITIVE_TAGS = ['Qualidade', 'Prazo Cumprido', 'Moto Limpa', 'Bem Feito', 'Perfeição'];
const OFICINA_IMPROVEMENT_TAGS = ['Problema não resolvido', 'Sujeira', 'Demora', 'Moto com Defeito', 'Peças Trocadas Sem Avisar'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

/**
 * 🏷️ Componente de Tags Dinâmicas
 * Mostra tags diferentes baseado na área (balcão/oficina) e nota (positiva/melhoria)
 */
function TagPills({
  area,
  score,
  selected,
  onToggle,
}: {
  area: 'balcao' | 'oficina';
  score: number;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  const isPositive = score >= 4;
  const options = area === 'balcao' 
    ? (isPositive ? BALCAO_POSITIVE_TAGS : BALCAO_IMPROVEMENT_TAGS)
    : (isPositive ? OFICINA_POSITIVE_TAGS : OFICINA_IMPROVEMENT_TAGS);

  const title = area === 'balcao' 
    ? (isPositive ? '✓ O que você achou bom no atendimento?' : '⚠ O que poderia melhorar no atendimento?')
    : (isPositive ? '✓ O que você achou bom no serviço?' : '⚠ O que poderia melhorar no serviço?');

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ⭐ Componente de Estrelas Clicáveis
 */
function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        const active = v <= value;
        return (
          <button key={v} type="button" onClick={() => onChange(v)} className="p-1">
            <Star className={cn('h-8 w-8', active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * 📱 Página Principal de Satisfação Pública
 * 
 * Fluxo:
 * 1. Carrega dados via token (GET)
 * 2. Busca nomes do atendente e mecânico no banco
 * 3. Cliente avalia e submete (POST)
 * 4. Exibe mensagem personalizada baseada na nota
 */
export default function PublicSatisfactionPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  // 👥 Dados carregados do banco
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [mechanic, setMechanic] = useState<Record<string, unknown> | null>(null);           // ✅ Nome do mecânico
  const [atendimento, setAtendimento] = useState<Record<string, unknown> | null>(null);     // ✅ Nome do atendente

  // ⭐ Avaliações e tags
  const [atendimentoRating, setAtendimentoRating] = useState(0);
  const [servicoRating, setServicoRating] = useState(0);
  const [atendimentoTags, setAtendimentoTags] = useState<string[]>([]);
  const [servicoTags, setServicoTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [recommends, setRecommends] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  /**
   * 📥 Carrega dados via token (GET satisfaction-public)
   */
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // Chama Edge Function com o token
        const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token || '')}`);
        const data = await res.json();

        if (!res.ok || !data?.success) {
          setError(data?.message || 'Não foi possível carregar a avaliação');
          return;
        }

        // ✅ Popula os nomes carregados do banco de dados
        setOrder(data.order || null);
        setMechanic(data.mechanic || null);          // Nome do mecânico
        setAtendimento(data.atendimento || null);    // Nome do atendente
        setAlreadyResponded(!!data.alreadyResponded);

        // Se houver avaliação anterior, carrega
        if (data.rating) {
          setAtendimentoRating(data.rating.atendimento_rating || 0);
          setServicoRating(data.rating.servico_rating || 0);
          setComment(data.rating.comment || '');
          setRecommends(typeof data.rating.recommends === 'boolean' ? data.rating.recommends : null);
          setAtendimentoTags(Array.isArray(data.rating.tags?.atendimento) ? data.rating.tags.atendimento : []);
          setServicoTags(Array.isArray(data.rating.tags?.servico) ? data.rating.tags.servico : []);
        }
      } catch (e) {
        setError((e as Error)?.message || 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  // Calcula nota final (média)
  const finalRating = useMemo(() => {
    if (!atendimentoRating || !servicoRating) return 0;
    return (atendimentoRating + servicoRating) / 2;
  }, [atendimentoRating, servicoRating]);

  // Verifica se é nota alta (4-5 em ambas)
  const isHighRating = useMemo(() => {
    return atendimentoRating >= 4 && servicoRating >= 4;
  }, [atendimentoRating, servicoRating]);

  // Verifica se é nota baixa (≤3 em alguma)
  const isLowRating = useMemo(() => {
    return atendimentoRating <= 3 || servicoRating <= 3;
  }, [atendimentoRating, servicoRating]);

  /**
   * Toggle de tags selecionadas
   */
  const toggleTag = (scope: 'atendimento' | 'servico', tag: string) => {
    if (scope === 'atendimento') {
      setAtendimentoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
      return;
    }

    setServicoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  /**
   * 📤 Submete a avaliação (POST satisfaction-public)
   */
  const handleSubmit = async () => {
    if (!atendimentoRating || !servicoRating || !token) {
      setError('Preencha as duas avaliações em estrelas.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          atendimento_rating: atendimentoRating,
          servico_rating: servicoRating,
          tags: {
            atendimento: atendimentoTags,
            servico: servicoTags,
          },
          comment: comment?.trim() || null,
          recommends,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.message || 'Não foi possível enviar avaliação');
        return;
      }

      setSubmitted(true);
      setAlreadyResponded(true);
    } catch (e) {
      setError((e as Error)?.message || 'Erro ao enviar');
    } finally {
      setSaving(false);
    }
  };

  // Estados de carregamento
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando avaliação...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-center px-4 text-red-600">{error}</div>;
  }

  if (alreadyResponded && !submitted) {
    return (
      <div className="min-h-screen bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Avaliação já registrada ✅</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Obrigado pelo seu feedback. A equipe da Bandara Motos agradece!</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        {/* Card de Informações da OS */}
        <Card>
          <CardHeader>
            <CardTitle>Bandara Motos • Avaliação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Cliente: <span className="font-medium text-foreground">{order?.client_name || '-'}</span></p>
            <p>Moto/Equipamento: <span className="font-medium text-foreground">{order?.equipment || '-'}</span></p>
          </CardContent>
        </Card>

        {/* Card identificando o atendente e mecânico */}
        {(atendimento || mechanic) && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Você está avaliando:</p>
              {atendimento && (
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-sm">
                    🎤
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Atendimento no Balcão</p>
                    <p className="font-medium">{atendimento.name || 'Equipe'}</p>
                  </div>
                </div>
              )}
              {mechanic && (
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-semibold text-sm">
                    🔧
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mecânico Responsável</p>
                    <p className="font-medium">{mechanic.name || 'Oficina'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card com o Formulário de Avaliação */}
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* ═══ SEÇÃO BALCÃO ═══ */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2">
                <div className="text-lg">🎤</div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Atendimento no Balcão</p>
                  {/* ✅ NOME DINÂMICO DO ATENDENTE */}
                  <p className="font-medium">{atendimento?.name}</p>
                </div>
              </div>
              
              {/* ✅ PERGUNTA DINÂMICA COM NOME */}
              <p className="font-medium text-base">
                {atendimento?.name 
                  ? `Como foi o atendimento de ${atendimento.name} no balcão?`
                  : 'Como foi o atendimento no balcão?'
                }
              </p>
              <Stars value={atendimentoRating} onChange={setAtendimentoRating} />
              
              {/* Tags específicas do balcão */}
              {atendimentoRating > 0 && (
                <TagPills
                  area="balcao"
                  score={atendimentoRating}
                  selected={atendimentoTags}
                  onToggle={(tag) => toggleTag('atendimento', tag)}
                />
              )}
            </div>

            {/* Divisor Visual */}
            <div className="border-t pt-6" />

            {/* ═══ SEÇÃO OFICINA ═══ */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2">
                <div className="text-lg">🔧</div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Serviço na Oficina</p>
                  {/* ✅ NOME DINÂMICO DO MECÂNICO */}
                  <p className="font-medium">{mechanic?.name}</p>
                </div>
              </div>
              
              {/* ✅ PERGUNTA DINÂMICA COM NOME */}
              <p className="font-medium text-base">
                {mechanic?.name 
                  ? `Como ficou o serviço de ${mechanic.name} na sua moto?`
                  : 'Como ficou o serviço na sua moto?'
                }
              </p>
              <Stars value={servicoRating} onChange={setServicoRating} />
              
              {/* Tags específicas da oficina */}
              {servicoRating > 0 && (
                <TagPills
                  area="oficina"
                  score={servicoRating}
                  selected={servicoTags}
                  onToggle={(tag) => toggleTag('servico', tag)}
                />
              )}
            </div>

            {/* Divisor Visual */}
            <div className="border-t pt-6" />

            {/* ═══ SEÇÃO FINAL ═══ */}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="font-medium">Recomendaria a Bandara Motos?</p>
                <div className="flex gap-2">
                  <Button type="button" variant={recommends === true ? 'default' : 'outline'} onClick={() => setRecommends(true)}>
                    Sim
                  </Button>
                  <Button type="button" variant={recommends === false ? 'default' : 'outline'} onClick={() => setRecommends(false)}>
                    Não
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-medium">Comentário (opcional)</p>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escreva um elogio ou ponto de melhoria..."
                  rows={4}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar avaliação'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══ TELA DE SUCESSO CONDICIONAL ═══ */}
        {submitted && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              {isHighRating ? (
                // ✅ Nota alta (4-5 em ambas)
                <>
                  <p className="font-medium text-green-700">
                    Ficamos muito felizes, {order?.client_name || 'cliente'}! 🎉
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {/* ✅ NOME DINÂMICO DO MECÂNICO */}
                    O {mechanic?.name || 'mecânico'} vai adorar saber disso. Sua satisfação é o melhor prêmio para nossa equipe!
                  </p>
                  <Button
                    type="button"
                    variant="default"
                    className="w-full"
                    onClick={() => window.open('https://g.page/r/CeBandaraMotos/review', '_blank')}
                  >
                    ⭐ Avaliar no Google Maps
                  </Button>
                </>
              ) : isLowRating ? (
                // ⚠ Nota baixa (≤3 em alguma)
                <>
                  <p className="font-medium text-orange-700">
                    Obrigado pelo feedback sincero, {order?.client_name || 'cliente'} 🙏
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Lamentamos que a experiência não tenha sido ideal. Nossa gerência analisará seu caso com atenção e entraremos em contato para resolver qualquer pendência.
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Estamos comprometidos em melhorar. Obrigado por nos dar essa chance!
                  </p>
                </>
              ) : (
                // 😊 Nota média
                <>
                  <p className="font-medium text-green-700">
                    Obrigado! Sua avaliação foi registrada com sucesso. 💚
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Cada feedback nos ajuda a melhorar. Valorizamos sua opinião!
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
