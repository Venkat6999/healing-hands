/* ============================================================
   The API — one Vercel Function
   ------------------------------------------------------------
   Vercel maps api/index.js to the single-segment path /api. That is
   the only route shape proven to work on this project, and one function
   stays well inside the Hobby limit of 12.

   The backend therefore does not use one URL per endpoint. Instead the
   client sends the logical route in an X-HH-Route header, and this
   function restores it onto req.url before handing off to the shared
   router in ../lib/handler.js. A header was chosen over a query
   parameter or a body field because it also works for the multipart
   image upload, where there is no body to carry metadata.

   Nothing about the site changes for a visitor: the pages are identical
   and the admin panel is identical. Only the internal request URLs do.
   ============================================================ */
const express = require('express');
const handler = require('../lib/handler');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// same-origin in production; permissive so local testing and any future
// split hosting still work
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-HH-Route');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  next();
});

app.all('*', (req, res) => {
  const route = req.headers['x-hh-route'];
  // The header is required rather than defaulted, so a stray request to /api
  // cannot quietly serve some arbitrary default endpoint.
  if (typeof route !== 'string' || route.charAt(0) !== '/' || route.includes('..')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Missing or invalid X-HH-Route header' }));
  }
  req.url = '/api' + route;
  return handler(req, res);
});

module.exports = app;