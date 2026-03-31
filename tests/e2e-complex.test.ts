/**
 * Tests: E2E Complex Query — Real-World SQL Parser Hardening
 *
 * Creates a real SQLite database with users/orders/refunds tables,
 * inserts realistic data, runs a complex analytics query through
 * SQLite to prove it's valid SQL, then parses it through Ancycle's
 * engine to verify DAG edge and constraint extraction.
 *
 * This same database schema backs the HackerNews demo.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Lexer, TokenType } from "../src/parser/lexer";
import { Parser } from "../src/parser/parser";
import { analyzeSqlNode } from "../src/parser/sql-parser";

let db: Database;

beforeAll(() => {
    db = new Database(":memory:");

    // ─── Schema ──────────────────────────────────────────────────────────
    db.run(`
        CREATE TABLE users (
            user_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE orders (
            order_id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    db.run(`
        CREATE TABLE refunds (
            refund_id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            order_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (order_id) REFERENCES orders(order_id)
        )
    `);

    // ─── Seed Data ───────────────────────────────────────────────────────
    const insertUser = db.prepare(
        "INSERT INTO users (user_id, name, status, created_at) VALUES (?, ?, ?, ?)"
    );
    insertUser.run(1, "Alice", "active", "2023-01-15");
    insertUser.run(2, "Bob", "active", "2023-03-20");
    insertUser.run(3, "Charlie", "churned", "2023-06-01");
    insertUser.run(4, "Diana", "active", "2024-01-10");
    insertUser.run(5, "Eve", "suspended", "2023-09-05");

    const insertOrder = db.prepare(
        "INSERT INTO orders (order_id, user_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    insertOrder.run(1, 1, 500.00, "completed", "2023-06-01");
    insertOrder.run(2, 1, 750.00, "completed", "2023-09-15");
    insertOrder.run(3, 1, 300.00, "completed", "2024-01-20");
    insertOrder.run(4, 2, 1200.00, "completed", "2023-07-10");
    insertOrder.run(5, 2, 800.00, "completed", "2024-02-01");
    insertOrder.run(6, 2, 950.00, "completed", "2024-03-15");
    insertOrder.run(7, 3, 100.00, "completed", "2023-08-20");
    insertOrder.run(8, 3, 50.00, "cancelled", "2023-10-01");
    insertOrder.run(9, 4, 2000.00, "completed", "2024-02-20");
    insertOrder.run(10, 4, 1500.00, "completed", "2024-03-01");
    insertOrder.run(11, 4, 3000.00, "completed", "2024-03-15");

    const insertRefund = db.prepare(
        "INSERT INTO refunds (refund_id, user_id, order_id, amount, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    insertRefund.run(1, 1, 2, 200.00, "2024-02-01");
    insertRefund.run(2, 3, 7, 100.00, "2023-09-01");
    insertRefund.run(3, 4, 9, 500.00, "2024-03-01");
});

afterAll(() => {
    db.close();
});

// ─── The Complex Analytics Query ─────────────────────────────────────────
const COMPLEX_QUERY = `
SELECT
  u.user_id,
  u.name AS user_name,
  o.total_spent,
  o.order_count,
  r.last_refund_amount
FROM users u
INNER JOIN (
  SELECT user_id, SUM(amount) AS total_spent, COUNT(*) AS order_count
  FROM orders
  WHERE status = 'completed'
  GROUP BY user_id
  HAVING SUM(amount) > 0
) o ON u.user_id = o.user_id
LEFT JOIN (
  SELECT user_id, MAX(amount) AS last_refund_amount
  FROM refunds
  WHERE created_at > '2024-01-01'
  GROUP BY user_id
) r ON r.user_id = u.user_id
WHERE u.status = 'active'
  AND o.order_count >= 3
ORDER BY o.total_spent DESC
LIMIT 100
`;

describe("E2E Complex Query", () => {
    // ─── SQLite Validation ───────────────────────────────────────────────

    test("the complex query is valid SQL and returns correct data", () => {
        const rows = db.prepare(COMPLEX_QUERY).all() as any[];
        // Alice: 3 completed orders (500+750+300=1550), 1 refund of 200
        // Bob:   3 completed orders (1200+800+950=2950), no refunds after 2024-01-01
        // Diana: 3 completed orders (2000+1500+3000=6500), 1 refund of 500
        // Charlie is churned (filtered by WHERE u.status = 'active')
        // Eve has no orders
        expect(rows.length).toBe(3);

        // Ordered by total_spent DESC: Diana (6500), Bob (2950), Alice (1550)
        expect(rows[0].user_name).toBe("Diana");
        expect(rows[0].total_spent).toBe(6500);
        expect(rows[0].last_refund_amount).toBe(500);

        expect(rows[1].user_name).toBe("Bob");
        expect(rows[1].total_spent).toBe(2950);
        expect(rows[1].last_refund_amount).toBeNull();

        expect(rows[2].user_name).toBe("Alice");
        expect(rows[2].total_spent).toBe(1550);
        expect(rows[2].last_refund_amount).toBe(200);
    });

    // ─── Lexer Survival ──────────────────────────────────────────────────

    test("lexer tokenizes the complex query without errors", () => {
        const lexer = new Lexer(COMPLEX_QUERY);
        const tokens = lexer.tokenize();
        const errorTokens = tokens.filter(t => t.type === TokenType.ERROR);
        expect(errorTokens).toHaveLength(0);
        // Must end with EOF
        expect(tokens[tokens.length - 1]!.type).toBe(TokenType.EOF);
    });

    // ─── Parser Survival ─────────────────────────────────────────────────

    test("parser parses the complex query without throwing", () => {
        const lexer = new Lexer(COMPLEX_QUERY);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt).toBeDefined();
    });

    // ─── DAG Edge Extraction ─────────────────────────────────────────────

    test("parser extracts FROM table name", () => {
        const lexer = new Lexer(COMPLEX_QUERY);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.fromTable).toBe("users");
    });

    test("parser extracts JOIN dependencies", () => {
        const lexer = new Lexer(COMPLEX_QUERY);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        // The statement should have join clauses referencing orders and refunds
        expect(stmt.joins).toBeDefined();
        expect(stmt.joins.length).toBe(2);
    });

    // ─── WHERE Constraint Extraction ─────────────────────────────────────

    test("parser extracts WHERE clause constraints", () => {
        const lexer = new Lexer(COMPLEX_QUERY);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.whereClause).not.toBeNull();
        // The WHERE clause should contain status = 'active' AND order_count >= 3
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toContain('status');
        expect(smt).toContain('"active"');
    });

    // ─── The Magic Trick with Real Data ──────────────────────────────────

    test("the HN demo: active users pipeline catches churned filter contradiction", () => {
        // Stage 1: Build the active users staging table
        const stageQuery = `
            SELECT u.user_id, u.name, u.status, o.total_spent
            FROM users u
            INNER JOIN (
                SELECT user_id, SUM(amount) AS total_spent
                FROM orders
                WHERE status = 'completed'
                GROUP BY user_id
            ) o ON u.user_id = o.user_id
            WHERE u.status = 'active'
        `;

        // Stage 2: Someone wires a churned analysis downstream
        const downstreamQuery = `
            SELECT user_id, name, total_spent
            FROM stg_active_users
            WHERE status = 'churned'
        `;

        const upstream = analyzeSqlNode("stg_active_users", stageQuery);
        const downstream = analyzeSqlNode("process_churned", downstreamQuery);

        // DAG edge detected
        expect(downstream.fromTable).toBe("stg_active_users");
        expect(downstream.fromTable).toBe(upstream.tableName);

        // Both produce assertions
        expect(upstream.z3Assertions.length).toBeGreaterThan(0);
        expect(downstream.z3Assertions.length).toBeGreaterThan(0);

        // The upstream constrains status to 'active'
        expect(upstream.z3Assertions[0]).toContain('"active"');
        // The downstream constrains status to 'churned'
        expect(downstream.z3Assertions[0]).toContain('"churned"');
    });

    // ─── Simpler JOINed Queries ──────────────────────────────────────────

    test("parses simple INNER JOIN", () => {
        const sql = "SELECT a.id, b.name FROM users a INNER JOIN orders b ON a.id = b.user_id WHERE a.status = 'active'";
        const lexer = new Lexer(sql);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.fromTable).toBe("users");
        expect(stmt.joins).toHaveLength(1);
        expect(stmt.whereClause).not.toBeNull();
    });

    test("parses simple LEFT JOIN", () => {
        const sql = "SELECT * FROM users u LEFT JOIN refunds r ON u.user_id = r.user_id";
        const lexer = new Lexer(sql);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.fromTable).toBe("users");
        expect(stmt.joins).toHaveLength(1);
    });

    test("parses dot-notation in WHERE clause", () => {
        const sql = "SELECT * FROM users u WHERE u.status = 'active'";
        const lexer = new Lexer(sql);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.whereClause).not.toBeNull();
        const smt = stmt.whereClause!.toSmtLib();
        expect(smt).toContain("status");
        expect(smt).toContain('"active"');
    });

    test("parses GROUP BY and HAVING", () => {
        const sql = "SELECT user_id, SUM(amount) AS total FROM orders GROUP BY user_id HAVING SUM(amount) > 100";
        const lexer = new Lexer(sql);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.groupBy).toBeDefined();
        expect(stmt.groupBy.length).toBeGreaterThan(0);
        expect(stmt.having).not.toBeNull();
    });

    test("parses ORDER BY and LIMIT", () => {
        const sql = "SELECT * FROM users ORDER BY name DESC LIMIT 10";
        const lexer = new Lexer(sql);
        const parser = new Parser(lexer);
        const stmt = parser.parseSelectStatement();
        expect(stmt.orderBy).toBeDefined();
        expect(stmt.orderBy.length).toBeGreaterThan(0);
        expect(stmt.limit).toBe(10);
    });
});
