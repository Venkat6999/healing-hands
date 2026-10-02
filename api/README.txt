/* ============================================================
   Route files
   ------------------------------------------------------------
   Vercel maps each file in /api to exactly one URL path:

       api/version.js          ->  /api/version
       api/auth/login.js       ->  /api/auth/login
       api/appointments/[id].js->  /api/appointments/<id>

   A previous version used a single catch-all file, api/[...path].js.
   Vercel compiled `[...path]` as a single segment, so only one-segment
   URLs such as /api/version resolved while /api/auth/check returned 404.
   Explicit files remove that ambiguity entirely: no glob or catch-all
   semantics are involved, every route is a literal path.

   Each file is a two-line shim so the routing logic lives in exactly
   one place (lib/handler.js) and dispatches on req.url as before.
   ============================================================ */