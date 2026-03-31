import { describe, test, expect, beforeAll } from "bun:test";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";
import { inferTypes } from "../src/parser/type-inference";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Advanced SMT: LIKE and NULL", () => {
    test("Translates IS NULL and IS NOT NULL to nil comparison", () => {
        const sql = "SELECT * FROM users WHERE email IS NULL AND name IS NOT NULL";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toBe("(and (= email nil) (distinct name nil))");
    });

    test("Translates LIKE '%val%' to str.contains", () => {
        const sql = "SELECT * FROM users WHERE email LIKE '%@gmail.com%'";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toBe('(str.contains email "@gmail.com")');
    });

    test("Translates LIKE 'val%' to str.prefixof", () => {
        const sql = "SELECT * FROM users WHERE email LIKE 'admin%'";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toBe('(str.prefixof "admin" email)');
    });

    test("Translates LIKE '%val' to str.suffixof", () => {
        const sql = "SELECT * FROM users WHERE email LIKE '%@gmail.com'";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toBe('(str.suffixof "@gmail.com" email)');
    });
});
