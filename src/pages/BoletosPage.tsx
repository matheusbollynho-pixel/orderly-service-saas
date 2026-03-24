import { useState, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { useBoletos, Boleto, BoletoCategoria, BoletoRecorrencia, BoletoPaidMethod, getBoletoStatus } from '@/hooks/useBoletos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, CheckCircle2, RotateCcw, Camera, X, AlertTriangle, Clock, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORIAS: { value: BoletoCategoria; label: string }[] = [
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'conta_fixa', label: 'Conta Fixa' },
  { value: 'imposto', label: 'Imposto' },
  { value: 'outro', label: 'Outro' },
];

const RECORRENCIAS: { value: BoletoRecorrencia; label: string }[] = [
  { value: 'nenhuma', label: 'Sem recorrência' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

const METODOS: { value: BoletoPaidMethod; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'ted_doc', label: 'TED/DOC' },
];

const ALERT_OPTIONS = [
  { days: 7, label: '7 dias antes' },
  { days: 5, label: '5 dias antes' },
  { days: 3, label: '3 dias antes' },
  { days: 2, label: '2 dias antes' },
  { days: 1, label: '1 dia antes' },
  { days: 0, label: 'No dia do vencimento' },
];

const STATUS_CONFIG = {
  pago: { label: 'Pago', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  vencido: { label: 'Vencido', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  vence_hoje: { label: 'Vence hoje', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  proximo: { label: 'Próximo', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  aberto: { label: 'Em aberto', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
};

const EMPTY_FORM = {
  credor: '',
  valor: '',
  vencimento: '',
  codigo_barras: '',
  pix_copia_cola: '',
  juros: '',
  categoria: 'outro' as BoletoCategoria,
  recorrencia: 'nenhuma' as BoletoRecorrencia,
  alert_days: [3],
  notify_sistema: true,
  notify_whatsapp: false,
  observacoes: '',
};

export function BoletosPage() {
  const { boletos, isLoading, createBoleto, updateBoleto, deleteBoleto, marcarPago, marcarAberto, isCreating } = useBoletos();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState<string>('pendentes');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ paid_at: '', paid_method: 'pix' as BoletoPaidMethod });
  const [loadingBarcode, setLoadingBarcode] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopScanner = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    BrowserMultiFormatReader.releaseAllStreams();
    readerRef.current = null;
    setScanning(false);
  };

  const startScanner = async () => {
    setScanError(null);
    setScanning(true);
    await new Promise(r => setTimeout(r, 250));
    if (!videoRef.current) { setScanning(false); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      // aguarda video ter dimensões reais
      await new Promise<void>(res => {
        const check = () => videoRef.current && videoRef.current.videoWidth > 0 ? res() : requestAnimationFrame(check);
        check();
      });

      if ('BarcodeDetector' in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BD = (window as any).BarcodeDetector;
        const supported: string[] = await BD.getSupportedFormats();
        const want = ['itf', 'itf_14', 'code_128', 'code_39', 'qr_code', 'pdf417', 'data_matrix'];
        const formats = want.filter(f => supported.includes(f));
        const detector = new BD({ formats: formats.length > 0 ? formats : supported });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return;
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0);
          try {
            const codes = await detector.detect(canvas);
            if (codes.length > 0) {
              const raw: string = codes[0].rawValue;
              stopScanner();
              setForm(prev => ({ ...prev, codigo_barras: raw }));
              fetchBarcodeData(raw);
              return;
            }
          } catch { /* frame sem código */ }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      } else {
        // Fallback ZXing (iOS Safari)
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.ITF, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;
        await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (result) {
            stopScanner();
            const raw = result.getText();
            setForm(prev => ({ ...prev, codigo_barras: raw }));
            fetchBarcodeData(raw);
          }
        });
      }
    } catch {
      setScanError('Não foi possível acessar a câmera.');
      setScanning(false);
    }
  };

  // Detecta se é código Pix EMV (começa com "00020126" ou similar)
  const isPixEMV = (text: string) => text.trim().startsWith('000201');

  // Busca dados na BrasilAPI pelo código de barras
  const fetchBarcodeData = async (codigo: string) => {
    const text = codigo.trim();

    // Se for QR Code Pix/EMV, salva no campo pix_copia_cola
    if (isPixEMV(text)) {
      setForm(prev => ({ ...prev, pix_copia_cola: text, codigo_barras: '' }));
      return;
    }

    const clean = text.replace(/\D/g, '');
    if (clean.length < 44) return;
    setLoadingBarcode(true);
    setScanError(null);

    // Extrai valor e vencimento direto do código (padrão FEBRABAN — funciona para qualquer banco)
    const parseBoletoLocal = () => {
      let fator: string;
      let valorStr: string;
      if (clean.length === 47) {
        // Linha digitável: campo 5 começa na posição 33
        fator = clean.substring(33, 37);
        valorStr = clean.substring(37, 47);
      } else {
        // Código de barras: posições 5-8 = fator, 9-18 = valor
        fator = clean.substring(5, 9);
        valorStr = clean.substring(9, 19);
      }
      const valor = parseInt(valorStr, 10) / 100;
      let vencimento: string | undefined;
      const fatorNum = parseInt(fator, 10);
      if (fatorNum > 0) {
        // Primeiro ciclo: base 07/10/1997, fator até 9999 (atingido em 21/02/2025)
        const base1 = new Date(1997, 9, 7);
        base1.setDate(base1.getDate() + fatorNum);

        const umAnoAtras = new Date();
        umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);

        if (base1 < umAnoAtras) {
          // Segundo ciclo (FEBRABAN 2025): fator 1000 = 22/02/2025
          const base2 = new Date(2025, 1, 22);
          base2.setDate(base2.getDate() + (fatorNum - 1000));
          vencimento = base2.toISOString().split('T')[0];
        } else {
          vencimento = base1.toISOString().split('T')[0];
        }
      }
      return { valor: valor > 0 ? valor : undefined, vencimento };
    };

    const local = parseBoletoLocal();
    if (local.valor || local.vencimento) {
      setForm(prev => ({
        ...prev,
        ...(local.valor ? { valor: String(local.valor) } : {}),
        ...(local.vencimento ? { vencimento: local.vencimento } : {}),
      }));
      setLoadingBarcode(false);
      return;
    }

    // Fallback: tenta BrasilAPI para casos especiais (convênios, concessionárias)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/boleto/v1/${clean}`);
      if (res.ok) {
        const data = await res.json();
        if (data.amount || data.expiration_date) {
          setForm(prev => ({
            ...prev,
            ...(data.amount ? { valor: String(data.amount) } : {}),
            ...(data.expiration_date ? { vencimento: data.expiration_date.split('T')[0] } : {}),
          }));
        }
      }
    } catch { /* silencioso */ } finally {
      setLoadingBarcode(false);
    }
  };

  const toggleAlertDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      alert_days: prev.alert_days.includes(day)
        ? prev.alert_days.filter(d => d !== day)
        : [...prev.alert_days, day],
    }));
  };

  const handleSubmit = () => {
    if (!form.credor || !form.valor || !form.vencimento) return;
    createBoleto({
      credor: form.credor,
      valor: parseFloat(form.valor),
      vencimento: form.vencimento,
      codigo_barras: form.codigo_barras || null,
      pix_copia_cola: form.pix_copia_cola || null,
      juros: form.juros ? parseFloat(form.juros) : null,
      categoria: form.categoria,
      recorrencia: form.recorrencia,
      alert_days: form.alert_days,
      notify_sistema: form.notify_sistema,
      notify_whatsapp: form.notify_whatsapp,
      observacoes: form.observacoes || null,
      paid_at: null,
      paid_method: null,
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const handlePagar = (id: string) => {
    if (!payForm.paid_at || !payForm.paid_method) return;
    marcarPago(id, payForm.paid_at, payForm.paid_method);
    setPayingId(null);
    setPayForm({ paid_at: '', paid_method: 'pix' });
  };

  const filteredBoletos = boletos.filter(b => {
    const status = getBoletoStatus(b);
    if (filterStatus === 'pendentes') return status !== 'pago';
    if (filterStatus === 'pagos') return status === 'pago';
    if (filterStatus === 'vencidos') return status === 'vencido';
    return true;
  });

  const counts = {
    vencidos: boletos.filter(b => getBoletoStatus(b) === 'vencido').length,
    vence_hoje: boletos.filter(b => getBoletoStatus(b) === 'vence_hoje').length,
    proximo: boletos.filter(b => getBoletoStatus(b) === 'proximo').length,
  };

  const totalPendente = boletos
    .filter(b => !b.paid_at)
    .reduce((s, b) => s + b.valor, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Controle de Boletos</h2>
        <Button onClick={() => setShowForm(v => !v)} size="sm">
          {showForm ? <><X className="h-4 w-4 mr-1" /> Cancelar</> : <><Plus className="h-4 w-4 mr-1" /> Novo Boleto</>}
        </Button>
      </div>

      {/* Alertas */}
      {(counts.vencidos > 0 || counts.vence_hoje > 0) && (
        <div className="space-y-2">
          {counts.vencidos > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">{counts.vencidos} boleto{counts.vencidos > 1 ? 's' : ''} vencido{counts.vencidos > 1 ? 's' : ''}!</span>
            </div>
          )}
          {counts.vence_hoje > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium">{counts.vence_hoje} boleto{counts.vence_hoje > 1 ? 's' : ''} vence{counts.vence_hoje > 1 ? 'm' : ''} hoje!</span>
            </div>
          )}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total pendente</p>
            <p className="text-lg font-bold text-red-600">R$ {totalPendente.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vencidos</p>
            <p className="text-lg font-bold">{counts.vencidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vencem hoje</p>
            <p className="text-lg font-bold">{counts.vence_hoje}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Próximos (3 dias)</p>
            <p className="text-lg font-bold">{counts.proximo}</p>
          </CardContent>
        </Card>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-semibold">Novo Boleto</h3>

            {/* Código de barras */}
            <div className="space-y-1">
              <Label>Código de barras</Label>
              <div className="flex gap-2">
                <Input
                  ref={barcodeInputRef}
                  placeholder="Cole ou digite o código..."
                  value={form.codigo_barras}
                  onChange={e => {
                    setForm(prev => ({ ...prev, codigo_barras: e.target.value }));
                    fetchBarcodeData(e.target.value);
                  }}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  title="Escanear com câmera"
                  onClick={startScanner}
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              {loadingBarcode && <p className="text-xs text-muted-foreground">Buscando dados do boleto...</p>}
              {scanError && <p className="text-xs text-red-500">{scanError}</p>}

              {/* Scanner ao vivo */}
              {scanning && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
                  <div className="relative w-full max-w-sm">
                    <video ref={videoRef} className="w-full rounded-lg" autoPlay playsInline muted />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-64 h-20 border-2 border-yellow-400 rounded opacity-80" />
                    </div>
                  </div>
                  <p className="text-white text-sm mt-4">Aponte para o código de barras</p>
                  <Button variant="outline" className="mt-4" onClick={stopScanner}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                </div>
              )}
              {form.pix_copia_cola && !form.codigo_barras && (
                <p className="text-xs text-blue-500">QR Code Pix detectado — salvo no campo Pix copia e cola</p>
              )}
            </div>

            {/* Pix copia e cola */}
            <div className="space-y-1">
              <Label>Pix copia e cola <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Textarea
                placeholder="Cole o código Pix aqui ou será preenchido automaticamente pelo QR Code..."
                value={form.pix_copia_cola}
                onChange={e => setForm(prev => ({ ...prev, pix_copia_cola: e.target.value }))}
                rows={2}
                className="font-mono text-xs resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Credor *</Label>
                <Input
                  placeholder="Nome do fornecedor ou credor"
                  value={form.credor}
                  onChange={e => setForm(prev => ({ ...prev, credor: e.target.value }))}
                  spellCheck lang="pt-BR"
                />
              </div>
              <div className="space-y-1">
                <Label>Valor original *</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={e => setForm(prev => ({ ...prev, valor: e.target.value }))}
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-1">
                <Label>Juros / Multa <span className="text-xs text-muted-foreground">(se vencido)</span></Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={form.juros}
                  onChange={e => setForm(prev => ({ ...prev, juros: e.target.value }))}
                  min={0}
                  step={0.01}
                />
                {form.valor && form.juros && (
                  <p className="text-xs text-orange-500">Total a pagar: R$ {(parseFloat(form.valor || '0') + parseFloat(form.juros || '0')).toFixed(2)}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={form.vencimento}
                  onChange={e => setForm(prev => ({ ...prev, vencimento: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.categoria} onValueChange={v => setForm(prev => ({ ...prev, categoria: v as BoletoCategoria }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Recorrência</Label>
                <Select value={form.recorrencia} onValueChange={v => setForm(prev => ({ ...prev, recorrencia: v as BoletoRecorrencia }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECORRENCIAS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Alertas */}
            <div className="space-y-2">
              <Label>Alertas</Label>
              <div className="flex flex-wrap gap-2">
                {ALERT_OPTIONS.map(opt => (
                  <label key={opt.days} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={form.alert_days.includes(opt.days)}
                      onCheckedChange={() => toggleAlertDay(opt.days)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notificações */}
            <div className="space-y-2">
              <Label>Notificar via</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={form.notify_sistema}
                    onCheckedChange={v => setForm(prev => ({ ...prev, notify_sistema: Boolean(v) }))}
                  />
                  <span className="text-sm">Sistema</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={form.notify_whatsapp}
                    onCheckedChange={v => setForm(prev => ({ ...prev, notify_whatsapp: Boolean(v) }))}
                  />
                  <span className="text-sm">WhatsApp</span>
                </label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                placeholder="Informações adicionais..."
                value={form.observacoes}
                onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
                rows={2}
                spellCheck
                lang="pt-BR"
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={isCreating || !form.credor || !form.valor || !form.vencimento}>
                {isCreating ? 'Salvando...' : 'Salvar boleto'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { value: 'pendentes', label: 'Pendentes' },
          { value: 'vencidos', label: 'Vencidos' },
          { value: 'pagos', label: 'Pagos' },
          { value: 'todos', label: 'Todos' },
        ].map(f => (
          <Button
            key={f.value}
            variant={filterStatus === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filteredBoletos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum boleto encontrado.</p>
      ) : (
        <div className="space-y-3">
          {filteredBoletos.map(boleto => {
            const status = getBoletoStatus(boleto);
            const cfg = STATUS_CONFIG[status];
            const isPaying = payingId === boleto.id;

            return (
              <Card key={boleto.id} className={status === 'vencido' ? 'border-red-500/30' : status === 'vence_hoje' ? 'border-orange-500/30' : ''}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{boleto.credor}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">{CATEGORIAS.find(c => c.value === boleto.categoria)?.label}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <p className="text-xl font-bold">R$ {boleto.valor.toFixed(2)}</p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(parseISO(boleto.vencimento), 'dd/MM/yyyy', { locale: ptBR })}
                        </div>
                      </div>
                      {boleto.recorrencia !== 'nenhuma' && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Recorrência: {RECORRENCIAS.find(r => r.value === boleto.recorrencia)?.label}
                        </p>
                      )}
                      {(boleto.juros ?? 0) > 0 && (
                        <p className="text-xs text-orange-500 mt-0.5">
                          + R$ {(boleto.juros!).toFixed(2)} juros/multa → Total: R$ {(boleto.valor + boleto.juros!).toFixed(2)}
                        </p>
                      )}
                      {boleto.codigo_barras && (
                        <p className="text-xs font-mono text-muted-foreground mt-1 break-all">{boleto.codigo_barras}</p>
                      )}
                      {boleto.pix_copia_cola && (
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-xs font-mono text-blue-400 truncate max-w-xs">{boleto.pix_copia_cola.substring(0, 40)}...</p>
                          <button
                            type="button"
                            className="text-xs text-blue-500 hover:text-blue-400 flex-shrink-0"
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(boleto.pix_copia_cola!); }}
                          >
                            Copiar Pix
                          </button>
                        </div>
                      )}
                      {boleto.observacoes && (
                        <p className="text-xs text-muted-foreground mt-1">Obs: {boleto.observacoes}</p>
                      )}
                      {boleto.paid_at && (
                        <p className="text-xs text-green-600 mt-1">
                          Pago em {format(parseISO(boleto.paid_at), 'dd/MM/yyyy')} via {METODOS.find(m => m.value === boleto.paid_method)?.label}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!boleto.paid_at ? (
                        <Button size="sm" variant="outline" className="text-green-600 border-green-500/30 hover:bg-green-500/10"
                          onClick={() => { setPayingId(boleto.id); setPayForm({ paid_at: new Date().toISOString().split('T')[0], paid_method: 'pix' }); }}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => marcarAberto(boleto.id)}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="text-destructive h-8 w-8"
                        onClick={() => deleteBoleto(boleto.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Formulário de pagamento */}
                  {isPaying && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Data de pagamento</Label>
                          <Input
                            type="date"
                            value={payForm.paid_at}
                            onChange={e => setPayForm(prev => ({ ...prev, paid_at: e.target.value }))}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Forma de pagamento</Label>
                          <Select value={payForm.paid_method} onValueChange={v => setPayForm(prev => ({ ...prev, paid_method: v as BoletoPaidMethod }))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {METODOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1" onClick={() => handlePagar(boleto.id)}>Confirmar</Button>
                          <Button size="sm" variant="outline" onClick={() => setPayingId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
