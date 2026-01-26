import { useState } from 'react';
import { useMechanics } from '@/hooks/useMechanics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function MechanicsPage() {
  const { mechanics, isLoading, createMechanic, updateMechanic, deleteMechanic } = useMechanics();
  const [name, setName] = useState('');
  const [commission, setCommission] = useState<number>(10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mecânicos</h2>
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
    </div>
  );
}
