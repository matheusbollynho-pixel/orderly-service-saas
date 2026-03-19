ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS whatsapp_satisfaction_template TEXT NOT NULL DEFAULT
    'Olá, {{nome}}! 👋

Aqui é da *{{empresa}}*.

Sua opinião é muito importante para melhorarmos sempre.
Pode avaliar seu atendimento em menos de 1 minuto? ⭐

{{link}}

Obrigado pela confiança! 🏍️🔧',

  ADD COLUMN IF NOT EXISTS whatsapp_birthday_template TEXT NOT NULL DEFAULT
    '🎉 *Feliz aniversário!* 🎂🥳

A equipe da *{{empresa}}* deseja muitas conquistas e bons quilômetros pela frente! 🏍️💨

Pra comemorar, você ganhou:
🎁 *15% de desconto* em serviços da oficina ou peças à vista.

⏰ Válido por 7 dias.
É só apresentar esta mensagem 😉

*{{empresa}}* — cuidando da sua moto como você merece!',

  ADD COLUMN IF NOT EXISTS whatsapp_balcao_followup_template TEXT NOT NULL DEFAULT
    'Olá{{nome}}! 👋

Aqui é da *{{empresa}}*.

Passando para saber se tudo ficou certinho com seu atendimento da nota *#{{numero}}*. Ficou alguma dúvida ou podemos ajudar em algo? 😊

Se quiser, deixa sua avaliação — leva menos de 1 minuto e nos ajuda muito! ⭐

{{link}}

Att, {{atendente}} 🏍️🔧';
