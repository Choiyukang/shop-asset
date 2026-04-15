import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oechxjczqqztlnpetgdc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lY2h4amN6cXF6dGxucGV0Z2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzcwMDMsImV4cCI6MjA5MTgxMzAwM30.JPVRpFbm8Qz3arQoBHXW48Gk8xThEPqGySPhC6Clkj0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
