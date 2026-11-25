// Certificado digital A1 do CNPJ que emite: ver validade e enviar um novo.
// O arquivo e a senha vão direto para o fornecedor da nota pela função do servidor; NADA é guardado no sistema.
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chamarFiscal, diasParaVencer } from '@/lib/fiscal';

export interface EmissorCert { papel: string; cnpj: string; certificado_validade: string | null; certificado_titular: string | null; certificado_conferido_em: string | null }

const lerBase64 = (f: File) => new Promise<string>((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => falha(new Error('Não consegui ler o arquivo.'));
  r.readAsDataURL(f);
});

export function textoValidade(validade: string | null): { texto: string; cor: string } {
  const d = diasParaVencer(validade);
  if (d == null) return { texto: 'Validade não conferida', cor: 'text-neutral-400' };
  const data = new Date(validade!).toLocaleDateString('pt-BR');
  if (d < 0) return { texto: `VENCIDO em ${data} — as notas não saem`, cor: 'text-red-400' };
  if (d <= 30) return { texto: `Vence em ${data} (faltam ${d} ${d === 1 ? 'dia' : 'dias'}) — renove já`, cor: d <= 7 ? 'text-red-400' : 'text-amber-400' };
  return { texto: `Válido até ${data}`, cor: 'text-emerald-400' };
}

export function CertificadoA1({ emissor }: { emissor: EmissorCert }) {
  const qc = useQueryClient();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState<'enviar' | 'ver' | null>(null);
  const val = textoValidade(emissor.certificado_validade);

  const limpar = () => { setArquivo(null); setSenha(''); if (arquivoRef.current) arquivoRef.current.value = ''; };
  const depois = (r: { validade: string | null; aviso?: string | null }, ok: string) => {
    if (r.aviso) toast.warning(r.aviso); else toast.success(ok);
    qc.invalidateQueries({ queryKey: ['fiscal-emissores'] });
  };

  const enviar = async () => {
    if (!arquivo || !senha) { toast.error('Escolha o arquivo .pfx e digite a senha.'); return; }
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) { toast.error('O certificado A1 é um arquivo .pfx (ou .p12).'); return; }
    if (arquivo.size > 50_000) { toast.error('Arquivo grande demais para um certificado A1.'); return; }
    setOcupado('enviar');
    try {
      const r = await chamarFiscal<{ validade: string | null; aviso?: string | null }>({
        acao: 'enviar_certificado', papel: emissor.papel, nome_arquivo: arquivo.name, arquivo_base64: await lerBase64(arquivo), senha,
      });
      depois(r, 'Certificado enviado!');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      limpar(); // senha e arquivo saem da tela, dando certo ou não
      setOcupado(null);
    }
  };
  const conferir = async () => {
    setOcupado('ver');
    try { depois(await chamarFiscal({ acao: 'ver_certificado', papel: emissor.papel }), 'Validade conferida'); }
    catch (e) { toast.error((e as Error).message); }
    finally { setOcupado(null); }
  };

  return (
    <div className="space-y-2 rounded-md border border-white/10 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-200"><ShieldCheck className="h-3.5 w-3.5" /> Certificado digital A1</p>
          <p className={`text-xs ${val.cor}`}>{val.texto}</p>
          {emissor.certificado_titular && <p className="truncate text-[11px] text-neutral-500">{emissor.certificado_titular}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" disabled={!!ocupado} onClick={conferir}>
          <RefreshCw className={`h-3.5 w-3.5 ${ocupado === 'ver' ? 'animate-spin' : ''}`} /> Conferir
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input ref={arquivoRef} type="file" accept=".pfx,.p12" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          className="w-full text-xs text-neutral-300 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-neutral-200" />
        <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha do certificado"
          className="w-full rounded border border-white/20 bg-black/30 p-2 text-sm text-neutral-200" />
        <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!!ocupado || !arquivo || !senha} onClick={enviar}>
          {ocupado === 'enviar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Enviar
        </Button>
      </div>
      <p className="text-[11px] text-neutral-500">
        O arquivo e a senha vão direto para o emissor de notas e não ficam guardados no sistema. Nunca mande o certificado por WhatsApp ou e-mail.
      </p>
    </div>
  );
}
