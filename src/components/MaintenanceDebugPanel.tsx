import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toast } from 'sonner';

// Use untyped client for new tables
const sb = supabase as any;

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'loading' | 'warning';
  message: string;
  details?: string;
}

export function MaintenanceDebugPanel() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoTests, setAutoTests] = useState<any>({});

  const runTests = async () => {
    setLoading(true);
    const newResults: TestResult[] = [];

    try {
      // Test 1: Database Connection
      newResults.push({
        name: 'Conexão com Banco de Dados',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const { error } = await sb
          .from('maintenance_keywords')
          .select('id')
          .limit(1);
        if (error) throw error;
        newResults[0] = { ...newResults[0], status: 'pass', message: '✅ Conectado' };
      } catch (e) {
        newResults[0] = { ...newResults[0], status: 'fail', message: '❌ Erro de conexão' };
      }

      // Test 2: Keywords Table
      newResults.push({
        name: 'Tabela de Palavras-chave',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const { data: keywords, error } = await sb
          .from('maintenance_keywords')
          .select('id, keyword, reminder_days, enabled')
          .eq('enabled', true);

        if (error) throw error;
        const count = keywords?.length || 0;
        newResults[1] = {
          ...newResults[1],
          status: count > 0 ? 'pass' : 'warning',
          message: `${count} palavra(s)-chave ativa(s)`,
          details: keywords?.map((k: any) => `${k.keyword} (${k.reminder_days} dias)`).join(', '),
        };
      } catch (e) {
        newResults[1] = { ...newResults[1], status: 'fail', message: '❌ Erro ao buscar keywords' };
      }

      // Test 3: Reminders Table
      newResults.push({
        name: 'Tabela de Lembretes',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const { data: reminders, error } = await sb
          .from('maintenance_reminders')
          .select('id, reminder_sent_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        const total = reminders?.length || 0;
        const pending = reminders?.filter((r: any) => !r.reminder_sent_at).length || 0;
        const sent = total - pending;

        newResults[2] = {
          ...newResults[2],
          status: total > 0 ? 'pass' : 'warning',
          message: `${total} lembretes (${pending} pendentes, ${sent} enviados)`,
        };
      } catch (e) {
        newResults[2] = { ...newResults[2], status: 'fail', message: '❌ Erro ao buscar lembretes' };
      }

      // Test 4: Clients Authorization
      newResults.push({
        name: 'Clientes com Autorização',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const clientsQuery = (supabase.from('clients') as any)
          .select('id, autoriza_lembretes')
          .eq('autoriza_lembretes', true)
          .limit(1);

        const { data: clients, error } = await clientsQuery;

        if (error) throw error;
        const count = clients?.length || 0;

        newResults[3] = {
          ...newResults[3],
          status: count > 0 ? 'pass' : 'warning',
          message: `${count} cliente(s) autorizado(s)`,
        };
      } catch (e) {
        newResults[3] = { ...newResults[3], status: 'fail', message: '❌ Erro ao buscar clientes' };
      }

      // Test 5: Service Orders
      newResults.push({
        name: 'Ordens de Serviço',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const { data: orders, error } = await supabase
          .from('service_orders')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        const count = orders?.length || 0;

        newResults[4] = {
          ...newResults[4],
          status: count > 0 ? 'pass' : 'warning',
          message: `${count} ordem(s) de serviço`,
        };
      } catch (e) {
        newResults[4] = { ...newResults[4], status: 'fail', message: '❌ Erro ao buscar ordens' };
      }

      // Test 6: Materials Table
      newResults.push({
        name: 'Tabela de Materiais',
        status: 'loading',
        message: 'Testando...',
      });

      try {
        const { data: materials, error } = await supabase
          .from('materials')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        const count = materials?.length || 0;

        newResults[5] = {
          ...newResults[5],
          status: count > 0 ? 'pass' : 'warning',
          message: `${count} material(is) cadastrado(s)`,
        };
      } catch (e) {
        newResults[5] = { ...newResults[5], status: 'fail', message: '❌ Erro ao buscar materiais' };
      }

      // Test 7: Reminders by Keyword
      newResults.push({
        name: 'Lembretes por Palavra-chave',
        status: 'loading',
        message: 'Analisando...',
      });

      try {
        const { data: reminders, error } = await sb
          .from('maintenance_reminders')
          .select('keyword_id, maintenance_keywords(keyword)');

        if (error) throw error;

        const grouped: any = {};
        reminders?.forEach((r: any) => {
          const key = r.maintenance_keywords?.keyword || 'Desconhecida';
          grouped[key] = (grouped[key] || 0) + 1;
        });

        const details = Object.entries(grouped)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        newResults[6] = {
          ...newResults[6],
          status: 'pass',
          message: 'Distribuição de lembretes',
          details: details || 'Nenhum',
        };
      } catch (e) {
        newResults[6] = { ...newResults[6], status: 'warning', message: 'Análise opcional' };
      }

    } catch (error) {
      console.error('Erro ao executar testes:', error);
      toast.error('Erro ao executar testes');
    }

    setResults(newResults);
    setLoading(false);

    // Calculate auto-test metrics
    const passed = newResults.filter((r) => r.status === 'pass').length;
    const failed = newResults.filter((r) => r.status === 'fail').length;
    const warnings = newResults.filter((r) => r.status === 'warning').length;

    setAutoTests({
      passed,
      failed,
      warnings,
      total: newResults.length,
      percentage: Math.round((passed / newResults.length) * 100),
    });
  };

  useEffect(() => {
    runTests();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'loading':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200';
      case 'fail':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'loading':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {autoTests.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{autoTests.total}</div>
              <div className="text-xs text-blue-600">Testes Totais</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{autoTests.passed}</div>
              <div className="text-xs text-green-600">✅ Passou</div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{autoTests.failed}</div>
              <div className="text-xs text-red-600">❌ Falhou</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{autoTests.percentage}%</div>
              <div className="text-xs text-yellow-600">Taxa de Sucesso</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Test Results */}
      <div className="space-y-2">
        {results.map((result, idx) => (
          <Card key={idx} className={`border ${getStatusColor(result.status)}`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{result.name}</div>
                  <div className="text-sm text-gray-600">{result.message}</div>
                  {result.details && <div className="text-xs text-gray-500 mt-1">{result.details}</div>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={runTests} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
          {loading ? 'Testando...' : 'Executar Testes'}
        </Button>
        <Button onClick={() => window.open('https://app.supabase.com', '_blank')} variant="outline">
          Abrir Supabase
        </Button>
      </div>

      {/* Summary */}
      {autoTests.total > 0 && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
          <strong>Resumo:</strong> {autoTests.passed}/{autoTests.total} testes passaram ✅
          {autoTests.failed > 0 && ` | ${autoTests.failed} falhas ❌`}
          {autoTests.warnings > 0 && ` | ${autoTests.warnings} avisos ⚠️`}
        </div>
      )}
    </div>
  );
}
