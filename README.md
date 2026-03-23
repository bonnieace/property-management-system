# Nyathira Homes — M-Pesa Integration

Complete Node.js backend for Safaricom Daraja STK Push (Lipa Na M-Pesa Online).

---

## Project structure

```
nyathira-mpesa/
├── server.js              ← Express entry point
├── src/
│   ├── daraja.js          ← Safaricom API client (OAuth + STK Push + Query)
│   ├── mpesaRoutes.js     ← All /api/mpesa/* endpoints
│   └── bookingStore.js    ← In-memory booking state machine
├── public/
│   └── index.html         ← Full frontend (wired to the API)
├── .env.example           ← Copy this to .env and fill in credentials
└── README.md
```

---

## Sandbox setup — step by step

### 1. Create a Daraja developer account

Go to https://developer.safaricom.co.ke and sign up.

### 2. Create an app

In the Daraja portal → My Apps → Add a New App.
- Tick **Lipa Na M-Pesa Sandbox**
- Copy your **Consumer Key** and **Consumer Secret**

### 3. Get your sandbox credentials

Still in the portal, go to **APIs → Lipa Na M-Pesa Online → Simulate**.
The sandbox uses:
- **Business Short Code**: `174379`
- **Passkey**: `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919`

These are already set as defaults in `.env.example`.

### 4. Install and configure

```bash
git clone <this-repo>
cd nyathira-mpesa
npm install

cp .env.example .env
# Edit .env — paste your Consumer Key and Consumer Secret
```

### 5. Expose your local server with ngrok

Safaricom's servers must be able to reach your callback URL.
ngrok creates a public HTTPS tunnel to localhost.

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 4000
```

Copy the `https://xxxx.ngrok.io` URL and set in `.env`:

```
MPESA_CALLBACK_URL=https://xxxx.ngrok.io/api/mpesa/callback
```

### 6. Start the server

```bash
node server.js
```

You should see:
```
╔══════════════════════════════════════════╗
║   Nyathira Homes — M-Pesa Server         ║
║   Environment : sandbox                  ║
║   Listening on: http://localhost:4000    ║
╚══════════════════════════════════════════╝
```

### 7. Open the site

http://localhost:4000

Click **Book Now** on any unit, complete the form, and on the payment step
enter a sandbox test number.

---

## Sandbox test numbers

Safaricom provides test MSISDN numbers for the sandbox:

| Phone         | Behaviour                    |
|---------------|------------------------------|
| 254708374149  | Always succeeds              |
| 254700000000  | Insufficient funds           |
| 254711000000  | User cancels                 |

Enter these in the M-Pesa phone field (without the +).

---

## API endpoints

| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| POST   | /api/mpesa/stk-push         | Create booking + send STK Push           |
| POST   | /api/mpesa/callback         | Safaricom posts payment result here      |
| GET    | /api/mpesa/status/:bookingId| Frontend polls this for payment status   |
| POST   | /api/mpesa/query            | Manually query Daraja for STK status     |
| GET    | /api/mpesa/bookings         | List all bookings (admin)                |
| GET    | /health                     | Server health check                      |

---

## Going to production

1. **Swap credentials** — Replace sandbox Consumer Key/Secret with live ones.
   Change `MPESA_ENV=production` in `.env`.

2. **Register a real shortcode** — Apply for a Paybill or Till number from
   Safaricom Business. Use that as `MPESA_SHORTCODE`.

3. **Get the production passkey** — Available in your live Daraja app dashboard.

4. **Use a real database** — Replace `bookingStore.js` methods with actual DB
   calls. The interface is the same — just swap the implementations.

5. **Add authentication** to `/api/mpesa/bookings`.

6. **Set CORS origin** in `server.js` to your real domain.

7. **Deploy on a server with a static IP or domain** — Railway, Render, DigitalOcean,
   or any VPS. Safaricom requires HTTPS for callback URLs.

---

## Callback payload shape (for reference)

Safaricom POSTs this to your `/api/mpesa/callback` on success:

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "...",
      "CheckoutRequestID": "ws_CO_...",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount",             "Value": 6000 },
          { "Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV" },
          { "Name": "TransactionDate",    "Value": 20240315143022 },
          { "Name": "PhoneNumber",        "Value": 254708374149 }
        ]
      }
    }
  }
}
```

On failure (wrong PIN, cancelled, etc.) `ResultCode` is non-zero and
`CallbackMetadata` is absent.
