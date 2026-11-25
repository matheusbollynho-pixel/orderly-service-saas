// Motivo do cancelamento da nota de balcão (código gravado → texto da tela)
const MOTIVOS: Record<string, string> = {
  erro_lancamento: 'Erro de lançamento',
  preco: 'Preço (cliente não aprovou o valor)',
  insatisfacao: 'Insatisfação do cliente',
  produto_indisponivel: 'Produto indisponível',
  outro: 'Outro motivo',
};
export const motivoCancelamento = (codigo: string | null | undefined) => (codigo ? MOTIVOS[codigo] ?? codigo : 'não informado');
