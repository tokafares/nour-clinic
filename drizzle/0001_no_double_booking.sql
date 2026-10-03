-- Prevent double booking at the database level.
-- btree_gist lets a GiST index combine "=" on doctor_id with "&&" (overlap) on a time range.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "doctor_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" <> 'cancelled');
