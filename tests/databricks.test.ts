import { describe, test, expect, beforeAll } from "bun:test";
import { parseUnityCatalog, checkDatabricksDag, UnityCatalogView } from "../src/cli/databricks-adapter";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";

const MOCK_UNITY_CATALOG: UnityCatalogView[] = [
    {
        catalog_name: "main",
        schema_name: "default",
        table_name: "stg_orders",
        view_definition: "SELECT * FROM raw_orders WHERE order_total > 100"
    },
    {
        catalog_name: "main",
        schema_name: "default",
        table_name: "high_value_refunds",
        view_definition: "SELECT * FROM stg_orders WHERE order_total < 50 AND status = 'refunded'"
    }
];

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Databricks Unity Catalog Adapter", () => {
    test("parseUnityCatalog extracts models and builds edges", () => {
        const { models, edges } = parseUnityCatalog(MOCK_UNITY_CATALOG);
        expect(models.length).toBe(2);
        expect(edges.length).toBe(1); 
        expect(edges[0].parent.table_name).toBe("stg_orders");
        expect(edges[0].child.table_name).toBe("high_value_refunds");
    });

    test("checkDatabricksDag finds contradictions in Unity Catalog views", async () => {
        const { edges } = parseUnityCatalog(MOCK_UNITY_CATALOG);
        const results = await checkDatabricksDag(edges);
        
        expect(results.length).toBe(1);
        expect(results[0].status).toBe("unsat"); // > 100 vs < 50 is a contradiction!
    });
});
