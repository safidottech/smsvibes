> ⚠️ **SMSVIBES Critical Notice — sms-activate.org Status:** Before diving into the full report, one finding from the research demands your immediate attention. `sms-activate.org` shut down on **December 22, 2025**. Their `.io` mirror (`sms-activate.io`) and API docs remain partially online, so this document covers them for completeness and because some community wrappers still function via `sms-activate.ae` — but **you must plan for a fallback**. This is noted in each relevant section.

---

# SMSVIBES — Technical Source of Truth
## Multi-Provider API Reference for Backend Adapters
> **Document Version:** 2026-04 | **Architect:** SMSVIBES Senior API Team
> **🚨 The Cents Law:** Every balance returned by every provider is a **float** (e.g., `18.75`). SMSVIBES architecture requires **mandatory conversion to integer cents** (`1875`) before storage or comparison. This is enforced at the adapter layer. Never store raw floats. **Reminder is embedded in every provider section.**

---

## Provider 1 — 5sim (`5sim.net`)

### 1.1 Core Reference Table

| Field | Value |
|---|---|
| **API Docs URL** | `https://5sim.net/docs` |
| **Secondary Docs** | `https://5sim.net/manual` |
| **Base API URL (v1 / Current)** | `https://5sim.net/v1/` |
| **Base API URL (Legacy v1 / Deprecated)** | `http://api1.5sim.net/stubs/handler_api.php` |
| **Auth Mechanism** | `Authorization: Bearer <JWT_TOKEN>` (HTTP Header) |
| **Balance Check Endpoint** | `GET https://5sim.net/v1/user/profile` |
| **Reseller Program** | No formal reseller verification gate found; standard API available post-registration |

### 1.2 Authentication Deep-Dive

The API key is a **JWT-based token** — JWT stands for JSON Web Token — which must be added to an HTTP request header with the key denoted as `Authorization` and value as `"Bearer apiKey"`.

If you have `https://5sim.net` in your software, choose **API key 5sim protocol**. If not, choose **API key API1 protocol (Deprecated API)**. When using an API key for the 5SIM protocol, use the New API documentation.

```http
GET /v1/user/profile HTTP/1.1
Host: 5sim.net
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

### 1.3 Balance Check & Response Parsing

The profile endpoint `https://5sim.net/v1/user/profile` (authenticated with `Authorization: Bearer $token`) returns a JSON object including `"balance":100`.

**Sample Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "vendor": "demo",
  "balance": 18.75,
  "rating": 96,
  "default_country": { "name": "england", "iso": "gb", "prefix": "+44" }
}
```

> 🚨 **THE CENTS LAW — 5SIM ADAPTER:** `balance` is returned as a **float** (e.g., `18.75`). Your adapter **MUST** execute:
> ```python
> balance_cents = int(round(response["balance"] * 100))  # 18.75 → 1875
> ```
> Store `1875` in your DB. Never store `18.75`.

### 1.4 Insufficient Balance Error

The buy endpoint is dynamically constructed: `https://5sim.net/v1/user/buy/activation/{country}/{operator}/{product}`.

Based on the documented API patterns and confirmed community SDKs, the canonical error string returned when funds are exhausted is:

```
not enough user balance
```
> ⚙️ **Adapter Note:** This is a **plaintext string response**, not a JSON-wrapped error code. Your failover logic must do a string match, not a JSON key lookup. Pattern: `if "not enough user balance" in response.text: trigger_failover()`

### 1.5 Service / Country Mapping

| Dimension | Format | Example |
|---|---|---|
| **Service** | String **slug** | `telegram`, `whatsapp`, `google` |
| **Country** | String **ISO name slug** (NOT ISO 2-letter) | `england`, `russia`, `indonesia` |
| **Operator** | String slug | `any`, `vodaphone`, `megafon` |

For example, the buy endpoint is `https://5sim.net/v1/user/buy/activation/{country}/{operator}/{product}`, dynamically constructed using variables for country, operator, and product, allowing customization based on user preferences.

> ⚠️ **Critical SMSVIBES Mapping Note:** 5sim uses **long-form country name slugs** (`england`) not standard ISO-3166-1 alpha-2 codes (`GB`). You will need a dedicated slug-mapping table in your provider adapter.

---

## Provider 2 — SMS-Activate (`sms-activate.org` / `.io` / `.ae`)

> 🚨 **PRODUCTION ALERT:** When `sms-activate.org` shut down on December 22, 2025, it impacted all integrations. The API documentation mirror at `sms-activate.io/api2` and the `.ae` endpoint remain accessible. This section documents those surviving endpoints. **Treat this provider as HIGH RISK / FALLBACK-ONLY** until a formal successor is confirmed.

### 2.1 Core Reference Table

| Field | Value |
|---|---|
| **API Docs URL** | `https://sms-activate.io/api2` |
| **Base API URL (Primary surviving)** | `https://api.sms-activate.ae/stubs/handler_api.php` |
| **Auth Mechanism** | Query Parameter: `?api_key=<YOUR_KEY>` |
| **Balance Check Endpoint** | `GET ...handler_api.php?api_key=$key&action=getBalance` |
| **Reseller Program** | ⚠️ **Verification REQUIRED** — see section 2.4 |

### 2.2 Authentication Deep-Dive

SMS-Activate uses the **legacy SMSHUB-compatible protocol**: the API key is passed as a **query string parameter**, not a header.

```http
GET https://api.sms-activate.ae/stubs/handler_api.php?api_key=YOUR_API_KEY&action=getBalance
```

> This is architecturally distinct from 5sim/OnlineSim. Your SMSVIBES adapter for this provider must **never** send an `Authorization` header — the key goes in the URL query string.

### 2.3 Balance Check & Response Parsing

The `getBalance` action returns a **plaintext** response (not JSON):

```
ACCESS_BALANCE:18.75
```

Your adapter must parse this as:
```python
raw = response.text  # "ACCESS_BALANCE:18.75"
balance_float = float(raw.split(":")[1])  # 18.75
balance_cents = int(round(balance_float * 100))  # 1875
```

> 🚨 **THE CENTS LAW — SMS-ACTIVATE ADAPTER:** The balance arrives as a **plaintext float in a colon-delimited string** (`ACCESS_BALANCE:18.75`). Convert to cents (`1875`) immediately. This provider does NOT return JSON for this endpoint — do not use `response.json()`.

### 2.4 Insufficient Balance Error & Reseller Gate

The `NO_BALANCE` error is a wrapper for the `NO_BALANCE` response, indicating "balance ended."

The balance error is returned as a **plaintext string**:
```
NO_BALANCE
```

**Critical Reseller Constraint:**
The error `BAD_ACTION` indicates an invalid action **or that the reseller is not verified**.

> ⚠️ **SMSVIBES Reseller Action Required:** SMS-Activate has a **mandatory reseller verification gate**. If your account is not verified as a reseller, many API actions — including bulk number purchasing — will return `BAD_ACTION` even if the request is syntactically correct. You must manually contact their support and complete the reseller verification process **before** this adapter will function for production use. This is NOT automatic.

| Error String | Meaning | SMSVIBES Action |
|---|---|---|
| `NO_BALANCE` | Wallet empty | Trigger provider failover |
| `BAD_KEY` | Invalid API key | Alert + halt |
| `BAD_ACTION` | Invalid action **or unverified reseller** | Check reseller status |
| `NO_NUMBERS` | No numbers available | Try next country/operator |

### 2.5 Service / Country Mapping

| Dimension | Format | Example |
|---|---|---|
| **Service** | Short string **code** (2–4 chars) | `tg` (Telegram), `tw` (Twitter), `go` (Google) |
| **Country** | **Numeric Integer ID** | `0` = Russia, `6` = Indonesia |

The country parameter uses numeric IDs (e.g., `country: 6`), and the service parameter uses short codes (e.g., `service: 'dr'`).

---

## Provider 3 — GrizzlySMS (`grizzlysms.com`)

### 3.1 Core Reference Table

| Field | Value |
|---|---|
| **API Docs URL (Retail/Buyer)** | `https://grizzlysms.com/docs-old` |
| **API Docs URL (Partner/Reseller)** | `https://grizzlysms.com/partner-documentation` |
| **Base API URL (Retail)** | `https://api.grizzlysms.com/stubs/handler_api.php` |
| **Base API URL (Partner/Wholesale)** | `https://agent.1grizzlysms.com` |
| **Auth Mechanism** | HTTP Header: `apikey: <YOUR_KEY>` (Partner API) / Query Param `api_key=` (Retail) |
| **Balance Check Endpoint** | `GET ...handler_api.php?api_key=$key&action=getBalance` |
| **Reseller Program** | Dedicated **Partner API** (separate endpoint) — key issued by support |

### 3.2 Authentication Deep-Dive

GrizzlySMS has a **dual-API architecture** — one for retail buyers, one for wholesale partners:

**Retail Buyer API (SMSHUB-protocol compatible):**
```http
GET https://api.grizzlysms.com/stubs/handler_api.php?api_key=YOUR_KEY&action=getBalance
```

**Partner / Wholesale API (Header-based):**
The API can be found at the address `https://agent.1grizzlysms.com`. For authentication in requests, you need to send your API key in the **HTTP header `apikey`**. All data is transmitted in JSON format.

```http
GET https://agent.1grizzlysms.com/some/endpoint HTTP/1.1
apikey: YOUR_PARTNER_KEY
Content-Type: application/json
```

> ⚠️ **SMSVIBES Architecture Note:** You will need **two separate GrizzlySMS adapters** — one for retail purchasing and one for the partner/reseller channel. The authentication mechanisms differ, as does the base URL.

### 3.3 Balance Check & Response Parsing

The retail API returns balance in the standard SMSHUB plaintext format:
```
ACCESS_BALANCE:18.75
```

The activation cost is returned as a float in the response — for example, `"activationCost": 12.34` — confirming the float pattern throughout the API.

> 🚨 **THE CENTS LAW — GRIZZLYSMS ADAPTER:** Both the account balance (`ACCESS_BALANCE:18.75`) and per-activation cost (`"activationCost": 12.34`) are returned as **floats**. Your adapter must convert **both**:
> ```python
> balance_cents = int(round(18.75 * 100))      # 1875
> cost_cents    = int(round(12.34 * 100))       # 1234
> ```
> Never pass `activationCost` raw to your pricing engine.

### 3.4 Insufficient Balance Error

The error `NO_BALANCE` means the wallet needs to be topped up.

```
NO_BALANCE
```

| Error String | Meaning | SMSVIBES Action |
|---|---|---|
| `NO_BALANCE` | Wallet empty | Trigger provider failover |
| `BAD_KEY` | Invalid API key | Alert + halt |
| `NO_NUMBERS` | No numbers available | Retry or switch country |
| `SERVICE_UNAVAILABLE_REGION` | IP region blocked | Use proxy rotation |

Additional documented errors include `BAD_KEY` (check your API key), `NO_NUMBERS` (repeat a request or choose another country), and `SERVICE_UNAVAILABLE_REGION` (access from your region is restricted, use another IP).

### 3.5 Partner API Reseller Requirements

The partner protocol is designed to provide phone numbers and incoming SMS messages via API directly to the Grizzly SMS server. All requests include the parameter KEY, which is provided by support staff and is available in the personal account.

> ⚠️ **SMSVIBES Reseller Action Required:** The Partner API key for `https://agent.1grizzlysms.com` is **not self-service**. It must be requested from GrizzlySMS support.

### 3.6 Service / Country Mapping

| Dimension | Format | Example |
|---|---|---|
| **Service** | Short string **code** | `tg`, `wa`, `go` |
| **Country** | **Numeric Integer ID** | `2` (from response: `"countryCode": "2"`) |

The successful number purchase response returns `"countryCode": "2"`, confirming countries use **numeric string IDs**, not ISO codes.

---

## Provider 4 — OnlineSim (`onlinesim.io`)

### 4.1 Core Reference Table

| Field | Value |
|---|---|
| **API Docs URL (Primary OpenAPI)** | `https://onlinesim.io/openapi_docs/Onlinesim-API-UN/info` |
| **API Docs URL (Alternative API)** | `https://onlinesim.io/openapi_docs/alternative-api-un/info` |
| **API Docs URL (Reseller/Partner)** | `https://onlinesim.io/openapi_docs/Reseller-API-UN/info` |
| **Base API URL** | `https://onlinesim.io/` |
| **Auth Mechanism** | `Authorization: Bearer <apikey>` (Header) **OR** OAuth 2.0 |
| **Balance Check Endpoint** | `GET /api/getBalance.php` (via `getBalance` method) |
| **Reseller Program** | ⚠️ **Partner account required** — manual contact with support |

### 4.2 Authentication Deep-Dive

OnlineSim is the **most advanced** authentication-wise of the four providers, supporting both API Key (Bearer) and full OAuth 2.0:

**Method 1 — API Key (Recommended for SMSVIBES):**
Use `Authorization: Bearer {{apikey}}` in the request header. Using an API key provides a simplified way to authorize requests. OnlineSim recommends using OAuth 2.0 for more secure data handling.

```http
GET /api/getBalance.php HTTP/1.1
Host: onlinesim.io
Authorization: Bearer YOUR_API_KEY
```

**Method 2 — OAuth 2.0 (Optional / For user-facing apps):**
The OAuth 2.0 authorization protocol provides Authorization Code and Implicit Flow types. The authorization URL is `https://onlinesim.io/oauth/authorize`. Scopes include `sms-scope`, `rent-scope`, and `free-scope`.

> 💡 **SMSVIBES Recommendation:** Use **Bearer API Key** for your backend service-to-service adapter. OAuth 2.0 is more appropriate if you build a user-delegated flow where your customers connect their own OnlineSim accounts.

### 4.3 Balance Check & Response Parsing

The `getBalance` method returns the current available balance of your profile, the frozen balance (funds reserved for active operations, which will be returned if those operations are cancelled), and information about your referral program income.

The `getBalance` method returns the current balance of your Profile; `getCountries` returns a list of countries and general information on what services are available.

**Sample Response (JSON):**
```json
{
  "balance": 18.75,
  "frozen": 2.50,
  "referral_income": 0.10
}
```

> 🚨 **THE CENTS LAW — ONLINESIM ADAPTER:** OnlineSim returns **three float values** — `balance`, `frozen`, and `referral_income`. ALL must be converted:
> ```python
> balance_cents  = int(round(data["balance"] * 100))        # 1875
> frozen_cents   = int(round(data["frozen"] * 100))         # 250
> referral_cents = int(round(data["referral_income"] * 100)) # 10
> ```
> Your **spendable balance** for SMSVIBES pricing logic = `balance_cents - frozen_cents`.

### 4.4 Insufficient Balance Error

If your request results in `ERROR_WRONG_KEY`, you need to refresh your token or get a new one.

The insufficient balance error string is:
```
BALANCE_ERROR
```
> ⚙️ **Adapter Note:** OnlineSim uses `ERROR_`-prefixed strings across their error taxonomy. Also watch for `ERROR_WRONG_KEY` (bad/expired token) — since they support OAuth, tokens can expire. Your adapter should implement token refresh logic.

### 4.5 Partner/Reseller Requirements

Both Reseller APIs require an **Onlinesim partner account**. You will need to register an Onlinesim profile and **contact partner support** to get access to these APIs.

Contact them via email or Telegram to create a partner profile, provide your endpoint URL, and receive theirs. Support specialists will run tests to verify everything is working. If tests are successful, your numbers will become available to their clients within a few hours.

### 4.6 Service / Country Mapping

| Dimension | Format | Example |
|---|---|---|
| **Service** | String **slug** | `telegram`, `google`, `whatsapp` |
| **Country** | **Numeric Integer ID** | Standard numeric country codes |

`getCountries` returns a list of countries and general information on what services are available per country.

---

## Master Comparison Table

| Feature | 5sim | SMS-Activate | GrizzlySMS | OnlineSim |
|---|---|---|---|---|
| **Docs URL** | `5sim.net/docs` | `sms-activate.io/api2` | `grizzlysms.com/docs-old` | `onlinesim.io/openapi_docs/...` |
| **Base URL** | `5sim.net/v1/` | `api.sms-activate.ae/...` | `api.grizzlysms.com/...` | `onlinesim.io/` |
| **Auth Type** | HTTP Header Bearer JWT | Query Param `api_key=` | Header `apikey:` (Partner) / Query Param (Retail) | Header Bearer **or** OAuth 2.0 |
| **Balance Endpoint** | `GET /v1/user/profile` | `?action=getBalance` | `?action=getBalance` | `getBalance` method |
| **Balance Format** | JSON float `"balance": 18.75` | Plaintext `ACCESS_BALANCE:18.75` | Plaintext `ACCESS_BALANCE:18.75` | JSON float `"balance": 18.75` |
| **Low Balance Error** | `not enough user balance` (string) | `NO_BALANCE` (string) | `NO_BALANCE` (string) | `BALANCE_ERROR` (string) |
| **Error Format** | Plaintext string | Plaintext string | Plaintext string | `ERROR_`-prefixed string |
| **Service Mapping** | String slug (`telegram`) | Short code (`tg`) | Short code (`tg`) | String slug (`telegram`) |
| **Country Mapping** | Name slug (`england`) | Numeric ID (`0`, `6`) | Numeric ID (`"2"`) | Numeric ID |
| **Reseller Gate** | None found | ⚠️ Manual verification required | ⚠️ Partner key from support | ⚠️ Partner account via support |
| **API Status (Apr 2025)** | ✅ Active | ⚠️ `.org` shut down Dec 2025; `.ae` active | ✅ Active | ✅ Active |
| **OAuth Support** | ❌ | ❌ | ❌ | ✅ Full OAuth 2.0 |
| **🚨 Cents Law** | Convert `balance` float → cents | Parse string, then convert float → cents | Parse string, then convert float → cents | Convert `balance` + `frozen` floats → cents |

---

## Failover Error String Reference (SMSVIBES Adapter Config)

```python
# smsvibes/providers/config.py

PROVIDER_BALANCE_ERRORS = {
    "5sim":          ["not enough user balance"],
    "sms_activate":  ["NO_BALANCE"],
    "grizzlysms":    ["NO_BALANCE"],
    "onlinesim":     ["BALANCE_ERROR"],
}

PROVIDER_AUTH_ERRORS = {
    "5sim":          ["Unauthorized", "401"],
    "sms_activate":  ["BAD_KEY", "BAD_ACTION"],  # BAD_ACTION may also mean unverified reseller!
    "grizzlysms":    ["BAD_KEY"],
    "onlinesim":     ["ERROR_WRONG_KEY"],
}
```

---

## Reseller Verification Action Checklist

| Provider | Action Required | Urgency |
|---|---|---|
| **5sim** | None — standard API key from profile settings | 🟢 None |
| **SMS-Activate** | Contact support to complete reseller verification; without it `BAD_ACTION` will block bulk operations | 🔴 Critical before launch |
| **GrizzlySMS** | Request Partner API key from support for `agent.1grizzlysms.com`; retail key is self-service | 🟡 Required for wholesale pricing |
| **OnlineSim** | Register profile, then contact partner support via email/Telegram for Reseller API access | 🟡 Required for reseller tier |

---

## 🏆 Developer-Friendliness Summary

### Ranking: Most to Least Developer-Friendly

| Rank | Provider | Score | Reason |
|---|---|---|---|
| 🥇 1st | **5sim** | ⭐⭐⭐⭐⭐ | Clean RESTful v1 API, JWT Bearer auth (industry standard), well-structured JSON throughout, multi-language code examples in docs (cURL, Python, PHP), no reseller gate, actively maintained |
| 🥈 2nd | **OnlineSim** | ⭐⭐⭐⭐ | Best docs format (OpenAPI spec), OAuth 2.0 support, clean JSON responses, BUT requires partner contact for reseller tier and the multi-API fragmentation (3 separate doc portals) creates friction |
| 🥉 3rd | **GrizzlySMS** | ⭐⭐⭐ | Dual API architecture is useful for resellers but increases adapter complexity; SMSHUB-protocol compatibility is convenient; `NO_BALANCE` error is clear; official MCP server published Mar 2026 shows active developer investment |
| 4th | **SMS-Activate** | ⭐⭐ | Historically the most widely used (largest community of wrappers), but the `.org` shutdown in Dec 2025 is a critical reliability event; query-param auth is less secure; the reseller verification gate is opaque |

### Architect's Recommendation for SMSVIBES

```
PRIMARY:   5sim         — cleanest adapter, most reliable, JWT standard
SECONDARY: OnlineSim    — solid fallback, good docs, JSON-native
TERTIARY:  GrizzlySMS   — use for specific geos where coverage is superior
RESERVE:   SMS-Activate — only via .ae endpoint, monitor for official successor
```

> **Final note on The Cents Law:** After auditing all four providers, **not a single one stores or returns balances in integer cents**. Every provider — 5sim (JSON float), SMS-Activate (plaintext float string), GrizzlySMS (plaintext float string), and OnlineSim (JSON float) — returns decimal dollar amounts. The `float → integer cents` conversion is therefore a **universal, non-negotiable requirement** at the boundary of every adapter in the SMSVIBES platform.