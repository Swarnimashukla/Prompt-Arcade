// PromptArcade · Supabase connection
//
// Fill these two values in from Supabase → Project Settings → API.
// Until you do, auth.js stays completely inert: no sign-in control, no
// nudge, no network calls. The site behaves exactly as it does today,
// which matters because main deploys straight to production.
//
// The anon key is DESIGNED to be public and is safe to commit — but only
// because every table in supabase/schema.sql has row-level security
// enabled with policies scoped to auth.uid(). Run that schema BEFORE
// putting a real key here. If you add a table later, enable RLS on it.
//
// Never put the service_role key in this file. It bypasses RLS entirely.

window.PA_SUPABASE = {
  url:     'https://umcietxtyfpwmlqvjieq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtY2lldHh0eWZwd21scXZqaWVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTU5NDAsImV4cCI6MjEwODA5MTk0MH0.OuwPelGUUwsF9PXKdj9lo4kjaziCIi5SnSYqUUVlk18'
};
