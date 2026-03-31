/**
 * Tests: SQL Parser Bridge — analyzeSqlNode()
 *
 * Verifies the high-level integration between the custom parser
 * and the Z3 assertion extraction pipeline.
 */
import { describe, test, expect } from "bun:test";
import { analyzeSqlNode } from "../src/parser/sql-parser";

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

    // ─── The Magic Trick: End-to-End ─────────────────────────────────────

    test("stg_active_users and process_churned produce contradictory assertions", () => {
        const upstream = analyzeSqlNode(
            "stg_active_users",
            "SELECT user_id, status, revenue FROM users WHERE status = 'active'"
        );
        const downstream = analyzeSqlNode(
            "process_churned",
            "SELECT user_id, revenue FROM stg_active_users WHERE status = 'churned'"
        );

        // Downstream depends on upstream
        expect(downstream.fromTable).toBe(upstream.tableName);

        // Both have exactly one assertion
        expect(upstream.z3Assertions).toHaveLength(1);
        expect(downstream.z3Assertions).toHaveLength(1);

        // The assertions are contradictory (will be UNSAT when combined)
        expect(upstream.z3Assertions[0]).toBe('(= status "active")');
        expect(downstream.z3Assertions[0]).toBe('(= status "churned")');
    });
});
