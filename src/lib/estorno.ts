import { pedirTexto } from '@/components/v2/Confirmacao';

/**
 * Pergunta o motivo do estorno. Nada é apagado do caixa: o valor contrário é lançado
 * e o original fica marcado como estornado. Retorna null se a pessoa cancelar.
 */
export function pedirMotivoEstorno(oQue: string): Promise<string | null> {
  return pedirTexto({
    titulo: `Estornar ${oQue}?`,
    descricao: 'Nada é apagado: o valor contrário entra no caixa de hoje e fica registrado com o motivo.',
    rotulo: 'Motivo do estorno',
    placeholder: 'Ex.: lançado em dobro, valor errado',
    obrigatorio: true,
    multilinha: true,
    verbo: 'Estornar',
  });
}
