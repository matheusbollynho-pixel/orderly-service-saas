import { useState } from 'react';
import { useClients, Client, Motorcycle } from '@/hooks/useClients';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createMaintenanceReminder } from '@/services/maintenanceReminderService';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface ExpressCadastroPageProps {
  onBack?: () => void;
}

export function ExpressCadastroPage({ onBack }: ExpressCadastroPageProps) {
  const {
    upsertClient,
    upsertMotorcycle,
    searchClientByCPF,
    searchClientByName,
    searchClientByPhone,
    getClientMotorcycles,
  } = useClients();
  const { createOrder } = useServiceOrders();
  const { members: teamMembers } = useTeamMembers();
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientMotorcycles, setClientMotorcycles] = useState<Motorcycle[]>([]);
  const [createQuickOrder, setCreateQuickOrder] = useState(true);
  const [client, setClient] = useState({
    name: '',
    phone: '',
  });
  const [moto, setMoto] = useState({
    placa: '',
    marca: '',
    modelo: '',
    ano: '',
    cor: '',
  });
  const [serviceDescription, setServiceDescription] = useState('');
  const [atendimentoId, setAtendimentoId] = useState('');
  const [autorizaLembretes, setAutorizaLembretes] = useState(true);

  const normalizePhone = (value: string) => value.replace(/\D/g, '');
  const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  const buildExpressCPF = (phone: string) => {
    const cleanPhone = normalizePhone(phone);
    return `EXP-${cleanPhone || 'SEMTELEFONE'}-${Date.now()}`;
  };
  const toNoonISOStringFromToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0).toISOString();
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    try {
      const digits = normalizePhone(query);
      let results: Client[] = [];

      if (digits.length >= 10) {
        const byPhone = await searchClientByPhone(digits);
        if (byPhone) results = [byPhone];
      }

      if (results.length === 0 && digits.length >= 11) {
        const byCpf = await searchClientByCPF(digits);
        if (byCpf) results = [byCpf];
      }

      if (results.length === 0) {
        results = await searchClientByName(query);
      }

      setSearchResults(results);

      if (results.length === 0) {
        toast.message('Nenhum cliente encontrado');
      }
    } catch (err) {
      console.error('Erro na busca:', err);
      toast.error('Erro ao buscar cliente');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectClient = async (selected: Client) => {
    setSelectedClient(selected);
    setClient({
      name: selected.name || '',
      phone: selected.phone || '',
    });
    try {
      const motos = await getClientMotorcycles(selected.id);
      setClientMotorcycles(motos);
    } catch {
      setClientMotorcycles([]);
    }
  };

  const handleSelectMotorcycle = (selected: Motorcycle) => {
    setMoto({
      placa: selected.placa || '',
      marca: selected.marca || '',
      modelo: selected.modelo || '',
      ano: selected.ano ? String(selected.ano) : '',
      cor: selected.cor || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!client.name.trim()) {
      toast.error('Nome do cliente é obrigatório');
      return;
    }
    if (!client.phone.trim()) {
      toast.error('Telefone do cliente é obrigatório');
      return;
    }
    if (!moto.placa.trim()) {
      toast.error('Placa da moto é obrigatória');
      return;
    }
    if (!moto.marca.trim()) {
      toast.error('Marca da moto é obrigatória');
      return;
    }
    if (!moto.modelo.trim()) {
      toast.error('Modelo da moto é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const cpfToSave = selectedClient?.cpf || buildExpressCPF(client.phone);
      const savedClient = await upsertClient({
        name: client.name.trim(),
        cpf: cpfToSave,
        phone: normalizePhone(client.phone),
        autoriza_instagram: false,
        autoriza_lembretes: autorizaLembretes,
      });

      if (!savedClient) {
        toast.error('Erro ao salvar cliente');
        return;
      }

      const savedMoto = await upsertMotorcycle({
        client_id: savedClient.id,
        placa: normalizePlate(moto.placa),
        marca: moto.marca.trim(),
        modelo: moto.modelo.trim(),
        ano: moto.ano ? parseInt(moto.ano, 10) : null,
        cor: moto.cor.trim() || null,
        active: true,
      });

      if (!savedMoto) {
        toast.error('Erro ao salvar moto');
        return;
      }

      if (createQuickOrder) {
        const desc = serviceDescription.trim() || 'Serviço rápido';
        await new Promise<void>((resolve, reject) => {
          createOrder(
            {
              client_id: savedClient.id,
              motorcycle_id: savedMoto.id,
              client_name: savedClient.name,
              client_cpf: savedClient.cpf || '',
              client_apelido: savedClient.apelido ?? '',
              client_instagram: savedClient.instagram ?? '',
              autoriza_instagram: savedClient.autoriza_instagram ?? false,
              client_phone: savedClient.phone || '',
              client_address: savedClient.endereco || '',
              client_birth_date: savedClient.birth_date ?? null,
              entry_date: toNoonISOStringFromToday(),
              exit_date: null,
              equipment: `${savedMoto.marca} ${savedMoto.modelo}${savedMoto.placa ? ` (${savedMoto.placa})` : ''}`.trim(),
              problem_description: `${desc} (cadastro express)`,
              atendimento_id: atendimentoId || null,
            },
            {
              onSuccess: async () => {
                // Process maintenance keywords from problem description
                if (autorizaLembretes && savedClient?.id) {
                  const problemDesc = `${desc} (cadastro express)`;
                  const maintenanceKeywords = [
                    'revisao',
                    'revisão',
                    'revisora',
                    'oleo',
                    'óleo',
                    'oléo',
                    'corrente',
                    'correia',
                    'cabo',
                    'freio',
                    'pneu',
                    'motor',
                  ];

                  const detectedKeyword = maintenanceKeywords.find((keyword) =>
                    problemDesc.toLowerCase().includes(keyword)
                  );

                  if (detectedKeyword) {
                    try {
                      await createMaintenanceReminder(
                        savedMoto.id,
                        detectedKeyword,
                        `Lembrete: ${detectedKeyword.charAt(0).toUpperCase() + detectedKeyword.slice(1).toLowerCase()} para ${savedMoto.placa || 'sua moto'}`
                      );
                    } catch (err) {
                      console.error('Erro ao criar lembrete de manutenção:', err);
                    }
                  }
                }
                resolve();
              },
              onError: (error: any) => reject(error),
            }
          );
        });
      }

      toast.success(createQuickOrder ? 'Cliente, moto e OS salvos com sucesso!' : 'Cliente e moto salvos com sucesso!');
      setSelectedClient(null);
      setSearchResults([]);
      setClientMotorcycles([]);
      setClient({ name: '', phone: '' });
      setMoto({ placa: '', marca: '', modelo: '', ano: '', cor: '' });
      setServiceDescription('');
      setAtendimentoId('');
      setAutorizaLembretes(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cadastro Express</h2>
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            Voltar
          </Button>
        )}
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Pesquisa rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, telefone ou CPF"
              className="h-11"
            />
            <Button type="button" variant="secondary" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Selecione um cliente:</p>
              <div className="grid grid-cols-1 gap-2">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectClient(c)}
                    className="text-left px-3 py-2 rounded-lg border hover:bg-muted transition"
                  >
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone || 'Sem telefone'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedClient && clientMotorcycles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Motos do cliente:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {clientMotorcycles.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMotorcycle(m)}
                    className="text-left px-3 py-2 rounded-lg border hover:bg-muted transition"
                  >
                    <div className="font-medium text-foreground">{m.placa}</div>
                    <div className="text-xs text-muted-foreground">{m.marca} {m.modelo}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={client.name}
              onChange={(e) => setClient((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nome completo"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              value={client.phone}
              onChange={(e) => setClient((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="(xx) xxxxx-xxxx"
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Moto</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Placa *</Label>
            <Input
              value={moto.placa}
              onChange={(e) => setMoto((prev) => ({ ...prev, placa: normalizePlate(e.target.value) }))}
              placeholder="ABC1D23"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Marca *</Label>
            <Input
              value={moto.marca}
              onChange={(e) => setMoto((prev) => ({ ...prev, marca: e.target.value }))}
              placeholder="Honda"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Modelo *</Label>
            <Input
              value={moto.modelo}
              onChange={(e) => setMoto((prev) => ({ ...prev, modelo: e.target.value }))}
              placeholder="CG 160"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Ano</Label>
            <Input
              value={moto.ano}
              onChange={(e) => setMoto((prev) => ({ ...prev, ano: e.target.value }))}
              placeholder="2024"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <Input
              value={moto.cor}
              onChange={(e) => setMoto((prev) => ({ ...prev, cor: e.target.value }))}
              placeholder="Preta"
              className="h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Serviço</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>O que fazer na moto?</Label>
            <Input
              value={serviceDescription}
              onChange={(e) => setServiceDescription(e.target.value)}
              placeholder="Trocar óleo, cabo, revisão..."
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Quem está criando essa OS?</Label>
            <Select value={atendimentoId} onValueChange={setAtendimentoId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoriza-lembretes-express"
              checked={autorizaLembretes}
              onCheckedChange={(checked) => setAutorizaLembretes(checked === true)}
            />
            <Label htmlFor="autoriza-lembretes-express" className="font-normal cursor-pointer">
              Autoriza receber lembretes de manutenção
            </Label>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full h-12 text-lg font-semibold" disabled={isSaving}>
        {isSaving ? 'Salvando...' : 'Salvar cadastro express'}
      </Button>
    </form>
  );
}
