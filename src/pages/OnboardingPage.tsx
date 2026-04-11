import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Car, Bike, MapPin, Phone, Building2, Clock, CreditCard, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STEPS = ['Tipo de veículo', 'Dados da loja', 'Funcionamento', 'Conclusão'];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { storeId } = useStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [vehicleType, setVehicleType] = useState<'moto' | 'carro'>('moto');
  const [companyName, setCompanyName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [openingHours, setOpeningHours] = useState('Seg a Sex: 08h às 18h\nSábados: 08h às 12h\nDomingos: Fechado');
  const [paymentMethods, setPaymentMethods] = useState('PIX, Dinheiro, Cartão de crédito/débito');

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const finish = async () => {
    if (!storeId) return;
    if (!companyName.trim()) { toast.error('Informe o nome da empresa'); return; }

    setSaving(true);
    const { error } = await (supabase as any)
      .from('store_settings')
      .update({
        vehicle_type: vehicleType,
        company_name: companyName,
        store_phone: storePhone || null,
        store_address: storeAddress || null,
        google_maps_url: googleMapsUrl || null,
        opening_hours: openingHours || null,
        payment_methods: paymentMethods || null,
        onboarded: true,
      })
      .eq('id', storeId);

    setSaving(false);
    if (error) { toast.error(error.message); return; }

    toast.success('Configuração concluída!');
    // Força reload para StoreContext atualizar vehicle_type e onboarded
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao SpeedSeekOS! 🚀</h1>
          <p className="text-sm text-muted-foreground">Configure sua oficina em menos de 2 minutos</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                i < step ? 'bg-primary border-primary text-primary-foreground' :
                i === step ? 'border-primary text-primary' :
                'border-border text-muted-foreground'
              )}>
                {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn('text-xs hidden sm:block', i === step ? 'text-primary font-medium' : 'text-muted-foreground')}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="glass-card border border-border/50 rounded-xl p-6 space-y-5">

          {/* STEP 0 — Tipo de veículo */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Sua oficina trabalha com:</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Isso define os rótulos e textos em todo o sistema</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setVehicleType('moto')}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    vehicleType === 'moto'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border'
                  )}
                >
                  <Bike className="h-12 w-12" />
                  <div className="text-center">
                    <p className="font-semibold text-base">Motos</p>
                    <p className="text-xs opacity-70">Oficina de motos</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleType('carro')}
                  className={cn(
                    'flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all',
                    vehicleType === 'carro'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/50 bg-muted/20 text-muted-foreground hover:border-border'
                  )}
                >
                  <Car className="h-12 w-12" />
                  <div className="text-center">
                    <p className="font-semibold text-base">Carros</p>
                    <p className="text-xs opacity-70">Oficina de carros</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 1 — Dados da loja */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Dados da sua oficina</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Essas informações aparecem nos documentos e mensagens</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Nome da empresa *</label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ex: Bandara Motos" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> WhatsApp / Telefone</label>
                  <Input value={storePhone} onChange={e => setStorePhone(e.target.value)} placeholder="Ex: 75988388629" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Endereço</label>
                  <Input value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Ex: Rua das Oficinas, 123 - Cidade-BA" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Link Google Maps</label>
                  <Input value={googleMapsUrl} onChange={e => setGoogleMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
                  <p className="text-xs text-muted-foreground">Usado pela IA para enviar a localização ao cliente</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — Funcionamento */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Horário e pagamento</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Usados pela IA para responder clientes no WhatsApp</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horário de funcionamento</label>
                  <textarea
                    rows={4}
                    value={openingHours}
                    onChange={e => setOpeningHours(e.target.value)}
                    className="w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Formas de pagamento</label>
                  <Input value={paymentMethods} onChange={e => setPaymentMethods(e.target.value)} placeholder="PIX, Dinheiro, Cartão..." />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — Conclusão */}
          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Tudo pronto!</h2>
                <p className="text-sm text-muted-foreground mt-1">Revise os dados abaixo e finalize a configuração</p>
              </div>
              <div className="text-left space-y-2 rounded-lg bg-muted/20 border border-border/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo de veículo</span>
                  <span className="text-foreground font-medium capitalize">{vehicleType === 'moto' ? '🏍️ Motos' : '🚗 Carros'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empresa</span>
                  <span className="text-foreground font-medium">{companyName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone</span>
                  <span className="text-foreground">{storePhone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endereço</span>
                  <span className="text-foreground text-right max-w-[60%] truncate">{storeAddress || '—'}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Você pode alterar tudo isso depois em Configurações</p>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <Button variant="outline" onClick={back} className="flex-1">
                Voltar
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => { if (step === 1 && !companyName.trim()) { toast.error('Informe o nome da empresa'); return; } next(); }}
                className="flex-1"
              >
                Continuar
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="flex-1 gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Entrar no sistema
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
