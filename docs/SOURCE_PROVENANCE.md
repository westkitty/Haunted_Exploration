# Frozen source provenance

Original sources are immutable references for this integration work.

- Agy foundation: https://github.com/westkitty/Betrayal_Agy/tree/9922de88a5990f0e21fe810138577ff0209c9248
- Haunted exploration reference: https://github.com/westkitty/Haunted_Betrayal/tree/d00799b43e0d1aa2c959fbbafc7f2a26753c7cc6
- New-only writable target: https://github.com/westkitty/Haunted_Exploration

Copied Agy source files retain their relative paths. This initial import **intentionally replaces** firebase-applet-config.json with an all-empty, disabled placeholder to avoid attaching the third game to an old cloud project. It **does not copy** public/assets/aistudio/Paste_November_21__2026_-_8_48PM_cbf9c9ad because it is an original prompt dump, not a required runtime dependency; the original remains at the pinned source. The third game does not inherit any previously deployed backend, Firebase instance, cloud secrets or runtime entitlement.

See OPERATIONAL_STATE.md for the current tested/not-tested status and docs/ARCHITECTURE_DECISIONS.md for the KEEP/ADAPT/DEFER/REJECT decisions. The new game's source commits track changes separately; never overwrite source repositories to resolve conflicts.
