CREATE TYPE "entryPayloadStorage" AS ENUM('s3');--> statement-breakpoint
CREATE TABLE "entries" (
	"subspaceId" text,
	"path" text,
	"timestamp" bigint NOT NULL,
	"payloadLength" bigint NOT NULL,
	"payloadDigest" text NOT NULL,
	"payload" bytea,
	"payloadStorage" "entryPayloadStorage",
	"updatedAt" timestamp DEFAULT current_timestamp NOT NULL,
	CONSTRAINT "entries_pkey" PRIMARY KEY("subspaceId","path")
);
--> statement-breakpoint
ALTER TABLE "server_jobs" RENAME TO "jobs";--> statement-breakpoint
ALTER TABLE "server_user_email_change_request" RENAME TO "user_email_change_request";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updatedAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "createdAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updatedAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "user_email_change_request" ALTER COLUMN "createdAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "createdAt" SET DEFAULT current_timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "updatedAt" SET DEFAULT current_timestamp;--> statement-breakpoint
CREATE INDEX "subspaceId_idx" ON "entries" ("subspaceId");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_subspaceId_users_id_fkey" FOREIGN KEY ("subspaceId") REFERENCES "users"("id") ON DELETE CASCADE;