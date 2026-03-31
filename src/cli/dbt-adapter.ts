import { analyzeSqlNode, SqlMetadata } from '../parser/sql-parser';
import { checkZ3Constraints, Z3Result } from '../shadow/z3';

export interface DbtNode {
    resource_type: string;
    name: string;
    depends_on: { nodes: string[] };
    compiled_code?: string;
    raw_code?: string;
}

export interface DbtManifest {
    nodes: Record<string, DbtNode>;
}

export interface DbtModelMetadata {
    name: string;
    nodeId: string;
    sqlMetadata: SqlMetadata | null;
}

export interface DbtEdge {
    parent: DbtModelMetadata;
    child: DbtModelMetadata;
}

export interface DbtCheckResult {
    parent: DbtModelMetadata;
    child: DbtModelMetadata;
    status: Z3Result;
}

export function parseDbtManifest(manifest: DbtManifest) {
    const models: DbtModelMetadata[] = [];
    const modelMap = new Map<string, DbtModelMetadata>();
    const edges: DbtEdge[] = [];

    for (const [nodeId, node] of Object.entries(manifest.nodes)) {
        if (node.resource_type === 'model') {
            const sql = node.compiled_code || node.raw_code || '';
            const sqlMetadata = sql ? analyzeSqlNode(node.name, sql) : null;
            const modelMeta = { name: node.name, nodeId, sqlMetadata };
            models.push(modelMeta);
            modelMap.set(nodeId, modelMeta);
        }
    }

    for (const [nodeId, node] of Object.entries(manifest.nodes)) {
        if (node.resource_type === 'model') {
            const childMeta = modelMap.get(nodeId);
            if (!childMeta) continue;

            const dependsOn = node.depends_on?.nodes || [];
            for (const parentId of dependsOn) {
                const parentMeta = modelMap.get(parentId);
                if (parentMeta) {
                    edges.push({ parent: parentMeta, child: childMeta });
                }
            }
        }
    }

    return { models, edges };
}

export async function checkDbtDag(edges: DbtEdge[]): Promise<DbtCheckResult[]> {
    const results: DbtCheckResult[] = [];

    for (const edge of edges) {
        if (edge.parent.sqlMetadata && edge.child.sqlMetadata) {
            const allAssertions = [
                ...edge.parent.sqlMetadata.z3Assertions,
                ...edge.child.sqlMetadata.z3Assertions
            ];
            const allVariables = {
                ...edge.parent.sqlMetadata.variables,
                ...edge.child.sqlMetadata.variables
            };

            if (allAssertions.length > 0) {
                const status = await checkZ3Constraints(allAssertions, allVariables);
                results.push({ parent: edge.parent, child: edge.child, status });
            } else {
                results.push({ parent: edge.parent, child: edge.child, status: 'unknown' });
            }
        } else {
            results.push({ parent: edge.parent, child: edge.child, status: 'unknown' });
        }
    }

    return results;
}
