// Chewata receipt proxy.
//
// Ethio Telecom serves telebirr receipt pages only to Ethiopian internet
// addresses, so the Cloud Function that verifies deposits (hosted in Europe)
// cannot read them itself. This tiny server runs on an Ethiopian host,
// fetches a receipt page when the function asks, and hands back the HTML.
// It does no parsing and keeps nothing: the verification rules live in one
// place, the Cloud Function.
//
//   POST /receipt  {"id":"DJG0V8449E"}   Authorization: Bearer <PROXY_SECRET>
//     200 {"found":true,"html":"…"} | {"found":false}
//     429 {"retryAfter":seconds}   Ethio Telecom allows 5 lookups a minute per address
//   GET /health → {"ok":true}
//
// Environment: PROXY_SECRET or PROXY_KEY (required, 32+ characters), PORT (default 8080).
// No dependencies; Node 18 or newer.

import { createServer } from "node:http"
import { timingSafeEqual } from "node:crypto"

// PROXY_KEY is accepted too: some hosts withhold variables whose names contain "SECRET".
const SECRET = process.env.PROXY_SECRET || process.env.PROXY_KEY || ""
const PORT = Number(process.env.PORT ?? 8080)
const RECEIPT_URL = "https://transactioninfo.ethiotelecom.et/receipt/"
const NOT_FOUND_TEXT = "This request is not correct"

// Stay under Ethio Telecom's limit of 5 a minute, with one spare.
const MAX_PER_MINUTE = 4
const recent = []

if (SECRET.length < 32) {
  console.error("PROXY_SECRET (or PROXY_KEY) must be set to at least 32 characters.")
  process.exit(1)
}

function authorized(req) {
  const given = Buffer.from(String(req.headers.authorization ?? "").replace(/^Bearer /, ""))
  const expected = Buffer.from(SECRET)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...extra })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  let raw = ""
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1024) throw new Error("Body too large")
  }
  return JSON.parse(raw || "{}")
}

/** Seconds until another lookup is allowed, or 0 when one is allowed now (and counts it). */
function takeSlot(now) {
  while (recent.length && now - recent[0] >= 60_000) recent.shift()
  if (recent.length >= MAX_PER_MINUTE) return Math.ceil((60_000 - (now - recent[0])) / 1000)
  recent.push(now)
  return 0
}

async function fetchReceipt(id) {
  const res = await fetch(RECEIPT_URL + encodeURIComponent(id), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ChewataReceiptCheck/1.0)", accept: "text/html" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Ethio Telecom answered ${res.status}`)
  const html = await res.text()
  if (html.length < 2000 && html.includes(NOT_FOUND_TEXT)) return { found: false }
  return { found: true, html }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true })
    if (req.method !== "POST" || req.url !== "/receipt") return send(res, 404, { error: "Not found" })
    if (!authorized(req)) return send(res, 401, { error: "Unauthorized" })

    const { id } = await readJson(req)
    if (typeof id !== "string" || !/^[A-Z0-9]{6,20}$/.test(id)) return send(res, 400, { error: "Invalid transaction id" })

    const wait = takeSlot(Date.now())
    if (wait) return send(res, 429, { retryAfter: wait }, { "retry-after": String(wait) })

    const started = Date.now()
    const result = await fetchReceipt(id)
    console.log(`${new Date().toISOString()} ${id} ${result.found ? "found" : "not found"} ${Date.now() - started}ms`)
    return send(res, 200, result)
  } catch (err) {
    console.error(`${new Date().toISOString()} error: ${err.message}`)
    return send(res, 502, { error: err.name === "TimeoutError" ? "Ethio Telecom did not answer in time" : err.message })
  }
})

server.listen(PORT, () => console.log(`receipt proxy listening on ${PORT}`))
