# OrganizeALot v2.1.0 Build 022 — Waze + Reopen Photo Fix

This remains **Build 022**.

Changes in this revision:
- Added a Waze button inside every inspection. It uses that inspection's saved address.
- Added Waze on the new-inspection setup screen.
- Fixed reopened inspections so each photo stays under the correct checklist item.
- Fixed Delete Photo placement so it remains directly under each photo after reopening.
- Photos are persisted in IndexedDB by inspection and checklist item.
- Preserves multiple inspections, 6 newest in Resume, older inspections in Archived Inspections.
- Saves inspections only after both Inspection ID and Address are entered.
- Preferred Reports workflow includes 13 field sections, required-photo status tracking, unlimited photos, preview with Use Photo / Retake, final missing-photo check, and ZIP export.
