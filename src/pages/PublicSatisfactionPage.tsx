import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const BALCAO_POSITIVE_TAGS = ['Educação', 'Rapidez', 'Transparência', 'Simpatia', 'Agilidade'];
const BALCAO_IMPROVEMENT_TAGS = ['Demora no balcão', 'Falta de Atenção', 'Falta de Informação', 'Preço Caro', 'Não Entendia'];

const OFICINA_POSITIVE_TAGS = ['Qualidade', 'Prazo Cumprido', 'Moto Limpa', 'Bem Feito', 'Perfeição'];
const OFICINA_IMPROVEMENT_TAGS = ['Problema não resolvido', 'Sujeira', 'Demora', 'Moto com Defeito', 'Peças Trocadas Sem Avisar'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

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

export default function PublicSatisfactionPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);

  const [order, setOrder] = useState<any>(null);
  const [mechanic, setMechanic] = useState<any>(null);
  const [atendimento, setAtendimento] = useState<any>(null);

  const [atendimentoRating, setAtendimentoRating] = useState(0);
  const [servicoRating, setServicoRating] = useState(0);
  const [atendimentoTags, setAtendimentoTags] = useState<string[]>([]);
  const [servicoTags, setServicoTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [recommends, setRecommends] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Carregando satisfação com token:', token);
        console.log('📍 Supabase URL:', supabaseUrl);
        
        const url = `${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token || '')}`;
        console.log('🌐 Chamando URL:', url);
        
        const res = await fetch(url);
        console.log('📡 Response status:', res.status);
        
        const data = await res.json();
        console.log('📦 Response data:', data);

        if (!res.ok || !data?.success) {
          const errorMsg = data?.message || 'Não foi possível carregar a avaliação';
          console.error('❌ Erro:', errorMsg);
          setError(errorMsg);
          return;
        }

        console.log('✅ Dados carregados com sucesso');
        setOrder(data.order || null);
        setMechanic(data.mechanic || null);
        setAtendimento(data.atendimento || null);
        setAlreadyResponded(!!data.alreadyResponded);

        if (data.rating) {
          setAtendimentoRating(data.rating.atendimento_rating || 0);
          setServicoRating(data.rating.servico_rating || 0);
          setComment(data.rating.comment || '');
          setRecommends(typeof data.rating.recommends === 'boolean' ? data.rating.recommends : null);
          setAtendimentoTags(Array.isArray(data.rating.tags?.atendimento) ? data.rating.tags.atendimento : []);
          setServicoTags(Array.isArray(data.rating.tags?.servico) ? data.rating.tags.servico : []);
        }
      } catch (e: any) {
        console.error('❌ Erro ao carregar:', e);
        setError(e?.message || 'Erro ao carregar');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token]);

  const finalRating = useMemo(() => {
    if (!atendimentoRating || !servicoRating) return 0;
    return (atendimentoRating + servicoRating) / 2;
  }, [atendimentoRating, servicoRating]);

  const isHighRating = useMemo(() => {
    return atendimentoRating >= 4 && servicoRating >= 4;
  }, [atendimentoRating, servicoRating]);

  const isLowRating = useMemo(() => {
    return atendimentoRating <= 3 || servicoRating <= 3;
  }, [atendimentoRating, servicoRating]);

  const toggleTag = (scope: 'atendimento' | 'servico', tag: string) => {
    if (scope === 'atendimento') {
      setAtendimentoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
      return;
    }

    setServicoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

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
    } catch (e: any) {
      setError(e?.message || 'Erro ao enviar');
    } finally {
      setSaving(false);
    }
  };

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
        <Card>
          <CardHeader>
            <CardTitle>Bandara Motos • Avaliação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Cliente: <span className="font-medium text-foreground">{order?.client_name || '-'}</span></p>
            <p>Moto/Equipamento: <span className="font-medium text-foreground">{order?.equipment || '-'}</span></p>
          </CardContent>
        </Card>

        {(atendimento || mechanic) && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Você está avaliando:</p>
              {atendimento && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border-2 border-blue-200">
                    <AvatarImage src={atendimento.photo_url || undefined} />
                    <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                      {atendimento.name?.charAt(0)?.toUpperCase() || '🎤'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground">Atendimento no Balcão</p>
                    <p className="font-medium">{atendimento.name || 'Equipe'}</p>
                  </div>
                </div>
              )}
              {mechanic && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border-2 border-orange-200">
                    <AvatarImage src={mechanic.photo_url || undefined} />
                    <AvatarFallback className="bg-orange-100 text-orange-700 font-semibold">
                      {mechanic.name?.charAt(0)?.toUpperCase() || '🔧'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground">Mecânico Responsável</p>
                    <p className="font-medium">{mechanic.name || 'Oficina'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* SEÇÃO BALCÃO */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2">
                <div className="text-lg">🎤</div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Atendimento no Balcão</p>
                  <p className="font-medium">{atendimento?.name}</p>
                </div>
              </div>
              
              <p className="font-medium text-base">
                {atendimento?.name 
                  ? `Como foi o atendimento de ${atendimento.name} no balcão?`
                  : 'Como foi o atendimento no balcão?'
                }
              </p>
              <Stars value={atendimentoRating} onChange={setAtendimentoRating} />
              
              {atendimentoRating > 0 && (
                <TagPills
                  area="balcao"
                  score={atendimentoRating}
                  selected={atendimentoTags}
                  onToggle={(tag) => toggleTag('atendimento', tag)}
                />
              )}
            </div>

            {/* DIVISOR VISUAL */}
            <div className="border-t pt-6" />

            {/* SEÇÃO OFICINA */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2">
                <div className="text-lg">🔧</div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Serviço na Oficina</p>
                  <p className="font-medium">{mechanic?.name}</p>
                </div>
              </div>
              
              <p className="font-medium text-base">
                {mechanic?.name 
                  ? `Como ficou o serviço de ${mechanic.name} na sua moto?`
                  : 'Como ficou o serviço na sua moto?'
                }
              </p>
              <Stars value={servicoRating} onChange={setServicoRating} />
              
              {servicoRating > 0 && (
                <TagPills
                  area="oficina"
                  score={servicoRating}
                  selected={servicoTags}
                  onToggle={(tag) => toggleTag('servico', tag)}
                />
              )}
            </div>

            {/* DIVISOR VISUAL */}
            <div className="border-t pt-6" />

            {/* SEÇÃO FINAL */}
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

        {submitted && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 space-y-4">
              <div className="text-center space-y-2">
                <div className="text-5xl">✅</div>
                <p className="font-bold text-lg text-green-700">
                  Avaliação enviada com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  Obrigado {order?.client_name || 'cliente'}, sua opinião é muito importante para nós.
                </p>
              </div>

              {isHighRating && (
                <>
                  <div className="bg-white p-4 rounded-lg border border-green-100">
                    <p className="font-medium text-green-700 mb-2">
                      🎉 Ficamos muito felizes com sua avaliação!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      O {mechanic?.name || 'mecânico'} vai adorar saber disso. Sua satisfação é o melhor prêmio para nossa equipe!
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    className="w-full bg-yellow-500 hover:bg-yellow-600"
                    onClick={() => {
                      // Link direto para adicionar review no Google Maps da Bandara Motos
                      window.open('https://www.google.com/maps/place/BANDARA+MOTOS/@-9.4442483,-38.2225858,20.58z/data=!4m8!3m7!1s0x70931f554af5bb9:0x5e55e62aa8ccbf9b!8m2!3d-9.4442315!4d-38.2223837!9m1!1b1!16s%2Fg%2F11j1fh_bdh?entry=ttu&g_ep=EgoyMDI2MDMwMS4xIKXMDSoASAFQAw%3D%3D', '_blank');
                    }}
                  >
                    ⭐ Avaliar no Google Maps
                  </Button>
                </>
              )}

              {isLowRating && (
                <div className="bg-white p-4 rounded-lg border border-orange-100">
                  <p className="font-medium text-orange-700 mb-2">
                    🙏 Obrigado pelo feedback sincero
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Lamentamos que a experiência não tenha sido ideal. Nossa gerência analisará seu caso com atenção e entraremos em contato para resolver qualquer pendência.
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    Estamos comprometidos em melhorar. Obrigado por nos dar essa chance!
                  </p>
                </div>
              )}

              {!isHighRating && !isLowRating && (
                <div className="bg-white p-4 rounded-lg border border-blue-100">
                  <p className="font-medium text-blue-700">
                    💙 Obrigado pela sua avaliação!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Sua opinião nos ajuda a melhorar cada vez mais.
                  </p>
                </div>
              )}

              <>
                <div className="space-y-2 pt-2">
                  <Button
                    type="button"
                    variant="default"
                    className="w-full bg-pink-600 hover:bg-pink-700"
                    onClick={() => window.open('https://www.instagram.com/bandaramotos/', '_blank')}
                  >
                    📸 Siga-nos no Instagram
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-sm"
                    onClick={() => window.close()}
                  >
                    ✕ Fechar esta página
                  </Button>
                </div>

                <div className="text-center pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    📱 Bandara Motos • Paulo Afonso-BA<br/>
                    (75) 98804-6356 • @BandaraMotos
                  </p>
                </div>
              </>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
