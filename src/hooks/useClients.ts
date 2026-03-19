import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  name: string;
  cpf: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  apelido?: string;
  instagram?: string;
  autoriza_instagram: boolean;
  autoriza_lembretes?: boolean;
  birth_date?: string | null;
  endereco?: string;
  cidade?: string;
  state?: string;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Motorcycle {
  id: string;
  client_id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano?: number;
  cilindrada?: string;
  cor?: string;
  motor?: string;
  chassi?: string;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [motorcycles, setMotorcycles] = useState<Motorcycle[]>([]);
  const [loading, setLoading] = useState(false);

  // Buscar cliente por CPF
  const searchClientByCPF = async (cpf: string): Promise<Client | null> => {
    try {
      const cleanCPF = cpf.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('cpf', cleanCPF)
        .eq('active', true)
        .limit(1);

      if (error || !data || data.length === 0) {
        console.log('Cliente não encontrado:', error);
        return null;
      }

      return data[0];
    } catch (err) {
      console.error('Erro ao buscar cliente:', err);
      return null;
    }
  };

  // Buscar cliente por nome (parcial)
  const searchClientByName = async (name: string): Promise<Client[]> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .ilike('name', `%${name}%`)
        .eq('active', true)
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
      return [];
    }
  };

  // Buscar cliente por telefone (tenta várias variações de formato)
  const searchClientByPhone = async (phone: string): Promise<Client | null> => {
    try {
      const clean = phone.replace(/\D/g, '');
      // Variações: com/sem DDI 55, com/sem 9 extra
      const variants = new Set<string>([clean]);
      if (clean.startsWith('55')) variants.add(clean.slice(2));
      else variants.add(`55${clean}`);
      // adiciona/remove o 9 no início do número local (após DDD)
      const local = clean.startsWith('55') ? clean.slice(2) : clean;
      if (local.length === 11) variants.add(local.slice(0, 2) + local.slice(3)); // remove 9
      if (local.length === 10) variants.add(local.slice(0, 2) + '9' + local.slice(2)); // add 9

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .in('phone', [...variants])
        .eq('active', true)
        .limit(1);

      if (error || !data || data.length === 0) return null;
      return data[0];
    } catch (err) {
      console.error('Erro ao buscar cliente:', err);
      return null;
    }
  };

  // Buscar moto por placa
  const searchMotorcycleByPlate = async (placa: string): Promise<Motorcycle | null> => {
    try {
      const cleanPlate = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const { data, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('placa', cleanPlate)
        .eq('active', true)
        .limit(1);

      if (error || !data || data.length === 0) {
        console.log('Moto não encontrada:', error);
        return null;
      }

      return data[0];
    } catch (err) {
      console.error('Erro ao buscar moto:', err);
      return null;
    }
  };

  // Buscar motos de um cliente
  const getClientMotorcycles = async (clientId: string): Promise<Motorcycle[]> => {
    try {
      const { data, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('client_id', clientId)
        .eq('active', true);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Erro ao buscar motos do cliente:', err);
      return [];
    }
  };

  // Buscar cliente por ID
  const getClientById = async (clientId: string): Promise<Client | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .limit(1)
        .single();

      if (error || !data) return null;
      return data as Client;
    } catch (err) {
      console.error('Erro ao buscar cliente por ID:', err);
      return null;
    }
  };

  // Buscar moto por ID
  const getMotorcycleById = async (motorcycleId: string): Promise<Motorcycle | null> => {
    try {
      const { data, error } = await supabase
        .from('motorcycles')
        .select('*')
        .eq('id', motorcycleId)
        .limit(1)
        .single();

      if (error || !data) return null;
      return data as Motorcycle;
    } catch (err) {
      console.error('Erro ao buscar moto por ID:', err);
      return null;
    }
  };

  // Criar ou atualizar cliente
  const upsertClient = async (client: Partial<Client>): Promise<Client | null> => {
    try {
      // Garantir que autoriza_lembretes e autoriza_instagram sejam true por padrão
      const clientData = {
        ...client,
        autoriza_lembretes: client.autoriza_lembretes !== false ? true : false,
        autoriza_instagram: client.autoriza_instagram !== false ? true : false,
      };

      const { data, error } = await supabase
        .from('clients')
        .upsert(clientData as Partial<Client>, { onConflict: 'cpf' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      return null;
    }
  };

  // Criar ou atualizar moto
  const upsertMotorcycle = async (motorcycle: Partial<Motorcycle>): Promise<Motorcycle | null> => {
    try {
      const { data, error } = await supabase
        .from('motorcycles')
        .upsert(motorcycle as Partial<Motorcycle>, { onConflict: 'placa' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Erro ao salvar moto:', err);
      return null;
    }
  };

  // Atualizar cliente
  const updateClientById = async (id: string, client: Partial<Client>): Promise<Client | null> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update(client as Partial<Client>)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Client;
    } catch (err) {
      console.error('Erro ao atualizar cliente:', err);
      return null;
    }
  };

  // Atualizar moto
  const updateMotorcycleById = async (id: string, motorcycle: Partial<Motorcycle>): Promise<Motorcycle | null> => {
    try {
      const { data, error } = await supabase
        .from('motorcycles')
        .update(motorcycle as Partial<Motorcycle>)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Motorcycle;
    } catch (err) {
      console.error('Erro ao atualizar moto:', err);
      return null;
    }
  };

  return {
    clients,
    motorcycles,
    loading,
    searchClientByCPF,
    searchClientByName,
    searchClientByPhone,
    searchMotorcycleByPlate,
    getClientMotorcycles,
    getClientById,
    getMotorcycleById,
    upsertClient,
    upsertMotorcycle,
    updateClientById,
    updateMotorcycleById
  };
}
