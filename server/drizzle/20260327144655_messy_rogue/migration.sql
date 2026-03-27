CREATE TYPE "logOperationType" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TABLE "logs" (
	"id" text PRIMARY KEY UNIQUE,
	"memberId" text NOT NULL,
	"operationType" "logOperationType" NOT NULL,
	"data" json,
	"executedAt" timestamp(3) NOT NULL,
	"pushedAt" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_memberId_members_id_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE;