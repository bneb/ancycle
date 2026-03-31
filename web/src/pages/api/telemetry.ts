import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const payload = await request.json();
        const apiKey = request.headers.get('Authorization');

        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        // Ideally insert into D1 here
        const db = (locals as any).runtime?.env?.DB;
        if (db) {
            // Note: Ensure `telemetry` table is created in D1 via wrangler migrations.
            await db.prepare('INSERT INTO telemetry (models_processed, edges_verified, fatal_conflicts, timestamp) VALUES (?, ?, ?, ?)')
                .bind(payload.modelsCount, payload.edgesCount, payload.fatalCount, new Date().toISOString())
                .run();
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
