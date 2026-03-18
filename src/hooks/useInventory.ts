import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

export type InventoryProduct = Database['public']['Tables']['inventory_products']['Row'];
export type InventoryProductInsert = Database['public']['Tables']['inventory_products']['Insert'];
export type InventoryProductUpdate = Database['public']['Tables']['inventory_products']['Update'];
export type InventoryMovement = Database['public']['Tables']['inventory_movements']['Row'];
export type InventoryMovementInsert = Database['public']['Tables']['inventory_movements']['Insert'];

export function useInventory() {
  const queryClient = useQueryClient();

  // ── PRODUTOS ──────────────────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as InventoryProduct[];
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (product: InventoryProductInsert) => {
      const { data, error } = await supabase
        .from('inventory_products')
        .insert(product)
        .select()
        .single();
      if (error) throw error;
      return data as InventoryProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Produto cadastrado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cadastrar produto: ${error.message}`);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, ...updates }: InventoryProductUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('inventory_products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as InventoryProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Produto atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar produto: ${error.message}`);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      // Remove referência em materials (OS) sem deletar o material
      await supabase.from('materials').update({ product_id: null }).eq('product_id', id);
      // Deleta movimentações vinculadas
      await supabase.from('inventory_movements').delete().eq('product_id', id);
      const { error } = await supabase
        .from('inventory_products')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      toast.success('Produto removido!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover produto: ${error.message}`);
    },
  });

  // ── MOVIMENTAÇÕES ─────────────────────────────────────────────
  const movementsQuery = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, inventory_products(name, code)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as (InventoryMovement & { inventory_products: { name: string; code: string } | null })[];
    },
  });

  const createMovementMutation = useMutation({
    mutationFn: async (movement: InventoryMovementInsert) => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .insert(movement)
        .select()
        .single();
      if (error) throw error;
      return data as InventoryMovement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-period'] });
      toast.success('Movimentação registrada!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao registrar movimentação: ${error.message}`);
    },
  });

  return {
    // Produtos
    products: productsQuery.data ?? [],
    isLoadingProducts: productsQuery.isLoading,
    createProduct: createProductMutation.mutate,
    updateProduct: updateProductMutation.mutate,
    deleteProduct: deleteProductMutation.mutate,
    isCreatingProduct: createProductMutation.isPending,
    isUpdatingProduct: updateProductMutation.isPending,
    isDeletingProduct: deleteProductMutation.isPending,

    // Movimentações
    movements: movementsQuery.data ?? [],
    isLoadingMovements: movementsQuery.isLoading,
    createMovement: createMovementMutation.mutate,
    createMovementAsync: createMovementMutation.mutateAsync,
    isCreatingMovement: createMovementMutation.isPending,
  };
}
