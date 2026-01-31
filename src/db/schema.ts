import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Status types
export type UserStatus = 'active' | 'inactive';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type RoleStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type AssignmentStatus = 'active' | 'completed' | 'cancelled';
export type KpiStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'disputed' | 'paid' | 'cancelled';
export type TransactionType = 'deposit' | 'payment' | 'refund' | 'penalty';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

// Users table
export const users = pgTable('users', {
  address: text('address').primaryKey(),
  nonce: text('nonce').notNull().$defaultFn(() => crypto.randomUUID()),
  email: text('email'),
  githubUrl: text('github_url'),
  linkedinUrl: text('linkedin_url'),
  bio: text('bio'),
  ens: text('ens'), // ENS domain name
  skills: text('skills'), // JSON array of skills: ["typescript", "react", "solidity"]
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Projects table
export const projects = pgTable('projects', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  ownerAddress: text('owner_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  timelineStart: timestamp('timeline_start').notNull(),
  timelineEnd: timestamp('timeline_end').notNull(),
  status: text('status', { enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled'] }).notNull().$type<ProjectStatus>().default('draft'),
  vaultAddress: text('vault_address'),
  totalDeposited: text('total_deposited').default('0'), // Total IDRX deposited to vault
  poResponseDeadline: timestamp('po_response_deadline'), // Auto-withdrawal deadline for PO response
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Project Roles table
export const projectRoles = pgTable('project_roles', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  kpiCount: integer('kpi_count').notNull(),
  paymentPerKpi: text('payment_per_kpi').notNull(), // Stored as string to handle big numbers
  skills: text('skills'), // JSON array of skills: ["typescript", "react"]
  status: text('status', { enum: ['open', 'assigned', 'completed', 'cancelled'] }).notNull().$type<RoleStatus>().default('open'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Applications table
export const applications = pgTable('applications', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'accepted', 'rejected', 'withdrawn'] }).notNull().$type<ApplicationStatus>().default('pending'),
  coverLetter: text('cover_letter'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Assignments table
export const assignments = pgTable('assignments', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  status: text('status', { enum: ['active', 'completed', 'cancelled'] }).notNull().$type<AssignmentStatus>().default('active'),
});

// KPIs table
export const kpis = pgTable('kpis', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  assignmentId: text('assignment_id').references(() => assignments.id, { onDelete: 'set null' }),
  kpiNumber: integer('kpi_number').notNull(),
  description: text('description').notNull(),
  deadline: timestamp('deadline').notNull(),
  amount: text('amount').notNull(), // Stored as string to handle big numbers
  status: text('status', { enum: ['pending', 'submitted', 'approved', 'rejected', 'disputed', 'paid', 'cancelled'] }).notNull().$type<KpiStatus>().default('pending'),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  submissionData: text('submission_data'), // JSON string
  reviewComment: text('review_comment'),
  penaltyAmount: text('penalty_amount').default('0'), // Stored as string, calculated by SC
  depositTxHash: text('deposit_tx_hash'), // Transaction hash when deposited to vault
  payoutTxHash: text('payout_tx_hash'), // Transaction hash when paid out
  vaultBalanceAtStart: text('vault_balance_at_start'), // Vault balance when KPI started (for yield calculation)
  vaultBalanceAtEnd: text('vault_balance_at_end'), // Vault balance when KPI completed (for yield calculation)
  yieldEarned: text('yield_earned').default('0'), // LP yield earned (from SC)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Transactions table
export const transactions = pgTable('transactions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  type: text('type', { enum: ['deposit', 'payment', 'refund', 'penalty'] }).notNull().$type<TransactionType>(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  kpiId: text('kpi_id').references(() => kpis.id, { onDelete: 'set null' }),
  assignmentId: text('assignment_id').references(() => assignments.id, { onDelete: 'set null' }),
  txHash: text('tx_hash').notNull(),
  amount: text('amount').notNull(), // Stored as string to handle big numbers
  status: text('status', { enum: ['pending', 'confirmed', 'failed'] }).notNull().$type<TransactionStatus>().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at'),
});

// Relations for Drizzle queries
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  ownedProjects: many(projects),
  applications: many(applications),
  assignments: many(assignments),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerAddress],
    references: [users.address],
  }),
  roles: many(projectRoles),
}));

export const projectRolesRelations = relations(projectRoles, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectRoles.projectId],
    references: [projects.id],
  }),
  applications: many(applications),
  assignments: many(assignments),
  kpis: many(kpis),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  projectRole: one(projectRoles, {
    fields: [applications.projectRoleId],
    references: [projectRoles.id],
  }),
  applicant: one(users, {
    fields: [applications.freelancerAddress],
    references: [users.address],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  projectRole: one(projectRoles, {
    fields: [assignments.projectRoleId],
    references: [projectRoles.id],
  }),
  freelancer: one(users, {
    fields: [assignments.freelancerAddress],
    references: [users.address],
  }),
  kpis: many(kpis),
}));

export const kpisRelations = relations(kpis, ({ one }) => ({
  projectRole: one(projectRoles, {
    fields: [kpis.projectRoleId],
    references: [projectRoles.id],
  }),
  assignment: one(assignments, {
    fields: [kpis.assignmentId],
    references: [assignments.id],
  }),
}));

// Export types for each table
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectRole = typeof projectRoles.$inferSelect;
export type NewProjectRole = typeof projectRoles.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;

export type Kpi = typeof kpis.$inferSelect;
export type NewKpi = typeof kpis.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
