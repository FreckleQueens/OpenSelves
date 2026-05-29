ALTER TABLE "users" ALTER COLUMN "isEmailVerified" SET NOT NULL;--> statement-breakpoint
UPDATE "users" SET "createdAt" = now();
