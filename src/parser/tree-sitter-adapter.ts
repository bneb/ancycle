import { Parser, Language } from 'web-tree-sitter';
import { join } from 'path';
import { 
    SelectStmt, Expr, Identifier, QualifiedIdentifier, 
    StringLiteral, NumberLiteral, BinaryExpr, UnaryExpr, FunctionCall,
    JoinClause, ParenExpr, NullLiteral
} from './ast';

export class TreeSitterAdapter {
    private static parser: any = null;

    static async init() {
        if (this.parser) return;
        await Parser.init();
        this.parser = new Parser();
        const Lang = await Language.load(join(import.meta.dirname, 'tree-sitter-sql.wasm'));
        this.parser.setLanguage(Lang);
    }

    static parseSelectStatement(sql: string): SelectStmt {
        if (!this.parser) {
            throw new Error("TreeSitterAdapter not initialized. Call init() first.");
        }
        
        // Very basic dialect preprocessing to improve tree-sitter-sql compatibility
        let preprocessed = sql.replace(/`/g, '"');
        // Fix INTERVAL without quotes (e.g. INTERVAL 1 MONTH -> INTERVAL '1' MONTH)
        preprocessed = preprocessed.replace(/\bINTERVAL\s+(\d+)\s+([a-zA-Z]+)\b/gi, "INTERVAL '$1' $2");
        const tree = this.parser.parse(preprocessed);
        
        let fromTable: string | null = null;
        let fromAlias: string | null = null;
        let whereClause: Expr | null = null;
        let joins: JoinClause[] = [];
        let columns: Expr[] = [];
        let withClauses: any = undefined;

        // Missing SELECT check
        if (!tree.rootNode.descendantsOfType('keyword_select').length) {
            throw new Error("Parse Error: Missing SELECT keyword");
        }

        if (tree.rootNode.isMissing && !tree.rootNode.descendantsOfType('statement').length) {
            throw new Error("Parse Error: Invalid SQL syntax");
        }

        // CTEs
        const cteNodes = tree.rootNode.descendantsOfType('cte');
        if (cteNodes.length > 0) {
            withClauses = [];
            for (const cte of cteNodes) {
                const nameNode = cte.children.find(c => c.type === 'identifier');
                const stmtNode = cte.children.find(c => c.type === 'statement');
                if (nameNode && stmtNode) {
                    withClauses.push({
                        name: nameNode.text,
                        stmt: this.parseSelectStatement(stmtNode.text)
                    });
                }
            }
        }

        // Columns
        const selectExprs = tree.rootNode.descendantsOfType('select_expression');
        if (selectExprs.length > 0) {
            // A select_expression has terms as direct children (comma separated)
            const terms = selectExprs[0].children.filter(c => c.type === 'term');
            for (const term of terms) {
                columns.push(this.buildExpr(term));
            }
        } else {
            const allFields = tree.rootNode.descendantsOfType('all_fields');
            if (allFields.length > 0) {
                columns.push(new Identifier('*'));
            }
        }

        // Traverse to find 'from' block
        const mainSelectNodes = tree.rootNode.children.filter(c => c.type === 'statement');
        const mainStmt = mainSelectNodes[mainSelectNodes.length - 1] || tree.rootNode;
        // The from clause for the main statement is a direct child of mainStmt (or a child of a select statement depending on the grammar)
        let mainFrom = mainStmt.children.find(c => c.type === 'from');
        if (!mainFrom) {
            // If it's wrapped, find the first from that isn't inside a CTE
            const allFroms = mainStmt.descendantsOfType('from');
            // The one whose parent is the mainStmt, or parent is a select that is child of mainStmt
            mainFrom = allFroms.find(f => {
                let p = f.parent;
                while (p) {
                    if (p.type === 'cte' || p.type === 'with') return false;
                    if (p.equals(mainStmt)) return true;
                    p = p.parent;
                }
                return true;
            });
        }

        if (mainFrom) {
            // Main relation
            const relation = mainFrom.childForFieldName('relation') || mainFrom.children.find(c => c.type === 'relation');
            if (relation) {
                fromTable = this.extractIdentifier(relation);
                const aliasNode = relation.childForFieldName('alias');
                if (aliasNode) {
                    fromAlias = aliasNode.text;
                }
            }

            // Joins
            const joinNodes = mainFrom.children.filter(c => c.type === 'join');
            for (const jNode of joinNodes) {
                const jRel = jNode.children.find(c => c.type === 'relation');
                let jTable = null;
                let jAlias = null;
                if (jRel) {
                    jTable = this.extractIdentifier(jRel);
                    const jAliasNode = jRel.childForFieldName('alias');
                    if (jAliasNode) jAlias = jAliasNode.text;
                }
                
                let onCondition: Expr | null = null;
                const predicate = jNode.childForFieldName('predicate');
                if (predicate) {
                    onCondition = this.buildExpr(predicate);
                }

                joins.push({
                    joinType: 'INNER',
                    table: jTable,
                    alias: jAlias,
                    subquery: null,
                    onCondition
                });
            }

            // Where
            const whereNode = mainFrom.children.find(c => c.type === 'where');
            if (whereNode) {
                const predicate = whereNode.childForFieldName('predicate');
                if (predicate) {
                    whereClause = this.buildExpr(predicate);
                }
            }
        }

        // Return the AST stub matching FormalProvable
        return new SelectStmt(columns, fromTable, fromAlias, joins, whereClause, [], null, [], null, withClauses);
    }

    private static extractIdentifier(node: any): string {
        const idNode = node.descendantsOfType('identifier')[0];
        return idNode ? idNode.text : node.text;
    }

    private static buildExpr(node: any): Expr {
        // Catch the term wrapping the interval and its unit alias (e.g. DAY, MONTH)
        if (node.type === 'term' && node.children.some((c:any) => c.type === 'interval')) {
            const intervalNode = node.children.find((c:any) => c.type === 'interval');
            const unitNode = node.children.find((c:any) => c.type === 'identifier');
            const numText = intervalNode.text.replace(/INTERVAL/i, '').trim().replace(/['"]/g, '');
            const num = Number(numText);
            const unit = unitNode ? unitNode.text.toUpperCase() : 'DAY';
            
            let seconds = num;
            if (unit === 'DAY' || unit === 'DAYS') seconds = num * 86400;
            if (unit === 'MONTH' || unit === 'MONTHS') seconds = num * 2592000;
            if (unit === 'YEAR' || unit === 'YEARS') seconds = num * 31536000;
            if (unit === 'HOUR' || unit === 'HOURS') seconds = num * 3600;
            if (unit === 'MINUTE' || unit === 'MINUTES') seconds = num * 60;
            
            return new NumberLiteral(seconds);
        }

        if (node.type === 'term') {
            const val = node.childForFieldName('value') || node.children[0];
            return this.buildExpr(val);
        }
        
        if (node.type === 'all_fields') {
            return new Identifier('*'); // StarExpr logic
        }

        if (node.type === 'binary_expression') {
            const left = this.buildExpr(node.childForFieldName('left'));
            const right = this.buildExpr(node.childForFieldName('right'));
            
            const operatorNode = node.childForFieldName('operator');
            let op = '=';
            if (operatorNode) {
                op = operatorNode.text.toUpperCase();
            } else {
                const opNode = node.children.find((c: any) => 
                    ['=', '!=', '<>', '>', '<', '>=', '<=', 'AND', 'OR', 'LIKE', 'IS', 'IS NOT'].includes(c.text.toUpperCase())
                );
                if (opNode) op = opNode.text.toUpperCase();
            }
            if (op === '<>') op = '!=';
            
            // Convert IS NULL / IS NOT NULL to UnaryExpr if the right side is a NullLiteral
            if (op === 'IS' && right instanceof NullLiteral) {
                return new UnaryExpr('IS NULL', left);
            }
            if (op === 'IS NOT' && right instanceof NullLiteral) {
                return new UnaryExpr('IS NOT NULL', left);
            }

            return new BinaryExpr(left, op, right);
        }

        if (node.type === 'unary_expression') {
            const operand = this.buildExpr(node.childForFieldName('operand') || node.children[1]);
            const op = node.children[0].text.toUpperCase();
            return new UnaryExpr(op, operand);
        }

        if (node.type === 'field' || node.type === 'identifier') {
            const objRef = node.childForFieldName('object_reference');
            const nameNode = node.childForFieldName('name') || node.children.find((c:any) => c.type === 'identifier') || node;
            
            if (objRef) {
                return new QualifiedIdentifier(objRef.text, nameNode.text);
            }
            return new Identifier(nameNode.text);
        }

        if (node.type === 'literal' || node.type === 'string' || node.type === 'integer' || node.type === 'float') {
            const text = node.text;
            if (node.children.some((c:any) => c.type === 'keyword_null') || text.toUpperCase() === 'NULL') {
                return new NullLiteral();
            }
            if (text.startsWith("'") || text.startsWith('"')) {
                return new StringLiteral(text.slice(1, -1));
            }
            if (!isNaN(Number(text))) {
                return new NumberLiteral(Number(text));
            }
        }
        
        if (node.type === 'invocation') {
            const nameNode = node.childForFieldName('function') || node.children.find((c:any) => c.type === 'object_reference' || c.type === 'identifier') || node;
            const name = nameNode.text;
            
            const params = node.children.filter((c:any) => c.type === 'parameter' || c.type === 'term');
            const args = params.map((p:any) => this.buildExpr(p));
            return new FunctionCall(name, args);
        }

        if (node.type === 'interval') {
            // e.g. INTERVAL '7'
            // We need to parse out the number and unit
            // Tree-sitter-sql parses `INTERVAL '7' DAY` as a term with `interval` and `identifier` (alias)
            // But we might be passed the `interval` node directly or the `term` node wrapper.
            const text = node.text.replace(/INTERVAL/i, '').trim().replace(/['"]/g, '');
            return new NumberLiteral(Number(text));
        }

        // Catch the term wrapping the interval and its unit alias (e.g. DAY, MONTH)
        if (node.type === 'term' && node.children.some((c:any) => c.type === 'interval')) {
            const intervalNode = node.children.find((c:any) => c.type === 'interval');
            const unitNode = node.children.find((c:any) => c.type === 'identifier');
            const numText = intervalNode.text.replace(/INTERVAL/i, '').trim().replace(/['"]/g, '');
            const num = Number(numText);
            const unit = unitNode ? unitNode.text.toUpperCase() : 'DAY';
            
            let seconds = num;
            if (unit === 'DAY' || unit === 'DAYS') seconds = num * 86400;
            if (unit === 'MONTH' || unit === 'MONTHS') seconds = num * 2592000;
            if (unit === 'YEAR' || unit === 'YEARS') seconds = num * 31536000;
            if (unit === 'HOUR' || unit === 'HOURS') seconds = num * 3600;
            if (unit === 'MINUTE' || unit === 'MINUTES') seconds = num * 60;
            
            return new NumberLiteral(seconds);
        }

        // Wrap parenthesis
        if (node.type === 'parenthesized_expression') {
            return new ParenExpr(this.buildExpr(node.children.find((c:any) => !['(', ')'].includes(c.type))));
        }

        // Fallback for unknown
        return new Identifier(node.text);
    }
}
