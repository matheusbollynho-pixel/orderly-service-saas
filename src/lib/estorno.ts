/**
 * Pergunta o motivo do estorno. Nada é apagado do caixa: o valor contrário é lançado
 * e o original fica marcado como estornado. Retorna null se a pessoa cancelar.
 */
export function pedirMotivoEstorno(oQue: string): string | null {
  const motivo = window.prompt(
    `Estornar ${oQue}?\n\nNada é apagado: o valor contrário entra no caixa de hoje e fica registrado com o motivo.\n\nMotivo do estorno:`
  );
  if (motivo === null) return null;
  if (!motivo.trim()) {
    window.alert('Escreva o motivo do estorno.');
    return null;
  }
  return motivo.trim();
}
