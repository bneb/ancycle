export interface FormalProvable {
    toSmtLib(): string;
}

export abstract class Expr implements FormalProvable {
    abstract toSmtLib(): string;
}

export class Identifier extends Expr {
    constructor(public name: string) {
        super();
    }

    toSmtLib(): string {
        return this.name;
    }
}

export class QualifiedIdentifier extends Expr {
    constructor(public table: string, public column: string) {
        super();
    }

    toSmtLib(): string {
        // For Z3, we only care about the column name (the table is for DAG resolution)
        return this.column;
    }
}

export class StringLiteral extends Expr {
    constructor(public value: string) {
        super();
    }

    toSmtLib(): string {
        return `"${this.value}"`;
    }
}

export class NumberLiteral extends Expr {
    constructor(public value: number) {
        super();
    }

    toSmtLib(): string {
        return this.value.toString();
    }
}

export class BinaryExpr extends Expr {
    constructor(
        public left: Expr,
        public operator: string,
        public right: Expr
    ) {
        super();
    }

    toSmtLib(): string {
        let smtOp = this.operator;
        if (smtOp === '=') smtOp = '=';
        else if (smtOp === '!=') smtOp = 'distinct';
        else if (smtOp === 'AND') smtOp = 'and';
        else if (smtOp === 'OR') smtOp = 'or';

        return `(${smtOp} ${this.left.toSmtLib()} ${this.right.toSmtLib()})`;
    }
}

export class UnaryExpr extends Expr {
    constructor(public operator: string, public operand: Expr) {
        super();
    }

    toSmtLib(): string {
        if (this.operator === 'NOT') return `(not ${this.operand.toSmtLib()})`;
        if (this.operator === 'IS NULL') return `(= ${this.operand.toSmtLib()} nil)`;
        if (this.operator === 'IS NOT NULL') return `(distinct ${this.operand.toSmtLib()} nil)`;
        return `(${this.operator} ${this.operand.toSmtLib()})`;
    }
}

export class FunctionCall extends Expr {
    constructor(public name: string, public args: Expr[]) {
        super();
    }

    toSmtLib(): string {
        // Aggregate/scalar functions are opaque to Z3
        const argStr = this.args.map(a => a.toSmtLib()).join(' ');
        return `(${this.name} ${argStr})`;
    }
}

export class AliasedExpr extends Expr {
    constructor(public expr: Expr, public alias: string) {
        super();
    }

    toSmtLib(): string {
        return this.expr.toSmtLib();
    }
}

export class StarExpr extends Expr {
    toSmtLib(): string {
        return "*";
    }
}

export class NullLiteral extends Expr {
    toSmtLib(): string {
        return "nil";
    }
}

export class CaseExpr extends Expr {
    constructor(
        public whens: { condition: Expr; result: Expr }[],
        public elseResult: Expr | null
    ) {
        super();
    }

    toSmtLib(): string {
        // CASE is opaque to Z3 constraint extraction
        return "(case)";
    }
}

export class ParenExpr extends Expr {
    constructor(public inner: Expr) {
        super();
    }

    toSmtLib(): string {
        return this.inner.toSmtLib();
    }
}

export class SubqueryExpr extends Expr {
    constructor(public stmt: SelectStmt) {
        super();
    }

    toSmtLib(): string {
        return "(subquery)";
    }
}

export interface JoinClause {
    joinType: string; // 'INNER' | 'LEFT' | 'RIGHT' | 'CROSS'
    table: string | null; // null if subquery
    alias: string | null;
    subquery: SelectStmt | null;
    onCondition: Expr | null;
}

export interface OrderByItem {
    expr: Expr;
    direction: 'ASC' | 'DESC';
}

export class SelectStmt {
    constructor(
        public columns: Expr[],
        public fromTable: string | null,
        public fromAlias: string | null,
        public joins: JoinClause[],
        public whereClause: Expr | null,
        public groupBy: Expr[],
        public having: Expr | null,
        public orderBy: OrderByItem[],
        public limit: number | null,
    ) {}
}
