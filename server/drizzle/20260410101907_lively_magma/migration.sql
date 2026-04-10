CREATE TABLE "fronts" (
	"userId" text,
	"id" text,
	"memberId" text NOT NULL,
	"startedAt" timestamp NOT NULL,
	"endedAt" timestamp,
	"note" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "fronts_pkey" PRIMARY KEY("userId","id")
);
--> statement-breakpoint
ALTER TABLE "logs" DROP CONSTRAINT "delete_or_has_ref_id_check";--> statement-breakpoint
ALTER TABLE "logs" DROP CONSTRAINT "deletedId_check";--> statement-breakpoint
ALTER TABLE "logs" DROP CONSTRAINT "delete_op_data_null_check";--> statement-breakpoint
ALTER TABLE "logs" ADD COLUMN "frontId" text;--> statement-breakpoint
DROP INDEX "unique_create_delete";--> statement-breakpoint
CREATE UNIQUE INDEX "unique_create_delete" ON "logs" ("userId","memberId","frontId","operationType") WHERE "operationType" in ('create', 'delete');--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_userId_frontId_fronts_userId_id_fkey" FOREIGN KEY ("userId","frontId") REFERENCES "fronts"("userId","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "fronts" ADD CONSTRAINT "fronts_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "fronts" ADD CONSTRAINT "fronts_userId_memberId_members_userId_id_fkey" FOREIGN KEY ("userId","memberId") REFERENCES "members"("userId","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "deleteOperation_check" CHECK ((((("operationType" = 'delete') and (num_nonnulls("memberId", "frontId") = 0) and (("deletedId" is not null)) and (("data" is null)))) or (((not ("operationType" = 'delete')) and (num_nonnulls("memberId", "frontId") = 1) and (("deletedId" is null)) and (("data" is not null))))));