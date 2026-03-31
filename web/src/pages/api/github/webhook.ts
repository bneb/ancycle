import type { APIRoute } from 'astro';
import { Webhooks } from '@octokit/webhooks';
import { Octokit } from 'octokit';
// Import CLI logic directly!
import { parseDbtManifest, checkDbtDag } from '../../../../../../src/cli/dbt-adapter';

// Astro config (Node runtime required for Webhooks/Z3)
export const config = {
    runtime: 'node'
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        if (!secret) return new Response('Missing Secret', { status: 500 });

        const webhooks = new Webhooks({ secret });
        const signature = request.headers.get('x-hub-signature-256');
        const payload = await request.text();

        if (!signature || !(await webhooks.verify(payload, signature))) {
            return new Response('Unauthorized', { status: 401 });
        }

        const event = JSON.parse(payload);
        
        if (event.action === 'opened' || event.action === 'synchronize') {
            if (event.pull_request) {
                // Background processing so we can return 200 to GitHub immediately
                processPullRequest(event).catch(console.error);
            }
        }

        return new Response('OK', { status: 200 });
    } catch (e: any) {
        return new Response(e.message, { status: 500 });
    }
};

async function processPullRequest(event: any) {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const repo = event.repository.name;
    const owner = event.repository.owner.login;
    const pr_number = event.pull_request.number;
    const sha = event.pull_request.head.sha;

    // 1. Fetch manifest.json
    let manifestData: any;
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: 'target/manifest.json',
            ref: sha
        });
        if ('content' in data) {
            manifestData = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
        }
    } catch (e) {
        console.log("No manifest.json found, skipping.");
        return;
    }

    // 2. Fetch modified SQL files in this PR (simplified logic - in reality, we check what changed)
    // For this demonstration, we assume `manifestData` has compiled_code or raw_code populated.
    
    // 3. Run DAG verification
    const { edges } = parseDbtManifest(manifestData);
    const results = await checkDbtDag(edges);
    
    let hasFatal = false;
    let commentBody = '## Ancycle Formal Verification\n\n';

    for (const result of results) {
        if (result.status === 'unsat') {
            hasFatal = true;
            commentBody += `❌ **FATAL: CONTRADICTION DETECTED** between \`${result.parent.name}\` -> \`${result.child.name}\`\n`;
        }
    }

    if (hasFatal) {
        commentBody += `\n*Your changes mathematically guarantee that downstream models will process 0 rows. Please fix the logical collisions.*`;
        
        // Post comment
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pr_number,
            body: commentBody
        });
        
        // Fail the check run
        await octokit.rest.checks.create({
            owner,
            repo,
            name: 'Ancycle Logic Check',
            head_sha: sha,
            status: 'completed',
            conclusion: 'failure',
            output: {
                title: 'Logical Collision Detected',
                summary: commentBody
            }
        });
    } else {
        await octokit.rest.checks.create({
            owner,
            repo,
            name: 'Ancycle Logic Check',
            head_sha: sha,
            status: 'completed',
            conclusion: 'success',
            output: {
                title: 'Verification Passed',
                summary: 'All logic constraints are satisfiable.'
            }
        });
    }
}
