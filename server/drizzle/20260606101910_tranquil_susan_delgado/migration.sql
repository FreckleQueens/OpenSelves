CREATE TABLE "server_user_email_change_request" (
	"userId" text PRIMARY KEY UNIQUE,
	"email" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_user_email_change_request" ADD CONSTRAINT "server_user_email_change_request_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;