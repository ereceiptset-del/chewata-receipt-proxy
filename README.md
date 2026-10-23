# Chewata receipt proxy

Ethio Telecom serves telebirr receipt pages
(`https://transactioninfo.ethiotelecom.et/receipt/<id>`) only to Ethiopian
internet addresses. Chewata's Cloud Functions run in Europe, so they ask this
small server, running in Ethiopia, to fetch a receipt and hand back the page.
It parses nothing and stores nothing.

## Run

```sh
PROXY_SECRET=<32+ random characters> npm start      # listens on PORT (default 8080)
```

- `POST /receipt` with `{"id":"DJG0V8449E"}` and `Authorization: Bearer <PROXY_SECRET>`
  returns `{"found":true,"html":"…"}` or `{"found":false}`.
- `GET /health` returns `{"ok":true}`.
- At most 4 lookups a minute (Ethio Telecom allows 5 per address); extra
  requests get `429` with `retryAfter` seconds.

## Deploy

Any Node 18+ host with an Ethiopian address works (AletCloud's free "Solo"
plan, or the gateway phone's network). The included Dockerfile runs it. On
AletCloud set the password as `PROXY_KEY` (variables named `*SECRET*` are
withheld there). Set the same value here and as
`RECEIPT_PROXY_SECRET` in the Cloud Functions' `functions/.env`, and the
public URL as `RECEIPT_PROXY_URL`.
