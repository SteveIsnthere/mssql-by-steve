import sql, { IResult, ConnectionPool } from 'mssql';

// Types
export interface SqlParameter {
    name: string;
    value: any;
    type?: sql.ISqlType;
}

export interface SqlConfig {
    user: string;
    password: string;
    server: string;
    database: string;
    options?: {
        trustServerCertificate?: boolean;
        trustedConnection?: boolean;
        enableArithAbort?: boolean;
        [key: string]: any;
    };
    pool?: {
        max?: number;
        min?: number;
        idleTimeoutMillis?: number;
    };
}

export type QueryType = 'Text' | 'StoredProcedure';

class SqlHelper {
    private static poolPromise: Promise<ConnectionPool> | null = null;
    private static config: SqlConfig | null = null;

    /**
     * Initialize the SQL configuration
     */
    static initialize(config: SqlConfig): void {
        SqlHelper.config = {
            ...config,
            options: {
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true,
                ...config.options,
            },
            pool: {
                max: 60,
                min: 5,
                idleTimeoutMillis: 60000,
                ...config.pool,
            },
        };
    }

    /**
     * Initialize using environment variables
     */
    static initializeFromEnv(): void {
        SqlHelper.initialize({
            user: process.env.db_user || "",
            password: process.env.db_password || "",
            server: process.env.server || "",
            database: process.env.database || "",
        });
    }

    /**
     * Ensures that only one connection pool is created and reused across all queries.
     */
    private static getPool(): Promise<sql.ConnectionPool> {
        if (!SqlHelper.poolPromise) {
            SqlHelper.poolPromise = new sql.ConnectionPool(SqlHelper.config!).connect()
                .then(pool => {
                    return pool;
                })
                .catch(err => {
                    console.error('Database connection failed', err);
                    SqlHelper.poolPromise = null;
                    throw err;
                });
        }
        return SqlHelper.poolPromise;
    }

    public static async getConnection(): Promise<sql.ConnectionPool> {
        try {
            return await new sql.ConnectionPool(SqlHelper.config!).connect();
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
        }
    }

    /**
     * Executes a SQL query or stored procedure.
     */
    static async executeQuery<T>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<IResult<T>> {
        try {
            const pool = await SqlHelper.getPool();
            const request = pool.request();

            if (parameters) {
                parameters.forEach(param => {
                    if (param.type) {
                        request.input(param.name, param.type, param.value);
                    } else {
                        request.input(param.name, param.value);
                    }
                });
            }

            return commandType === 'StoredProcedure'
                ? await request.execute(query)
                : await request.query(query);

        } catch (error) {
            console.error('Query execution error:', error);
            throw error;
        }
    }

    // SELECT operations
    static async executeDataset<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<T[]> {
        const result = await SqlHelper.executeQuery<T>(commandType, query, parameters);
        return result.recordset || [];
    }

    static async executeMultipleDatasets<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<T[][]> {
        const result = await SqlHelper.executeQuery<T>(commandType, query, parameters);
        return result.recordsets || [];
    }

    static async executeSingle<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<T | null> {
        const result = await SqlHelper.executeQuery<T>(commandType, query, parameters);
        return result.recordset?.[0] || null;
    }

    static async executeScalar<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<T | null> {
        const result = await SqlHelper.executeQuery<{ value: T }>(commandType, query, parameters);
        return result.recordset?.[0]?.value || null;
    }

    // INSERT operations
    static async executeInsert<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[],
        identityColumnName: string = 'Id'
    ): Promise<number> {
        const modifiedQuery = commandType === 'Text'
            ? `${query}; SELECT SCOPE_IDENTITY() AS ${identityColumnName}`
            : query;

        const result = await SqlHelper.executeQuery<T & { [key: string]: number }>(
            commandType,
            modifiedQuery,
            parameters
        );

        return result.recordset?.[0]?.[identityColumnName] || 0;
    }

    // UPDATE operations
    static async executeUpdate<T = any>(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<number> {
        const result = await SqlHelper.executeQuery<T>(commandType, query, parameters);
        return result.rowsAffected[0] || 0;
    }

    // DELETE operations
    static async executeDelete(
        commandType: QueryType,
        query: string,
        parameters?: SqlParameter[]
    ): Promise<number> {
        const result = await SqlHelper.executeQuery(commandType, query, parameters);
        return result.rowsAffected[0] || 0;
    }

    // Utility methods
    static async exists(
        tableName: string,
        whereClause: string,
        parameters?: SqlParameter[]
    ): Promise<boolean> {
        const result = await SqlHelper.executeScalar<number>(
            'Text',
            `SELECT COUNT(1) as value
             FROM ${tableName}
             WHERE ${whereClause}`,
            parameters
        );
        return (result || 0) > 0;
    }

    static async count(
        tableName: string,
        whereClause?: string,
        parameters?: SqlParameter[]
    ): Promise<number> {
        const query = whereClause
            ? `SELECT COUNT(1) as value
               FROM ${tableName}
               WHERE ${whereClause}`
            : `SELECT COUNT(1) as value
               FROM ${tableName}`;

        const result = await SqlHelper.executeScalar<number>('Text', query, parameters);
        return result || 0;
    }

    /**
     * Executes a stored procedure and retrieves its return value.
     */
    static async executeWithReturnValue(
        query: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {

        try {
            const pool = await SqlHelper.getPool();
            const request = pool.request();

            // Add input parameters
            parameters.forEach(param => {
                // Remove @ symbol if it's included in the parameter name
                const paramName = param.name.startsWith('@')
                    ? param.name.substring(1)
                    : param.name;

                if (param.type) {
                    request.input(paramName, param.type, param.value);
                } else {
                    request.input(paramName, param.value);
                }
            });

            // Execute the stored procedure and capture the result
            const result = await request.execute(query);

            // The return value from a stored procedure is available in result.returnValue
            return result.returnValue || 0;

        } catch (error) {
            console.error('Query execution error:', error);
            throw error;
        }
    }
}

export default SqlHelper;