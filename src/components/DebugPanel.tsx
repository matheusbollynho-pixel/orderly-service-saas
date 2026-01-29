import React, { useEffect, useState } from 'react';

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
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>(logs);
  const [isOpen, setIsOpen] = useState(false);

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
        {isOpen ? '✕' : '🐛'}
      </button>

      {/* Badge com número de logs */}
      {displayLogs.length > 0 && !isOpen && (
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

      {/* Painel de Logs */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '70px',
            right: '0',
            width: '350px',
            maxHeight: '450px',
            backgroundColor: '#1a1a1a',
            border: '3px solid #2563eb',
            borderRadius: '8px',
            padding: '12px',
            overflow: 'auto',
            boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: '14px' }}>
            📋 Console ({displayLogs.length})
          </h3>
          
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

          {/* Botão de limpar */}
          <button
            onClick={() => {
              logs.length = 0;
              setDisplayLogs([]);
            }}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px',
              backgroundColor: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            🗑️ Limpar
          </button>
        </div>
      )}
    </div>
  );
};
