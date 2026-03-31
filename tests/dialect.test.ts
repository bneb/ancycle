import { describe, test, expect, beforeAll } from "bun:test";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Dialect Support (BigQuery & Snowflake)", () => {
    test("Parser tokenizes backtick identifiers (BigQuery)", () => {
        const stmt = TreeSitterAdapter.parseSelectStatement("SELECT `project.dataset.table` FROM `table`");
        expect(stmt.fromTable).toBe('"table"');
        expect(stmt.columns.length).toBe(1);
    });

    test("Parser supports Snowflake :: cast operator", () => {
        const sql = "SELECT age::INT FROM users WHERE status::VARCHAR = 'active'";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        expect(stmt.columns.length).toBe(1);
        expect(stmt.whereClause).toBeDefined();
    });

    test("Parser supports BigQuery UNNEST and arrays", () => {
        const sql = "SELECT * FROM UNNEST([1, 2, 3]) AS num";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        // tree-sitter-sql will parse UNNEST as a function call in FROM clause usually
        expect(stmt.fromAlias).toBe("num");
    });

    test("Parser supports complex UDFs and JSON extraction", () => {
        const sql = "SELECT JSON_EXTRACT(data, '$.id') FROM events";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        expect(stmt.columns.length).toBe(1);
    });
});
