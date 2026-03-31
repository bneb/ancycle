import { Lexer, type Token, TokenType } from './lexer';
import {
    SelectStmt, Identifier, QualifiedIdentifier, type Expr, BinaryExpr,
    StringLiteral, NumberLiteral, FunctionCall, AliasedExpr, StarExpr,
    CaseExpr, ParenExpr, SubqueryExpr, NullLiteral,
    type JoinClause, type OrderByItem
} from './ast';

export class Parser {
    private tokens: Token[];
    private pos: number = 0;

    constructor(lexer: Lexer) {
        this.tokens = lexer.tokenize();
    }

    private peek(): Token {
        return this.pos < this.tokens.length ? this.tokens[this.pos]! : this.tokens[this.tokens.length - 1]!;
    }

    private advance(): Token {
        if (this.pos < this.tokens.length) {
            return this.tokens[this.pos++]!;
        }
        return this.tokens[this.tokens.length - 1]!;
    }

    private match(type: TokenType): Token {
        const token = this.peek();
        if (token.type === type) {
            return this.advance();
        }
        throw new Error(`Parse Error [Line ${token.line}, Col ${token.col}]: Expected ${TokenType[type]}, found ${TokenType[token.type]} ('${token.value}')`);
    }

    private check(type: TokenType): boolean {
        return this.peek().type === type;
    }

    private checkValue(type: TokenType, value: string): boolean {
        const t = this.peek();
        return t.type === type && t.value === value;
    }

    private isAtEnd(): boolean {
        return this.check(TokenType.EOF) || this.check(TokenType.ERROR);
    }

    // ─── SELECT Statement ────────────────────────────────────────────────

    public parseSelectStatement(): SelectStmt {
        this.match(TokenType.SELECT);

        // Parse SELECT list
        const columns = this.parseSelectList();

        // Parse FROM
        let fromTable: string | null = null;
        let fromAlias: string | null = null;
        if (this.check(TokenType.FROM)) {
            this.advance();
            if (this.check(TokenType.LPAREN)) {
                // Subquery in FROM — skip for fromTable extraction
                this.advance(); // (
                this.parseSelectStatement(); // consume inner select
                this.match(TokenType.RPAREN); // )
            } else {
                fromTable = this.match(TokenType.IDENTIFIER).value;
            }
            // Optional alias
            fromAlias = this.tryParseAlias();
        }

        // Parse JOINs
        const joins = this.parseJoinClauses();

        // Parse WHERE
        let whereClause: Expr | null = null;
        if (this.check(TokenType.WHERE)) {
            this.advance();
            whereClause = this.parseExpression();
        }

        // Parse GROUP BY
        const groupBy = this.parseGroupByClause();

        // Parse HAVING
        let having: Expr | null = null;
        if (this.check(TokenType.HAVING)) {
            this.advance();
            having = this.parseExpression();
        }

        // Parse ORDER BY
        const orderBy = this.parseOrderByClause();

        // Parse LIMIT
        let limit: number | null = null;
        if (this.check(TokenType.LIMIT)) {
            this.advance();
            limit = parseFloat(this.match(TokenType.NUMBER_LITERAL).value);
        }

        return new SelectStmt(columns, fromTable, fromAlias, joins, whereClause, groupBy, having, orderBy, limit);
    }

    // ─── SELECT List ─────────────────────────────────────────────────────

    private parseSelectList(): Expr[] {
        const columns: Expr[] = [];

        if (this.check(TokenType.OPERATOR) && this.peek().value === '*') {
            columns.push(new StarExpr());
            this.advance();
            return columns;
        }

        columns.push(this.parseSelectItem());
        while (this.check(TokenType.COMMA)) {
            this.advance(); // consume comma
            columns.push(this.parseSelectItem());
        }

        return columns;
    }

    private parseSelectItem(): Expr {
        let expr = this.parseExpression();

        // Check for AS alias
        if (this.check(TokenType.AS)) {
            this.advance();
            const alias = this.match(TokenType.IDENTIFIER).value;
            expr = new AliasedExpr(expr, alias);
        }

        return expr;
    }

    // ─── Alias ───────────────────────────────────────────────────────────

    private tryParseAlias(): string | null {
        if (this.check(TokenType.AS)) {
            this.advance();
            return this.match(TokenType.IDENTIFIER).value;
        }
        // Implicit alias: identifier that isn't a keyword
        if (this.check(TokenType.IDENTIFIER)) {
            return this.advance().value;
        }
        return null;
    }

    // ─── JOIN ────────────────────────────────────────────────────────────

    private parseJoinClauses(): JoinClause[] {
        const joins: JoinClause[] = [];

        while (this.isJoinKeyword()) {
            joins.push(this.parseOneJoin());
        }

        return joins;
    }

    private isJoinKeyword(): boolean {
        return this.check(TokenType.JOIN) ||
               this.check(TokenType.INNER) ||
               this.check(TokenType.LEFT) ||
               this.check(TokenType.RIGHT) ||
               this.check(TokenType.CROSS);
    }

    private parseOneJoin(): JoinClause {
        let joinType = 'INNER';

        if (this.check(TokenType.INNER)) {
            this.advance();
            joinType = 'INNER';
        } else if (this.check(TokenType.LEFT)) {
            this.advance();
            if (this.check(TokenType.OUTER)) this.advance();
            joinType = 'LEFT';
        } else if (this.check(TokenType.RIGHT)) {
            this.advance();
            if (this.check(TokenType.OUTER)) this.advance();
            joinType = 'RIGHT';
        } else if (this.check(TokenType.CROSS)) {
            this.advance();
            joinType = 'CROSS';
        }

        this.match(TokenType.JOIN);

        let table: string | null = null;
        let alias: string | null = null;
        let subquery: SelectStmt | null = null;

        if (this.check(TokenType.LPAREN)) {
            // Subquery join
            this.advance(); // (
            subquery = this.parseSelectStatement();
            this.match(TokenType.RPAREN); // )
        } else {
            table = this.match(TokenType.IDENTIFIER).value;
        }

        alias = this.tryParseAlias();

        let onCondition: Expr | null = null;
        if (this.check(TokenType.ON)) {
            this.advance();
            onCondition = this.parseExpression();
        }

        return { joinType, table, alias, subquery, onCondition };
    }

    // ─── GROUP BY ────────────────────────────────────────────────────────

    private parseGroupByClause(): Expr[] {
        if (!this.check(TokenType.GROUP)) return [];
        this.advance(); // GROUP
        this.match(TokenType.BY);

        const exprs: Expr[] = [];
        exprs.push(this.parseExpression());
        while (this.check(TokenType.COMMA)) {
            this.advance();
            exprs.push(this.parseExpression());
        }
        return exprs;
    }

    // ─── ORDER BY ────────────────────────────────────────────────────────

    private parseOrderByClause(): OrderByItem[] {
        if (!this.check(TokenType.ORDER)) return [];
        this.advance(); // ORDER
        this.match(TokenType.BY);

        const items: OrderByItem[] = [];
        items.push(this.parseOrderByItem());
        while (this.check(TokenType.COMMA)) {
            this.advance();
            items.push(this.parseOrderByItem());
        }
        return items;
    }

    private parseOrderByItem(): OrderByItem {
        const expr = this.parseExpression();
        let direction: 'ASC' | 'DESC' = 'ASC';
        if (this.check(TokenType.ASC)) {
            this.advance();
            direction = 'ASC';
        } else if (this.check(TokenType.DESC)) {
            this.advance();
            direction = 'DESC';
        }
        return { expr, direction };
    }

    // ─── Expression Parsing (Precedence Climbing) ────────────────────────

    // Level 1: OR
    private parseExpression(): Expr {
        let left = this.parseAndExpression();

        while (this.check(TokenType.OR)) {
            this.advance();
            const right = this.parseAndExpression();
            left = new BinaryExpr(left, 'OR', right);
        }

        return left;
    }

    // Level 2: AND
    private parseAndExpression(): Expr {
        let left = this.parseComparisonExpression();

        while (this.check(TokenType.AND)) {
            this.advance();
            const right = this.parseComparisonExpression();
            left = new BinaryExpr(left, 'AND', right);
        }

        return left;
    }

    // Level 3: =, !=, <, >, >=, <=
    private parseComparisonExpression(): Expr {
        let left = this.parseAddSubExpression();

        while (this.check(TokenType.OPERATOR)) {
            const op = this.advance().value;
            const right = this.parseAddSubExpression();
            left = new BinaryExpr(left, op, right);
        }

        return left;
    }

    // Level 4: +, -
    private parseAddSubExpression(): Expr {
        let left = this.parsePrimary();

        while (this.check(TokenType.OPERATOR) && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.advance().value;
            const right = this.parsePrimary();
            left = new BinaryExpr(left, op, right);
        }

        return left;
    }

    // ─── Primary Expressions ─────────────────────────────────────────────

    private parsePrimary(): Expr {
        const token = this.peek();

        // CASE expression
        if (token.type === TokenType.CASE) {
            return this.parseCaseExpression();
        }

        // NULL literal
        if (token.type === TokenType.NULL_KW) {
            this.advance();
            return new NullLiteral();
        }

        // Parenthesized expression or subquery
        if (token.type === TokenType.LPAREN) {
            this.advance(); // (
            if (this.check(TokenType.SELECT)) {
                const subquery = this.parseSelectStatement();
                this.match(TokenType.RPAREN);
                return new SubqueryExpr(subquery);
            }
            const inner = this.parseExpression();
            this.match(TokenType.RPAREN);
            return new ParenExpr(inner);
        }

        // NOT
        if (token.type === TokenType.NOT) {
            this.advance();
            // Could be standalone NOT or part of IS NOT NULL
            // Handled here as unary prefix
            const operand = this.parseComparisonExpression();
            return new BinaryExpr(new NumberLiteral(0), 'NOT', operand);
        }

        // Star (used in COUNT(*) etc.)
        if (token.type === TokenType.OPERATOR && token.value === '*') {
            this.advance();
            return new StarExpr();
        }

        // Identifier — could be plain, qualified (dot), or function call
        if (token.type === TokenType.IDENTIFIER) {
            const name = this.advance().value;

            // Function call: identifier followed by (
            if (this.check(TokenType.LPAREN)) {
                return this.parseFunctionArgs(name);
            }

            // Qualified identifier: identifier followed by .
            if (this.check(TokenType.DOT)) {
                this.advance(); // consume .
                // Could be table.column or table.*
                if (this.check(TokenType.OPERATOR) && this.peek().value === '*') {
                    this.advance();
                    return new QualifiedIdentifier(name, '*');
                }
                const col = this.match(TokenType.IDENTIFIER).value;
                return new QualifiedIdentifier(name, col);
            }

            return new Identifier(name);
        }

        // Aggregate keywords used as function names (SUM, COUNT, AVG, MIN, MAX)
        if (this.isAggregateFunctionKeyword(token)) {
            const name = this.advance().value.toUpperCase();
            return this.parseFunctionArgs(name);
        }

        // String literal
        if (token.type === TokenType.STRING_LITERAL) {
            return new StringLiteral(this.advance().value);
        }

        // Number literal
        if (token.type === TokenType.NUMBER_LITERAL) {
            return new NumberLiteral(parseFloat(this.advance().value));
        }

        throw new Error(`Parse Error [Line ${token.line}, Col ${token.col}]: Unexpected token '${token.value}' (${TokenType[token.type]})`);
    }

    // ─── Function Call ───────────────────────────────────────────────────

    private parseFunctionArgs(name: string): FunctionCall {
        this.match(TokenType.LPAREN);
        const args: Expr[] = [];

        if (!this.check(TokenType.RPAREN)) {
            args.push(this.parseExpression());
            while (this.check(TokenType.COMMA)) {
                this.advance();
                args.push(this.parseExpression());
            }
        }

        this.match(TokenType.RPAREN);
        return new FunctionCall(name, args);
    }

    private isAggregateFunctionKeyword(token: Token): boolean {
        // These SQL keywords are also commonly used as function names
        // We check if they're followed by ( to disambiguate
        if (token.type === TokenType.IDENTIFIER) return false;
        const name = token.value;
        if (['sum', 'count', 'avg', 'min', 'max'].includes(name)) {
            // Peek ahead to see if it's a function call
            const next = this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1] : null;
            return next !== null && next!.type === TokenType.LPAREN;
        }
        return false;
    }

    // ─── CASE Expression ─────────────────────────────────────────────────

    private parseCaseExpression(): CaseExpr {
        this.match(TokenType.CASE);
        const whens: { condition: Expr; result: Expr }[] = [];

        while (this.check(TokenType.WHEN)) {
            this.advance(); // WHEN
            const condition = this.parseExpression();
            this.match(TokenType.THEN);
            const result = this.parseExpression();
            whens.push({ condition, result });
        }

        let elseResult: Expr | null = null;
        if (this.check(TokenType.ELSE)) {
            this.advance();
            elseResult = this.parseExpression();
        }

        this.match(TokenType.END);
        return new CaseExpr(whens, elseResult);
    }
}
