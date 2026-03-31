import { execSync } from 'child_process';
import { join } from 'path';

export type Z3Result = 'sat' | 'unsat' | 'unknown';

export async function checkZ3Constraints(assertions: string[], variables: Record<string, string> = {}): Promise<Z3Result> {
    let script = '(set-logic ALL)\n';
    for (const [name, type] of Object.entries(variables)) {
        script += `(declare-const ${name} ${type})\n`;
    }
    for (const assert of assertions) {
        script += `(assert ${assert})\n`;
    }

    try {
        const workerPath = join(import.meta.dir || __dirname, 'z3-worker.mjs');
        const output = execSync(`node ${workerPath}`, { input: script, encoding: 'utf8' });
        const result = output.trim();
        if (result === 'sat' || result === 'unsat') {
            return result as Z3Result;
        }
        return 'unknown';
    } catch (e) {
        return 'unknown';
    }
}
