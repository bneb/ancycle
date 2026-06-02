import { Expr, Identifier, QualifiedIdentifier, BinaryExpr, StringLiteral, NumberLiteral, UnaryExpr, ParenExpr, IntervalExpr, FunctionCall } from './ast';

export type SmtType = 'String' | 'Int' | 'Real' | 'Bool';

export function inferTypes(expr: Expr): Record<string, SmtType> {
    const vars: Record<string, SmtType> = {};

    function visit(node: Expr, contextType: SmtType | null = null) {
        if (node instanceof ParenExpr) {
            visit(node.inner, contextType);
        } else if (node instanceof BinaryExpr) {
            // Handle NOT operator which is parsed as BinaryExpr(NumberLiteral(0), 'NOT', operand)
            if (node.operator.toUpperCase() === 'NOT') {
                visit(node.right, 'Bool');
                return;
            }

            // Check if one side is a literal
            if (node.left instanceof Identifier || node.left instanceof QualifiedIdentifier) {
                if (node.right instanceof StringLiteral) {
                    visit(node.left, 'String');
                    visit(node.right, null);
                    return;
                } else if (node.right instanceof NumberLiteral) {
                    const numType = Number.isInteger(node.right.value) ? 'Int' : 'Real';
                    visit(node.left, numType);
                    visit(node.right, null);
                    return;
                } else if (node.right instanceof IntervalExpr || node.right instanceof FunctionCall) {
                    if (node.right instanceof FunctionCall && ['DATE_ADD', 'DATE_SUB', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(node.right.name.toUpperCase())) {
                        visit(node.left, 'Int');
                        visit(node.right, null);
                        return;
                    }
                    if (node.right instanceof IntervalExpr) {
                        visit(node.left, 'Int');
                        visit(node.right, null);
                        return;
                    }
                }
            } else if (node.right instanceof Identifier || node.right instanceof QualifiedIdentifier) {
                if (node.left instanceof StringLiteral) {
                    visit(node.right, 'String');
                    visit(node.left, null);
                    return;
                } else if (node.left instanceof NumberLiteral) {
                    const numType = Number.isInteger(node.left.value) ? 'Int' : 'Real';
                    visit(node.right, numType);
                    visit(node.left, null);
                    return;
                } else if (node.left instanceof IntervalExpr || node.left instanceof FunctionCall) {
                    if (node.left instanceof FunctionCall && ['DATE_ADD', 'DATE_SUB', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(node.left.name.toUpperCase())) {
                        visit(node.right, 'Int');
                        visit(node.left, null);
                        return;
                    }
                    if (node.left instanceof IntervalExpr) {
                        visit(node.right, 'Int');
                        visit(node.left, null);
                        return;
                    }
                }
            }

            // If it's a logical operator AND/OR, the children are essentially booleans (or predicates)
            if (node.operator.toUpperCase() === 'AND' || node.operator.toUpperCase() === 'OR') {
                visit(node.left, 'Bool');
                visit(node.right, 'Bool');
                return;
            }

            // LIKE operator implies strings
            if (node.operator.toUpperCase() === 'LIKE') {
                visit(node.left, 'String');
                visit(node.right, 'String');
                return;
            }

            // Otherwise, visit normally
            visit(node.left, null);
            visit(node.right, null);
        } else if (node instanceof UnaryExpr) {
            if (node.operator.toUpperCase() === 'NOT') {
                visit(node.operand, 'Bool');
            } else {
                visit(node.operand, null);
            }
        } else if (node instanceof Identifier) {
            if (!vars[node.name]) {
                vars[node.name] = contextType || 'String';
            }
        } else if (node instanceof QualifiedIdentifier) {
            if (!vars[node.column]) {
                vars[node.column] = contextType || 'String';
            }
        } else if (node instanceof FunctionCall) {
            const uName = node.name.toUpperCase();
            if (!['DATE_ADD', 'DATE_SUB', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'].includes(uName)) {
                const varName = `__fn_${node.name}`;
                if (!vars[varName]) {
                    vars[varName] = contextType || 'String';
                }
            }
            // Visit arguments!
            const argType = ['DATE_ADD', 'DATE_SUB'].includes(uName) ? 'Int' : null;
            for (const arg of node.args) {
                visit(arg, argType);
            }
        }
    }

    visit(expr, 'Bool'); // The root of a WHERE clause is evaluated as a boolean predicate
    
    return vars;
}
