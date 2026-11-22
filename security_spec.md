# Security Specification — The House That Remembers (Firestore Multiplayer)

## 1. Data Invariants
1. **Default Deny**: All paths outside `/lobbies/{lobbyId}` and its explicit subcollections (`players`, `privateRoles`, `actions`) are denied.
2. **Verified Authentication**: Every read and write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document operation validates `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `<= 128` chars), and `lobbyId` matches `^[A-Z0-9]{6}$` equal to `inviteCode`.
4. **Master Gate Membership**: Access to `/players`, `/privateRoles`, and `/actions` verifies the parent `/lobbies/{lobbyId}` exists and `request.auth.uid in parent.memberUids` (strictly bounded `memberUids.size() <= 4`).
5. **Private Role Isolation**: `/lobbies/{lobbyId}/privateRoles/{playerUid}` is strictly readable ONLY when `request.auth.uid == playerUid` — never by other players in the lobby.
6. **Turn Ownership & Version Monotonicity**: Active-game updates to `/lobbies/{lobbyId}` require `existing().currentTurnUid == request.auth.uid` and `incoming().version == existing().version + 1`.
7. **Terminal State Lock**: Once `existing().status == 'finished'`, no further updates to `/lobbies/{lobbyId}` are permitted.
8. **Temporal Integrity**: `createdAt`, `joinedAt`, and `updatedAt` must equal `request.time`.
9. **No PII Leakage**: Player seats store only chosen `displayName` and `characterId` — never emails, phones, or addresses.

## 2. The Dirty Dozen Adversarial Payloads (Must All Be Rejected)
1. **Unauthenticated Lobby Creation**: `auth: null` writing to `/lobbies/ABC123`.
2. **Unverified Email Spoofing**: `auth.token.email_verified: false` creating or updating a lobby.
3. **Identity Spoofing on Create**: User A sets `hostUid: "userB"` or `memberUids: ["userB"]`.
4. **Shadow / Ghost Field Injection**: Creating or updating a lobby with extra field `isAdmin: true`.
5. **Oversized ID Poisoning**: Creating `/lobbies/AAA...` (150 chars) or non-alphanumeric ID.
6. **Out-of-Turn State Hijack**: Player B updates `publicState` when `currentTurnUid == Player A`.
7. **Stale / Replay Version Overwrite**: Updating lobby with `version == existing.version` instead of `+ 1`.
8. **Terminal State Tampering**: Updating a lobby whose `status` is already `'finished'`.
9. **Private Role Eavesdropping**: Player A attempts `get` on `/lobbies/ABC123/privateRoles/playerB`.
10. **Non-Member Subcollection Write**: Outsider C writes to `/lobbies/ABC123/actions/act1`.
11. **Backdated Timestamp Forgery**: Creating a lobby with client-supplied past timestamp instead of `request.time`.
12. **Blanket Collection Scraping**: Listing `/lobbies` without matching `request.auth.uid in resource.data.memberUids`.
