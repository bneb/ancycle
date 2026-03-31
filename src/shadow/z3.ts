import { spawn } from 'child_process';

export type Z3Result = 'sat' | 'unsat' | 'unknown';

export async function checkZ3Constraints(assertions: string[]): Promise<Z3Result> {
  return new Promise((resolve, reject) => {
    const z3 = spawn('z3', ['-in']);
    
    let output = '';
    
    z3.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    z3.stderr.on('data', (data) => {
      console.error(`Z3 Error: ${data.toString()}`);
    });
    
    z3.on('close', (code) => {
      if (code !== 0 && code !== null) {
         return reject(new Error('Z3 process exited with code ' + code));
      }
      // Z3 can output warnings or other text before sat/unsat.
      // We look for 'unsat' or 'sat' in the last logged lines.
      const lines = output.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      resolve(lastLine as Z3Result);
    });

    // Our QF_S base logic (Quantifier-Free String equations)
    z3.stdin.write('(set-logic QF_S)\n');
    
    // In a real system, we'd dynamically declare constants based on the AST.
    // For this MVP, we know the domain is the 'status' column.
    z3.stdin.write('(declare-const status String)\n');
    
    for (const assert of assertions) {
       z3.stdin.write(`(assert ${assert})\n`);
    }
    
    z3.stdin.write('(check-sat)\n');
    z3.stdin.end();
  });
}
