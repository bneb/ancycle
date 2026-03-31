import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const email = data.email?.trim();

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // @ts-ignore - locals.runtime is assigned by @astrojs/cloudflare
    const env = locals.runtime?.env;

    if (!env || !env.DB) {
      console.error('D1 Database binding (DB) not found in runtime environment.');
      return new Response(JSON.stringify({ error: 'Database unavailable' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = env.DB;
    
    // Insert into D1
    const stmt = db.prepare('INSERT INTO waitlist (email) VALUES (?)').bind(email);
    const result = await stmt.run();

    if (result.success) {
      return new Response(JSON.stringify({ message: 'Success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('D1 execution failed');
    }

  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint failed')) {
      // Don't leak DB errors, just say success if they are already on the list (idempotent)
      return new Response(JSON.stringify({ message: 'Success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('Waitlist insertion error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
