#!/usr/bin/env node

/**
 * Script para enviar link de satisfação via WhatsApp
 * Uso: node send-satisfaction-link.mjs --name "Matheus" --apelido "bollynho" --phone "75988388629"
 */

import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const params: Record<string, string> = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    params[key] = args[i + 1] || '';
    i++;
  }
}

const clientName = params.name || params.clientName || 'Matheus';
const apelido = params.apelido || 'bollynho';
const phone = params.phone || '75988388629';

console.log('📱 Enviando link de satisfação...');
console.log(`  Nome: ${clientName}`);
console.log(`  Apelido: ${apelido}`);
console.log(`  Telefone: ${phone}\n`);

// Script para executar no contexto do navegador
const scriptContent = `
(async () => {
  try {
    // Import dinâmico da função
    const { sendSatisfactionLinkToClient } = await import('./src/lib/sendSatisfactionLink.ts');
    
    const result = await sendSatisfactionLinkToClient({
      phone: '${phone}',
      clientName: '${clientName}',
      apelido: '${apelido}',
    });
    
    console.log(result);
  } catch (error) {
    console.error('Erro:', error);
  }
})();
`;

console.log('⚠️  Para executar este script, você precisa:');
console.log('   1. Executar no console do navegador enquanto o app está rodando');
console.log('   2. Ou usar o AdminMenu no app para chamar sendSatisfactionLinkToClient()\n');

console.log('📋 Comando do console:\n');
console.log(`
import { sendSatisfactionLinkToClient } from '@/lib/sendSatisfactionLink';

sendSatisfactionLinkToClient({
  phone: '${phone}',
  clientName: '${clientName}',
  apelido: '${apelido}',
}).then(result => console.log(result));
`);
