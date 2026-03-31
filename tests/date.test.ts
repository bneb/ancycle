import { describe, test, expect, beforeAll } from "bun:test";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";
import { inferTypes } from "../src/parser/type-inference";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Date Arithmetic in SMT", () => {
    test("Translates INTERVAL to integer seconds", () => {
        // We expect `INTERVAL 7 DAY` to become 7 * 86400 = 604800
        const sql = "SELECT * FROM users WHERE created_at > DATE_SUB(CURRENT_DATE(), INTERVAL '7' DAY)";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toContain("604800"); 
    });

    test("Translates DATE_SUB and DATE_ADD", () => {
        const sql = "SELECT * FROM users WHERE created_at < DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        // For simplicity, let's say 1 MONTH = 30 days = 2592000 seconds
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toContain("2592000");
    });
    
    test("Infers Date columns as Int for Z3", () => {
        const sql = "SELECT * FROM users WHERE created_at > DATE_SUB(CURRENT_DATE(), INTERVAL '7' DAY)";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        const types = inferTypes(stmt.whereClause!);
        expect(types["created_at"]).toBe("Int");
    });
});
