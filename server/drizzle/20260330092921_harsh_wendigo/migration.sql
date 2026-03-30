CREATE TYPE "logOperationType" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "logs" (
	"userId" text,
	"id" text,
	"memberId" text,
	"operationType" "logOperationType" NOT NULL,
	"data" json,
	"executedAt" timestamp(3) NOT NULL,
	"pushedAt" timestamp(3) DEFAULT now() NOT NULL,
	CONSTRAINT "logs_pkey" PRIMARY KEY("userId","id"),
	CONSTRAINT "delete_or_has_ref_id_check" CHECK (("operationType" = 'delete' or ("memberId" is not null)))
);
--> statement-breakpoint
CREATE TABLE "members" (
	"userId" text,
	"id" text,
	"name" text NOT NULL,
	"pronouns" text NOT NULL,
	"description" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"isArchived" boolean DEFAULT false NOT NULL,
	"archivedReason" text,
	CONSTRAINT "members_pkey" PRIMARY KEY("userId","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY UNIQUE,
	"userId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY UNIQUE,
	"email" text NOT NULL UNIQUE,
	"passwordHash" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_create_delete" ON "logs" ("userId","memberId","operationType") WHERE "operationType" in ('create', 'delete');--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_userId_memberId_members_userId_id_fkey" FOREIGN KEY ("userId","memberId") REFERENCES "members"("userId","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;