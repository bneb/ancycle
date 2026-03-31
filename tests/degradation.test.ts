import { describe, test, expect, beforeAll } from "bun:test";
import { TreeSitterAdapter } from "../src/parser/tree-sitter-adapter";
import { inferTypes } from "../src/parser/type-inference";

beforeAll(async () => {
    await TreeSitterAdapter.init();
});

describe("Graceful Degradation for Unknowns", () => {
    test("Maps unknown boolean functions to uninterpreted boolean variables", () => {
        // REGEXP_CONTAINS is unknown to Z3
        const sql = "SELECT * FROM users WHERE REGEXP_CONTAINS(email, '@gmail.com')";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toContain("__fn_REGEXP_CONTAINS");
        
        const types = inferTypes(stmt.whereClause!);
        // The type inference should have declared __fn_REGEXP_CONTAINS as Bool
        expect(types["__fn_REGEXP_CONTAINS"]).toBe("Bool");
    });
    
    test("Multiple identical unknown function calls map to the same variable", () => {
        // If the same function is called with the same arguments, they should map to the same variable
        const sql = "SELECT * FROM users WHERE foo(a) AND NOT foo(a)";
        const stmt = TreeSitterAdapter.parseSelectStatement(sql);
        
        const smt = stmt.whereClause!.toSmtLib();
        // Z3 will see: (and __fn_foo (not __fn_foo)) which is UNSAT
        expect(smt).toBe("(and __fn_foo (not __fn_foo))");
    });
});
