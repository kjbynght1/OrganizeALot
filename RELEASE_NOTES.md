# OrganizeALot v2.1.0 Build 023

## New in Build 023

- Added a **Navigate with Waze** button beside the existing map preview controls.
- Uses the inspection address already entered in OrganizeALot and starts Waze navigation to that destination.
- If Waze is installed on the phone, the Waze app opens; otherwise the Waze web experience is used.
- Added a clear address-required message if navigation is tapped before an address is entered.

## Preserved from Build 022

- Added a separate **Preferred Reports Commercial** inspection workflow.
- Added large section buttons with **red → yellow → green** completion states.
- Added company-specific areas for:
  - Job / contact information
  - Business operations, annual sales and payroll
  - Building / square footage details
  - Front, exterior, interior and hazard photo groups
  - Electrical panel documentation
  - Fire protection and commercial cooking
  - Additional buildings and adjacent exposures
  - Hazards and recommendations
  - BVS / RCT data entry
  - Diagrams and attachment checklist
  - Final field review
- Photos can be taken in any order.
- Each photo item supports unlimited photos.
- After capture, a full-screen **Use Photo / Retake** review is shown.
- Preserved working save rules: inspections are not stored until both Inspection ID and Address are entered.
- Keeps the 6 most recent inspections in the Resume list and moves older ones to searchable Archives.
- Finish & Export creates a ZIP containing a JSON report, printable HTML report and organized photo folders.
- Export uses the device save picker when available, then the phone share/save sheet, with regular ZIP download as fallback. This allows selecting OneDrive / NIIS when exposed by the device.
- No Azure portal, Microsoft Entra, Client ID, Microsoft sign-in or MSAL setup is used.
