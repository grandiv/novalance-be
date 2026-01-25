import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Status types
export type UserStatus = 'active' | 'inactive';
export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type RoleStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type AssignmentStatus = 'active' | 'completed' | 'cancelled';
export type KpiStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'disputed';
export type TransactionType = 'deposit' | 'payment' | 'refund' | 'penalty';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

// Users table
export const users = sqliteTable('users', {
  address: text('address').primaryKey(),
  nonce: text('nonce').notNull().default(sql`(lower(hex(randomblob(16))))`),
  email: text('email'),
  githubUrl: text('github_url'),
  linkedinUrl: text('linkedin_url'),
  bio: text('bio'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerAddress: text('owner_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  timelineStart: integer('timeline_start', { mode: 'timestamp' }).notNull(),
  timelineEnd: integer('timeline_end', { mode: 'timestamp' }).notNull(),
  status: text('status', { mode: 'plaintext', enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled'] }).notNull().$type<ProjectStatus>().default('draft'),
  vaultAddress: text('vault_address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Project Roles table
export const projectRoles = sqliteTable('project_roles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  kpiCount: integer('kpi_count').notNull(),
  paymentPerKpi: text('payment_per_kpi').notNull(), // Stored as string to handle big numbers
  status: text('status', { mode: 'plaintext', enum: ['open', 'assigned', 'completed', 'cancelled'] }).notNull().$type<RoleStatus>().default('open'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Applications table
export const applications = sqliteTable('applications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  status: text('status', { mode: 'plaintext', enum: ['pending', 'accepted', 'rejected', 'withdrawn'] }).notNull().$type<ApplicationStatus>().default('pending'),
  coverLetter: text('cover_letter'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Assignments table
export const assignments = sqliteTable('assignments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  freelancerAddress: text('freelancer_address').notNull().references(() => users.address, { onDelete: 'cascade' }),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  status: text('status', { mode: 'plaintext', enum: ['active', 'completed', 'cancelled'] }).notNull().$type<AssignmentStatus>().default('active'),
});

// KPIs table
export const kpis = sqliteTable('kpis', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectRoleId: text('project_role_id').notNull().references(() => projectRoles.id, { onDelete: 'cascade' }),
  assignmentId: text('assignment_id').references(() => assignments.id, { onDelete: 'set null' }),
  kpiNumber: integer('kpi_number').notNull(),
  description: text('description').notNull(),
  deadline: integer('deadline', { mode: 'timestamp' }).notNull(),
  amount: text('amount').notNull(), // Stored as string to handle big numbers
  status: text('status', { mode: 'plaintext', enum: ['pending', 'submitted', 'approved', 'rejected', 'disputed'] }).notNull().$type<KpiStatus>().default('pending'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  submissionData: text('submission_data'), // JSON string
  reviewComment: text('review_comment'),
  penaltyAmount: text('penalty_amount'), // Stored as string to handle big numbers
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Transactions table
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text('type', { mode: 'plaintext', enum: ['deposit', 'payment', 'refund', 'penalty'] }).notNull().$type<TransactionType>(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  kpiId: text('kpi_id').references(() => kpis.id, { onDelete: 'set null' }),
  assignmentId: text('assignment_id').references(() => assignments.id, { onDelete: 'set null' }),
  txHash: text('tx_hash').notNull(),
  amount: text('amount').notNull(), // Stored as string to handle big numbers
  status: text('status', { mode: 'plaintext', enum: ['pending', 'confirmed', 'failed'] }).notNull().$type<TransactionStatus>().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
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
