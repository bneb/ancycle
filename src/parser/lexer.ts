export enum TokenType {
    // Keywords
    SELECT,
    FROM,
    WHERE,
    AND,
    OR,
    AS,
    ON,
    JOIN,
    INNER,
    LEFT,
    RIGHT,
    OUTER,
    CROSS,
    GROUP,
    BY,
    HAVING,
    ORDER,
    ASC,
    DESC,
    LIMIT,
    IN,
    NOT,
    IS,
    NULL_KW,
    BETWEEN,
    CASE,
    WHEN,
    THEN,
    ELSE,
    END,
    LIKE,

    // Literals & Identifiers
    IDENTIFIER,
    STRING_LITERAL,
    NUMBER_LITERAL,

    // Punctuation
    COMMA,       // ,
    DOT,         // .
    LPAREN,      // (
    RPAREN,      // )

    // Operators
    OPERATOR,    // = != > < >= <= * + - /

    // Control
    EOF,
    ERROR
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
}

const KEYWORDS: Record<string, TokenType> = {
    'select': TokenType.SELECT,
    'from': TokenType.FROM,
    'where': TokenType.WHERE,
    'and': TokenType.AND,
    'or': TokenType.OR,
    'as': TokenType.AS,
    'on': TokenType.ON,
    'join': TokenType.JOIN,
    'inner': TokenType.INNER,
    'left': TokenType.LEFT,
    'right': TokenType.RIGHT,
    'outer': TokenType.OUTER,
    'cross': TokenType.CROSS,
    'group': TokenType.GROUP,
    'by': TokenType.BY,
    'having': TokenType.HAVING,
    'order': TokenType.ORDER,
    'asc': TokenType.ASC,
    'desc': TokenType.DESC,
    'limit': TokenType.LIMIT,
    'in': TokenType.IN,
    'not': TokenType.NOT,
    'is': TokenType.IS,
    'null': TokenType.NULL_KW,
    'between': TokenType.BETWEEN,
    'case': TokenType.CASE,
    'when': TokenType.WHEN,
    'then': TokenType.THEN,
    'else': TokenType.ELSE,
    'end': TokenType.END,
    'like': TokenType.LIKE,
};

export class Lexer {
    private input: string;
    private pos: number = 0;
    private line: number = 1;
    private col: number = 1;

    constructor(input: string) {
        this.input = input;
    }

    private peek(): string | null {
        return this.pos < this.input.length ? this.input[this.pos] : null;
    }

    private advance(): string | null {
        if (this.pos >= this.input.length) return null;
        const char = this.input[this.pos++];
        if (char === '\n') {
            this.line++;
            this.col = 1;
        } else {
            this.col++;
        }
        return char;
    }

    private skipWhitespace() {
        let char = this.peek();
        while (char !== null && (char === ' ' || char === '\n' || char === '\r' || char === '\t')) {
            this.advance();
            char = this.peek();
        }
    }

    private isAlpha(char: string | null): boolean {
        return char !== null && /^[a-zA-Z_]$/.test(char);
    }

    private isAlphaNumeric(char: string | null): boolean {
        return char !== null && /^[a-zA-Z0-9_]$/.test(char);
    }

    private isDigit(char: string | null): boolean {
        return char !== null && /^[0-9]$/.test(char);
    }

    public nextToken(): Token {
        this.skipWhitespace();

        let char = this.advance();
        if (char === null) {
            return { type: TokenType.EOF, value: '', line: this.line, col: this.col };
        }

        const startLine = this.line;
        const startCol = this.col - 1;

        // Punctuation
        if (char === ',') {
            return { type: TokenType.COMMA, value: char, line: startLine, col: startCol };
        }
        if (char === '.') {
            return { type: TokenType.DOT, value: char, line: startLine, col: startCol };
        }
        if (char === '(') {
            return { type: TokenType.LPAREN, value: char, line: startLine, col: startCol };
        }
        if (char === ')') {
            return { type: TokenType.RPAREN, value: char, line: startLine, col: startCol };
        }

        // Operators
        if (char === '*' || char === '+' || char === '-' || char === '/') {
            return { type: TokenType.OPERATOR, value: char, line: startLine, col: startCol };
        }
        if (char === '=') {
            return { type: TokenType.OPERATOR, value: char, line: startLine, col: startCol };
        }
        if (char === '<' || char === '>') {
            let next = this.peek();
            if (next === '=' || (char === '<' && next === '>')) {
                const op = char + this.advance()!;
                return { type: TokenType.OPERATOR, value: op === '<>' ? '!=' : op, line: startLine, col: startCol };
            }
            return { type: TokenType.OPERATOR, value: char, line: startLine, col: startCol };
        }
        if (char === '!') {
            let next = this.peek();
            if (next === '=') {
                return { type: TokenType.OPERATOR, value: char + this.advance()!, line: startLine, col: startCol };
            }
            return { type: TokenType.ERROR, value: char, line: startLine, col: startCol };
        }

        // String Literal
        if (char === "'") {
            let val = '';
            while (this.peek() !== "'" && this.peek() !== null) {
                val += this.advance();
            }
            if (this.peek() === "'") {
                this.advance(); // consume closing quote
            } else {
                return { type: TokenType.ERROR, value: "Unterminated string literal", line: startLine, col: startCol };
            }
            return { type: TokenType.STRING_LITERAL, value: val, line: startLine, col: startCol };
        }

        // Number Literal
        if (this.isDigit(char)) {
            let val = char;
            while (this.isDigit(this.peek()) || this.peek() === '.') {
                val += this.advance();
            }
            return { type: TokenType.NUMBER_LITERAL, value: val, line: startLine, col: startCol };
        }

        // Identifier or Keyword
        if (this.isAlpha(char)) {
            let val = char;
            while (this.isAlphaNumeric(this.peek())) {
                val += this.advance();
            }
            const lowerVal = val.toLowerCase();
            if (KEYWORDS[lowerVal] !== undefined) {
                return { type: KEYWORDS[lowerVal]!, value: lowerVal, line: startLine, col: startCol };
            }
            return { type: TokenType.IDENTIFIER, value: val, line: startLine, col: startCol };
        }

        return { type: TokenType.ERROR, value: char, line: startLine, col: startCol };
    }

    public tokenize(): Token[] {
        const tokens: Token[] = [];
        let token: Token;
        do {
            token = this.nextToken();
            tokens.push(token);
        } while (token.type !== TokenType.EOF && token.type !== TokenType.ERROR);
        return tokens;
    }
}
