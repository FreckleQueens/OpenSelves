CREATE TABLE "entries" (
	"subspaceId" bytea,
	"path" bytea[],
	"timestamp" bigint NOT NULL,
	"payloadLength" bigint NOT NULL,
	"payloadDigest" bytea NOT NULL,
	"payload" bytea,
	"payloadStorage" "entryPayloadStorage",
	"updatedAt" timestamp DEFAULT current_timestamp NOT NULL,
	CONSTRAINT "entries_pkey" PRIMARY KEY("subspaceId","path")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY UNIQUE,
	"type" text NOT NULL,
	"data" json NOT NULL,
	"attempts" integer NOT NULL,
	"scheduledAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT current_timestamp NOT NULL,
	"updatedAt" timestamp DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY UNIQUE,
	"subspaceIds" bytea[] NOT NULL,
	"persist" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT current_timestamp NOT NULL,
	"updatedAt" timestamp DEFAULT current_timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subspaceId_idx" ON "entries" ("subspaceId");