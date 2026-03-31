import { Lucia } from "lucia";
import { DrizzleSQLiteAdapter } from "@lucia-auth/adapter-drizzle";
import { users, sessions } from "../db/schema";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

export function initializeAuth(d1: D1Database) {
    const db = drizzle(d1);
    const adapter = new DrizzleSQLiteAdapter(db, sessions, users);

    return new Lucia(adapter, {
        sessionCookie: {
            attributes: {
                secure: import.meta.env.PROD
            }
        },
        getUserAttributes: (attributes) => {
            return {
                githubId: attributes.githubId,
                username: attributes.username,
                email: attributes.email
            };
        }
    });
}

declare module "lucia" {
    interface Register {
        Lucia: ReturnType<typeof initializeAuth>;
        DatabaseUserAttributes: DatabaseUserAttributes;
    }
}

interface DatabaseUserAttributes {
    githubId: number;
    username: string;
    email: string;
}
