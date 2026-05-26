CREATE TABLE "server_jobs" (
	"id" text PRIMARY KEY UNIQUE,
	"type" text NOT NULL,
	"data" json NOT NULL,
	"attempts" integer NOT NULL,
	"scheduledAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
