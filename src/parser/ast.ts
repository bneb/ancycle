export interface FormalProvable {
    toSmtLib(): string;
}

export abstract class Expr implements FormalProvable {
    abstract toSmtLib(): string;
}

export class IntervalExpr extends Expr {
    constructor(public value: number, public unit: string) {
        super();
    }

    toSmtLib(): string {
        let multiplier = 1;
        const u = this.unit.toUpperCase();
        if (u === 'DAY' || u === 'DAYS') multiplier = 86400;
        else if (u === 'HOUR' || u === 'HOURS') multiplier = 3600;
        else if (u === 'MINUTE' || u === 'MINUTES') multiplier = 60;
        else if (u === 'MONTH' || u === 'MONTHS') multiplier = 2592000;
        else if (u === 'YEAR' || u === 'YEARS') multiplier = 31536000;
        return (this.value * multiplier).toString();
    }
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

        if (smtOp === 'LIKE') {
            if (this.right instanceof StringLiteral) {
                const val = this.right.value;
                const startsWithPct = val.startsWith('%');
                const endsWithPct = val.endsWith('%');
                const coreVal = val.replace(/^%+|%+$/g, '');
                const z3Val = `"${coreVal}"`;
                
                if (startsWithPct && endsWithPct) {
                    return `(str.contains ${this.left.toSmtLib()} ${z3Val})`;
                } else if (startsWithPct) {
                    return `(str.suffixof ${z3Val} ${this.left.toSmtLib()})`;
                } else if (endsWithPct) {
                    return `(str.prefixof ${z3Val} ${this.left.toSmtLib()})`;
                } else {
                    return `(= ${this.left.toSmtLib()} ${z3Val})`;
                }
            }
            // Fallback for LIKE with variable
            return `(str.contains ${this.left.toSmtLib()} ${this.right.toSmtLib()})`;
        }

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
        const uName = this.name.toUpperCase();
        if (uName === 'CURRENT_DATE' || uName === 'CURRENT_TIMESTAMP') {
            return "0"; // Unix epoch zero for relative comparison
        }
        if (uName === 'DATE_SUB' && this.args.length === 2) {
            return `(- ${this.args[0].toSmtLib()} ${this.args[1].toSmtLib()})`;
        }
        if (uName === 'DATE_ADD' && this.args.length === 2) {
            return `(+ ${this.args[0].toSmtLib()} ${this.args[1].toSmtLib()})`;
        }
        
        // Map all unknown functions to a free variable for graceful degradation
        // Note: arguments are omitted in the variable name for simplicity,
        // but could be hashed if we wanted strict argument tracking.
        return `__fn_${this.name}`;
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
        let out = this.elseResult ? this.elseResult.toSmtLib() : '"NULL"';
        for (let i = this.whens.length - 1; i >= 0; i--) {
            const w = this.whens[i];
            out = `(ite ${w.condition.toSmtLib()} ${w.result.toSmtLib()} ${out})`;
        }
        return out;
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

export interface CTE {
    name: string;
    stmt: SelectStmt;
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
        public withClauses?: CTE[]
    ) {}
}
