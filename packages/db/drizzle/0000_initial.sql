CREATE TYPE "public"."conflict_resolution" AS ENUM('kept-local', 'kept-remote', 'merged');--> statement-breakpoint
CREATE TYPE "public"."content_format" AS ENUM('usfm', 'osis', 'json');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('web', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."entitlement_kind" AS ENUM('offline', 'audio', 'commentary');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."licence_status" AS ENUM('public-domain', 'licensed', 'unlicensed');--> statement-breakpoint
CREATE TYPE "public"."reading_theme" AS ENUM('light', 'sepia', 'dark');--> statement-breakpoint
CREATE TYPE "public"."sync_entity" AS ENUM('bookmark', 'highlight', 'note', 'folder', 'reading-plan-progress', 'reading-progress', 'preference');--> statement-breakpoint
CREATE TYPE "public"."sync_op" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verse_id" text NOT NULL,
	"version_id" text NOT NULL,
	"label" text,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"version_id" text PRIMARY KEY NOT NULL,
	"version_code" integer NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"language" text NOT NULL,
	"language_name" text NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"licence_status" "licence_status" DEFAULT 'unlicensed' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"policy" jsonb NOT NULL,
	"manifest" jsonb,
	"package_key" text,
	"package_bytes" bigint,
	"verse_count" integer DEFAULT 0 NOT NULL,
	"checksum" text,
	"enabled_at" timestamp with time zone,
	"enabled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"platform" "device_platform" NOT NULL,
	"app_version" text,
	"pull_cursor" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version_id" text NOT NULL,
	"kind" "entitlement_kind" NOT NULL,
	"source" text NOT NULL,
	"licence_key_hash" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verse_id" text NOT NULL,
	"version_id" text NOT NULL,
	"color" text NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" text NOT NULL,
	"source_format" "content_format" NOT NULL,
	"source_name" text NOT NULL,
	"source_checksum" text NOT NULL,
	"status" "ingest_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ingest_verses" (
	"run_id" uuid NOT NULL,
	"verse_id" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "ingest_verses_run_id_verse_id_pk" PRIMARY KEY("run_id","verse_id")
);
--> statement-breakpoint
CREATE TABLE "note_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"local_payload" jsonb NOT NULL,
	"remote_payload" jsonb NOT NULL,
	"local_hlc" text NOT NULL,
	"remote_hlc" text NOT NULL,
	"resolution" "conflict_resolution",
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verse_id" text,
	"reference" text,
	"title" text,
	"body" text NOT NULL,
	"folder_id" uuid,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"reading_theme" "reading_theme" DEFAULT 'light' NOT NULL,
	"font_scale" integer DEFAULT 100 NOT NULL,
	"active_version_id" text,
	"last_location" jsonb,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"day_count" integer NOT NULL,
	"schedule" jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" uuid NOT NULL,
	"version_id" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer,
	"hlc" text NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_version_id_pk" PRIMARY KEY("user_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"entity" "sync_entity" NOT NULL,
	"entity_id" text NOT NULL,
	"op" "sync_op" NOT NULL,
	"payload" jsonb,
	"hlc" text NOT NULL,
	"server_seq" bigserial NOT NULL,
	"server_version" integer DEFAULT 1 NOT NULL,
	"conflict_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_server_seq_unique" UNIQUE("server_seq")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_sub" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_cognito_sub_unique" UNIQUE("cognito_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "version_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"version_id" text NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_verses" ADD CONSTRAINT "ingest_verses_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_conflicts" ADD CONSTRAINT "note_conflicts_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_conflicts" ADD CONSTRAINT "note_conflicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_progress" ADD CONSTRAINT "plan_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_progress" ADD CONSTRAINT "plan_progress_plan_id_reading_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."reading_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_installs" ADD CONSTRAINT "version_installs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_installs" ADD CONSTRAINT "version_installs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_updated_idx" ON "bookmarks" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_verse_idx" ON "bookmarks" USING btree ("user_id","verse_id");--> statement-breakpoint
CREATE INDEX "devices_user_last_seen_idx" ON "devices" USING btree ("user_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_unique_idx" ON "entitlements" USING btree ("user_id","version_id","kind");--> statement-breakpoint
CREATE INDEX "entitlements_user_idx" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folders_user_parent_idx" ON "folders" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "highlights_user_updated_idx" ON "highlights" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "highlights_user_verse_idx" ON "highlights" USING btree ("user_id","verse_id");--> statement-breakpoint
CREATE INDEX "ingest_verses_lookup_idx" ON "ingest_verses" USING btree ("run_id","book","chapter");--> statement-breakpoint
CREATE INDEX "note_conflicts_user_created_idx" ON "note_conflicts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_user_updated_idx" ON "notes" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_verse_idx" ON "notes" USING btree ("user_id","verse_id");--> statement-breakpoint
CREATE INDEX "notes_user_folder_idx" ON "notes" USING btree ("user_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_progress_unique_idx" ON "plan_progress" USING btree ("user_id","plan_id","day_number");--> statement-breakpoint
CREATE INDEX "sync_operations_user_seq_idx" ON "sync_operations" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "version_installs_unique_idx" ON "version_installs" USING btree ("user_id","version_id","device_id");