// Baixa uma planilha (CSV) que abre direto no Excel em português:
// separador ";", vírgula decimal e acentos certos (BOM UTF-8).
export type Celula = string | number | null | undefined;

function celula(v: Celula): string {
  if (v == null) return '';
  const txt = typeof v === 'number'
    ? (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ','))
    : String(v);
  return /[;"\n\r]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
}

export function baixarPlanilha(nome: string, colunas: string[], linhas: Celula[][]) {
  const corpo = [colunas, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const BOM = String.fromCharCode(0xfeff); // faz o Excel ler os acentos certo
  const blob = new Blob([BOM + corpo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const data = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${nome}-${data}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
