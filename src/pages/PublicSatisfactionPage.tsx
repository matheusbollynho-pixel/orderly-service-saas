import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Moon, Star, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const BALCAO_POSITIVE_TAGS = ['Educação', 'Rapidez', 'Transparência', 'Simpatia', 'Agilidade'];
const BALCAO_IMPROVEMENT_TAGS = ['Demora no balcão', 'Falta de Atenção', 'Falta de Informação', 'Não Entendia'];

const OFICINA_POSITIVE_TAGS = ['Qualidade', 'Prazo Cumprido', 'Moto Limpa', 'Bem Feito', 'Perfeição'];
const OFICINA_IMPROVEMENT_TAGS = ['Problema não resolvido', 'Sujeira', 'Demora', 'Moto com Defeito', 'Peças Trocadas Sem Avisar'];

const STORE_POSITIVE_TAGS = ['Atendimento rápido', 'Mecânico atencioso', 'Preço justo', 'Loja organizada', 'Serviço de confiança'];
const STORE_IMPROVEMENT_TAGS = ['Demora no atendimento', 'Preço elevado', 'Falta de peças', 'Dificuldade de contato', 'Ambiente desconfortável'];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

function TagPills({
  area,
  score,
  selected,
  onToggle,
}: {
  area: 'balcao' | 'oficina' | 'store';
  score: number;
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  const isPositive = score >= 4;
  const options = area === 'balcao' 
    ? (isPositive ? BALCAO_POSITIVE_TAGS : BALCAO_IMPROVEMENT_TAGS)
    : area === 'oficina'
    ? (isPositive ? OFICINA_POSITIVE_TAGS : OFICINA_IMPROVEMENT_TAGS)
    : (isPositive ? STORE_POSITIVE_TAGS : STORE_IMPROVEMENT_TAGS);

  const title = area === 'balcao' 
    ? (isPositive ? '✓ O que você achou bom no atendimento?' : '⚠ O que poderia melhorar no atendimento?')
    : area === 'oficina'
    ? (isPositive ? '✓ O que você achou bom no serviço?' : '⚠ O que poderia melhorar no serviço?')
    : (isPositive ? '✓ Elogios' : '⚠ Melhorias');

  return (
    <div className="space-y-2 mt-4">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">Selecione os motivos:</p>
      <div className="flex flex-wrap gap-2">
        {options.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm transition-all font-medium',
                active 
                  ? 'border-primary bg-primary text-primary-foreground shadow-md scale-105' 
                  : 'border-border bg-background hover:bg-muted hover:border-primary/50'
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

  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [mechanic, setMechanic] = useState<Record<string, unknown> | null>(null);
  const [atendimento, setAtendimento] = useState<Record<string, unknown> | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);

  // Walk-in: lista de atendentes disponíveis
  const [staffMembers, setStaffMembers] = useState<Array<{id: string, name: string, photo_url?: string}>>([]);
  const [mechanics, setMechanics] = useState<Array<{id: string, name: string, photo_url?: string}>>([]);
  const [selectedAttendant, setSelectedAttendant] = useState('');
  const [wantsAttendantReview, setWantsAttendantReview] = useState<boolean | null>(null);
  const [wantsMechanicReview, setWantsMechanicReview] = useState<boolean | null>(null);
  const [selectedMechanic, setSelectedMechanic] = useState('');

  const [atendimentoRating, setAtendimentoRating] = useState(0);
  const [servicoRating, setServicoRating] = useState(0);
  const [storeRating, setStoreRating] = useState(0);
  const [atendimentoTags, setAtendimentoTags] = useState<string[]>([]);
  const [servicoTags, setServicoTags] = useState<string[]>([]);
  const [storeTags, setStoreTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [recommends, setRecommends] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [publicTheme, setPublicTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const previousThemeRef = useRef<'dark' | 'light' | null>(null);

  useEffect(() => {
    if (!previousThemeRef.current) {
      previousThemeRef.current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    return () => {
      if (previousThemeRef.current === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
  }, []);

  useEffect(() => {
    if (publicTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [publicTheme]);

  useEffect(() => {
    const load = async () => {
      // Validar token antes de fazer a requisição
      if (!token) {
        console.error('❌ Token ausente na URL');
        setError('Link inválido. Token não encontrado.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Carregando satisfação com token:', token);
        console.log('📍 Supabase URL:', supabaseUrl);
        
        const url = `${supabaseUrl}/functions/v1/satisfaction-public?token=${encodeURIComponent(token)}`;
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
        setIsWalkIn(!!data.is_walk_in);
        setAlreadyResponded(!!data.alreadyResponded);

        // Se é walk-in SEM atendente, carregar lista
        if (data.is_walk_in && !data.mechanic && !data.atendimento) {
          console.log('📋 Walk-in sem atendente, carregando lista...');
          const metaRes = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?mode=store-metadata`);
          const metaData = await metaRes.json();
          console.log('📦 Metadata:', metaData);
          if (metaData?.success) {
            setStaffMembers(metaData.staff_members || []);
            setMechanics(metaData.mechanics || []);
            console.log('✅ Atendentes carregados:', metaData.staff_members?.length, 'staff,', metaData.mechanics?.length, 'mechanics');
          }
        } else {
          console.log('ℹ️ Não é walk-in sem atendente:', { is_walk_in: data.is_walk_in, has_mechanic: !!data.mechanic, has_atendimento: !!data.atendimento });
        }

        if (data.rating) {
          setAtendimentoRating(data.rating.atendimento_rating || 0);
          setServicoRating(data.rating.servico_rating || 0);
          setComment(data.rating.comment || '');
          setRecommends(typeof data.rating.recommends === 'boolean' ? data.rating.recommends : null);
          setAtendimentoTags(Array.isArray(data.rating.tags?.atendimento) ? data.rating.tags.atendimento : []);
          setServicoTags(Array.isArray(data.rating.tags?.servico) ? data.rating.tags.servico : []);
        }
      } catch (e: Error | unknown) {
        console.error('❌ Erro ao carregar:', e);
        setError((e as Error)?.message || 'Erro ao carregar');
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

  // Resetar tags de atendimento quando rating mudar de categoria (positivo <-> negativo)
  useEffect(() => {
    if (atendimentoRating === 0) return; // Não resetar se rating for zerado
    
    const isCurrentPositive = atendimentoRating >= 4;
    const wasPreviousPositive = atendimentoTags.length > 0 && 
      (atendimentoTags.some(tag => BALCAO_POSITIVE_TAGS.includes(tag)) || 
       atendimentoTags.some(tag => BALCAO_IMPROVEMENT_TAGS.includes(tag)));
    
    // Se temos tags e a categoria mudou, resetar
    if (atendimentoTags.length > 0) {
      setAtendimentoTags([]);
    }
  }, [atendimentoRating]);

  // Resetar tags de serviço quando rating mudar de categoria (positivo <-> negativo)
  useEffect(() => {
    if (servicoRating === 0) return; // Não resetar se rating for zerado
    
    if (servicoTags.length > 0) {
      setServicoTags([]);
    }
  }, [servicoRating]);

  // Resetar tags da loja quando rating mudar de categoria (positivo <-> negativo)
  useEffect(() => {
    if (storeRating === 0) return; // Não resetar se rating for zerado
    
    if (storeTags.length > 0) {
      setStoreTags([]);
    }
  }, [storeRating]);

  const toggleTag = (scope: 'atendimento' | 'servico' | 'store', tag: string) => {
    if (scope === 'atendimento') {
      setAtendimentoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
      return;
    }

    if (scope === 'servico') {
      setServicoTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
      return;
    }

    if (scope === 'store') {
      setStoreTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    }
  };

  const handleSubmit = async () => {
    // Validação básica de estrelas
    if (isWalkIn) {
      // Walk-in: validar apenas se escolheu avaliar balconista ou mecânico
      const hasAttendantReview = wantsAttendantReview === true && selectedAttendant;
      const hasMechanicReview = wantsMechanicReview === true && selectedMechanic;
      
      // Se escolheu avaliar balconista mas não selecionou
      if (wantsAttendantReview === true && !selectedAttendant) {
        setError('Selecione o balconista que te atendeu.');
        return;
      }
      
      // Se escolheu avaliar mecânico mas não selecionou
      if (wantsMechanicReview === true && !selectedMechanic) {
        setError('Selecione o mecânico que te atendeu.');
        return;
      }

      // Se escolheu avaliar balconista, precisa dar nota
      if (hasAttendantReview && !atendimentoRating) {
        setError('Preencha a avaliação do balconista em estrelas.');
        return;
      }

      // Se escolheu avaliar mecânico, precisa dar nota
      if (hasMechanicReview && !servicoRating) {
        setError('Preencha a avaliação do mecânico em estrelas.');
        return;
      }

      // Permitir enviar apenas comentário se não quis avaliar ninguém
      if (!hasAttendantReview && !hasMechanicReview && !comment?.trim()) {
        setError('Escreva um comentário ou escolha avaliar um colaborador.');
        return;
      }

      if (!token) {
        setError('Token inválido.');
        return;
      }
    } else {
      // OS normal: ambos obrigatórios
      if (!atendimentoRating || !servicoRating || !token) {
        setError('Preencha as duas avaliações em estrelas.');
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      const payload: Record<string, unknown> = {
        token,
        atendimento_rating: atendimentoRating,
        servico_rating: servicoRating || 0, // Para walk-in, usar 0 se não preencheu
        store_rating: storeRating || 0, // Avaliação geral da loja
        tags: {
          atendimento: atendimentoTags,
          servico: servicoTags,
          store: storeTags,
        },
        comment: comment?.trim() || null,
        recommends,
      };

      // Incluir atendente selecionado se walk-in
      if (isWalkIn && selectedAttendant) {
        const [type, id] = selectedAttendant.split(':');
        payload.attendant_type = type;
        payload.attendant_id = id;
      }

      // Incluir mecânico selecionado se walk-in e optou por avaliar
      if (isWalkIn && selectedMechanic) {
        const [type, id] = selectedMechanic.split(':');
        if (type === 'mechanic') {
          payload.mechanic_type = type;
          payload.mechanic_id = id;
        }
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.message || 'Não foi possível enviar avaliação');
        return;
      }

      setSubmitted(true);
      setAlreadyResponded(true);
    } catch (e: Error | unknown) {
      setError((e as Error)?.message || 'Erro ao enviar');
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
          <Card className="border-border/70 shadow-lg shadow-black/20 dark:shadow-black/50">
            <CardHeader className="relative">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPublicTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="absolute right-6 top-5 h-9 w-9 border-border/60 bg-background/80"
                aria-label="Alternar tema"
              >
                {publicTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
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
        {!submitted && (
          <>
            <Card className="bg-card/95 backdrop-blur-sm border border-border/70 shadow-lg shadow-black/15 dark:shadow-black/45">
              <CardHeader className="relative items-center pt-5 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setPublicTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className="absolute right-3 top-16 h-9 w-9 border-border/60 bg-background/80"
                  aria-label="Alternar tema"
                >
                  {publicTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <img src="/client-logo.png" alt="Bandara Motos" className="h-32 w-auto" />
                <p className="-mt-3 text-sm font-semibold uppercase tracking-[0.18em] leading-none text-[#C1272D]">AVALIAÇÃO BANDARA MOTOS</p>
              </CardHeader>
              <CardContent className="pt-2 pb-4 text-center">
                <p className="inline-flex flex-wrap items-center justify-center gap-1 rounded-md border border-border/60 bg-muted/40 px-3 py-1.5 text-sm text-zinc-400">
                  Cliente: <span className="font-medium text-foreground">{order?.client_name || '-'}</span>
                  <span className="px-2 text-zinc-500">·</span>
                  Telefone: <span className="font-medium text-foreground">{order?.client_phone || '-'}</span>
                </p>
              </CardContent>
            </Card>

            {(!isWalkIn || atendimento || mechanic) && (
          <Card className="shadow-lg shadow-black/20 dark:shadow-black/45">
            <CardContent className="pt-6 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Você está avaliando:</p>
              <div className="flex items-center justify-around px-4">
                {(atendimento || !isWalkIn) && (
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-16 w-16 border-2 border-blue-200">
                      <AvatarImage src={atendimento?.photo_url || undefined} />
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-lg">
                        {atendimento?.name?.charAt(0)?.toUpperCase() || '🎤'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Balconista</p>
                      <p className="font-medium text-sm">{atendimento?.name || 'Não definido'}</p>
                    </div>
                  </div>
                )}
                {(mechanic || !isWalkIn) && (
                  <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-16 w-16 border-2 border-orange-200">
                      <AvatarImage src={mechanic?.photo_url || undefined} />
                      <AvatarFallback className="bg-orange-100 text-orange-700 font-semibold text-lg">
                        {mechanic?.name?.charAt(0)?.toUpperCase() || '🔧'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Mecânico</p>
                      <p className="font-medium text-sm">{mechanic?.name || 'Não definido'}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-lg shadow-black/20 dark:shadow-black/50">
          <CardContent className="pt-6 space-y-6">
            {isWalkIn ? (
              <>
                {/* LAYOUT QR CODE (WALK-IN) */}
                
                {/* PERGUNTA SE QUER AVALIAR BALCONISTA */}
                <div className="space-y-3 pb-4 border-b">
                  <p className="font-medium text-base">Quer avaliar um balconista?</p>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant={wantsAttendantReview === true ? "default" : "outline"}
                      onClick={() => setWantsAttendantReview(true)}
                      className="flex-1 shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                    >
                      {wantsAttendantReview === true && "✓ "}
                      Sim
                    </Button>
                    <Button 
                      type="button" 
                      variant={wantsAttendantReview === false ? "default" : "outline"}
                      onClick={() => {
                        setWantsAttendantReview(false);
                        setSelectedAttendant(null);
                        setAtendimentoRating(0);
                        setAtendimentoTags([]);
                      }}
                      className="flex-1 shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                    >
                      {wantsAttendantReview === false && "✓ "}
                      Não
                    </Button>
                  </div>
                </div>

                {/* SELEÇÃO DE BALCONISTA */}
                {wantsAttendantReview === true && staffMembers.length > 0 && !selectedAttendant && (
                  <div className="space-y-3 pb-4 border-b">
                    <p className="font-medium text-base">Quem te atendeu no balcão?</p>
                    <div className="grid grid-cols-2 gap-3">
                      {staffMembers.map((staff) => {
                        const isSelected = selectedAttendant === `staff:${staff.id}`;
                        return (
                          <button
                            key={`staff-${staff.id}`}
                            type="button"
                            onClick={() => setSelectedAttendant(`staff:${staff.id}`)}
                            className={cn(
                              'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                              isSelected
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            )}
                          >
                            <Avatar className="h-16 w-16 border-2 border-blue-200">
                              <AvatarImage src={staff.photo_url || undefined} />
                              <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold text-lg">
                                {staff.name?.charAt(0)?.toUpperCase() || '👤'}
                              </AvatarFallback>
                            </Avatar>
                            <p className="text-sm font-medium text-center leading-tight">{staff.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AVALIAÇÃO DO BALCONISTA */}
                {wantsAttendantReview === true && selectedAttendant && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2">
                      <div className="text-lg">🎤</div>
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">Atendimento no Balcão</p>
                        <p className="font-medium">
                          {staffMembers.find(s => selectedAttendant === `staff:${s.id}`)?.name || 'Balcão / Loja'}
                        </p>
                      </div>
                    </div>

                    <p className="font-medium text-base">O que achou do nosso atendimento hoje?</p>
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
                )}

                {/* PERGUNTA SE QUER AVALIAR MECÂNICO */}
                <div className="space-y-3 pt-4 border-t">
                  <p className="font-medium text-base">Quer avaliar um mecânico também?</p>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant={wantsMechanicReview === true ? "default" : "outline"}
                      onClick={() => setWantsMechanicReview(true)}
                      className="flex-1 shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                    >
                      {wantsMechanicReview === true && "✓ "}
                      Sim
                    </Button>
                    <Button 
                      type="button" 
                      variant={wantsMechanicReview === false ? "default" : "outline"}
                      onClick={() => {
                        setWantsMechanicReview(false);
                        setSelectedMechanic(null);
                        setServicoRating(0);
                        setServicoTags([]);
                      }}
                      className="flex-1 shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                    >
                      {wantsMechanicReview === false && "✓ "}
                      Não
                    </Button>
                  </div>
                </div>

                {/* SELEÇÃO DE MECÂNICO */}
                {wantsMechanicReview === true && mechanics.length > 0 && !selectedMechanic && (
                  <div className="space-y-3 pt-4 border-t">
                    <p className="font-medium text-base">Qual mecânico te atendeu?</p>
                    <div className="grid grid-cols-2 gap-3">
                      {mechanics.map((mec) => {
                        const isSelected = selectedMechanic === `mechanic:${mec.id}`;
                        return (
                          <button
                            key={`mechanic-${mec.id}`}
                            type="button"
                            onClick={() => setSelectedMechanic(`mechanic:${mec.id}`)}
                            className={cn(
                              'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                              isSelected
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            )}
                          >
                            <Avatar className="h-16 w-16 border-2 border-orange-200">
                              <AvatarImage src={mec.photo_url || undefined} />
                              <AvatarFallback className="bg-orange-100 text-orange-700 font-semibold text-lg">
                                {mec.name?.charAt(0)?.toUpperCase() || '🔧'}
                              </AvatarFallback>
                            </Avatar>
                            <p className="text-sm font-medium text-center leading-tight">{mec.name}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AVALIAÇÃO DO MECÂNICO */}
                {wantsMechanicReview === true && selectedMechanic && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center gap-2 pb-2">
                      <div className="text-lg">🔧</div>
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">Serviço na Oficina</p>
                        <p className="font-medium">
                          {mechanics.find(m => selectedMechanic === `mechanic:${m.id}`)?.name || 'Mecânico'}
                        </p>
                      </div>
                    </div>

                    <p className="font-medium text-base">Como foi o serviço do mecânico?</p>
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
                )}
              </>
            ) : (
              <>
                {/* LAYOUT OS PRONTA */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2">
                    <div className="text-lg">🎤</div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Atendimento no Balcão</p>
                      <p className="font-medium">{atendimento?.name || 'Não informado'}</p>
                    </div>
                  </div>

                  <p className="font-medium text-base">
                    {atendimento?.name
                      ? `Como foi o atendimento de ${atendimento.name} no balcão?`
                      : 'Como foi o atendimento no balcão?'}
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

                <div className="border-t pt-6" />

                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2">
                    <div className="text-lg">🔧</div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Serviço na Oficina</p>
                      <p className="font-medium">{mechanic?.name || 'Não informado'}</p>
                    </div>
                  </div>

                  <p className="font-medium text-base">
                    {mechanic?.name
                      ? `Como ficou o serviço de ${mechanic.name} na sua moto?`
                      : 'Como ficou o serviço na sua moto?'}
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
              </>
            )}

            {/* AVALIAÇÃO GERAL DA LOJA - sempre visível em ambos os fluxos */}
            <div className="space-y-3 pt-6 border-t">
              <div className="flex items-center gap-2 pb-2">
                <div className="text-lg">🏪</div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Experiência Geral</p>
                  <p className="font-medium">Bandara Motos</p>
                </div>
              </div>
              <p className="font-medium text-base">Como foi sua experiência na loja?</p>
              <Stars value={storeRating} onChange={setStoreRating} />
              {storeRating > 0 && (
                <TagPills
                  area="store"
                  score={storeRating}
                  selected={storeTags}
                  onToggle={(tag) => toggleTag('store', tag)}
                />
              )}
            </div>

            {/* SEÇÃO FINAL - sempre visível */}
            <div className="space-y-4 border-t pt-6">
              <div className="space-y-2">
                <p className="font-medium">Recomendaria a Bandara Motos?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={recommends === true ? 'default' : 'outline'}
                    onClick={() => setRecommends(true)}
                    className="shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                  >
                    Sim
                  </Button>
                  <Button
                    type="button"
                    variant={recommends === false ? 'default' : 'outline'}
                    onClick={() => setRecommends(false)}
                    className="shadow-md shadow-black/15 dark:shadow-black/40 border-border/70"
                  >
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
                  className="shadow-md shadow-black/15 dark:shadow-black/40 border-border/70 bg-background/95"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar avaliação'}
              </Button>
            </div>
          </CardContent>
        </Card>
          </>
        )}

        {submitted && (
          <Card className="border-green-200 bg-green-50 shadow-lg shadow-black/20 dark:shadow-black/45">
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
                  <div className="bg-white p-4 rounded-lg border border-green-100 shadow-md shadow-black/15">
                    <p className="font-medium text-green-700 mb-2">
                      🎉 Ficamos muito felizes com sua avaliação!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Nossa equipe vai adorar saber disso. Sua satisfação é o melhor prêmio para nós!
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
