import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const POSITIVE_TAGS = ['Educação', 'Rapidez', 'Preço Justo', 'Moto Limpa', 'Transparência'];
const IMPROVEMENT_TAGS = ['Demora', 'Preço Caro', 'Problema não resolvido', 'Falta de Atenção', 'Sujeira'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

function TagPills({
  label,
  score,
  selected,
  onToggle,
}: {
  label: 'atendimento' | 'servico';
  score: number;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  const options = score >= 4 ? POSITIVE_TAGS : IMPROVEMENT_TAGS;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">{label === 'atendimento' ? 'Pontos do atendimento' : 'Pontos do serviço'}</p>
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

        const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token || '')}`);
        const data = await res.json();

        if (!res.ok || !data?.success) {
          setError(data?.message || 'Não foi possível carregar a avaliação');
          return;
        }

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

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <p className="font-medium">Como foi o atendimento de {atendimento?.name || 'nossa equipe'}?</p>
              <Stars value={atendimentoRating} onChange={setAtendimentoRating} />
              {atendimentoRating > 0 && (
                <TagPills
                  label="atendimento"
                  score={atendimentoRating}
                  selected={atendimentoTags}
                  onToggle={(tag) => toggleTag('atendimento', tag)}
                />
              )}
            </div>

            <div className="space-y-2">
              <p className="font-medium">Como ficou o serviço de {mechanic?.name || 'nossa oficina'}?</p>
              <Stars value={servicoRating} onChange={setServicoRating} />
              {servicoRating > 0 && (
                <TagPills
                  label="servico"
                  score={servicoRating}
                  selected={servicoTags}
                  onToggle={(tag) => toggleTag('servico', tag)}
                />
              )}
            </div>

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
          </CardContent>
        </Card>

        {submitted && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="font-medium text-green-700">Obrigado! Sua avaliação foi registrada com sucesso. 💚</p>
              {finalRating === 5 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open('https://g.page/r/CeBandaraMotos/review', '_blank')}
                >
                  Pode copiar sua avaliação para o nosso Google Maps?
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
