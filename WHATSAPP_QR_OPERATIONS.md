# WhatsApp QR Operations

## Security expectations

- QR payloads are treated as sensitive credentials.
- Backend must never log raw QR strings.
- QR is kept in memory only (`lastQr`) and is not persisted to the database.
- Access to QR/status requires authenticated users with WhatsApp Settings permission.

## Runtime behavior

- Socket.IO is the primary channel for `whatsapp:status` and `whatsapp:qr`.
- Frontend can request an immediate state replay using `whatsapp:request-sync`.
- GraphQL `whatsAppStatus` and REST `/api/v1/whatsapp/qr` remain fallback reads.

## Operational notes

- `WHATSAPP_ENABLED` should remain disabled by default in environments without Chromium.
- A process restart may require re-pairing depending on `whatsapp-web.js` LocalAuth session state.
