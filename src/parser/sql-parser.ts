import { Lexer } from './lexer';
import { Parser } from './parser';

export interface SqlMetadata {
    tableName: string | null;
    fromTable: string | null;
    joinTables: string[];
    z3Assertions: string[];
}

export function analyzeSqlNode(nodeId: string, sqlString: string): SqlMetadata {
    if (!sqlString.trim()) {
        return { tableName: null, fromTable: null, joinTables: [], z3Assertions: [] };
    }

    try {
        const lexer = new Lexer(sqlString);
        const parser = new Parser(lexer);
        const ast = parser.parseSelectStatement();
        
        // Default to the node ID as the resulting table name (CTE/Staging pattern)
        let tableName = nodeId;
        let fromTable = ast.fromTable;
        let z3Assertions: string[] = [];

        // Extract JOIN table dependencies
        const joinTables = ast.joins
            .map(j => j.table)
            .filter((t): t is string => t !== null);

        // Extract WHERE predicates natively translated into SMT-LIB logic
        if (ast.whereClause) {
            const smtString = ast.whereClause.toSmtLib();
            z3Assertions.push(smtString);
        }

        // Extract HAVING predicates too
        if (ast.having) {
            z3Assertions.push(ast.having.toSmtLib());
        }
        
        return {
            tableName,
            fromTable,
            joinTables,
            z3Assertions
        };
    } catch (err: any) {
        console.error(`Failed to analyze SQL for node [${nodeId}]:`, err.message);
        throw err;
    }
}
