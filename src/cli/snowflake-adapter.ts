import { TreeSitterAdapter } from '../parser/tree-sitter-adapter';
import { checkZ3Constraints } from '../shadow/z3';
import { analyzeSqlNode, SqlNodeMetadata } from '../parser/sql-parser';

export interface SnowflakeView {
    name: string;
    schema: string;
    text: string; // The DDL: CREATE VIEW...
}

export interface Edge {
    parent: SnowflakeView;
    child: SnowflakeView;
}

export function parseSnowflakeInformationSchema(views: SnowflakeView[]): { models: SqlNodeMetadata[], edges: Edge[] } {
    const models: SqlNodeMetadata[] = [];
    const edges: Edge[] = [];
    
    // Quick regex to strip "CREATE OR REPLACE VIEW X AS"
    const extractSelect = (ddl: string) => {
        const match = ddl.match(/AS\s+(SELECT.*)/is);
        return match ? match[1] : ddl;
    };

    for (const view of views) {
        const sql = extractSelect(view.text);
        const metadata = analyzeSqlNode(view.name, sql);
        if (metadata) {
            models.push(metadata);
        }
    }

    // Build edges (simplified: if child's DDL contains parent's name, it's a dependency)
    // In a real Snowflake App, this would use SYSTEM$GET_TAG or SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES
    for (const child of views) {
        for (const parent of views) {
            if (parent.name !== child.name && child.text.includes(parent.name)) {
                edges.push({ parent, child });
            }
        }
    }

    return { models, edges };
}

export async function checkSnowflakeDag(edges: Edge[]): Promise<any[]> {
    const results = [];
    for (const edge of edges) {
        const parentSql = edge.parent.text.match(/AS\s+(SELECT.*)/is)?.[1] || edge.parent.text;
        const childSql = edge.child.text.match(/AS\s+(SELECT.*)/is)?.[1] || edge.child.text;
        
        const pMeta = analyzeSqlNode(edge.parent.name, parentSql);
        const cMeta = analyzeSqlNode(edge.child.name, childSql);
        
        if (pMeta && cMeta && pMeta.z3Assertions.length > 0 && cMeta.z3Assertions.length > 0) {
            const combinedAssertions = [...pMeta.z3Assertions, ...cMeta.z3Assertions];
            const combinedVariables = { ...pMeta.variables, ...cMeta.variables };
            const status = await checkZ3Constraints(combinedAssertions, combinedVariables);
            results.push({ parent: edge.parent, child: edge.child, status });
        } else {
            results.push({ parent: edge.parent, child: edge.child, status: 'skipped' });
        }
    }
    return results;
}
