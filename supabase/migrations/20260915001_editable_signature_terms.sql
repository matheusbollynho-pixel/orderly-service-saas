-- Torna editável (por loja) o texto de declaração do checklist de inspeção
-- e do termo de entrega, exibidos na OS e impressos no PDF.
-- Coluna com DEFAULT preenche tanto as lojas existentes quanto as novas
-- (provision-client insere store_settings sem especificar esses campos).
alter table public.store_settings
  add column if not exists inspection_terms_text text
    default 'Declaro que o checklist de inspeção do veículo foi realizado e conferido no ato do atendimento, estando ciente das condições registradas e autorizando a execução dos serviços descritos nesta Ordem de Serviço. Estou ciente do prazo de até 30 dias para retirada da motocicleta após a conclusão do serviço. Após esse período, será cobrada taxa de estadia no valor de R$ 6,00 por dia. O não comparecimento para retirada poderá caracterizar abandono do veículo, nos termos da legislação vigente.',
  add column if not exists delivery_terms_text text
    default 'Declaro que recebi nesta data a motocicleta referente a esta Ordem de Serviço, após a execução dos serviços descritos. Confirmo que o veículo foi entregue, conferido e encontra-se em condições de uso, não constatando irregularidades aparentes no ato da entrega.';
