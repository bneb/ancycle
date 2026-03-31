/**
 * Tests: Z3 Shadow — Theorem Prover Integration
 *
 * Verifies that the Z3 subprocess correctly evaluates
 * QF_S string constraints. Requires the native z3 binary.
 */
import { describe, test, expect } from "bun:test";
import { checkZ3Constraints } from "../src/shadow/z3";

describe("Z3 Shadow", () => {
    // ─── Core Constraint Solving ─────────────────────────────────────────

    test("contradictory string assertions return UNSAT", async () => {
        const result = await checkZ3Constraints([
            '(= status "active")',
            '(= status "churned")',
        ]);
        expect(result).toBe("unsat");
    });

    test("compatible string assertions return SAT", async () => {
        const result = await checkZ3Constraints([
            '(= status "active")',
            '(= status "active")',
        ]);
        expect(result).toBe("sat");
    });

    test("single assertion is always SAT", async () => {
        const result = await checkZ3Constraints([
            '(= status "active")',
        ]);
        expect(result).toBe("sat");
    });

    // ─── The Magic Trick ─────────────────────────────────────────────────

    test("the Magic Trick assertions are mathematically UNSAT", async () => {
        // This is the exact constraint pair from the demo
        const result = await checkZ3Constraints([
            '(= status "active")',   // upstream: stg_active_users
            '(= status "churned")',  // downstream: process_churned
        ]);
        expect(result).toBe("unsat");
    });
});
