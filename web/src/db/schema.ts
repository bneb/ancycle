import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    githubId: integer('github_id').unique(),
    username: text('username').notNull(),
    email: text('email'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    subscriptionStatus: text('subscription_status'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    expiresAt: integer('expires_at').notNull()
});

export const organizations = sqliteTable('organizations', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    githubInstallationId: integer('github_installation_id').unique(),
    ownerId: text('owner_id').references(() => users.id)
});

export const projects = sqliteTable('projects', {
    id: text('id').primaryKey(),
    orgId: text('org_id').references(() => organizations.id),
    repository: text('repository').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});

export const prRuns = sqliteTable('pr_runs', {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id),
    prNumber: integer('pr_number').notNull(),
    commitSha: text('commit_sha').notNull(),
    status: text('status').notNull(), // 'success' | 'failure' | 'pending'
    z3Output: text('z3_output'),
    edgesVerified: integer('edges_verified'),
    fatalContradictions: integer('fatal_contradictions'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`)
});
