import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    console.error('🔴 ErrorBoundary capturou um erro:', error);
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          backgroundColor: '#1a1a1a',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{
            maxWidth: '600px',
            backgroundColor: '#2d2d2d',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            border: '2px solid #dc2626',
          }}>
            <h1 style={{ color: '#ff6b6b', marginBottom: '16px', fontSize: '24px' }}>
              🔴 ERRO NA APLICAÇÃO
            </h1>
            <p style={{ marginBottom: '16px', color: '#aaa', lineHeight: '1.6' }}>
              Desculpe, ocorreu um erro ao carregar a aplicação.
            </p>
            
            {/* Erro Principal */}
            <div style={{
              backgroundColor: '#1a1a1a',
              padding: '15px',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #444',
            }}>
              <p style={{ color: '#ff6b6b', margin: '0 0 8px 0', fontWeight: 'bold' }}>
                Erro:
              </p>
              <pre style={{
                color: '#00ff00',
                margin: '0',
                overflow: 'auto',
                fontSize: '12px',
                maxHeight: '150px',
              }}>
                {this.state.error?.toString()}
              </pre>
            </div>

            {/* Stack Trace */}
            {this.state.errorInfo && (
              <details style={{ marginBottom: '16px' }}>
                <summary style={{
                  cursor: 'pointer',
                  color: '#fbbf24',
                  fontWeight: 'bold',
                  padding: '8px',
                  backgroundColor: '#333',
                  borderRadius: '4px',
                  userSelect: 'none',
                }}>
                  📋 Stack Trace (clique para expandir)
                </summary>
                <pre style={{
                  backgroundColor: '#1a1a1a',
                  padding: '12px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '11px',
                  marginTop: '8px',
                  color: '#ccc',
                  maxHeight: '200px',
                }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1,
                  backgroundColor: '#2563eb',
                  color: 'white',
                  padding: '12px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                🔄 Recarregar
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  flex: 1,
                  backgroundColor: '#16a34a',
                  color: 'white',
                  padding: '12px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                🏠 Ir para Home
              </button>
            </div>

            {/* Info Extra */}
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#333',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#999',
            }}>
              <p style={{ margin: '0 0 4px 0' }}>
                ⏰ {new Date().toLocaleTimeString('pt-BR')}
              </p>
              <p style={{ margin: '0 0 4px 0' }}>
                📱 {navigator.userAgent.substring(0, 50)}...
              </p>
              <p style={{ margin: '0' }}>
                📍 {window.location.href}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
