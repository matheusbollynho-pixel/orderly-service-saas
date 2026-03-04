import { useState } from 'react';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function MechanicsPage() {
  const { mechanics, isLoading, createMechanic, updateMechanic, deleteMechanic } = useMechanics();
  const { members, isLoading: isLoadingMembers, createMember, updateMember, deleteMember } = useTeamMembers();
  const [name, setName] = useState('');
  const [commission, setCommission] = useState<number>(10);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<'balconista' | 'dono' | 'outro'>('balconista');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Equipe</h2>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Mecânicos</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border rounded-xl">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João" />
        </div>
        <div className="space-y-2">
          <Label>Comissão (%)</Label>
          <Input type="number" step="0.01" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value || '0'))} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={() => {
            if (!name.trim()) return;
            createMechanic({ name: name.trim(), commission_rate: commission });
            setName('');
            setCommission(10);
          }}>Cadastrar</Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p>Carregando...</p>
        ) : mechanics.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum mecânico cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {mechanics.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-4 border rounded-xl">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">Comissão: {m.commission_rate}%</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Ativo</span>
                    <Switch checked={m.active} onCheckedChange={(v) => updateMechanic({ id: m.id, active: Boolean(v) })} />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    const novo = prompt('Nova comissão (%)', String(m.commission_rate));
                    const val = novo ? parseFloat(novo) : NaN;
                    if (!isNaN(val)) updateMechanic({ id: m.id, commission_rate: val });
                  }}>Editar Comissão</Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteMechanic(m.id)}>Remover</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-2 border-t" />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Atendentes de Balcão</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border rounded-xl">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Ex: Maria" />
        </div>
        <div className="space-y-2">
          <Label>Função</Label>
          <Select value={staffRole} onValueChange={(v) => setStaffRole(v as 'balconista' | 'dono' | 'outro')}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balconista">Balconista</SelectItem>
              <SelectItem value="dono">Dono</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            onClick={() => {
              if (!staffName.trim()) return;
              createMember({ name: staffName.trim(), role: staffRole });
              setStaffName('');
              setStaffRole('balconista');
            }}
          >
            Cadastrar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {isLoadingMembers ? (
          <p>Carregando atendentes...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendente cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-4 border rounded-xl">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">Função: {m.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Ativo</span>
                    <Switch checked={m.active} onCheckedChange={(v) => updateMember({ id: m.id, active: Boolean(v) })} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const novoNome = prompt('Novo nome', m.name)?.trim();
                      if (!novoNome) return;
                      updateMember({ id: m.id, name: novoNome });
                    }}
                  >
                    Editar Nome
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteMember(m.id)}>
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
