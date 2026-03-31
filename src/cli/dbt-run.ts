import { parseDbtManifest, checkDbtDag } from './dbt-adapter';
import { sendTelemetry } from './telemetry';
import { readFileSync } from 'fs';
import { TreeSitterAdapter } from '../parser/tree-sitter-adapter';

async function main() {
    const args = process.argv.slice(2);
    const manifestPathIndex = args.indexOf('--manifest');
    
    if (manifestPathIndex === -1 || !args[manifestPathIndex + 1]) {
        console.error('Usage: bun src/cli/dbt-run.ts --manifest <path-to-manifest.json>');
        process.exit(1);
    }

    const manifestPath = args[manifestPathIndex + 1];
    
    console.log(`[Ancycle] Reading dbt manifest at: ${manifestPath}`);
    const manifestContent = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    console.log(`[Ancycle] Parsing DAG and analyzing SQL nodes...`);
    await TreeSitterAdapter.init();
    const { models, edges } = parseDbtManifest(manifest);
    
    console.log(`[Ancycle] Found ${models.length} models and ${edges.length} dependencies.`);
    console.log(`[Ancycle] Running Z3 Formal Verification...`);
    
    const results = await checkDbtDag(edges);
    
    let hasFatal = false;
    let satCount = 0;
    
    for (const result of results) {
        if (result.status === 'unsat') {
            console.error(`❌ FATAL: CONTRADICTION DETECTED between ${result.parent.name} -> ${result.child.name}`);
            hasFatal = true;
        } else if (result.status === 'sat') {
            console.log(`✅ OK: ${result.parent.name} -> ${result.child.name}`);
            satCount++;
        } else {
            console.log(`⚠️  SKIPPED: ${result.parent.name} -> ${result.child.name} (No constraints)`);
        }
    }

    await sendTelemetry({
        modelsCount: models.length,
        edgesCount: edges.length,
        fatalCount: hasFatal ? 1 : 0
    });

    if (hasFatal) {
        console.error(`\n[Ancycle] ❌ Pipeline verification failed! Fix the logical collisions above.`);
        process.exit(1);
    } else {
        console.log(`\n[Ancycle] ✨ Pipeline verification passed! (${satCount} edges verified)`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
