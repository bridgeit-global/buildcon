type QueryResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type MockQueryBuilder = {
  select: (columns?: string, opts?: unknown) => MockQueryBuilder;
  insert: (values: unknown) => MockQueryBuilder;
  update: (values: unknown) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
  upsert: (values: unknown, opts?: unknown) => MockQueryBuilder;
  eq: (column: string, value: unknown) => MockQueryBuilder;
  neq: (column: string, value: unknown) => MockQueryBuilder;
  in: (column: string, values: unknown[]) => MockQueryBuilder;
  order: (column: string, opts?: { ascending?: boolean }) => MockQueryBuilder;
  limit: (n: number) => MockQueryBuilder;
  maybeSingle: () => Promise<QueryResult<unknown>>;
  single: () => Promise<QueryResult<unknown>>;
  then: (
    resolve: (value: QueryResult<unknown[]>) => void
  ) => Promise<QueryResult<unknown[]>>;
};

export type TableHandler = (ctx: {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  builder: MockQueryBuilder;
  callIndex: number;
}) => QueryResult<unknown> | QueryResult<unknown[]> | void;

export type MockSupabaseConfig = {
  tables?: Record<string, QueryResult<unknown> | QueryResult<unknown[]>>;
  tableHandler?: TableHandler;
  auth?: {
    getUser?: () => Promise<{
      data: { user: { id: string; email?: string } | null };
      error: { message: string } | null;
    }>;
    admin?: {
      inviteUserByEmail?: (
        email: string
      ) => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
  };
  rpc?: Record<
    string,
    QueryResult<unknown> | ((args: Record<string, unknown>) => QueryResult<unknown>)
  >;
};

function defaultResult(): QueryResult<unknown[]> {
  return { data: [], error: null };
}

export function createMockSupabaseClient(config: MockSupabaseConfig = {}) {
  const callCounts = new Map<string, number>();

  const resolveForTable = (
    table: string,
    op: MockSupabaseConfig extends never ? never : 'select' | 'insert' | 'update' | 'delete' | 'upsert',
    builder: MockQueryBuilder
  ): QueryResult<unknown> | QueryResult<unknown[]> => {
    const key = `${table}:${op}`;
    const callIndex = callCounts.get(key) ?? 0;
    callCounts.set(key, callIndex + 1);

    if (config.tableHandler) {
      const handled = config.tableHandler({ table, op, builder, callIndex });
      if (handled) return handled;
    }

    const preset = config.tables?.[table];
    if (preset) return preset;
    return defaultResult();
  };

  const createBuilder = (
    table: string,
    op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  ): MockQueryBuilder => {
    let currentOp = op;
    const builder: MockQueryBuilder = {
      select: () => {
        currentOp = 'select';
        return builder;
      },
      insert: () => {
        currentOp = 'insert';
        return builder;
      },
      update: () => {
        currentOp = 'update';
        return builder;
      },
      delete: () => {
        currentOp = 'delete';
        return builder;
      },
      upsert: () => {
        currentOp = 'upsert';
        return builder;
      },
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const result = resolveForTable(table, currentOp, builder);
        if (Array.isArray(result.data)) {
          return { data: result.data[0] ?? null, error: result.error };
        }
        return result as QueryResult<unknown>;
      },
      single: async () => {
        const result = resolveForTable(table, currentOp, builder);
        if (Array.isArray(result.data)) {
          return { data: result.data[0] ?? null, error: result.error };
        }
        return result as QueryResult<unknown>;
      },
      then: (resolve) => {
        const result = resolveForTable(table, currentOp, builder);
        const rows = Array.isArray(result.data)
          ? result
          : { data: result.data != null ? [result.data] : [], error: result.error };
        return Promise.resolve(resolve(rows as QueryResult<unknown[]>));
      }
    };
    return builder;
  };

  return {
    from: (table: string) => createBuilder(table),
    auth: {
      getUser:
        config.auth?.getUser ??
        (async () => ({
          data: { user: { id: 'test-user-id', email: 'test@example.com' } },
          error: null
        })),
      admin: {
        inviteUserByEmail:
          config.auth?.admin?.inviteUserByEmail ??
          (async () => ({
            data: { user: { id: 'invited-user-id' } },
            error: null
          }))
      }
    },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      const handler = config.rpc?.[fn];
      if (typeof handler === 'function') return handler(args ?? {});
      return handler ?? { data: null, error: null };
    }
  };
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
