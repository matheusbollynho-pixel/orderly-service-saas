import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const companyName = import.meta.env.VITE_COMPANY_NAME || 'Minha Oficina';

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export default function PublicStoreSatisfactionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get('store') || '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicTheme, setPublicTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
  const previousThemeRef = useRef<'dark' | 'light' | null>(null);
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    // Apenas marca como carregado
    setLoading(false);
  }, []);

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
      
      const res = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public?mode=check-pending&client_name=${encodeURIComponent(name.trim())}&client_phone=${normalizePhone(phone)}${storeId ? `&store_id=${storeId}` : ''}`);
      const data = await res.json();

      if (data?.success && data?.pending_token) {
        console.log('✅ Cliente tem avaliação pendente, redirecionando...');
        navigate(`/avaliar/${data.pending_token}`);
        return;
      }

      console.log('🚀 Criando avaliação walk-in...');
      
      // Criar avaliação walk-in e redirecionar para o questionário
      const createRes = await fetch(`${supabaseUrl}/functions/v1/satisfaction-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create_walkin',
          client_name: name.trim(),
          client_phone: normalizePhone(phone),
          store_id: storeId || undefined,
        }),
      });

      const createData = await createRes.json();
      
      if (!createRes.ok || !createData?.success || !createData?.token) {
        console.error('❌ Erro ao iniciar avaliação:', createData?.message);
        setError(createData?.message || 'Não foi possível iniciar a avaliação.');
        return;
      }

      console.log('✅ Avaliação criada, redirecionando...');
      navigate(`/avaliar/${createData.token}?origem=loja`);
    } catch (e: Error | unknown) {
      console.error('❌ Erro:', e);
      setError((e as Error)?.message || 'Erro ao verificar cliente.');
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
        <div className="flex justify-end mb-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setPublicTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="h-9 w-9 border-border/60 bg-background/80 mt-12"
            aria-label="Alternar tema"
          >
            {publicTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        <Card>
          <CardHeader className="items-center p-3 pb-0 pt-4">
            <img src={import.meta.env.VITE_LOGO_PATH || '/bandara-logo.png'} alt="Logo" className="h-48 w-auto" />
          </CardHeader>
          <CardContent className="space-y-0 text-center pt-0 px-4 pb-4">
            <p className="text-base font-semibold text-foreground -mt-3">Avaliação {companyName}</p>
            <p className="text-sm text-muted-foreground">Identifique-se para iniciarmos sua avaliação em poucos segundos.</p>
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
