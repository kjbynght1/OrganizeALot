# OrganizeALot v2.1.0 Build 023 — Android Gallery Backup

Built from the confirmed working Build 022 baseline.

## New in Build 023
- When **Use Photo** is pressed in the Android app, the accepted image is saved in two places:
  1. attached to the correct OrganizeALot inspection item; and
  2. copied automatically into Android shared photo storage so Samsung Gallery can display it.
- Gallery organization:
  - `Pictures / OrganizeALot / <Inspection ID>`
- Gallery filenames include the inspection ID, checklist item name, and timestamp.
- Deleting a photo from inside an inspection does **not** delete the Gallery backup.
- Existing Build 022 Waze, photo preview/retry, reopen/delete controls, saved inspections, archives, Preferred Reports workflow, and ZIP export remain in place.

## Android behavior
- Android 10 and newer use MediaStore shared image storage and do not require broad storage permission for photos created by this app.
- Android 9 and older request legacy write permission only when needed.

## Build status
- Android native project generated with Capacitor 8.4.2.
- Native `GallerySaver` plugin is registered in `MainActivity` and invoked by the existing **Use Photo** workflow.
