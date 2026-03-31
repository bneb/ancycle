/**
 * Tests: AST — Concrete Syntax Tree & FormalProvable Contract
 *
 * Verifies that every AST node correctly translates itself
 * into valid Z3 SMT-LIB2 syntax via toSmtLib().
 */
import { describe, test, expect } from "bun:test";
import { Identifier, StringLiteral, NumberLiteral, BinaryExpr, SelectStmt } from "../src/parser/ast";

describe("AST Nodes", () => {
    // ─── Identifier ──────────────────────────────────────────────────────

    test("Identifier.toSmtLib() returns raw name", () => {
        const id = new Identifier("status");
        expect(id.toSmtLib()).toBe("status");
    });

    test("Identifier preserves underscored names", () => {
        const id = new Identifier("user_session_id");
        expect(id.toSmtLib()).toBe("user_session_id");
    });

    // ─── StringLiteral ───────────────────────────────────────────────────

    test('StringLiteral.toSmtLib() wraps value in double quotes', () => {
        const lit = new StringLiteral("active");
        expect(lit.toSmtLib()).toBe('"active"');
    });

    test("StringLiteral handles empty string", () => {
        const lit = new StringLiteral("");
        expect(lit.toSmtLib()).toBe('""');
    });

    test("StringLiteral preserves spaces in value", () => {
        const lit = new StringLiteral("hello world");
        expect(lit.toSmtLib()).toBe('"hello world"');
    });

    // ─── NumberLiteral ───────────────────────────────────────────────────

    test("NumberLiteral.toSmtLib() returns numeric string", () => {
        const num = new NumberLiteral(42);
        expect(num.toSmtLib()).toBe("42");
    });

    test("NumberLiteral handles zero", () => {
        const num = new NumberLiteral(0);
        expect(num.toSmtLib()).toBe("0");
    });

    test("NumberLiteral handles decimals", () => {
        const num = new NumberLiteral(3.14);
        expect(num.toSmtLib()).toBe("3.14");
    });

    test("NumberLiteral handles negative numbers", () => {
        const num = new NumberLiteral(-1);
        expect(num.toSmtLib()).toBe("-1");
    });

    // ─── BinaryExpr — Equality ───────────────────────────────────────────

    test("BinaryExpr = produces (= left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("status"),
            "=",
            new StringLiteral("active")
        );
        expect(expr.toSmtLib()).toBe('(= status "active")');
    });

    // ─── BinaryExpr — Inequality ─────────────────────────────────────────

    test("BinaryExpr != produces (distinct left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("status"),
            "!=",
            new StringLiteral("churned")
        );
        expect(expr.toSmtLib()).toBe('(distinct status "churned")');
    });

    // ─── BinaryExpr — Comparisons ────────────────────────────────────────

    test("BinaryExpr > produces (> left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("revenue"),
            ">",
            new NumberLiteral(1000)
        );
        expect(expr.toSmtLib()).toBe("(> revenue 1000)");
    });

    test("BinaryExpr < produces (< left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("age"),
            "<",
            new NumberLiteral(18)
        );
        expect(expr.toSmtLib()).toBe("(< age 18)");
    });

    test("BinaryExpr >= produces (>= left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("score"),
            ">=",
            new NumberLiteral(90)
        );
        expect(expr.toSmtLib()).toBe("(>= score 90)");
    });

    test("BinaryExpr <= produces (<= left right)", () => {
        const expr = new BinaryExpr(
            new Identifier("count"),
            "<=",
            new NumberLiteral(5)
        );
        expect(expr.toSmtLib()).toBe("(<= count 5)");
    });

    // ─── BinaryExpr — Logical Connectives ────────────────────────────────

    test("BinaryExpr AND produces (and ...)", () => {
        const expr = new BinaryExpr(
            new BinaryExpr(new Identifier("a"), "=", new NumberLiteral(1)),
            "AND",
            new BinaryExpr(new Identifier("b"), "=", new NumberLiteral(2))
        );
        expect(expr.toSmtLib()).toBe("(and (= a 1) (= b 2))");
    });

    test("BinaryExpr OR produces (or ...)", () => {
        const expr = new BinaryExpr(
            new BinaryExpr(new Identifier("a"), "=", new NumberLiteral(1)),
            "OR",
            new BinaryExpr(new Identifier("b"), "=", new NumberLiteral(2))
        );
        expect(expr.toSmtLib()).toBe("(or (= a 1) (= b 2))");
    });

    // ─── Nested Compound Expressions ─────────────────────────────────────

    test("deeply nested AND/OR produces correct prefix notation", () => {
        // a = 1 AND (b = 2 OR c = 3)
        const expr = new BinaryExpr(
            new BinaryExpr(new Identifier("a"), "=", new NumberLiteral(1)),
            "AND",
            new BinaryExpr(
                new BinaryExpr(new Identifier("b"), "=", new NumberLiteral(2)),
                "OR",
                new BinaryExpr(new Identifier("c"), "=", new NumberLiteral(3))
            )
        );
        expect(expr.toSmtLib()).toBe("(and (= a 1) (or (= b 2) (= c 3)))");
    });

    test("triple AND chain", () => {
        // (a = 1 AND b = 2) AND c = 3
        const expr = new BinaryExpr(
            new BinaryExpr(
                new BinaryExpr(new Identifier("a"), "=", new NumberLiteral(1)),
                "AND",
                new BinaryExpr(new Identifier("b"), "=", new NumberLiteral(2))
            ),
            "AND",
            new BinaryExpr(new Identifier("c"), "=", new NumberLiteral(3))
        );
        expect(expr.toSmtLib()).toBe("(and (and (= a 1) (= b 2)) (= c 3))");
    });

    // ─── SelectStmt ──────────────────────────────────────────────────────

    test("SelectStmt stores columns, fromTable, and whereClause", () => {
        const whereExpr = new BinaryExpr(new Identifier("status"), "=", new StringLiteral("active"));
        const stmt = new SelectStmt(
            [new Identifier("user_id"), new Identifier("status")],
            "users",
            null, // fromAlias
            [],   // joins
            whereExpr,
            [],   // groupBy
            null, // having
            [],   // orderBy
            null  // limit
        );
        expect(stmt.columns).toHaveLength(2);
        expect((stmt.columns[0]! as Identifier).name).toBe("user_id");
        expect(stmt.fromTable).toBe("users");
        expect(stmt.whereClause).not.toBeNull();
        expect(stmt.whereClause!.toSmtLib()).toBe('(= status "active")');
    });

    test("SelectStmt allows null fromTable and whereClause", () => {
        const stmt = new SelectStmt([], null, null, [], null, [], null, [], null);
        expect(stmt.columns).toHaveLength(0);
        expect(stmt.fromTable).toBeNull();
        expect(stmt.whereClause).toBeNull();
    });
});
