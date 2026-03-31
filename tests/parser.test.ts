/**
 * Tests: Parser — Recursive Descent SQL Parser
 *
 * Verifies that token streams are correctly assembled into
 * SelectStmt ASTs with proper operator precedence, error
 * reporting, and edge-case handling.
 */
import { describe, test, expect } from "bun:test";
import { Lexer } from "../src/parser/lexer";
import { Parser } from "../src/parser/parser";
import { BinaryExpr, Identifier, StringLiteral, NumberLiteral } from "../src/parser/ast";

function parse(sql: string) {
    const lexer = new Lexer(sql);
    const parser = new Parser(lexer);
    return parser.parseSelectStatement();
}

describe("Parser", () => {
    // ─── Basic SELECT Parsing ────────────────────────────────────────────

    test("parses SELECT * with no FROM", () => {
        const stmt = parse("SELECT *");
        expect(stmt.columns).toHaveLength(1); // StarExpr
        expect(stmt.fromTable).toBeNull();
        expect(stmt.whereClause).toBeNull();
    });

    test("parses SELECT with named columns", () => {
        const stmt = parse("SELECT user_id, status, revenue FROM users");
        expect(stmt.columns).toHaveLength(3);
        expect(stmt.columns[0]!.name).toBe("user_id");
        expect(stmt.columns[1]!.name).toBe("status");
        expect(stmt.columns[2]!.name).toBe("revenue");
    });

    test("parses FROM clause and extracts table name", () => {
        const stmt = parse("SELECT * FROM stg_active_users");
        expect(stmt.fromTable).toBe("stg_active_users");
    });

    test("parses SELECT without FROM clause", () => {
        const stmt = parse("SELECT user_id, name");
        expect(stmt.columns).toHaveLength(2);
        expect(stmt.fromTable).toBeNull();
    });

    // ─── WHERE Clause Parsing ────────────────────────────────────────────

    test("parses WHERE with string equality", () => {
        const stmt = parse("SELECT * FROM t WHERE status = 'active'");
        expect(stmt.whereClause).not.toBeNull();
        expect(stmt.whereClause).toBeInstanceOf(BinaryExpr);
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe("=");
        expect((expr.left as Identifier).name).toBe("status");
        expect((expr.right as StringLiteral).value).toBe("active");
    });

    test("parses WHERE with numeric comparison", () => {
        const stmt = parse("SELECT * FROM t WHERE revenue > 1000");
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe(">");
        expect((expr.left as Identifier).name).toBe("revenue");
        expect((expr.right as NumberLiteral).value).toBe(1000);
    });

    test("parses WHERE with != operator", () => {
        const stmt = parse("SELECT * FROM t WHERE status != 'deleted'");
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe("!=");
    });

    test("parses WHERE with <> operator (normalized to !=)", () => {
        const stmt = parse("SELECT * FROM t WHERE status <> 'deleted'");
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe("!=");
    });

    // ─── Compound WHERE (AND / OR) ───────────────────────────────────────

    test("parses WHERE with AND", () => {
        const stmt = parse("SELECT * FROM t WHERE a = 1 AND b = 'x'");
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe("AND");
        expect((expr.left as BinaryExpr).operator).toBe("=");
        expect((expr.right as BinaryExpr).operator).toBe("=");
    });

    test("parses WHERE with OR", () => {
        const stmt = parse("SELECT * FROM t WHERE a = 1 OR b = 2");
        const expr = stmt.whereClause as BinaryExpr;
        expect(expr.operator).toBe("OR");
    });

    test("AND binds tighter than OR (operator precedence)", () => {
        // a = 1 OR b = 2 AND c = 3
        // should parse as: a = 1 OR (b = 2 AND c = 3)
        const stmt = parse("SELECT * FROM t WHERE a = 1 OR b = 2 AND c = 3");
        const top = stmt.whereClause as BinaryExpr;
        expect(top.operator).toBe("OR");
        // Left side: a = 1
        expect((top.left as BinaryExpr).operator).toBe("=");
        expect(((top.left as BinaryExpr).left as Identifier).name).toBe("a");
        // Right side: b = 2 AND c = 3
        const right = top.right as BinaryExpr;
        expect(right.operator).toBe("AND");
        expect(((right.left as BinaryExpr).left as Identifier).name).toBe("b");
        expect(((right.right as BinaryExpr).left as Identifier).name).toBe("c");
    });

    test("multiple ANDs chain left-associatively", () => {
        // a = 1 AND b = 2 AND c = 3
        // should parse as: (a = 1 AND b = 2) AND c = 3
        const stmt = parse("SELECT * FROM t WHERE a = 1 AND b = 2 AND c = 3");
        const top = stmt.whereClause as BinaryExpr;
        expect(top.operator).toBe("AND");
        // Left side should be another AND
        const left = top.left as BinaryExpr;
        expect(left.operator).toBe("AND");
        // Right side is c = 3
        expect(((top.right as BinaryExpr).left as Identifier).name).toBe("c");
    });

    // ─── SMT-LIB2 End-to-End Verification ────────────────────────────────

    test("parsed WHERE clause produces correct SMT-LIB2", () => {
        const stmt = parse("SELECT * FROM users WHERE status = 'active'");
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("parsed compound AND produces correct SMT-LIB2", () => {
        const stmt = parse("SELECT * FROM t WHERE status = 'active' AND revenue > 100");
        expect(stmt.whereClause!.toSmtLib()).toBe('(and (= status "active") (> revenue 100))');
    });

    test("parsed compound OR produces correct SMT-LIB2", () => {
        const stmt = parse("SELECT * FROM t WHERE a = 1 OR b = 2");
        expect(stmt.whereClause!.toSmtLib()).toBe("(or (= a 1) (= b 2))");
    });

    test("parsed precedence produces correct nested SMT-LIB2", () => {
        // a = 1 OR b = 2 AND c = 3  →  (or (= a 1) (and (= b 2) (= c 3)))
        const stmt = parse("SELECT * FROM t WHERE a = 1 OR b = 2 AND c = 3");
        expect(stmt.whereClause!.toSmtLib()).toBe("(or (= a 1) (and (= b 2) (= c 3)))");
    });

    // ─── The Magic Trick SQL ─────────────────────────────────────────────

    test("parses stg_active_users.sql correctly", () => {
        const sql = "SELECT user_id, status, revenue FROM users WHERE status = 'active'";
        const stmt = parse(sql);
        expect(stmt.fromTable).toBe("users");
        expect(stmt.columns).toHaveLength(3);
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("parses process_churned.sql correctly", () => {
        const sql = "SELECT user_id, revenue FROM stg_active_users WHERE status = 'churned'";
        const stmt = parse(sql);
        expect(stmt.fromTable).toBe("stg_active_users");
        expect(stmt.columns).toHaveLength(2);
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "churned")');
    });

    // ─── Error Handling ──────────────────────────────────────────────────

    test("throws on missing SELECT keyword", () => {
        expect(() => parse("FROM users")).toThrow(/Parse Error/);
    });

    test("throws on garbled input", () => {
        expect(() => parse("GARBAGE NONSENSE")).toThrow(/Parse Error/);
    });

    // ─── Edge Cases ──────────────────────────────────────────────────────

    test("handles SELECT with single column, no comma", () => {
        const stmt = parse("SELECT user_id FROM users");
        expect(stmt.columns).toHaveLength(1);
        expect(stmt.columns[0]!.name).toBe("user_id");
    });

    test("handles multiline SQL", () => {
        const sql = `SELECT
  user_id,
  status
FROM
  users
WHERE
  status = 'active'`;
        const stmt = parse(sql);
        expect(stmt.fromTable).toBe("users");
        expect(stmt.columns).toHaveLength(2);
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("handles SQL with no whitespace around operator", () => {
        const stmt = parse("SELECT * FROM t WHERE status='active'");
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("handles SQL with excessive whitespace", () => {
        const stmt = parse("SELECT   *   FROM   t   WHERE   status  =  'active'");
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("case-insensitive keywords work in full statement", () => {
        const stmt = parse("select user_id from users where status = 'active'");
        expect(stmt.fromTable).toBe("users");
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });
});
