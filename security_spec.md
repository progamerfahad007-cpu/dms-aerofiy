# aerofiy DMS — Firestore Security Specification (Phase 0)

## Data Invariants
1. Every document ID in all 12 collections (`dms_users`, `dms_products`, `dms_stores`, `dms_orders`, `dms_grns`, `dms_reconciliations`, `dms_final_invoices`, `dms_rtvs`, `dms_cashbook`, `dms_settlements`, `dms_day_locks`, `dms_settings`) must match `^[a-zA-Z0-9_\-]+$` with max length 128 characters.
2. Unknown collections are blocked by the global default-deny catch-all `match /{document=**} { allow read, write: if false; }`.
3. Every write enforces strict schema validation via `isValid[Entity](incoming())` checking required keys (`hasAll`), allowed keys (`hasOnly` to block ghost/shadow fields), exact field types, bounded string lengths, bounded list lengths, and valid enum values.
4. `dms_users` roles must strictly be one of `ADMIN`, `CASHIER`, `WAREHOUSE_MANAGER`, `SALES_REP`, `DELIVERYMAN`.
5. `dms_orders` status must strictly be one of `PENDING_DISPATCH`, `IN_TRANSIT`, `DELIVERED`, `PARTIAL_DELIVERY` and line items list capped at 200 items.
6. `dms_grns` invoice image data URL is bounded to 600,000 characters to stay safely within Firestore's 1MB document ceiling.
7. `dms_products` stock and price fields must be non-negative numbers.
8. `dms_cashbook` type must be `INFLOW` or `OUTFLOW` and amount must be a positive number.
9. `dms_settings` only allows the singleton document ID `main`.

## Adversarial Test Cases ("Dirty Dozen")
1. Unknown collection write (`/shadow_collection/hack`) -> DENIED (default-deny).
2. Oversized / malformed document ID (`/dms_users/../../etc/passwd` or 200-char ID) -> DENIED (`isValidId`).
3. Shadow/ghost field injection on `dms_users` (`{ ..., isSuperGod: true }`) -> DENIED (`hasOnly`).
4. Invalid role escalation on `dms_users` (`{ role: 'SUPERADMIN' }`) -> DENIED (role enum guard).
5. Oversized string payload on `dms_users.name` (> 120 chars) -> DENIED (`.size() <= 120`).
6. Negative stock injection on `dms_products` (`sellableStock: -50`) -> DENIED (`>= 0`).
7. Oversized line items array on `dms_orders` (> 200 items) -> DENIED (`items.size() <= 200`).
8. Invalid order status (`status: 'FREE_GOODS'`) -> DENIED (status enum guard).
9. Negative amount on `dms_cashbook` (`amount: -100`) -> DENIED (`amount > 0`).
10. Oversized GRN image payload (> 600,000 chars) -> DENIED (`invoiceImageDataUrl.size() <= 600000`).
11. Unauthorized settings doc ID (`/dms_settings/other`) -> DENIED (`settingId == 'main'`).
12. Wrong field types (`active: "yes"`, `unitCost: "100"`) -> DENIED (strict type checks).
