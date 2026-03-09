// Mock Supabase Client para desenvolvimento local offline
// Este é um mock completo que funciona sem conexão com o servidor

export function createMockSupabaseClient() {
  // Simular sessão autenticada
  const mockSession = {
    user: {
      id: 'mock-user-id',
      email: 'test@example.com',
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    session: null,
    access_token: 'mock-token',
    token_type: 'Bearer',
    expires_in: 3600,
  };

  // Armazenar dados em memória
  const mockData: Record<string, unknown[]> = {
    service_orders: [],
    payments: [],
    materials: [],
    checklist_items: [],
    cash_flow: [],
    clients: [],
    motorcycles: [],
    mechanics: [],
  };

  // UUID generator
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return {
    from: (table: string) => {
      if (!mockData[table]) {
        mockData[table] = [];
      }

      return {
        select: (query?: string) => {
          return {
            eq: (column: string, value: unknown) => {
              return Promise.resolve({
                data: mockData[table].filter(item => item[column] === value),
                error: null,
              });
            },
            single: () => {
              return Promise.resolve({
                data: mockData[table][0] || null,
                error: null,
              });
            },
            order: (column: string, options?: unknown) => {
              return Promise.resolve({
                data: mockData[table],
                error: null,
              });
            },
            then: (callback: (result: { data: unknown[]; error: null }) => void) => {
              callback({ data: mockData[table], error: null });
              return Promise.resolve({ data: mockData[table], error: null });
            },
          };
        },
        insert: (data: unknown) => {
          const record = Array.isArray(data) ? data : [data];
          
          return {
            select: () => {
              return {
                single: () => {
                  return Promise.resolve((() => {
                    const newRecord = { id: generateUUID(), ...record[0], created_at: new Date().toISOString() };
                    
                    // Validar constraint de payment method
                    if (table === 'payments' && newRecord.method) {
                      const validMethods = ['dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'];
                      if (!validMethods.includes(newRecord.method)) {
                        return {
                          data: null,
                          error: {
                            message: `Invalid payment method: ${newRecord.method}`,
                            code: '23514',
                            details: 'violates check constraint "payments_method_check"'
                          }
                        };
                      }
                    }
                    
                    mockData[table].push(newRecord);
                    return { data: newRecord, error: null };
                  })());
                },
              };
            },
            then: (callback: (result: { data: unknown[]; error: null }) => void) => {
              const newRecords = record.map(r => ({ 
                id: generateUUID(), 
                ...r, 
                created_at: new Date().toISOString() 
              }));
              mockData[table].push(...newRecords);
              callback({ data: newRecords, error: null });
              return Promise.resolve({ data: newRecords, error: null });
            },
          };
        },
        update: (data: unknown) => {
          return {
            eq: (column: string, value: unknown) => {
              return {
                select: () => {
                  return {
                    single: () => {
                      const index = mockData[table].findIndex(item => item[column] === value);
                      if (index !== -1) {
                        mockData[table][index] = { ...mockData[table][index], ...data };
                        return Promise.resolve({ data: mockData[table][index], error: null });
                      }
                      return Promise.resolve({ data: null, error: null });
                    }
                  };
                },
                then: (callback: (result: { data: unknown | null; error: null }) => void) => {
                  const index = mockData[table].findIndex(item => item[column] === value);
                  if (index !== -1) {
                    mockData[table][index] = { ...mockData[table][index], ...data };
                    callback({ data: mockData[table][index], error: null });
                    return Promise.resolve({ data: mockData[table][index], error: null });
                  }
                  callback({ data: null, error: null });
                  return Promise.resolve({ data: null, error: null });
                }
              };
            },
          };
        },
        delete: () => {
          return {
            eq: (column: string, value: unknown) => {
              const index = mockData[table].findIndex(item => item[column] === value);
              if (index !== -1) {
                mockData[table].splice(index, 1);
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        eq: (column: string, value: unknown) => {
          return {
            select: (query?: string) => {
              return Promise.resolve({
                data: mockData[table].filter(item => item[column] === value),
                error: null,
              });
            },
            then: (callback: (result: { data: unknown[]; error: null }) => void) => {
              callback({ data: mockData[table].filter(item => item[column] === value), error: null });
              return Promise.resolve({
                data: mockData[table].filter(item => item[column] === value),
                error: null,
              });
            },
          };
        },
        order: (column: string, options?: unknown) => {
          return Promise.resolve({
            data: mockData[table],
            error: null,
          });
        },
      };
    },

    auth: {
      onAuthStateChange: (callback: (event: string, session: typeof mockSession) => void) => {
        callback('SIGNED_IN', mockSession);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => {
        return { data: { session: mockSession }, error: null };
      },
      getUser: async () => {
        return { data: { user: mockSession.user }, error: null };
      },
      signOut: async () => {
        return { error: null };
      },
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        return { data: { session: mockSession }, error: null };
      },
    },

    realtime: {
      on: () => {
        return { subscribe: () => ({ unsubscribe: () => {} }) };
      },
    },
  };
}
