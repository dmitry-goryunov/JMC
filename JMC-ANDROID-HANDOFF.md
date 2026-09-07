# JMC Practice Android app: agent handover

## Goal

Build an offline Android practice app from the Junior Mathematical Challenge PDFs in Google Drive folder `My Drive/Github/JMC`, extended with the official UKMT individual-problem pages for 2004–2010.

The requested question-bank record is:

```text
year<TAB>question<TAB>correct answer letter<TAB>long worked answer
```

Each question is stored separately as a high-resolution screenshot. The app lets the user select a year and either questions 1–15 or 16–25, answer A–E, see the worked answer and retain progress offline.

## Current status

The requested implementation is complete.

| Item | Status |
| --- | --- |
| Source PDFs retrieved | Complete for 2011–2013 and 2015–2026 |
| Official web years imported | 2004–2010 |
| Question images generated | 550 |
| Answer records generated | 550 |
| Years covered | 22 |
| Bank validation | Passed |
| Java compilation and DEX generation | Passed |
| APK packaging and signing | Passed |
| APK signature verification | Passed |
| Physical device or emulator test | Not performed |

The source set contains no 2014 paper. The included years are 2004–2013 and 2015–2026, with 25 questions per year. UKMT's free year pages were found for 2004–2010; the same URL pattern returned no pages for 1997–2003. UKMT currently sells older paper bundles, so unavailable years were not reconstructed from unofficial answer lists.

## Final deliverables

All paths below are relative to the workspace root `/workspace/scratch/6100ab1d9cd8`.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `JMC-Practice-debug.apk` | Installable, debug-signed APK | `f2c7f49edac73604a6de081fbc752ca1ada23198cc87d632666d138fab76095d` |
| `JMC-question-bank-answers.txt` | Complete standalone answer bank | `6d95765d207e8cb1c0f4ed6c026529af77700ba939e58d33aefa67d8f7849f79` |
| `JMC-question-bank.zip` | Complete answer text plus 550 question images | `9830d3a4258bc5428a5a667a5aaf89ac04e8df19a08ecc594b78eaf2de3eba5b` |
| `JMC-Practice-Android-source.zip` | Android Studio project and bank-generation tools | `24b4f566ac68bbc562cfe8625ba1447d596d5c5d462971e4e8768008d72d7f86` |
| `JMC-2004-2010-answers.txt` | Legacy-year answer records only | `86c2666318af5c1a4f823f7e334eaeb0385ec4184aa1f5a546ec815ca27285b8` |
| `JMC-2004-2010-question-bank.zip` | Legacy-year answer text and 175 question images | `186f43584b6e9d3770b529c6ed5e5803a6477dc59d0e3e617b3ec2481b6da264` |

The deliverables are saved as persistent user-facing files.

## Working directories

```text
jmc-android/       Android project
source_pdfs/       Original PDFs retrieved from Google Drive
tmp/android-sdk/   Temporary Android SDK used to build the APK
tmp/ukmt-legacy-source/  Cached official legacy GIFs and the 2007 fallback paper
tmp/               Temporary rendering, OCR and build files
```

The original PDFs are not included in the deliverable ZIPs. They appear to be UK Mathematics Trust material and contain usage notices. Wider redistribution rights are unknown.

## Source coverage

The local `source_pdfs/` folder contains 27 PDFs. Years 2011–2013 use combined extended-solution PDFs. Years 2015–2026 use separate question and solution PDFs.

Years 2004–2010 come from UKMT's official year pages at:

```text
https://ukmt.org.uk/free-past-papers/junior-mathematical-challenge-<year>
```

Each page contains 25 question GIFs paired with 25 worked-solution GIFs. The migrated 2007 page omits its Q7 question image while retaining the solution; that one question crop was recovered from a complete scan of the same 2007 UKMT paper hosted by MyMathsCloud. The exception is implemented in `tools/import_legacy_web.py`.

```text
2011  jmc-2011-extended.pdf
2012  jmc-2012-extended.pdf
2013  jmc-2013-extended.pdf
2015  jmc-2015-q.pdf, jmc-2015-s.pdf
2016  jmc-2016-q.pdf, jmc-2016-s.pdf
2017  jmc-2017-q.pdf, jmc-2017-s.pdf
2018  jmc-2018-q.pdf, jmc-2018-s.pdf
2019  jmc-2019-q.pdf, jmc-2019-s.pdf
2020  JMC-2020-q.pdf, JMC-2020-s.pdf
2021  JMC-2021-paper.pdf, JMC-2021-Solutions.pdf
2022  JMC_2022_Paper.pdf, JMC_2022_Solutions_0.pdf
2023  JMC-2023_Paper.pdf, JMC-2023-Solutions.pdf
2024  JMC-2024-Question-Paper-4.pdf, JMC-2024-Solutions-1.pdf
2025  JMC-2025-Paper.pdf, JMC-2025-Solutions.pdf
2026  JMC_Paper_2026.pdf, JMC_Solutions_2026.pdf
```

## Android project

Project root: `jmc-android/`

Important files:

```text
jmc-android/
├── README.md
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── app/
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── assets/
│       │   ├── answers.txt
│       │   └── questions/<year>/q01.png ... q25.png
│       └── java/uk/co/jmcpractice/
│           ├── MainActivity.java
│           ├── ProgressStore.java
│           ├── Question.java
│           ├── QuestionBank.java
│           └── ZoomImageView.java
└── tools/
    ├── build_bank.py
    ├── import_legacy_web.py
    └── validate_bank.py
```

Application ID: `uk.co.jmcpractice`

Android configuration:

- Minimum SDK: 23 (Android 6.0)
- Target and compile SDK: 35
- Version: 1.1, version code 2
- Java: 17 in the Gradle configuration; source is Java 8-compatible
- Runtime dependencies: none
- Network permission: none
- Analytics: none

## App behaviour

`MainActivity.java` builds the interface programmatically and has no XML layouts.

Home screen:

- Year selector, newest first
- Range selector for questions 1–15 or 16–25
- Saved completion and score summary
- Start or resume button
- Reset progress for selected year

Question screen:

- High-resolution question image
- Pinch-to-zoom and drag support
- A–E selection
- Immediate marking
- Correct letter and worked answer
- Next or finish control

Progress is stored in Android `SharedPreferences` by year and question. The app resumes at the first unanswered question in the selected range. Completed ranges restart at their first question while retaining the stored answers.

## Question bank format

Canonical bank:

```text
jmc-android/app/src/main/assets/answers.txt
```

It is UTF-8, tab-separated and has four fields:

```text
year<TAB>question_number<TAB>A-E<TAB>worked_answer
```

Within the final field, backslashes, tabs and newlines are escaped. `QuestionBank.java` reverses those escapes at runtime. Comment lines begin with `#`.

Images use this path convention:

```text
questions/<year>/q<number-as-two-digits>.png
```

Example:

```text
questions/2026/q01.png
```

Questions from PDF papers were rendered at 240 dpi in greyscale. The official 2004–2010 GIFs were exported as two-times-resolution greyscale PNGs. Upscaling aids app rendering but does not create detail beyond the approximately 700-pixel-wide source GIFs. Crops include the complete question, diagrams and answer options.

## Generation and validation

From the workspace root:

```bash
python3 jmc-android/tools/build_bank.py
python3 jmc-android/tools/import_legacy_web.py
python3 jmc-android/tools/validate_bank.py
```

`build_bank.py` expects `source_pdfs/` to be a sibling of `jmc-android/`. It uses PyMuPDF, Pillow and Tesseract.

`import_legacy_web.py` downloads the official 2004–2010 UKMT question and solution GIFs, converts the questions, OCRs the worked answers and merges those 175 records into the PDF-derived bank. It contains visually checked 25-letter answer keys for each imported year, so a plausible OCR letter cannot silently replace the printed UKMT answer.

`validate_bank.py` checks:

- 550 unique answer rows
- 550 readable, non-empty question images
- Exactly 25 questions per included year
- Correct letters restricted to A–E
- Matching answer and image records

Last validation result:

```text
Validated 550 answer records and 550 question images across 22 years.
```

## Answer extraction limitations

Correct answer letters come from the official marking guides or the answer letters printed in UKMT's official worked-solution images. Some older PDFs have malformed embedded text, so 2011–2013 and 2016 marking strings are explicitly encoded in `build_bank.py`. The 2004–2010 keys were visually checked and are encoded in `import_legacy_web.py`.

Worked answers use official PDF text where reliable and OCR where the embedded text is malformed or supplied only as an image. Formula-heavy entries, particularly in older papers, may retain OCR artefacts. Four particularly damaged legacy entries have manual clean transcriptions in `MANUAL_SOLUTIONS`; the most obvious later-paper issues are corrected through `MANUAL_SOLUTION_CORRECTIONS` in `build_bank.py`. A complete mathematical editorial review of all long-answer typography has not been performed.

Manual corrections currently cover selected questions from 2011, 2013, 2015, 2016, 2019–2023, 2025 and 2026. Treat correct letters as validated against the official guides; treat exact typography and wording of long answers as potentially imperfect.

## Build history

The ordinary Gradle build command is:

```bash
cd jmc-android
gradle assembleDebug
```

In the current environment, Gradle 8.9 was downloaded successfully but the Android Gradle Plugin `8.7.3` could not be fetched from Google's Maven repository. This was an environment dependency-access failure, not a source compilation error.

The APK was therefore built with the installed Android command-line tools:

- `aapt2` to link the manifest and assets
- the JDK compiler module to compile Java
- `d8` to produce `classes.dex`
- `zipalign` to align the APK
- `apksigner` with a temporary debug key

The resulting APK is:

```text
JMC-Practice-debug.apk
```

Verified package metadata:

```text
package: uk.co.jmcpractice
versionCode: 2
versionName: 1.1
minSdkVersion: 23
targetSdkVersion: 35
compileSdkVersion: 35
launchable activity: uk.co.jmcpractice.MainActivity
```

Signature verification passed for APK signature schemes v1, v2 and v3. The APK contains one DEX file, one answer bank and all 550 question images.

## Recommended next work

The core requested scope is complete. If another agent continues the project, the most useful next actions are:

1. Install the APK on a physical Android device or emulator and run an end-to-end interaction test.
2. Review formula-heavy worked answers against the PDFs and replace residual OCR notation with clean mathematical text.
3. Add automated Android tests for bank loading, answer persistence and range-resume behaviour.
4. Add a proper launcher icon and, if publication is intended, create a release signing configuration.
5. Confirm UKMT permissions before distributing the app or bundled question images beyond private use.

## Known assumptions and unknowns

- The request `16-` was interpreted as questions 16–25 because every included paper has 25 questions.
- The absence of 2014 reflects the supplied Drive folder, not a claim that no 2014 JMC paper exists elsewhere.
- The 2004–2010 import is limited to UKMT's freely accessible individual-problem pages. Earlier URL-pattern failures are not evidence that the competitions or papers did not exist.
- Wider source-material redistribution permission is unknown.
- Behaviour on a real Android device is unverified; compilation, packaging, content and signature checks passed.
