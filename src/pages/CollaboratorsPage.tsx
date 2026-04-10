import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/hooks/useAuth';
import type { MemberPermissions } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserPlus, Trash2, Mail } from 'lucide-react';

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  active: boolean;
  permissions: MemberPermissions | null;
};

const PERMISSION_LABELS: { key: keyof MemberPermissions; label: string }[] = [
  { key: 'nova_os', label: 'Nova OS' },
  { key: 'express', label: 'Express' },
  { key: 'orders', label: 'Ordens' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'quadro', label: 'Oficina' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'balcao', label: 'Balcão' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'boletos', label: 'Boletos' },
  { key: 'fiados', label: 'Fiados' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'pos_venda', label: 'Pós-Venda' },
  { key: 'satisfacao', label: 'Satisfação' },
];

const DEFAULT_PERMISSIONS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: false, balcao: false, relatorios: false, boletos: false, fiados: false,
  estoque: false, equipe: false, pos_venda: false, satisfacao: false,
};

export default function CollaboratorsPage() {
  const { storeId, isOwner } = useStore();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<MemberPermissions>(DEFAULT_PERMISSIONS);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['collaborators', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_members' as never)
        .select('id, user_id, email, role, active, permissions')
        .eq('store_id', storeId!)
        .eq('active', true)
        .order('role');
      if (error) throw error;
      return (data || []) as Member[];
    },
    enabled: !!storeId,
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: MemberPermissions }) => {
      const { error } = await supabase
        .from('store_members' as never)
        .update({ permissions } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators', storeId] });
      toast.success('Permissões salvas!');
      setEditingId(null);
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('store_members' as never)
        .update({ active: false } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators', storeId] });
      toast.success('Colaborador removido!');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { error } = await supabase.functions.invoke('invite-collaborator', {
        body: { email: inviteEmail.trim(), store_id: storeId, permissions: DEFAULT_PERMISSIONS, owner_user_id: user?.id },
      });
      if (error) throw error;
      toast.success(`Convite enviado para ${inviteEmail}`);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['collaborators', storeId] });
    } catch (e: unknown) {
      toast.error(`Erro ao convidar: ${(e as Error)?.message || 'Erro desconhecido'}`);
    } finally {
      setInviting(false);
    }
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditPerms({ ...DEFAULT_PERMISSIONS, ...(member.permissions || {}) });
  };

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Apenas o proprietário pode gerenciar colaboradores.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6 pb-32">
      <h1 className="text-xl font-bold text-foreground">Colaboradores</h1>

      {/* Convidar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Convidar colaborador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="email@colaborador.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviting}
              className="flex-1"
            />
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Enviando...' : 'Convidar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Lista */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{member.email || member.user_id}</p>
                      <p className="text-xs text-muted-foreground capitalize">{member.role === 'owner' ? 'Proprietário' : 'Colaborador'}</p>
                    </div>
                  </div>
                  {member.role !== 'owner' && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editingId === member.id ? setEditingId(null) : startEdit(member)}
                      >
                        {editingId === member.id ? 'Cancelar' : 'Permissões'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeMember.mutate(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {editingId === member.id && (
                  <div className="border-t pt-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acesso aos módulos</p>
                    <div className="grid grid-cols-2 gap-3">
                      {PERMISSION_LABELS.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <Label className="text-sm">{label}</Label>
                          <Switch
                            checked={editPerms[key]}
                            onCheckedChange={(v) => setEditPerms(p => ({ ...p, [key]: v }))}
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full mt-2"
                      onClick={() => updatePermissions.mutate({ id: member.id, permissions: editPerms })}
                      disabled={updatePermissions.isPending}
                    >
                      {updatePermissions.isPending ? 'Salvando...' : 'Salvar permissões'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
