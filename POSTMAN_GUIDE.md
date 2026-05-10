# Postman Testing Guide — Loan Applications Export API

## Endpoint Overview

| Field | Value |
|----|----|
| **Method** | `GET` |
| **Full URL** | `https://lionfish-app-mg3te.ondigitalocean.app/api/loans/export` |


## Step-by-Step Postman Setup

### Step 1 — Create a New Request



1. Open Postman → click **"New"** → select **"HTTP Request"**
2. Set the method dropdown to `GET`
3. Paste the URL in the address bar:

```
https://lionfish-app-mg3te.ondigitalocean.app/api/loans/export
```


### Step 2 — Headers Tab

Click the **Headers** tab and add the following rows:

| KEY | VALUE |
|----|----|
| `Authorization` | `Key paromita$432` |
| `Content-Type` | `application/json` |

> ⚠️ **Important:** The `Authorization` value must be exactly `Key paromita$432`
> — note the word **Key** (capital K) followed by a **space**, then the secret.
> Do **NOT** use `Bearer` here.


### Step 3 — Params Tab

Click the **Params** tab and add these two query parameters:

| KEY | VALUE | DESCRIPTION |
|----|----|----|
| `from` | `2026-01-01T00:00:00.000Z` | Start of date range (ISO 8601 UTC) |
| `to` | `2026-04-08T23:59:59.999Z` | End of date range (ISO 8601 UTC) |

> Postman will automatically append these to the URL, making it:
>
> ```
> https://lionfish-app-mg3te.ondigitalocean.app/api/loans/export?from=2026-01-01T00%3A00%3A00.000Z&to=2026-04-08T23%3A59%3A59.999Z
> ```


### Step 4 — Body Tab

No body is needed. Leave it as **None**.


### Step 5 — Send the Request

Click the blue **Send** button and check the response below.


## Date Format Reference

The `from` and `to` params must be in **ISO 8601 UTC format**:

```
YYYY-MM-DDTHH:mm:ss.sssZ
```

### Common Date Range Examples

| Range | `from` | `to` |
|----|----|----|
| Last 7 days | `2026-04-01T00:00:00.000Z` | `2026-04-08T23:59:59.999Z` |
| Last 30 days | `2026-03-09T00:00:00.000Z` | `2026-04-08T23:59:59.999Z` |
| Last 90 days | `2026-01-08T00:00:00.000Z` | `2026-04-08T23:59:59.999Z` |
| Full year 2026 | `2026-01-01T00:00:00.000Z` | `2026-12-31T23:59:59.999Z` |
| All time | `2020-01-01T00:00:00.000Z` | `2026-12-31T23:59:59.999Z` |


## Complete Request at a Glance

```
Method : GET
URL    : https://lionfish-app-mg3te.ondigitalocean.app/api/loans/export

Headers:
  Authorization : Key paromita$432
  Content-Type  : application/json

Params:
  from : 2026-01-01T00:00:00.000Z
  to   : 2026-04-08T23:59:59.999Z
```


## Expected Responses

### ✅ Success — 200 OK

```json
{
  "success": true,
  "count": 42,
  "data": [
    {
      "id": "clxxx...",
      "name": "Ravi Kumar",
      "mobileNo": "9876543210",
      "personalEmail": "ravi@example.com",
      "panNo": "ABCDE1234F",
      "aadhaarNo": "123456789012",
      "loanAmount": 150000,
      "loanPurpose": "Home renovation",
      "loanPeriod": 24,
      "status": "PENDING",
      "incomeType": "SALARIED",
      "monthlyIncome": 45000,
      "state": "Odisha",
      "district": "Bhubaneswar",
      "applicationNumber": "LIN-2026-00042",
      "createdAt": "2026-03-15T10:22:00.000Z",
      "updatedAt": "2026-03-15T10:22:00.000Z"
    }
  ],
  "elapsed": null
}
```


### ❌ Unauthorized — 401 / 403

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Fix:** Check that the `Authorization` header is exactly `Key paromita$432` (capital K, space after Key).


### ❌ Missing Params — 400 Bad Request

```json
{
  "error": "Both \"from\" and \"to\" query params are required."
}
```

**Fix:** Make sure both `from` and `to` are filled in the **Params** tab.


### ❌ Server Unreachable — 503

```json
{
  "success": false,
  "error": "connect ECONNREFUSED"
}
```

**Fix:** The production server may be down. Try again after some time.


## Testing via cURL (Alternative)

If you prefer the terminal over Postman, run this command:

```bash
curl -X GET \
  "https://lionfish-app-mg3te.ondigitalocean.app/api/loans/export?from=2026-01-01T00:00:00.000Z&to=2026-04-08T23:59:59.999Z" \
  -H "Authorization: Key paromita$432" \
  -H "Content-Type: application/json"
```


## Notes

* The `Authorization` scheme used here is a **custom** `Key` scheme, not the standard `Bearer` token scheme.
* Dates must always be in **UTC** (ending in `Z`) — local time formats will not work correctly.
* The API returns all loan applications created between `from` and `to`, sorted by creation date descending.
* The `data` array may be empty (`[]`) if no applications exist in the given date range — this is not an error.


---

<br><br>

# Postman Testing Guide — Update Loan Status API (LOS System)

## Endpoint Overview

| Field | Value |
|----|----|
| **Method** | `PUT` |
| **Full URL** | `https://lionfish-app-mg3te.ondigitalocean.app/api/loans/update-status` |


---

## Step-by-Step Postman Setup

### Step 1 — Create a New Request


1. Open Postman → click **"New"** → select **"HTTP Request"**
2. Set the method dropdown to `PUT`
3. Paste the URL:

```
https://lionfish-app-mg3te.ondigitalocean.app/api/loans/update-status
```

### Step 2 — Headers Tab

Add the exactly same headers required for the GET API:

| KEY | VALUE |
|----|----|
| `Authorization` | `Key paromita$432` |
| `Content-Type` | `application/json` |

### Step 3 — Body Tab


1. Click the **Body** tab.
2. Select **raw**.
3. In the dropdown to the right, verify it says **JSON**.
4. Paste the following payload structure into the box:

```json
{
  "id": "123",                    // Required: The ID sent down in the export API
  "status": "APPROVED",           // Required: Needs to be a valid status e.g. APPROVED or REJECTED
  "employeeId": "EMP-042",        // Optional
  "employeeName": "Rahul Verma",  // Optional
  "reason": "Credit score met",   // Optional: Must provide reason if REJECTED
  "loanNo": "LA-992348",          // Optional
  "applicationNumber": "APP-584"  // Optional
}
```

> ⚠️ **Note about** `id`: The `id` you pass back MUST match the `id` field sent to you in the `GET /api/loans/export` request for that specific application.

> 📝 **Note about Aadhaar Number**: You DO NOT need to pass the Aadhaar Number to update the status. However, upon a successful update, the API will automatically **return the Aadhaar number** of the applicant to you in the response payload.

### Step 4 — Send

Click the blue **Send** button.


---

## Expected Responses

### ✅ Success — 200 OK

```json
{
  "success": true,
  "message": "Loan application updated successfully from LOS.",
  "data": {
    "applicationId": 123,
    "status": "APPROVED",
    "loanAccountNumber": "LA-992348",
    "aadhaarNo": "789012345678"
  }
}
```

### ❌ Application Not Found — 400 Bad Request

```json
{
  "success": false,
  "message": "Loan Application not found for id: 999"
}
```

### ❌ Missing Data — 400 Bad Request

```json
{
  "success": false,
  "message": "Both \"id\" and \"status\" are required in the request body."
}
```


