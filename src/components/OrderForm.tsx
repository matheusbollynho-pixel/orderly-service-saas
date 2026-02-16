import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { User, MapPin, Phone, Wrench, FileText, ArrowLeft, Truck, AlertCircle } from 'lucide-react';
import { ClientSearch } from '@/components/ClientSearch';
import { Client, Motorcycle } from '@/hooks/useClients';
import { getMaintenanceKeywords, findKeywordInText, type MaintenanceKeyword } from '@/services/maintenanceReminderService';

interface ClientData {
  name: string;
  cpf: string;
  phone: string;
  address: string;
  numero?: string;
  apelido?: string;
  instagram?: string;
  autoriza_instagram?: boolean;
  autoriza_lembretes?: boolean;
  birth_date?: string; // YYYY-MM-DD
}

interface MotoData {
  placa: string;
  moto_info: string;
  equipment: string;  // string final exibida/gravada
  model?: string;
  year?: string;
  color?: string;
  km: string;
}

interface ServicoData {
  descricao_geral: string;
  quem_pega: 'cliente' | 'outro';
  nome_retirada?: string;
  telefone_retirada?: string;
  cpf_retirada?: string;
  adesivo_loja: 'sim' | 'nao';
  o_que_fazer: string;
  entry_date?: string;
}

interface OrderFormData {
  client: ClientData;
  motos: MotoData[];
  servicos: ServicoData;
}

export function OrderForm({ onSubmit, onCancel, isSubmitting }: { onSubmit: any; onCancel: any; isSubmitting?: boolean }) {
  const [activeTab, setActiveTab] = useState<'cliente' | 'motos' | 'servicos'>('cliente');
  const [maintenanceKeywords, setMaintenanceKeywords] = useState<MaintenanceKeyword[]>([]);
  const [detectedKeywords, setDetectedKeywords] = useState<MaintenanceKeyword[]>([]);
  
  const getTodayLocal = () => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };
  
  const [formData, setFormData] = useState<OrderFormData>({
    client: { name: '', cpf: '', phone: '', address: '', numero: '', apelido: '', instagram: '', autoriza_instagram: false, autoriza_lembretes: true, birth_date: '' },
    motos: [{ placa: '', moto_info: '', equipment: '', model: '', year: '', color: '', km: '' }],
    servicos: {
      descricao_geral: '',
      quem_pega: 'cliente',
      nome_retirada: '',
      telefone_retirada: '',
      cpf_retirada: '',
      adesivo_loja: 'sim',
      o_que_fazer: '',
      entry_date: getTodayLocal() // Data de hoje (local)
    }
  });

  // Load maintenance keywords on component mount
  useEffect(() => {
    const loadKeywords = async () => {
      const keywords = await getMaintenanceKeywords();
      setMaintenanceKeywords(keywords);
    };
    loadKeywords();
  }, []);

  // Check for keywords in the service description
  useEffect(() => {
    if (maintenanceKeywords.length === 0) return;
    
    const detected: MaintenanceKeyword[] = [];
    const text = formData.servicos.o_que_fazer;
    
    for (const keyword of maintenanceKeywords) {
      if (text.toLowerCase().includes(keyword.keyword.toLowerCase())) {
        if (!detected.find(k => k.id === keyword.id)) {
          detected.push(keyword);
        }
      }
    }
    
    setDetectedKeywords(detected);
  }, [formData.servicos.o_que_fazer, maintenanceKeywords]);

  // Função para preencher o formulário com dados do cliente encontrado
  const handleClientFound = (client: Client, motorcycles: Motorcycle[]) => {
    // Preencher dados do cliente
    setFormData(prev => ({
      ...prev,
      client: {
        name: client.name,
        cpf: client.cpf,
        phone: client.phone || '',
        address: client.endereco || '',
        numero: '',
        apelido: client.apelido || '',
        instagram: client.instagram || '',
        autoriza_instagram: client.autoriza_instagram || false,
        autoriza_lembretes: client.autoriza_lembretes ?? true,
        birth_date: client.birth_date || ''
      }
    }));

    // Preencher dados das motos se houver
    if (motorcycles.length > 0) {
      const motosFormatadas = motorcycles.map(moto => ({
        placa: moto.placa,
        moto_info: `${moto.marca} ${moto.modelo}`,
        equipment: `${moto.modelo} ${moto.ano || ''} ${moto.cor || ''}`.trim(),
        model: `${moto.marca} ${moto.modelo}`,
        year: moto.ano?.toString() || '',
        color: moto.cor || '',
        km: ''
      }));
      
      setFormData(prev => ({
        ...prev,
        motos: motosFormatadas
      }));
    }
  };



  const formatPlate = (value: string) => {
    const cleaned = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    return cleaned;
  };

  const buildEquipment = (moto: MotoData) => {
    const parts = [moto.model, moto.year, moto.color].filter(Boolean).join(' ').trim();
    return parts || moto.equipment || '';
  };



  const addMoto = () => {
    setFormData(prev => ({
      ...prev,
      motos: [...prev.motos, { placa: '', moto_info: '', equipment: '', model: '', year: '', color: '', km: '' }]
    }));
  };

  const updateField = (tab: string, index: number, field: string, value: string | boolean) => {
    setFormData(prev => {
      if (tab === 'client') {
        return {
          ...prev,
          client: { ...prev.client, [field]: value }
        };
      } else if (tab === 'motos') {
        const newMotos = [...prev.motos];
        const next = { ...newMotos[index] } as MotoData;

        if (field === 'placa') {
          next.placa = formatPlate(String(value));
        } else {
          (next as any)[field] = value;
        }

        if (['model', 'year', 'color'].includes(field)) {
          next.equipment = buildEquipment(next);
        }

        newMotos[index] = next;
        return { ...prev, motos: newMotos };
      } else {
        return {
          ...prev,
          servicos: { ...prev.servicos, [field]: value }
        };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('📋 Formulário enviado:', formData);
    onSubmit(formData);
  };

  const isValid = formData.client.name && formData.client.cpf && formData.motos.every(m => m.placa);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">
          Nova OS - Bandara Motos
        </h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab as any}>
        <TabsList className="grid w-full grid-cols-3 bg-muted p-1 rounded-xl">
          <TabsTrigger value="cliente" className="data-[state=active]:bg-background">Cliente</TabsTrigger>
          <TabsTrigger value="motos" className="data-[state=active]:bg-background">Motos</TabsTrigger>
          <TabsTrigger value="servicos" className="data-[state=active]:bg-background">Serviços</TabsTrigger>
        </TabsList>

        {/* ABA CLIENTE */}
        <TabsContent value="cliente" className="space-y-4 pt-4">
          {/* Campo de busca de cliente */}
          <ClientSearch onClientFound={handleClientFound} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 font-semibold"><User className="h-4 w-4" /> Nome *</Label>
              <Input placeholder="João Silva" value={formData.client.name} onChange={(e) => updateField('client', 0, 'name', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">CPF *</Label>
              <Input placeholder="000.000.000-00" value={formData.client.cpf} onChange={(e) => updateField('client', 0, 'cpf', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 font-semibold"><Phone className="h-4 w-4" /> Telefone</Label>
              <Input placeholder="(11) 99999-9999" value={formData.client.phone} onChange={(e) => updateField('client', 0, 'phone', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Apelido (opcional)</Label>
              <Input placeholder="Como o cliente prefere ser chamado" value={formData.client.apelido} onChange={(e) => updateField('client', 0, 'apelido', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Data de Nascimento (opcional)</Label>
              <Input type="date" value={formData.client.birth_date || ''} onChange={(e) => updateField('client', 0, 'birth_date', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Instagram (opcional)</Label>
              <Input placeholder="@usuario" value={formData.client.instagram} onChange={(e) => updateField('client', 0, 'instagram', e.target.value)} className="h-12" />
              <div className="flex items-center gap-2 mt-2">
                <Checkbox 
                  id="autoriza_instagram" 
                  checked={formData.client.autoriza_instagram}
                  onCheckedChange={(checked) => updateField('client', 0, 'autoriza_instagram', checked as boolean)}
                />
                <Label htmlFor="autoriza_instagram" className="text-sm font-normal cursor-pointer">
                  Autoriza criar conteúdo para Instagram e marcar o cliente
                </Label>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Checkbox 
                  id="autoriza_lembretes" 
                  checked={formData.client.autoriza_lembretes}
                  onCheckedChange={(checked) => updateField('client', 0, 'autoriza_lembretes', checked as boolean)}
                />
                <Label htmlFor="autoriza_lembretes" className="text-sm font-normal cursor-pointer">
                  Autoriza receber lembretes de manutenção
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Número (opcional)</Label>
              <Input placeholder="123" value={formData.client.numero || ''} onChange={(e) => updateField('client', 0, 'numero', e.target.value)} className="h-12" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Endereço</Label>
              <Input placeholder="Rua das Flores, 123, Centro - Paulo Afonso/BA" value={formData.client.address} onChange={(e) => updateField('client', 0, 'address', e.target.value)} className="h-12" />
            </div>
          </div>
        </TabsContent>

        {/* ABA MOTOS */}
        <TabsContent value="motos" className="space-y-4 pt-4">
          {formData.motos.map((moto, index) => (
            <div key={index} className="border rounded-xl p-6 space-y-4 bg-card shadow-sm">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Moto {index + 1}</h3>
                {index > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => {
                  const newMotos = formData.motos.filter((_, i) => i !== index);
                  setFormData({ ...formData, motos: newMotos.length ? newMotos : [formData.motos[0]] });
                }}>Remover</Button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold">Modelo</Label>
                  <Input placeholder="Honda CG 160" value={moto.model || ''} onChange={(e) => updateField('motos', index, 'model', e.target.value)} className="h-12" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="font-semibold">Ano</Label>
                    <Input placeholder="2024" value={moto.year || ''} onChange={(e) => updateField('motos', index, 'year', e.target.value)} className="h-12" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold">Cor</Label>
                    <Input placeholder="Preta" value={moto.color || ''} onChange={(e) => updateField('motos', index, 'color', e.target.value)} className="h-12" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">Placa *</Label>
                  <Input
                    placeholder="ABC1D23"
                    value={moto.placa}
                    onChange={(e) => updateField('motos', index, 'placa', e.target.value)}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Km</Label>
                  <Input placeholder="25.000 km" value={moto.km} onChange={(e) => updateField('motos', index, 'km', e.target.value)} className="h-12" />
                </div>
              </div>

              {moto.moto_info && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="font-medium text-blue-800">ℹ️ Informações da moto:</Label>
                  <div className="mt-1 font-semibold text-blue-900">{moto.moto_info}</div>
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addMoto} className="w-full h-12 border-2 text-lg">
            + Nova Moto
          </Button>
        </TabsContent>

        {/* NOVA ABA SERVIÇOS */}
        <TabsContent value="servicos" className="space-y-4 pt-4">
          <div className="space-y-6">
            {/* Datas de Entrada */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-2">
                <Label className="font-semibold">📅 Data de Entrada *</Label>
                <Input
                  type="date"
                  value={formData.servicos.entry_date || ''}
                  onChange={(e) => updateField('servicos', 0, 'entry_date', e.target.value)}
                  className="h-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="flex items-center gap-2 font-semibold">
                  <Truck className="h-5 w-5" /> Quem vai pegar a moto?
                </Label>
                <Select value={formData.servicos.quem_pega} onValueChange={(v) => updateField('servicos', 0, 'quem_pega', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente">🟢 Cliente</SelectItem>
                    <SelectItem value="outro">🔴 Outra pessoa</SelectItem>
                  </SelectContent>
                </Select>

                {formData.servicos.quem_pega === 'outro' && (
                  <div className="space-y-3 pt-2 border-t pt-4">
                    <div>
                      <Label className="font-medium">Nome da pessoa</Label>
                      <Input
                        placeholder="Nome completo de quem retira"
                        value={formData.servicos.nome_retirada || ''}
                        onChange={(e) => updateField('servicos', 0, 'nome_retirada', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="font-medium">Telefone (opcional)</Label>
                      <Input
                        placeholder="(XX) XXXXX-XXXX"
                        value={formData.servicos.telefone_retirada || ''}
                        onChange={(e) => updateField('servicos', 0, 'telefone_retirada', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="font-medium">CPF (opcional)</Label>
                      <Input
                        placeholder="XXX.XXX.XXX-XX"
                        value={formData.servicos.cpf_retirada || ''}
                        onChange={(e) => updateField('servicos', 0, 'cpf_retirada', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-2 font-semibold">
                  Adesivo Bandara Motos?
                </Label>
                <Select value={formData.servicos.adesivo_loja} onValueChange={(v) => updateField('servicos', 0, 'adesivo_loja', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">✅ Sim (colar adesivo)</SelectItem>
                    <SelectItem value="nao">❌ Não (sem adesivo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 font-semibold text-lg">
                <Wrench className="h-5 w-5" /> O que fazer na moto?
              </Label>
              <Textarea
                placeholder="Trocar óleo, alinhamento, revisão freios, etc..."
                value={formData.servicos.o_que_fazer}
                onChange={(e) => updateField('servicos', 0, 'o_que_fazer', e.target.value)}
                rows={4}
                className="resize-vertical min-h-[120px]"
              />
              
              {/* Detected keywords alert */}
              {detectedKeywords.length > 0 && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex gap-2 items-start">
                    <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-900">Palavras-chave detectadas:</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {detectedKeywords.map((keyword) => (
                          <div key={keyword.id} className="bg-amber-100 text-amber-900 px-3 py-1 rounded-full text-sm">
                            <span className="font-medium">{keyword.keyword}</span>
                            <span className="text-xs ml-2">⏱️ {keyword.reminder_days}d</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-amber-700 mt-2">
                        ℹ️ Lembretes automáticos serão criados para quando o cliente voltar à loja!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Button type="submit" className="w-full h-14 text-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800" disabled={!isValid || isSubmitting}>
        {isSubmitting ? '⏳ Criando OS...' : '🚀 Finalizar OS Bandara Motos'}
      </Button>
    </form>
  );
}
