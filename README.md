# OrganizeALot Residential Inspection Assistant - Phone App v1.8

This is the residential-focused phone app version for OrganizeALot / Inspection Assistant.

## What it does now

- Creates and saves inspections on the phone/browser
- Stores job details:
  - Company/destination folder
  - Workflow
  - Inspection ID
  - Insured/job name
  - Address
  - Year built
  - Roof age
  - HVAC age
  - Electric
  - Notes
- Residential-focused workflows:
  - Residential
  - Apartment
  - USAA
- Has inspection checklist categories:
  - Exterior
  - Roof
  - Interior
  - Utilities
  - Hazards
  - Documents
  - Other
- Captures or imports photos from the phone
- Photo category and checklist buttons turn green after photos are added
- Automatically corrects sideways/rotated photos before saving and exporting
- Simple finger sketch pad for house layout
- Quick house outline button
- Sketch is saved with the inspection and included in the export ZIP
- Exact residential photo list with required photo progress
- Export warning if required photos are incomplete
- Reads EXIF GPS/date when the photo has it
- Falls back to phone GPS when adding photos
- Exports an organized ZIP:
  - Company folder
  - Inspection ID / name / address folder
  - Photos separated by category
  - inspection-summary.txt
  - inspection-data.json

## Best way to use it on Android

1. Upload these files to GitHub Pages or any HTTPS website.
2. Open the app link in Chrome or Edge on the phone.
3. Tap the browser menu.
4. Tap "Add to Home screen" or "Install app".
5. Start a new inspection.
6. Export the ZIP when done.

## Notes

- The app stores data on the device. Do not clear browser storage until you export finished inspections.
- GPS permission is needed if you want phone GPS added to imported/captured photos.
- EXIF GPS works only when the photo file actually contains GPS data.
- This is Version 1. The next versions should add:
  - better address-to-photo matching
  - Google Photos import flow
  - inspection templates by company
  - native Android APK build
  - direct save-to-folder if supported by the phone/browser


## v1.6
- Automatic inspection photo adjustment with roof/shingle detail protection
- Protects bright areas so already-bright photos are not over-brightened
- Adjustment strength setting: Light, Medium, Strong shade fix


## v1.7
- After taking a photo, the app checks quality before saving.
- If the photo appears bad, the app asks:
  - Save Anyway
  - Retake
  - Auto-fix
- Checks for dark photos, over-bright photos, roof/shingle washout risk, and possible blur.
- Good photos save without interruption.


## v1.8
- Replaced the freehand house sketch with a measurement sketch builder.
- Enter a wall length, then tap directional keys to build the sketch.
- Direction buttons include straight and angled walls: up, down, left, right, and diagonals.
- Added custom angle wall option.
- Sketch export now includes measurement-sketch.png and measurements.txt.
