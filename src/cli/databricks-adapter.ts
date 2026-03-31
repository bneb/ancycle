import { TreeSitterAdapter } from '../parser/tree-sitter-adapter';
import { checkZ3Constraints } from '../shadow/z3';
import { analyzeSqlNode, SqlNodeMetadata } from '../parser/sql-parser';

export interface UnityCatalogView {
    catalog_name: string;
    schema_name: string;
    table_name: string;
    view_definition: string; // The raw SELECT statement from Unity Catalog
}

export interface DatabricksEdge {
    parent: UnityCatalogView;
    child: UnityCatalogView;
}

export function parseUnityCatalog(views: UnityCatalogView[]): { models: SqlNodeMetadata[], edges: DatabricksEdge[] } {
    const models: SqlNodeMetadata[] = [];
    const edges: DatabricksEdge[] = [];
    
    for (const view of views) {
        const metadata = analyzeSqlNode(view.table_name, view.view_definition);
        if (metadata) {
            models.push(metadata);
        }
    }

    // Build edges (simplified dependency tracking)
    for (const child of views) {
        for (const parent of views) {
            if (parent.table_name !== child.table_name && child.view_definition.includes(parent.table_name)) {
                edges.push({ parent, child });
            }
        }
    }

    return { models, edges };
}

export async function checkDatabricksDag(edges: DatabricksEdge[]): Promise<any[]> {
    const results = [];
    for (const edge of edges) {
        const pMeta = analyzeSqlNode(edge.parent.table_name, edge.parent.view_definition);
        const cMeta = analyzeSqlNode(edge.child.table_name, edge.child.view_definition);
        
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
