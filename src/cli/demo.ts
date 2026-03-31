import { readFileSync } from 'fs';
import { analyzeSqlNode } from '../parser/sql-parser';
import { checkZ3Constraints } from '../shadow/z3';

async function main() {
  console.log('🛡️  ANCYCLE INTERACTIVE DEMO');
  console.log('────────────────────────────────────────────────────────────────\n');

  console.log('  Scenario: A junior engineer reconnects an external table...');
  
  // 1. Read files
  const node1Sql = readFileSync('stg_active_users.sql', 'utf8');
  const node2Sql = readFileSync('process_churned.sql', 'utf8');
  
  // 2. Parse Nodes
  const node1 = analyzeSqlNode('stg_active_users', node1Sql);
  const node2 = analyzeSqlNode('process_churned', node2Sql);

  console.log(`  Read [${node1.tableName}]: Found Constraints -> ${node1.z3Assertions.join(', ')}`);
  
  if (node2.fromTable === node1.tableName) {
      console.log(`  Read [${node2.tableName}]: Infers Dependency on [${node1.tableName}]`);
      console.log(`  Read [${node2.tableName}]: Found Filters     -> ${node2.z3Assertions.join(', ')}\n`);
      
      console.log("  Standard CI runners would execute this wave. Let's see what the Z3 shadow says…\n");
      
      console.log('  QF_S Formula Submitted to Z3 Worker');
      console.log('  ─────────────────────────────────────');
      console.log('  (set-logic QF_S)');
      console.log('  (declare-const status String)');
      console.log(`  ; Upstream output contract`);
      node1.z3Assertions.forEach(a => console.log(`  (assert ${a})`));
      console.log(`  ; Downstream input filter requirements`);
      node2.z3Assertions.forEach(a => console.log(`  (assert ${a})`));
      console.log('  (check-sat)\n');

      const allAssertions = [...node1.z3Assertions, ...node2.z3Assertions];
      
      console.log('  Checking Constraints...\n');
      
      try {
        const result = await checkZ3Constraints(allAssertions);

        if (result === 'unsat') {
           console.log('  ❌  FATAL: MATHEMATICAL COLLISION DETECTED\n');
           console.log(`  Conflict: [${node1.tableName}] ⚡ [${node2.tableName}]\n`);
           console.log(`  Z3 QF_S Constraint Resolution: UNSAT`);
           console.log(`  ↳ Compile Error: [${node2.tableName}] is mathematically guaranteed to process 0 rows.`);
           console.log(`  Upstream constraints conflict with downstream filters.\n`);
           console.log(`  Compute Provisioned: $0.00`);
           console.log(`  Time Wasted: 0.04s`);
        } else if (result === 'sat') {
           console.log('  ✅  Path Satisfiable. Wave can execute safely.');
        } else {
           console.log(`  ⚠️  Unknown result from Z3: ${result}`);
        }
      } catch (err) {
        console.error('Failed to run Z3 verification:', err);
      }
      
  } else {
      console.log(`  Node 2 does not depend on Node 1.`);
  }
}

main().catch(console.error);
