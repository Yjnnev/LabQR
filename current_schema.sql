


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."equipment_status" AS ENUM (
    'available',
    'in_use',
    'maintenance',
    'decommissioned',
    'out_of_stock'
);


ALTER TYPE "public"."equipment_status" OWNER TO "postgres";


CREATE TYPE "public"."log_action" AS ENUM (
    'checked_out',
    'returned',
    'viewed'
);


ALTER TYPE "public"."log_action" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."available_quantity"("item_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  select e.total_quantity - coalesce(sum(c.quantity), 0)
  from equipment e
  left join checkouts c on c.equipment_id = e.id and c.returned_at is null
  where e.id = item_id
  group by e.total_quantity;
$$;


ALTER FUNCTION "public"."available_quantity"("item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_quantity"("item_id" "uuid", "requested_quantity" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  available integer;
begin
  if requested_quantity is null or requested_quantity <= 0 then
    raise exception 'Quantity must be at least 1.';
  end if;

  select public.available_quantity(item_id) into available;

  if requested_quantity > available then
    raise exception 'Only % available.', available;
  end if;

  insert into checkouts (equipment_id, user_id, quantity)
  values (item_id, auth.uid(), requested_quantity);

  insert into usage_logs (equipment_id, user_id, performed_by, action)
  values (item_id, auth.uid(), auth.uid(), 'checked_out');

  update equipment
  set status = (
    case
      when public.available_quantity(item_id) <= 0 then 'out_of_stock'
      else 'available'
    end
  )::equipment_status
  where id = item_id
    and status not in ('maintenance', 'decommissioned');
end;
$$;


ALTER FUNCTION "public"."checkout_quantity"("item_id" "uuid", "requested_quantity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."return_checkout"("checkout_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  eq_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can mark equipment as returned.';
  end if;

  select equipment_id into eq_id from checkouts where id = checkout_id and returned_at is null;

  if eq_id is null then
    raise exception 'Checkout not found or already returned.';
  end if;

  update checkouts set returned_at = now(), returned_by = auth.uid() where id = checkout_id;

  insert into usage_logs (equipment_id, user_id, performed_by, action)
  select equipment_id, user_id, auth.uid(), 'returned' from checkouts where id = checkout_id;

  update equipment
  set status = (
    case
      when public.available_quantity(eq_id) <= 0 then 'out_of_stock'
      else 'available'
    end
  )::equipment_status
  where id = eq_id
    and status not in ('maintenance', 'decommissioned');
end;
$$;


ALTER FUNCTION "public"."return_checkout"("checkout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."checkouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "checked_out_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "returned_at" timestamp with time zone,
    "returned_by" "uuid",
    CONSTRAINT "checkouts_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."checkouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "total_quantity" integer DEFAULT 1 NOT NULL,
    "status" "public"."equipment_status" DEFAULT 'available'::"public"."equipment_status" NOT NULL,
    "location" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "thumbnail_url" "text",
    "photo_urls" "text"[]
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "public"."log_action" DEFAULT 'viewed'::"public"."log_action" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "performed_by" "uuid"
);


ALTER TABLE "public"."usage_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."checkouts"
    ADD CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_logs"
    ADD CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_checkouts_equipment" ON "public"."checkouts" USING "btree" ("equipment_id");



CREATE INDEX "idx_equipment_category" ON "public"."equipment" USING "btree" ("category");



CREATE INDEX "idx_equipment_status" ON "public"."equipment" USING "btree" ("status");



CREATE INDEX "idx_usage_logs_created_at" ON "public"."usage_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_usage_logs_equipment" ON "public"."usage_logs" USING "btree" ("equipment_id");



CREATE INDEX "idx_usage_logs_user" ON "public"."usage_logs" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "notify_admin_on_checkout" AFTER INSERT ON "public"."usage_logs" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://lkmkjmrffgnqwgmnzgnv.supabase.co/functions/v1/notify-admin', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrbWtqbXJmZmducXdnbW56Z252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MDM5NjcsImV4cCI6MjA5OTM3OTk2N30.ze_yqbH-XQ8zi9E55nbCyMYo-CbBgEJu2ag4PJEVm3s"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "notify_admin_webhook" AFTER INSERT ON "public"."usage_logs" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://lkmkjmrffgnqwgmnzgnv.supabase.co/functions/v1/notify-admin', 'POST', '{"Content-type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrbWtqbXJmZmducXdnbW56Z252Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzgwMzk2NywiZXhwIjoyMDk5Mzc5OTY3fQ._WnkYdgnaO1NHpLWl_-X8EEOLLjcqfk4X-dOptmSX-I"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trg_equipment_updated_at" BEFORE UPDATE ON "public"."equipment" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."checkouts"
    ADD CONSTRAINT "checkouts_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkouts"
    ADD CONSTRAINT "checkouts_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."checkouts"
    ADD CONSTRAINT "checkouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_logs"
    ADD CONSTRAINT "usage_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_logs"
    ADD CONSTRAINT "usage_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."usage_logs"
    ADD CONSTRAINT "usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete logs" ON "public"."usage_logs" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can update roles" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Anyone can view equipment" ON "public"."equipment" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Only admins can delete equipment" ON "public"."equipment" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Only admins can insert equipment" ON "public"."equipment" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can update equipment" ON "public"."equipment" FOR UPDATE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Users can insert their own logs" ON "public"."usage_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own checkouts, admins view all" ON "public"."checkouts" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Users can view their own logs, admins view all" ON "public"."usage_logs" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_admin"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



ALTER TABLE "public"."checkouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_logs" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."available_quantity"("item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."available_quantity"("item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."available_quantity"("item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkout_quantity"("item_id" "uuid", "requested_quantity" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."checkout_quantity"("item_id" "uuid", "requested_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_quantity"("item_id" "uuid", "requested_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."return_checkout"("checkout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."return_checkout"("checkout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."return_checkout"("checkout_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."checkouts" TO "anon";
GRANT ALL ON TABLE "public"."checkouts" TO "authenticated";
GRANT ALL ON TABLE "public"."checkouts" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_logs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







