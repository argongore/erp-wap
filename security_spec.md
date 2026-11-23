# Security Specification — Weekly Backup Database (Firestore)

## 1. Data Invariants
1. **Authenticated & Verified Only**: Every read/write on `/weeklyBackups`, `/weeklyBackups/{backupId}/parts`, and `/backupSettings` requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Ownership & Bootstrapped Admin Isolation**: Users can only read, list, create, update, or delete backup snapshots, parts, and settings where `ownerId == request.auth.uid`, unless they are the verified bootstrapped admin (`kasirwap@gmail.com` with `email_verified == true`).
3. **Master Gate Relational Sync**: A `BackupPart` document under `/weeklyBackups/{backupId}/parts/{partId}` cannot be created unless its parent `/weeklyBackups/{backupId}` exists, belongs to `request.auth.uid`, and is currently in `status == 'UPLOADING'`.
4. **Terminal State Locking**: Once a `WeeklyBackup` document transitions from `UPLOADING` to `COMPLETED`, non-admin updates are strictly rejected. `BackupPart` documents are strictly immutable after creation (`allow update: if false`).
5. **Temporal Integrity**: `createdAt` and `updatedAt` MUST equal `request.time` on creation; `createdAt` is immutable on update and `updatedAt` MUST equal `request.time`.
6. **Path & Size Hardening**: All document IDs (`backupId`, `partId`, `settingId`) must pass `isValidId` (`^[a-zA-Z0-9_\-]+$`, max 128 chars). Every string field enforces strict `maxLength` matching `firebase-blueprint.json`, and `records` arrays are capped at `<= 200` items.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `get /weeklyBackups/BKP-2026-W47-1` with `auth = null`.
2. **Unverified Admin Email Spoof**: `get /weeklyBackups/BKP-2026-W47-1` with `auth.token.email = 'kasirwap@gmail.com'`, `auth.token.email_verified = false`.
3. **Shadow Field Injection on Create**: Create `WeeklyBackup` containing extra ghost field `isAdmin: true` (blocked by `hasOnly`).
4. **Identity Spoofing on Create**: User A (`uid-A`) creates `WeeklyBackup` with `ownerId: 'uid-B'`.
5. **Orphaned Part Creation**: Create `/weeklyBackups/NON_EXISTENT/parts/P-1` when parent does not exist (blocked by Master Gate `exists`/`get`).
6. **Post-Completion Part Tampering**: Create a new part under `/weeklyBackups/{backupId}/parts/P-99` after parent `status` is `'COMPLETED'`.
7. **Immutable Part Modification**: Attempt `update` on `/weeklyBackups/{backupId}/parts/P-0` (blocked by `allow update: if false`).
8. **Terminal State Re-Opening**: Non-admin attempts `update` on a `COMPLETED` `WeeklyBackup` to change `status` back to `'UPLOADING'`.
9. **Client Timestamp Forgery**: Create `WeeklyBackup` with client-forged `createdAt` not equal to `request.time`.
10. **ID Poisoning Attack**: Create `/weeklyBackups/<200-char-junk-id>` or ID containing spaces/slashes (blocked by `isValidId`).
11. **Array Exhaustion / Oversized Records**: Create `BackupPart` with `records.size() > 200` or string field exceeding `maxLength`.
12. **Cross-Tenant List Scraping**: User B (`uid-B`) queries `/weeklyBackups` without filtering `ownerId == 'uid-B'` (blocked by `allow list` checking `existing().ownerId == request.auth.uid || isAdmin()`).
