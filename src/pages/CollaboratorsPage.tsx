import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/hooks/useAuth';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MemberPermissions } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { UserPlus, Trash2, Mail, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { confirmar } from '@/components/v2/Confirmacao';

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  active: boolean;
  permissions: MemberPermissions | null;
  colaborador_tipo: 'mecanico' | 'atendente' | null;
  colaborador_id: string | null;
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
  { key: 'clientes', label: 'Clientes' },
];

// Ações dentro das telas (o banco também confere)
const ACOES: { key: keyof MemberPermissions; label: string; ajuda: string }[] = [
  { key: 'editar_itens_os', label: 'Editar ou remover itens da OS', ajuda: 'Desligado: só adiciona itens. Tirar ou mudar quantidade/valor fica com o gerente.' },
  { key: 'excluir_os', label: 'Excluir OS', ajuda: 'Apagar uma ordem de serviço inteira.' },
  { key: 'dar_desconto', label: 'Dar desconto', ajuda: 'No pagamento da OS e na nota do balcão.' },
  { key: 'estornar', label: 'Estornar ou cancelar pagamentos', ajuda: 'Estorno no caixa, apagar ou alterar pagamento da OS, cancelar nota já finalizada, cancelar vale.' },
  { key: 'ajustar_estoque', label: 'Ajustar estoque', ajuda: 'Corrigir o saldo (ajuste) e mudar o saldo no cadastro do produto.' },
  { key: 'pagar_equipe', label: 'Pagar a equipe', ajuda: 'Fechar e desfazer pagamentos de salário e comissão.' },
  { key: 'abrir_fechar_caixa', label: 'Abrir e fechar o caixa', ajuda: 'Abertura com troco e fechamento com contagem da gaveta.' },
  { key: 'aprovar_fiado', label: 'Aprovar fiado', ajuda: 'Liberar cliente para comprar fiado e mudar o limite dele. Vem desmarcado: só o dono, até marcar.' },
];

const COMPARTILHADA = 'compartilhada';

export const DEFAULT_PERMISSIONS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: false, balcao: false, relatorios: false, boletos: false, fiados: false,
  estoque: false, equipe: false, pos_venda: false, satisfacao: false, clientes: true,
  editar_itens_os: true, excluir_os: true, dar_desconto: true, estornar: true, ajustar_estoque: true, pagar_equipe: true, abrir_fechar_caixa: true,
  aprovar_fiado: false,
};

export const MAX_MEMBERS: Record<string, number> = { basic: 2, trial: 2 };

export default function CollaboratorsPage() {
  const { storeId, isOwner } = useStore();
  const { user } = useAuth();
  const { currentPlan, getUpgradeLink } = usePlanFeatures();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<MemberPermissions>(DEFAULT_PERMISSIONS);
  const [editQuem, setEditQuem] = useState<string>(COMPARTILHADA);
  const { mechanics } = useMechanics();
  const { members: atendentes } = useTeamMembers();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['collaborators', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_members' as never)
        .select('id, user_id, email, role, active, permissions, colaborador_tipo, colaborador_id')
        .eq('store_id', storeId!)
        .eq('active', true)
        .order('role');
      if (error) throw error;
      return (data || []) as Member[];
    },
    enabled: !!storeId,
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions, quem }: { id: string; permissions: MemberPermissions; quem: string }) => {
      const [tipo, colaboradorId] = quem === COMPARTILHADA ? [null, null] : quem.split(':');
      // Função no banco confere se quem salva é o dono desta loja (antes o update não gravava nada)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('salvar_colaborador', {
        p_member_id: id, p_permissions: permissions, p_colaborador_tipo: tipo, p_colaborador_id: colaboradorId,
      });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('remover_colaborador', { p_member_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators', storeId] });
      toast.success('Colaborador removido!');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const maxMembers = MAX_MEMBERS[currentPlan] ?? Infinity;
  const atLimit = maxMembers !== Infinity && members.length >= maxMembers;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    if (atLimit) {
      toast.error(`Plano ${currentPlan === 'basic' ? 'Básico' : 'Trial'} permite no máximo ${maxMembers} usuários. Faça upgrade para adicionar mais.`);
      return;
    }
    setInviting(true);
    try {
      const { error } = await supabase.functions.invoke('invite-collaborator', {
        body: { email: inviteEmail.trim(), store_id: storeId, permissions: DEFAULT_PERMISSIONS },
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
    // Quem já usava continua igual: ação não marcada = liberada
    setEditPerms({ ...DEFAULT_PERMISSIONS, editar_itens_os: true, excluir_os: true, dar_desconto: true, estornar: true, ajustar_estoque: true, pagar_equipe: true, abrir_fechar_caixa: true, aprovar_fiado: false, ...(member.permissions || {}) });
    setEditQuem(member.colaborador_tipo && member.colaborador_id ? `${member.colaborador_tipo}:${member.colaborador_id}` : COMPARTILHADA);
  };

  const nomeDoColaborador = (m: Member) => {
    if (!m.colaborador_tipo || !m.colaborador_id) return null;
    const lista = m.colaborador_tipo === 'mecanico' ? mechanics : atendentes;
    return lista.find((p) => p.id === m.colaborador_id)?.name ?? null;
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
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/config')} className="gap-2 px-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Colaboradores</h1>
      </div>

      {/* Convidar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Convidar colaborador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atLimit && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
              Limite de {maxMembers} usuários atingido no plano {currentPlan === 'basic' ? 'Básico' : 'Trial'}.{' '}
              <a href={getUpgradeLink('estoque')} target="_blank" rel="noreferrer" className="underline font-medium">Fazer upgrade</a> para adicionar mais colaboradores.
            </div>
          )}
          <form onSubmit={handleInvite} className="flex gap-2">
            <Input
              type="email"
              placeholder="email@colaborador.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={inviting || atLimit}
              className="flex-1"
            />
            <Button type="submit" disabled={inviting || atLimit}>
              {inviting ? 'Enviando...' : 'Convidar'}
            </Button>
          </form>
          <p className="text-xs text-yellow-500">
            Avise o colaborador para verificar a pasta de <strong>spam</strong> caso o email não chegue na caixa de entrada. Se estiver lá, pedir para clicar em <strong>"Não é spam"</strong>.
          </p>
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
                      <p className="text-xs text-muted-foreground">
                        {member.role === 'owner' ? 'Proprietário' : nomeDoColaborador(member) ? `Conta de ${nomeDoColaborador(member)}` : 'Conta compartilhada'}
                      </p>
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
                        onClick={async () => {
                          if (await confirmar({ titulo: `Remover ${member.email || 'este colaborador'}?`, descricao: 'Ele perde o acesso ao sistema na hora. O que ele já lançou continua.', verbo: 'Remover', perigo: true })) {
                            removeMember.mutate(member.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {editingId === member.id && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quem usa esta conta</p>
                      <Select value={editQuem} onValueChange={setEditQuem}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={COMPARTILHADA}>Conta compartilhada (pergunta quem está fazendo)</SelectItem>
                          {mechanics.filter((m) => m.active !== false).map((m) => (
                            <SelectItem key={m.id} value={`mecanico:${m.id}`}>{m.name} (mecânico/capoteiro)</SelectItem>
                          ))}
                          {atendentes.filter((a) => a.active !== false).map((a) => (
                            <SelectItem key={a.id} value={`atendente:${a.id}`}>{a.name} (atendente)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Conta de uma pessoa: o que ela lançar sai com o nome dela, sem perguntar.</p>
                    </div>
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
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">O que pode fazer</p>
                    <div className="space-y-2">
                      {ACOES.map(({ key, label, ajuda }) => (
                        <div key={key} className="flex items-start justify-between gap-3">
                          <div>
                            <Label className="text-sm">{label}</Label>
                            <p className="text-[11px] text-muted-foreground">{ajuda}</p>
                          </div>
                          <Switch checked={editPerms[key] !== false} onCheckedChange={(v) => setEditPerms(p => ({ ...p, [key]: v }))} />
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full mt-2"
                      onClick={() => updatePermissions.mutate({ id: member.id, permissions: editPerms, quem: editQuem })}
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
