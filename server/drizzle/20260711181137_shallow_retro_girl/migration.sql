DELETE FROM "entries";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_subspaceId_users_id_fkey";--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "subspaceId" SET DATA TYPE bytea USING "subspaceId"::bytea;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "path" SET DATA TYPE bytea[] USING "path"::bytea[];--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "payloadDigest" SET DATA TYPE bytea USING "payloadDigest"::bytea;