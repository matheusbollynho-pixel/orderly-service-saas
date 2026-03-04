import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export default function PublicStoreSatisfactionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    // Apenas marca como carregado
    setLoading(false);
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Informe seu nome.');
      return;
    }

    if (!normalizePhone(phone)) {
      setError('Informe seu WhatsApp.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      console.log('🔍 Verificando se cliente já tem avaliação pendente...');
      
      const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?mode=check-pending&client_name=${encodeURIComponent(name.trim())}&client_phone=${normalizePhone(phone)}`);
      const data = await res.json();

      if (data?.success && data?.pending_token) {
        console.log('✅ Cliente tem avaliação pendente, redirecionando...');
        navigate(`/avaliar/${data.pending_token}`);
        return;
      }

      console.log('🚀 Criando walk-in sem atendente (cliente escolhe no questionário)...');
      
      // Criar walk-in SEM atendente (cliente vai escolher no questionário)
      const createRes = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create_walkin',
          client_name: name.trim(),
          client_phone: normalizePhone(phone),
        }),
      });

      const createData = await createRes.json();
      
      if (!createRes.ok || !createData?.success || !createData?.token) {
        console.error('❌ Erro ao criar walk-in:', createData?.message);
        setError(createData?.message || 'Não foi possível iniciar a avaliação.');
        return;
      }

      console.log('✅ Walk-in criado, redirecionando para questionário...');
      navigate(`/avaliar/${createData.token}?origem=loja`);
    } catch (e: any) {
      console.error('❌ Erro:', e);
      setError(e?.message || 'Erro ao verificar cliente.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Bandara Motos • Avaliação no Balcão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Escaneou o QR Code? Identifique-se para continuar.</p>
            <p>Tempo médio: menos de 1 minuto.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(75) 99999-9999"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" type="submit" disabled={saving}>
                {saving ? 'Iniciando...' : 'Começar avaliação'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
