# Haunted Exploration

Third-generation integration workspace for **The House That Remembers**.

This repository is the **only writable target** of the guarded consolidation. The original repositories remain unchanged:

- Foundation source: [westkitty/Betrayal_Agy](https://github.com/westkitty/Betrayal_Agy), reviewed main `9922de88a5990f0e21fe810138577ff0209c9248`.
- Reference source: [westkitty/Haunted_Betrayal](https://github.com/westkitty/Haunted_Betrayal), reviewed branch `arena/80bdded6-haunted-betrayal` at `d00799b43e0d1aa2c959fbbafc7f2a26753c7cc6`.

## Integration status

This initial `main` commit only establishes the empty destination. The implementation belongs on a separate integration branch; do not mistake this README-only baseline for a playable game.

Proposed milestone sequence: **P001** verified source and ownership inventory, **P002** one Agy-based engine and presentation architecture with selectively adapted Haunted behaviors, **P003** safe saves and tests, **P004** complete solo Last Midnight experience, **P006** measured rendering performance.

Design guards: retain both six-character rosters as separate narrative alternatives until an explicit canon decision; preserve existing Agy save compatibility; do not silently convert Haunted saves; do not expose insecure experimental multiplayer as production-ready. No automatic deployment or merge into `main`.
