// Configurações > Nota fiscal: regime da loja, alíquotas e padrões usados na NFC-e.
// Ligar o módulo e trocar teste/produção é só com o suporte (trava no banco).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useStoreSettings, type StoreSettings } from '@/hooks/useStoreSettings';
import { Button } from '@/components/ui/button';
import { fmtCpf } from '@/lib/precoCliente';
import { CertificadoA1, type EmissorCert } from './CertificadoA1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Fiscal = {
  fiscal_ativo?: boolean; fiscal_ambiente?: 'sandbox' | 'producao'; fiscal_regime?: 'simples' | 'normal';
  fiscal_icms_aliquota?: number | null; fiscal_fcp_aliquota?: number | null; fiscal_pis_cofins_cst?: number;
  fiscal_pis_aliquota?: number; fiscal_cofins_aliquota?: number; fiscal_ncm_padrao?: string | null;
  fiscal_cfop_padrao?: string; fiscal_csosn_padrao?: string; fiscal_origem_padrao?: number;
};

const CST_PIS = [
  { v: 4, nome: '04 - Monofásico (revenda a alíquota zero) — ex.: autopeças da Lei 10.485' },
  { v: 1, nome: '01 - Tributável (Lucro Presumido 0,65% / 3%)' },
  { v: 6, nome: '06 - Alíquota zero' },
  { v: 7, nome: '07 - Isenta' },
  { v: 49, nome: '49 - Outras operações de saída' },
];

const campo = 'w-full p-2 border border-white/20 rounded text-sm bg-black/30 text-neutral-200';
const rotulo = 'text-xs text-neutral-400 font-medium';
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const txt = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

export function ConfigFiscal() {
  const { storeId } = useStore();
  const { settings, saveSettings, saving } = useStoreSettings();
  const f = (settings ?? {}) as Fiscal;
  const [regime, setRegime] = useState<'simples' | 'normal'>('simples');
  const [icms, setIcms] = useState('');
  const [fcp, setFcp] = useState('');
  const [cstPis, setCstPis] = useState(4);
  const [pis, setPis] = useState('0,65');
  const [cofins, setCofins] = useState('3');
  const [ncm, setNcm] = useState('');
  const [cfop, setCfop] = useState('5102');
  const [csosn, setCsosn] = useState('102');
  const [origem, setOrigem] = useState(0);

  useEffect(() => {
    if (!settings) return;
    setRegime(f.fiscal_regime === 'normal' ? 'normal' : 'simples');
    setIcms(txt(f.fiscal_icms_aliquota)); setFcp(txt(f.fiscal_fcp_aliquota));
    setCstPis(Number(f.fiscal_pis_cofins_cst ?? 4)); setPis(txt(f.fiscal_pis_aliquota ?? 0.65)); setCofins(txt(f.fiscal_cofins_aliquota ?? 3));
    setNcm(f.fiscal_ncm_padrao ?? ''); setCfop(f.fiscal_cfop_padrao ?? '5102'); setCsosn(f.fiscal_csosn_padrao ?? '102'); setOrigem(Number(f.fiscal_origem_padrao ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.id]);

  const { data: emissores = [] } = useQuery({
    queryKey: ['fiscal-emissores', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db.from('fiscal_emissores').select('papel, ambiente, cnpj, razao_social, ativo, certificado_validade, certificado_titular, certificado_conferido_em').eq('store_id', storeId);
      return (data ?? []) as (EmissorCert & { ambiente: string; razao_social: string | null; ativo: boolean })[];
    },
  });

  const erro = (() => {
    if (ncm && ncm.replace(/\D/g, '').length !== 8) return 'O NCM padrão precisa ter 8 dígitos.';
    if (!/^\d{4}$/.test(cfop)) return 'O CFOP padrão precisa ter 4 dígitos.';
    if (regime === 'normal') {
      const a = num(icms);
      if (a == null || !(a > 0 && a <= 40)) return 'Informe a alíquota de ICMS (ex.: 20,5).';
      const b = num(fcp);
      if (b != null && !(b >= 0 && b <= 10)) return 'FCP inválido.';
      if ([1, 2].includes(cstPis) && (num(pis) == null || num(cofins) == null)) return 'Informe as alíquotas de PIS e COFINS.';
    } else if (!/^\d{3}$/.test(csosn)) return 'O CSOSN padrão precisa ter 3 dígitos (ex.: 102).';
    return null;
  })();

  const salvar = () => {
    if (erro) return;
    saveSettings({
      fiscal_regime: regime,
      fiscal_icms_aliquota: regime === 'normal' ? num(icms) : f.fiscal_icms_aliquota ?? null,
      fiscal_fcp_aliquota: regime === 'normal' ? num(fcp) : f.fiscal_fcp_aliquota ?? null,
      fiscal_pis_cofins_cst: cstPis,
      fiscal_pis_aliquota: num(pis) ?? 0.65,
      fiscal_cofins_aliquota: num(cofins) ?? 3,
      fiscal_ncm_padrao: ncm.replace(/\D/g, '') || null,
      fiscal_cfop_padrao: cfop,
      fiscal_csosn_padrao: csosn,
      fiscal_origem_padrao: origem,
    } as Partial<StoreSettings>);
  };

  if (!f.fiscal_ativo) {
    return (
      <div className="border border-white/10 rounded-lg p-3 bg-black/20 text-sm text-neutral-300">
        O módulo de nota fiscal não está ativo nesta loja. Fale com o suporte para contratar e ativar.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-white/10 rounded-lg p-3 space-y-1 bg-black/20">
        <p className="text-sm font-semibold text-neutral-200">Emissão</p>
        <p className="text-xs text-neutral-400">
          Ambiente: <b className={f.fiscal_ambiente === 'producao' ? 'text-emerald-400' : 'text-amber-400'}>{f.fiscal_ambiente === 'producao' ? 'Produção (notas valendo)' : 'Teste (notas sem valor fiscal)'}</b>
          {' '}· trocar só com o suporte.
        </p>
        {emissores.filter((e) => e.ambiente === f.fiscal_ambiente).map((e) => (
          <div key={e.papel} className="space-y-1.5 pt-1">
            <p className="text-xs text-neutral-400">
              CNPJ de {e.papel === 'vendas' ? 'vendas' : 'serviços'}: <b className="text-neutral-200">{fmtCpf(e.cnpj)}</b>{e.razao_social ? ` · ${e.razao_social}` : ''}{e.ativo ? '' : ' (desligado)'}
            </p>
            {e.ativo && <CertificadoA1 emissor={e} />}
          </div>
        ))}
        {emissores.filter((e) => e.ambiente === f.fiscal_ambiente).length === 0 && <p className="text-xs text-red-400">Nenhum CNPJ cadastrado para emitir. Fale com o suporte.</p>}
      </div>

      <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
        <p className="text-sm font-semibold text-neutral-200">Impostos da loja</p>
        <p className="text-xs text-neutral-500">Confira com o seu contador. O que está no cadastro de cada produto (NCM, CST, CFOP) vale mais que estes padrões.</p>
        <div className="space-y-1">
          <label className={rotulo}>Regime tributário</label>
          <select value={regime} onChange={(e) => setRegime(e.target.value as 'simples' | 'normal')} className={campo}>
            <option value="simples">Simples Nacional (ou MEI)</option>
            <option value="normal">Regime normal (Lucro Presumido ou Real)</option>
          </select>
        </div>

        {regime === 'normal' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={rotulo}>ICMS (%)</label>
                <input inputMode="decimal" value={icms} onChange={(e) => setIcms(e.target.value)} placeholder="Ex.: 20,5" className={campo} />
              </div>
              <div className="space-y-1">
                <label className={rotulo}>FCP (%) — deixe vazio se não tiver</label>
                <input inputMode="decimal" value={fcp} onChange={(e) => setFcp(e.target.value)} placeholder="Vazio" className={campo} />
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">Peça com substituição tributária (CST 60 / CFOP 5405 no produto) sai sem ICMS destacado.</p>
            <div className="space-y-1">
              <label className={rotulo}>PIS/COFINS padrão</label>
              <select value={cstPis} onChange={(e) => setCstPis(Number(e.target.value))} className={campo}>
                {CST_PIS.map((c) => <option key={c.v} value={c.v}>{c.nome}</option>)}
              </select>
            </div>
            {[1, 2].includes(cstPis) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={rotulo}>PIS (%)</label>
                  <input inputMode="decimal" value={pis} onChange={(e) => setPis(e.target.value)} className={campo} />
                </div>
                <div className="space-y-1">
                  <label className={rotulo}>COFINS (%)</label>
                  <input inputMode="decimal" value={cofins} onChange={(e) => setCofins(e.target.value)} className={campo} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-1">
            <label className={rotulo}>CSOSN padrão</label>
            <input inputMode="numeric" value={csosn} onChange={(e) => setCsosn(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="102" className={campo} />
            <p className="text-[11px] text-neutral-500">102 = venda normal do Simples; 500 = peça com ICMS já pago por substituição tributária.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className={rotulo}>NCM padrão</label>
            <input inputMode="numeric" value={ncm} onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 dígitos" className={campo} />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>CFOP padrão</label>
            <input inputMode="numeric" value={cfop} onChange={(e) => setCfop(e.target.value.replace(/\D/g, '').slice(0, 4))} className={campo} />
          </div>
          <div className="space-y-1">
            <label className={rotulo}>Origem padrão</label>
            <select value={origem} onChange={(e) => setOrigem(Number(e.target.value))} className={campo}>
              <option value={0}>0 - Nacional</option>
              <option value={1}>1 - Importado direto</option>
              <option value={2}>2 - Importado (mercado interno)</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">NCM padrão: usado em item digitado à mão ou produto sem NCM. Vazio = a nota não sai e avisa qual item está sem NCM.</p>

        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <Button className="w-full" disabled={saving || !!erro} onClick={salvar}>{saving ? 'Salvando...' : 'Salvar impostos'}</Button>
      </div>
    </div>
  );
}
