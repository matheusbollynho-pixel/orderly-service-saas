import React, { useState } from 'react';
import { cleanupOldPhotos } from '@/lib/photoService';
import { sendTestSatisfactionSurvey, testSatisfactionSurveyWith4SecondDelay } from '@/services/whatsappService';
import { Settings, Trash2, MessageCircle, Clock, Zap } from 'lucide-react';
import { MaintenanceKeywordsManager } from './MaintenanceKeywordsManager';
import { useAuth } from '@/hooks/useAuth';

export const AdminMenu = () => {
  const { user, isRestrictedUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeywordsManager, setShowKeywordsManager] = useState(false);

  // Não renderizar se usuário não está autenticado ou é usuário restrito
  if (!user || isRestrictedUser) {
    return null;
  }

  const handleCleanup = async () => {
    setIsLoading(true);
    const deleted = await cleanupOldPhotos(cleanupDays);
    setIsLoading(false);
    
    if (deleted !== null) {
      alert(`✅ ${deleted} fotos deletadas com ${cleanupDays}+ dias`);
      setIsOpen(false);
    } else {
      alert('❌ Erro ao limpar fotos');
    }
  };

  const handleTestSatisfactionSurvey = async () => {
    setIsLoading(true);
    try {
      const result = await sendTestSatisfactionSurvey();
      
      if (result.success) {
        alert(`${result.message}\n\nTelefone: ${result.phone}`);
        setIsOpen(false);
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert(`❌ Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestWith4Seconds = async () => {
    setIsLoading(true);
    try {
      const result = await testSatisfactionSurveyWith4SecondDelay();
      
      if (result.success) {
        alert(result.message);
        setIsOpen(false);
      } else {
        alert(result.message || 'Erro desconhecido');
      }
    } catch (error) {
      alert(`❌ Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 1000 }}>
      {/* Modal para gerenciar keywords */}
      {showKeywordsManager && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowKeywordsManager(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
              zIndex: 2001,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                borderBottom: '1px solid #eee',
                position: 'sticky',
                top: 0,
                backgroundColor: 'white',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                ⚡ Gerenciar Palavras-chave de Manutenção
              </h2>
              <button
                onClick={() => setShowKeywordsManager(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <MaintenanceKeywordsManager />
          </div>
        </div>
      )}

      {/* Overlay para fechar menu ao clicar fora */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
        />
      )}

      {/* Botão de Engrenagem */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          backgroundColor: '#f5f5f5',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          transition: 'all 0.3s',
          position: 'relative',
          zIndex: 1001,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)')}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
      >
        <Settings size={24} color="#333" />
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '60px',
            right: '0',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px',
            minWidth: '250px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 1002,
          }}
        >
          <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #eee' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
              ⚙️ Administração
            </h4>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '6px', fontWeight: '500' }}>
              Limpar fotos com X+ dias:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                value={cleanupDays}
                onChange={(e) => {
                  const val = e.target.value === '' ? 100 : parseInt(e.target.value);
                  setCleanupDays(isNaN(val) ? 100 : val);
                }}
                min="0"
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
              <span style={{ padding: '8px', color: '#999', fontSize: '12px' }}>dias</span>
            </div>
          </div>

          <button
            onClick={handleCleanup}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: isLoading ? '#ccc' : '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background-color 0.3s',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.backgroundColor = '#ff5252';
            }}
            onMouseLeave={(e) => {
              if (!isLoading) e.currentTarget.style.backgroundColor = '#ff6b6b';
            }}
          >
            <Trash2 size={16} />
            {isLoading ? 'Limpando...' : 'Limpar Fotos'}
          </button>

          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
            <button
              onClick={handleTestSatisfactionSurvey}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: isLoading ? '#ccc' : '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 0.3s',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#1976D2';
              }}
              onMouseLeave={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#2196F3';
              }}
            >
              <MessageCircle size={16} />
              {isLoading ? 'Enviando...' : 'Testar Pesquisa (Matheus)'}
            </button>

            <button
              onClick={handleTestWith4Seconds}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '8px',
                backgroundColor: isLoading ? '#ccc' : '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 0.3s',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#F57C00';
              }}
              onMouseLeave={(e) => {
                if (!isLoading) e.currentTarget.style.backgroundColor = '#FF9800';
              }}
            >
              <Clock size={16} />
              {isLoading ? 'Testando (4s)...' : 'Teste 4 Segundos'}
            </button>

            <button
              onClick={() => {
                setShowKeywordsManager(true);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '8px',
                backgroundColor: '#9C27B0',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'background-color 0.3s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#7B1FA2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#9C27B0';
              }}
            >
              <Zap size={16} />
              Gerenciar Keywords
            </button>
          </div>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#999' }}>
            📌 Limpa automaticamente todo dia à meia-noite
          </div>
        </div>
      )}
    </div>
  );
};
