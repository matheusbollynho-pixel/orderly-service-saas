import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus, Edit2, Save, X } from 'lucide-react';
import {
  getMaintenanceKeywords,
  updateMaintenanceKeyword,
  createMaintenanceKeyword,
  type MaintenanceKeyword,
} from '@/services/maintenanceReminderService';

export function MaintenanceKeywordsManager() {
  const [keywords, setKeywords] = useState<MaintenanceKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [formData, setFormData] = useState<Partial<MaintenanceKeyword>>({
    keyword: '',
    description: '',
    reminder_days: 90,
    reminder_message: '',
    enabled: true,
  });

  useEffect(() => {
    loadKeywords();
  }, []);

  const loadKeywords = async () => {
    setLoading(true);
    const data = await getMaintenanceKeywords();
    setKeywords(data);
    setLoading(false);
  };

  const handleEdit = (keyword: MaintenanceKeyword) => {
    setEditing(keyword.id);
    setFormData(keyword);
  };

  const handleSave = async () => {
    if (!formData.keyword?.trim()) {
      alert('Palavra-chave é obrigatória');
      return;
    }

    if (editing) {
      const updated = await updateMaintenanceKeyword(editing, formData);
      if (updated) {
        setKeywords(keywords.map((k) => (k.id === editing ? updated : k)));
        setEditing(null);
        setFormData({
          keyword: '',
          description: '',
          reminder_days: 90,
          reminder_message: '',
          enabled: true,
        });
      }
    }
  };

  const handleAdd = async () => {
    if (!formData.keyword?.trim()) {
      alert('Palavra-chave é obrigatória');
      return;
    }

    const newKeyword = await createMaintenanceKeyword(
      formData as MaintenanceKeyword
    );
    if (newKeyword) {
      setKeywords([...keywords, newKeyword]);
      setIsAdding(false);
      setFormData({
        keyword: '',
        description: '',
        reminder_days: 90,
        reminder_message: '',
        enabled: true,
      });
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setIsAdding(false);
    setFormData({
      keyword: '',
      description: '',
      reminder_days: 90,
      reminder_message: '',
      enabled: true,
    });
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p>Carregando keywords...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Palavras-chave de Manutenção</h2>
        {!isAdding && !editing && (
          <Button
            onClick={() => setIsAdding(true)}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Plus size={20} /> Adicionar Keyword
          </Button>
        )}
      </div>

      {/* Form para adicionar ou editar */}
      {(isAdding || editing) && (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 space-y-4">
          <h3 className="font-semibold text-lg">
            {editing ? 'Editar Palavra-chave' : 'Adicionar Nova Palavra-chave'}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Palavra-chave *
              </label>
              <Input
                value={formData.keyword || ''}
                onChange={(e) =>
                  setFormData({ ...formData, keyword: e.target.value })
                }
                placeholder="Ex: Óleo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Dias para Lembrete *
              </label>
              <Input
                type="number"
                min={0}
                value={formData.reminder_days ?? 90}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    reminder_days: parseInt(e.target.value),
                  })
                }
                placeholder="90"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Descrição</label>
            <Input
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Ex: Troca de óleo do motor"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Mensagem de Lembrete
            </label>
            <Textarea
              value={formData.reminder_message || ''}
              onChange={(e) =>
                setFormData({ ...formData, reminder_message: e.target.value })
              }
              placeholder="Use {days} e {keyword} como variáveis"
              rows={3}
            />
            <p className="text-xs text-gray-600 mt-1">
              Variáveis: {`{days}`} = dias desde serviço, {`{keyword}`} = nome da
              palavra-chave
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={editing ? handleSave : handleAdd}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Save size={20} /> {editing ? 'Salvar' : 'Adicionar'}
            </Button>
            <Button onClick={handleCancel} variant="outline">
              <X size={20} /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de keywords */}
      <div className="grid gap-4">
        {keywords.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhuma palavra-chave cadastrada
          </div>
        ) : (
          keywords.map((keyword) => (
            <div
              key={keyword.id}
              className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-start"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{keyword.keyword}</h3>
                  {!keyword.enabled && (
                    <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                      Desativado
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {keyword.description}
                </p>
                <p className="text-sm text-blue-600 mt-2">
                  ⏱️ Lembrete após {keyword.reminder_days} dias
                </p>
                <p className="text-xs text-gray-500 mt-2 italic">
                  "{keyword.reminder_message}"
                </p>
              </div>

              <div className="flex gap-2 ml-4">
                <Button
                  onClick={() => handleEdit(keyword)}
                  size="sm"
                  variant="outline"
                  className="gap-1"
                >
                  <Edit2 size={16} /> Editar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
