/**
 * Tests: Lexer — Deterministic Character Scanner
 *
 * Verifies that raw SQL strings are correctly decomposed into
 * a strictly-typed token stream with precise line/column tracking.
 */
import { describe, test, expect } from "bun:test";
import { Lexer, TokenType } from "../src/parser/lexer";

describe("Lexer", () => {
    // ─── Keyword Recognition ─────────────────────────────────────────────

    test("tokenizes SELECT keyword (lowercase)", () => {
        const lexer = new Lexer("select");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.SELECT);
        expect(token.value).toBe("select");
    });

    test("tokenizes SELECT keyword (uppercase)", () => {
        const lexer = new Lexer("SELECT");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.SELECT);
        expect(token.value).toBe("select");
    });

    test("tokenizes SELECT keyword (mixed case)", () => {
        const lexer = new Lexer("SeLeCt");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.SELECT);
        expect(token.value).toBe("select");
    });

    test("tokenizes FROM keyword", () => {
        const lexer = new Lexer("FROM");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.FROM);
        expect(token.value).toBe("from");
    });

    test("tokenizes WHERE keyword", () => {
        const lexer = new Lexer("WHERE");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.WHERE);
        expect(token.value).toBe("where");
    });

    test("tokenizes AND keyword", () => {
        const lexer = new Lexer("AND");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.AND);
        expect(token.value).toBe("and");
    });

    test("tokenizes OR keyword", () => {
        const lexer = new Lexer("OR");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OR);
        expect(token.value).toBe("or");
    });

    // ─── Identifiers ─────────────────────────────────────────────────────

    test("tokenizes simple identifier", () => {
        const lexer = new Lexer("user_id");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.IDENTIFIER);
        expect(token.value).toBe("user_id");
    });

    test("tokenizes identifier with numbers", () => {
        const lexer = new Lexer("revenue123");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.IDENTIFIER);
        expect(token.value).toBe("revenue123");
    });

    test("tokenizes underscore-prefixed identifier", () => {
        const lexer = new Lexer("_internal");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.IDENTIFIER);
        expect(token.value).toBe("_internal");
    });

    test("identifier starting with keyword prefix is not a keyword", () => {
        // 'selected' starts with 'select' but is an identifier
        const lexer = new Lexer("selected");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.IDENTIFIER);
        expect(token.value).toBe("selected");
    });

    test("identifier 'from_date' is not the FROM keyword", () => {
        const lexer = new Lexer("from_date");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.IDENTIFIER);
        expect(token.value).toBe("from_date");
    });

    // ─── String Literals ─────────────────────────────────────────────────

    test("tokenizes simple string literal", () => {
        const lexer = new Lexer("'active'");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.STRING_LITERAL);
        expect(token.value).toBe("active");
    });

    test("tokenizes string literal with spaces", () => {
        const lexer = new Lexer("'hello world'");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.STRING_LITERAL);
        expect(token.value).toBe("hello world");
    });

    test("tokenizes empty string literal", () => {
        const lexer = new Lexer("''");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.STRING_LITERAL);
        expect(token.value).toBe("");
    });

    test("tokenizes string literal containing digits", () => {
        const lexer = new Lexer("'abc123'");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.STRING_LITERAL);
        expect(token.value).toBe("abc123");
    });

    test("unterminated string literal produces ERROR", () => {
        const lexer = new Lexer("'missing end");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.ERROR);
    });

    // ─── Number Literals ─────────────────────────────────────────────────

    test("tokenizes integer literal", () => {
        const lexer = new Lexer("42");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.NUMBER_LITERAL);
        expect(token.value).toBe("42");
    });

    test("tokenizes decimal literal", () => {
        const lexer = new Lexer("3.14");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.NUMBER_LITERAL);
        expect(token.value).toBe("3.14");
    });

    test("tokenizes zero", () => {
        const lexer = new Lexer("0");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.NUMBER_LITERAL);
        expect(token.value).toBe("0");
    });

    // ─── Operators ───────────────────────────────────────────────────────

    test("tokenizes = operator", () => {
        const lexer = new Lexer("=");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("=");
    });

    test("tokenizes != operator", () => {
        const lexer = new Lexer("!=");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("!=");
    });

    test("tokenizes <> operator and normalizes to !=", () => {
        const lexer = new Lexer("<>");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("!=");
    });

    test("tokenizes > operator", () => {
        const lexer = new Lexer(">");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe(">");
    });

    test("tokenizes < operator", () => {
        const lexer = new Lexer("<");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("<");
    });

    test("tokenizes >= operator", () => {
        const lexer = new Lexer(">=");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe(">=");
    });

    test("tokenizes <= operator", () => {
        const lexer = new Lexer("<=");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("<=");
    });

    test("tokenizes * operator", () => {
        const lexer = new Lexer("*");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.OPERATOR);
        expect(token.value).toBe("*");
    });

    test("standalone ! produces ERROR", () => {
        const lexer = new Lexer("!");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.ERROR);
    });

    // ─── Punctuation ─────────────────────────────────────────────────────

    test("tokenizes comma", () => {
        const lexer = new Lexer(",");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.COMMA);
        expect(token.value).toBe(",");
    });

    // ─── Whitespace Handling ─────────────────────────────────────────────

    test("skips leading whitespace", () => {
        const lexer = new Lexer("   SELECT");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.SELECT);
    });

    test("skips tabs", () => {
        const lexer = new Lexer("\t\tSELECT");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.SELECT);
    });

    test("skips newlines between tokens", () => {
        const lexer = new Lexer("SELECT\nuser_id");
        const t1 = lexer.nextToken();
        const t2 = lexer.nextToken();
        expect(t1.type).toBe(TokenType.SELECT);
        expect(t2.type).toBe(TokenType.IDENTIFIER);
        expect(t2.value).toBe("user_id");
    });

    test("skips carriage return + newline (CRLF)", () => {
        const lexer = new Lexer("SELECT\r\nFROM");
        const t1 = lexer.nextToken();
        const t2 = lexer.nextToken();
        expect(t1.type).toBe(TokenType.SELECT);
        expect(t2.type).toBe(TokenType.FROM);
    });

    test("empty input produces EOF immediately", () => {
        const lexer = new Lexer("");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.EOF);
    });

    test("whitespace-only input produces EOF", () => {
        const lexer = new Lexer("   \n\t  \r\n  ");
        const token = lexer.nextToken();
        expect(token.type).toBe(TokenType.EOF);
    });

    // ─── Line & Column Tracking ──────────────────────────────────────────

    test("tracks column position on first line", () => {
        const lexer = new Lexer("SELECT user_id");
        const t1 = lexer.nextToken();
        expect(t1.line).toBe(1);
        expect(t1.col).toBe(1);
        const t2 = lexer.nextToken();
        expect(t2.line).toBe(1);
        expect(t2.col).toBe(8);
    });

    test("tracks line position across newlines", () => {
        const lexer = new Lexer("SELECT\nuser_id\nFROM");
        lexer.nextToken(); // SELECT on line 1
        const t2 = lexer.nextToken(); // user_id on line 2
        expect(t2.line).toBe(2);
        const t3 = lexer.nextToken(); // FROM on line 3
        expect(t3.line).toBe(3);
    });

    test("column resets after newline", () => {
        const lexer = new Lexer("SELECT\nFROM");
        lexer.nextToken(); // SELECT
        const t2 = lexer.nextToken(); // FROM
        expect(t2.line).toBe(2);
        expect(t2.col).toBe(1);
    });

    // ─── Full Tokenization ───────────────────────────────────────────────

    test("tokenizes complete SELECT statement", () => {
        const sql = "SELECT user_id, status FROM users WHERE status = 'active'";
        const lexer = new Lexer(sql);
        const tokens = lexer.tokenize();

        const types = tokens.map(t => t.type);
        expect(types).toEqual([
            TokenType.SELECT,
            TokenType.IDENTIFIER,  // user_id
            TokenType.COMMA, // ,
            TokenType.IDENTIFIER,  // status
            TokenType.FROM,
            TokenType.IDENTIFIER,  // users
            TokenType.WHERE,
            TokenType.IDENTIFIER,  // status
            TokenType.OPERATOR,    // =
            TokenType.STRING_LITERAL, // active
            TokenType.EOF,
        ]);
    });

    test("tokenizes SELECT * FROM table", () => {
        const lexer = new Lexer("SELECT * FROM users");
        const tokens = lexer.tokenize();
        const types = tokens.map(t => t.type);
        expect(types).toEqual([
            TokenType.SELECT,
            TokenType.OPERATOR, // *
            TokenType.FROM,
            TokenType.IDENTIFIER, // users
            TokenType.EOF,
        ]);
    });

    test("tokenizes complex WHERE with AND and OR", () => {
        const sql = "SELECT * FROM t WHERE a = 1 AND b = 'x' OR c > 10";
        const lexer = new Lexer(sql);
        const tokens = lexer.tokenize();
        const types = tokens.map(t => t.type);
        expect(types).toEqual([
            TokenType.SELECT,
            TokenType.OPERATOR,       // *
            TokenType.FROM,
            TokenType.IDENTIFIER,     // t
            TokenType.WHERE,
            TokenType.IDENTIFIER,     // a
            TokenType.OPERATOR,       // =
            TokenType.NUMBER_LITERAL, // 1
            TokenType.AND,
            TokenType.IDENTIFIER,     // b
            TokenType.OPERATOR,       // =
            TokenType.STRING_LITERAL, // x
            TokenType.OR,
            TokenType.IDENTIFIER,     // c
            TokenType.OPERATOR,       // >
            TokenType.NUMBER_LITERAL, // 10
            TokenType.EOF,
        ]);
    });

    test("tokenize stops on ERROR token", () => {
        const lexer = new Lexer("SELECT ! FROM");
        const tokens = lexer.tokenize();
        const last = tokens[tokens.length - 1];
        expect(last!.type).toBe(TokenType.ERROR);
    });

    // ─── Edge Cases & Adversarial Inputs ─────────────────────────────────

    test("handles multiple consecutive commas", () => {
        const lexer = new Lexer(",,");
        const t1 = lexer.nextToken();
        const t2 = lexer.nextToken();
        expect(t1.type).toBe(TokenType.COMMA);
        expect(t2.type).toBe(TokenType.COMMA);
    });

    test("handles operator immediately after identifier (no space)", () => {
        const lexer = new Lexer("status='active'");
        const t1 = lexer.nextToken();
        const t2 = lexer.nextToken();
        const t3 = lexer.nextToken();
        expect(t1.type).toBe(TokenType.IDENTIFIER);
        expect(t1.value).toBe("status");
        expect(t2.type).toBe(TokenType.OPERATOR);
        expect(t2.value).toBe("=");
        expect(t3.type).toBe(TokenType.STRING_LITERAL);
        expect(t3.value).toBe("active");
    });

    test("handles number immediately after operator", () => {
        const lexer = new Lexer(">100");
        const t1 = lexer.nextToken();
        const t2 = lexer.nextToken();
        expect(t1.type).toBe(TokenType.OPERATOR);
        expect(t1.value).toBe(">");
        expect(t2.type).toBe(TokenType.NUMBER_LITERAL);
        expect(t2.value).toBe("100");
    });

    test("multiline SQL with mixed indentation tokenizes correctly", () => {
        const sql = `SELECT
  user_id,
  status
FROM
  users
WHERE
  status = 'active'`;
        const lexer = new Lexer(sql);
        const tokens = lexer.tokenize();
        const values = tokens.map(t => t.value);
        expect(values).toEqual([
            "select", "user_id", ",", "status",
            "from", "users",
            "where", "status", "=", "active",
            "",
        ]);
    });
});
