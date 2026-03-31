import { describe, test, expect } from "bun:test";
import { parseDbtManifest, checkDbtDag } from "../src/cli/dbt-adapter";
import { checkZ3Constraints } from "../src/shadow/z3";

const MOCK_MANIFEST = {
    nodes: {
        "model.my_project.stg_users": {
            resource_type: "model",
            name: "stg_users",
            depends_on: { nodes: [] },
            compiled_code: "SELECT * FROM raw_users WHERE status = 'active'"
        },
        "model.my_project.process_churn": {
            resource_type: "model",
            name: "process_churn",
            depends_on: { nodes: ["model.my_project.stg_users"] },
            compiled_code: "SELECT * FROM stg_users WHERE status = 'churned'"
        },
        "model.my_project.safe_model": {
            resource_type: "model",
            name: "safe_model",
            depends_on: { nodes: ["model.my_project.stg_users"] },
            compiled_code: "SELECT * FROM stg_users WHERE revenue > 100"
        }
    }
};

describe("dbt Adapter", () => {
    test("parseDbtManifest extracts nodes and builds edges", () => {
        const { models, edges } = parseDbtManifest(MOCK_MANIFEST);
        
        expect(models.length).toBe(3);
        expect(edges.length).toBe(2);
        
        const churnEdge = edges.find(e => e.child.name === "process_churn");
        expect(churnEdge).toBeDefined();
        expect(churnEdge!.parent.name).toBe("stg_users");
    });

    test("checkDbtDag finds contradictions on bad edges and passes good edges", async () => {
        const { models, edges } = parseDbtManifest(MOCK_MANIFEST);
        const results = await checkDbtDag(edges);
        
        expect(results.length).toBe(2);
        
        const churnResult = results.find(r => r.child.name === "process_churn");
        expect(churnResult!.status).toBe("unsat"); // Conflict! active vs churned
        
        const safeResult = results.find(r => r.child.name === "safe_model");
        expect(safeResult!.status).toBe("sat"); // No conflict! active & revenue > 100
    });
});
