import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Star } from 'lucide-react';

type Review = {
  id: string;
  client_name: string;
  atendimento_rating: number | null;
  servico_rating: number | null;
  comment: string;
  responded_at: string;
};

type RatingRow = {
  id: string;
  atendimento_rating: number | null;
  servico_rating: number | null;
  comment: string;
  responded_at: string;
  order_id: string;
};

type OrderLite = {
  client_name: string;
};

export default function PublicSatisfactionFeedPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReviews = async () => {
      const { data: ratingsData, error } = await supabase
        .from('satisfaction_ratings')
        .select('id, atendimento_rating, servico_rating, comment, responded_at, order_id')
        .not('responded_at', 'is', null)
        .not('comment', 'is', null)
        .filter('comment', 'neq', '')
        .gte('atendimento_rating', 5)
        .gte('servico_rating', 5)
        .order('responded_at', { ascending: false })
        .limit(50);

      if (error || !ratingsData) {
        setLoading(false);
        return;
      }

      const ratings = ratingsData as RatingRow[];
      const orderIds = [...new Set(ratings.map(r => r.order_id))];

      if (!orderIds.length) {
        setReviews([]);
        setLoading(false);
        return;
      }

      const { data: ordersData } = await supabase
        .from('service_orders')
        .select('id, client_name')
        .in('id', orderIds);

      const orderMap: Record<string, string> = {};
      for (const order of (ordersData || []) as any[]) {
        orderMap[order.id] = order.client_name;
      }

      const reviewsWithNames = ratings.map(r => ({
        id: r.id,
        client_name: orderMap[r.order_id] || 'Cliente Anônimo',
        atendimento_rating: r.atendimento_rating,
        servico_rating: r.servico_rating,
        comment: r.comment,
        responded_at: r.responded_at,
      }));

      setReviews(reviewsWithNames);
      setLoading(false);
    };

    loadReviews();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('satisfaction_feed_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'satisfaction_ratings' },
        () => {
          loadReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10 flex items-center justify-center">
        <p className="text-muted-foreground">Carregando avaliações...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">O que nossos clientes dizem</h1>
          <p className="text-muted-foreground">Avaliações de 5 estrelas da Bandara Motos</p>
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma avaliação com 5 estrelas ainda. Seja o primeiro!</p>
            </div>
          ) : (
            reviews.map((review) => (
              <Card key={review.id} className="border-none shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 px-1 py-1">
                  <div className="bg-white rounded-lg p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{review.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          📅 {new Date(review.responded_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed text-sm md:text-base">
                      "{review.comment}"
                    </p>

                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-full w-fit">
                      <span className="text-lg">✓</span>
                      <span>Recomenda</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="mt-12 text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            Bandara Motos • Paulo Afonso-BA<br/>
            (75) 98804-6356 • @BandaraMotos
          </p>
        </div>
      </div>
    </div>
  );
}
