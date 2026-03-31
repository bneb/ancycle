/**
 * Tests: SQL Parser Bridge - analyzeSqlNode()
 *
 * Verifies the high-level integration between the custom parser
 * and the Z3 assertion extraction pipeline.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { analyzeSqlNode } from "../src/parser/sql-parser";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("analyzeSqlNode", () => {
    // ─── Basic Extraction ────────────────────────────────────────────────

    test("extracts FROM table name", () => {
        const result = analyzeSqlNode("my_node", "SELECT * FROM users");
        expect(result.fromTable).toBe("users");
    });

    test("uses nodeId as tableName", () => {
        const result = analyzeSqlNode("stg_active_users", "SELECT * FROM users");
        expect(result.tableName).toBe("stg_active_users");
    });

    test("extracts Z3 assertion from WHERE clause", () => {
        const result = analyzeSqlNode("node1", "SELECT * FROM t WHERE status = 'active'");
        expect(result.z3Assertions).toHaveLength(1);
        expect(result.z3Assertions[0]).toBe('(= status "active")');
    });

    // ─── Edge Cases ──────────────────────────────────────────────────────

    test("empty SQL returns null metadata", () => {
        const result = analyzeSqlNode("empty", "");
        expect(result.tableName).toBeNull();
        expect(result.fromTable).toBeNull();
        expect(result.z3Assertions).toHaveLength(0);
    });

    test("whitespace-only SQL returns null metadata", () => {
        const result = analyzeSqlNode("empty", "   \n  ");
        expect(result.tableName).toBeNull();
        expect(result.fromTable).toBeNull();
        expect(result.z3Assertions).toHaveLength(0);
    });

    test("SQL without WHERE clause returns empty z3Assertions", () => {
        const result = analyzeSqlNode("node1", "SELECT user_id, name FROM users");
        expect(result.z3Assertions).toHaveLength(0);
        expect(result.fromTable).toBe("users");
    });

    // ─── Compound Assertions ─────────────────────────────────────────────

    test("compound AND WHERE produces single combined assertion", () => {
        const result = analyzeSqlNode("node1", "SELECT * FROM t WHERE a = 1 AND b = 'x'");
        expect(result.z3Assertions).toHaveLength(1);
        expect(result.z3Assertions[0]).toBe('(and (= a 1) (= b "x"))');
    });

    test("compound OR WHERE produces single combined assertion", () => {
        const result = analyzeSqlNode("node1", "SELECT * FROM t WHERE a = 1 OR b = 2");
        expect(result.z3Assertions).toHaveLength(1);
        expect(result.z3Assertions[0]).toBe("(or (= a 1) (= b 2))");
    });

    // ─── CTE Dependency Resolution ───────────────────────────────────────
    test("analyzeSqlNode ignores CTEs as external dependencies and merges assertions", () => {
        const sql = `
            WITH active_users AS (
                SELECT user_id FROM raw_users WHERE status = 'active'
            )
            SELECT * FROM active_users JOIN raw_events ON active_users.user_id = raw_events.user_id
            WHERE raw_events.type = 'click'
        `;
        const meta = analyzeSqlNode("test_cte", sql);
        
        // active_users should not be in external dependencies
        expect(meta.fromTable).toBeNull(); 
        // raw_users (from CTE) and raw_events (from main query) should be the external dependencies
        expect(meta.joinTables).toContain("raw_users");
        expect(meta.joinTables).toContain("raw_events");
        expect(meta.joinTables).not.toContain("active_users");

        // assertions should combine CTE and main query
        expect(meta.z3Assertions).toContain('(= status "active")');
        expect(meta.z3Assertions).toContain('(= type "click")');
    });

    // ─── The Magic Trick: End-to-End ─────────────────────────────────────

    test("stg_active_users and process_churned produce contradictory assertions", () => {
        const upstream = analyzeSqlNode("stg_active_users", "SELECT * FROM users WHERE status = 'active'");
        const downstream = analyzeSqlNode("process_churned", "SELECT * FROM stg_active_users WHERE status = 'churned'");

        expect(upstream.z3Assertions[0]).toBe('(= status "active")');
        expect(downstream.z3Assertions[0]).toBe('(= status "churned")');
    });
});
