import { init } from 'z3-solver';
import * as fs from 'fs';

async function main() {
    const input = fs.readFileSync(0, 'utf-8');
    const { Z3, Context, em } = await init();
    const ctx = new Context('main');
    const solver = new ctx.Solver();

    try {
        solver.fromString(input);
        const result = await solver.check();
        console.log(result);
    } catch (e) {
        console.log('unknown');
    } finally {
        em.PThread.terminateAllThreads();
        process.exit(0);
    }
}

main().catch(() => process.exit(1));
