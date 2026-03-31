import { describe, test, expect, beforeAll } from "bun:test";
import { parseSnowflakeInformationSchema, checkSnowflakeDag, SnowflakeView } from "../src/cli/snowflake-adapter";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";

const MOCK_SNOWFLAKE_VIEWS: SnowflakeView[] = [
    {
        name: "STG_USERS",
        schema: "PUBLIC",
        text: "CREATE OR REPLACE VIEW STG_USERS AS SELECT * FROM RAW_USERS WHERE STATUS = 'active'"
    },
    {
        name: "PROCESS_CHURN",
        schema: "PUBLIC",
        text: "CREATE OR REPLACE VIEW PROCESS_CHURN AS SELECT * FROM STG_USERS WHERE STATUS = 'churned'"
    }
];

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Snowflake Native App Adapter", () => {
    test("parseSnowflakeInformationSchema strips DDL and extracts models", () => {
        const { models, edges } = parseSnowflakeInformationSchema(MOCK_SNOWFLAKE_VIEWS);
        expect(models.length).toBe(2);
        expect(edges.length).toBe(1); // PROCESS_CHURN depends on STG_USERS
        expect(edges[0].parent.name).toBe("STG_USERS");
        expect(edges[0].child.name).toBe("PROCESS_CHURN");
    });

    test("checkSnowflakeDag finds contradictions in Snowflake DDL views", async () => {
        const { edges } = parseSnowflakeInformationSchema(MOCK_SNOWFLAKE_VIEWS);
        const results = await checkSnowflakeDag(edges);
        
        expect(results.length).toBe(1);
        expect(results[0].status).toBe("unsat"); // active vs churned is a contradiction!
    });
});
