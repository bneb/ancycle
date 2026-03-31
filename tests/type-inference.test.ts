import { describe, test, expect, beforeAll } from "bun:test";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";
import { inferTypes } from "../src/parser/type-inference";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

function parseWhere(sql: string) {
    const stmt = TreeSitterAdapter.parseSelectStatement(sql);
    return stmt.whereClause;
}

describe("Type Inference Engine", () => {
    test("infers String when identifier is compared to a StringLiteral", () => {
        const expr = parseWhere("SELECT * FROM t WHERE status = 'active'");
        const vars = inferTypes(expr!);
        expect(vars['status']).toBe('String');
    });

    test("infers Int when identifier is compared to an Integer NumberLiteral", () => {
        const expr = parseWhere("SELECT * FROM t WHERE age > 18");
        const vars = inferTypes(expr!);
        expect(vars['age']).toBe('Int');
    });

    test("infers Real when identifier is compared to a Float NumberLiteral", () => {
        const expr = parseWhere("SELECT * FROM t WHERE price <= 9.99");
        const vars = inferTypes(expr!);
        expect(vars['price']).toBe('Real');
    });

    test("handles qualified identifiers", () => {
        const expr = parseWhere("SELECT * FROM t WHERE t.user_id = 123");
        const vars = inferTypes(expr!);
        expect(vars['user_id']).toBe('Int');
    });

    test("extracts multiple variables from compound expressions", () => {
        const expr = parseWhere("SELECT * FROM t WHERE status = 'active' AND revenue > 1000.50 OR is_deleted = 0");
        const vars = inferTypes(expr!);
        expect(vars['status']).toBe('String');
        expect(vars['revenue']).toBe('Real');
        expect(vars['is_deleted']).toBe('Int');
    });

    test("handles unary operators", () => {
        const expr = parseWhere("SELECT * FROM t WHERE NOT deleted AND verified = 1");
        const vars = inferTypes(expr!);
        expect(vars['deleted']).toBe('Bool');
        expect(vars['verified']).toBe('Int');
    });

    test("handles identifiers used as bare predicates", () => {
        const expr = parseWhere("SELECT * FROM t WHERE is_active");
        const vars = inferTypes(expr!);
        expect(vars['is_active']).toBe('Bool');
    });
});
