import { TreeSitterAdapter } from './tree-sitter-adapter';
import { inferTypes } from './type-inference';

export interface SqlMetadata {
    tableName: string | null;
    fromTable: string | null;
    joinTables: string[];
    z3Assertions: string[];
    variables: Record<string, string>;
}

export function analyzeSqlNode(nodeId: string, sqlString: string): SqlMetadata {
    if (!sqlString.trim()) {
        return { tableName: null, fromTable: null, joinTables: [], z3Assertions: [] };
    }

    try {
        const ast = TreeSitterAdapter.parseSelectStatement(sqlString);
        
        // Default to the node ID as the resulting table name (CTE/Staging pattern)
        let tableName = nodeId;
        let fromTable = ast.fromTable;
        let z3Assertions: string[] = [];
        let variables: Record<string, string> = {};
        let joinTables: string[] = ast.joins.map(j => j.table).filter((t): t is string => t !== null);

        const cteNames = new Set<string>();
        if (ast.withClauses) {
            ast.withClauses.forEach(cte => cteNames.add(cte.name));
            
            ast.withClauses.forEach(cte => {
                if (cte.stmt.fromTable && !cteNames.has(cte.stmt.fromTable)) {
                    joinTables.push(cte.stmt.fromTable);
                }
                cte.stmt.joins.forEach(j => {
                    if (j.table && !cteNames.has(j.table)) joinTables.push(j.table);
                });
                if (cte.stmt.whereClause) {
                    z3Assertions.push(cte.stmt.whereClause.toSmtLib());
                    Object.assign(variables, inferTypes(cte.stmt.whereClause));
                }
            });
        }

        if (fromTable && cteNames.has(fromTable)) {
            fromTable = null;
        }
        joinTables = joinTables.filter(name => !cteNames.has(name));

        // Extract WHERE predicates natively translated into SMT-LIB logic
        if (ast.whereClause) {
            const smtString = ast.whereClause.toSmtLib();
            z3Assertions.push(smtString);
            Object.assign(variables, inferTypes(ast.whereClause));
        }

        // Extract HAVING predicates too
        if (ast.having) {
            z3Assertions.push(ast.having.toSmtLib());
            Object.assign(variables, inferTypes(ast.having));
        }
        
        return {
            tableName,
            fromTable,
            joinTables,
            z3Assertions,
            variables
        };
    } catch (err: any) {
        console.error(`Failed to analyze SQL for node [${nodeId}]:`, err.message);
        throw err;
    }
}
