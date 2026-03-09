import React, { useEffect, useState } from 'react';
import { cleanupOldPhotos } from '@/lib/photoService';

interface LogEntry {
  time: Date;
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

// Iniciar captura de logs IMEDIATAMENTE
const logs: LogEntry[] = [];

if (typeof window !== 'undefined') {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    originalLog(...args);
    logs.push({ time: new Date(), type: 'log', message: args.map(String).join(' ') });
  };

  console.error = (...args) => {
    originalError(...args);
    logs.push({ time: new Date(), type: 'error', message: args.map(String).join(' ') });
  };

  console.warn = (...args) => {
    originalWarn(...args);
    logs.push({ time: new Date(), type: 'warn', message: args.map(String).join(' ') });
  };
}

console.log('🐛 DebugPanel ativado!');

export const DebugPanel = () => {
  const [cleanupDays, setCleanupDays] = React.useState(100);
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>(logs);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 20, y: 80 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Atualizar logs a cada segundo
    const interval = setInterval(() => {
      setDisplayLogs([...logs]);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const colors = {
    log: '#00ff00',
    error: '#ff6b6b',
    warn: '#fbbf24',
    info: '#60a5fa',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        fontFamily: 'monospace',
      }}
    >
      {/* Botão Flutuante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: isOpen ? '#2563eb' : '#888',
          color: 'white',
          border: '3px solid #fff',
          cursor: 'pointer',
          fontSize: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        🐛
        {displayLogs.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#ff6b6b',
              color: 'white',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {displayLogs.length}
          </div>
        )}
      </button>

      {/* Painel de Logs - Arrastável */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: `${panelPos.y}px`,
            left: `${panelPos.x}px`,
            width: '350px',
            maxHeight: '300px',
            backgroundColor: '#1a1a1a',
            border: '3px solid #2563eb',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            zIndex: 9998,
            cursor: dragging ? 'grabbing' : 'grab',
            display: 'flex',
            flexDirection: 'column',
          }}
          onMouseDown={(e) => {
            setDragging(true);
            setDragStart({ x: e.clientX - panelPos.x, y: e.clientY - panelPos.y });
          }}
          onMouseMove={(e) => {
            if (!dragging) return;
            setPanelPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
        >
          {/* Header */}
          <div style={{ padding: '12px', borderBottom: '1px solid #333', flexShrink: 0 }}>
            <h3 style={{ margin: '0', color: '#fff', fontSize: '14px' }}>
              📋 Console ({displayLogs.length})
            </h3>
          </div>

          {/* Logs */}
          <div style={{ overflow: 'auto', flex: 1, padding: '12px' }}>
            {displayLogs.length === 0 ? (
              <p style={{ color: '#999', margin: '0', fontSize: '12px' }}>
                Aguardando logs...
              </p>
            ) : (
              displayLogs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: '8px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #333',
                    fontSize: '11px',
                    lineHeight: '1.4',
                  }}
                >
                  <div style={{ color: colors[log.type], fontWeight: 'bold' }}>
                    {log.type === 'error' ? '❌' : log.type === 'warn' ? '⚠️' : log.type === 'info' ? 'ℹ️' : '✓'} [{log.type.toUpperCase()}]
                  </div>
                  <div style={{ color: '#ccc', wordBreak: 'break-word' }}>
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer - Controles */}
          <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <input
              type="number"
              value={cleanupDays}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                setCleanupDays(isNaN(val) ? 100 : val);
              }}
              placeholder="Dias"
              min="0"
              style={{
                width: '50px',
                padding: '6px',
                backgroundColor: '#333',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            />
            <button
              onClick={async () => {
                const deleted = await cleanupOldPhotos(cleanupDays);
                if (deleted !== null) {
                  console.log(`✅ Limpeza completa: ${deleted} fotos deletadas com ${cleanupDays}+ dias`);
                }
              }}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#ff9800',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
              title="Deletar fotos com X+ dias"
            >
              🧹 Limpar Fotos
            </button>

            <button
              onClick={() => {
                logs.length = 0;
                setDisplayLogs([]);
              }}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              🗑️ Limpar Logs
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
