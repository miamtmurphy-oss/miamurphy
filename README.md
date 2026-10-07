# CPACC Study Tool

A static, accessible practice exam and flashcard resource for people preparing for the IAAP Certified Professional in Accessibility Core Competencies (CPACC) exam. It contains 50 original multiple-choice questions and 75 original study cards spanning the broad CPACC knowledge domains. It is not an official IAAP resource and does not reproduce IAAP sample or exam questions.

> This is an unofficial CPACC study tool and is not affiliated with or endorsed by IAAP.

## Run locally

Open `cpacc-study-tool/index.html` in a modern browser. There is no build step, package installation, account, or server requirement. A local static server can also serve the `cpacc-study-tool` directory as its document root.

## Features and privacy

- One question at a time, four answer choices shuffled for each exam, previous/next navigation, question jump list, review flags, and progress tracking. The saved answer order is retained for accurate review.
- Answers remain editable until submission. Correct answers and explanations are shown only after submission, with a filter for incorrect answers.
- Scores include the total and a breakdown across Disabilities; Accessibility and Universal Design; and Standards, Laws, and Management Strategies.
- Completed attempts are kept in this browser’s `localStorage`; starting another exam does not erase prior attempts. The latest saved attempt is available through **View Previous Results**.
- Results are never uploaded or sent to a server. The app has no analytics, third-party scripts, or network requests for score collection. When browser storage is blocked or full, the app explains that results cannot be saved; an in-tab result can still be reviewed after submission.
- Flashcards can be flipped, shuffled, navigated by keyboard, and filtered by domain.

Clearing browser storage, private browsing, browser restrictions, or using another browser or device may make saved results unavailable. Do not use this tool to store sensitive information.

## Updating study content

Question data lives in `cpacc-study-tool/questions.js`; flashcard data lives in `cpacc-study-tool/flashcards.js`. Both are plain JavaScript arrays assigned to `window.CPACC_QUESTIONS` and `window.CPACC_FLASHCARDS`. Add entries using the existing object shapes:

- Questions: `domain`, `prompt`, four `options`, zero-based `answer` index, and an explanatory `explanation`.
- Cards: `domain`, `term`, and `definition`.

Use one of the three domain names already listed in `questions.js` for consistent filters and score summaries. Keep questions and explanations original; do not copy official exam or sample-exam content. When changing the question count, update the exam progress maximum if it is no longer 50.

## GitHub Pages

The workflow at `.github/workflows/static.yml` uploads `cpacc-study-tool/` as the published site root and deploys it with GitHub Pages on pushes to `main` or a manual workflow run. Asset URLs are relative, so the same files also work when hosted under a project-site base path. To publish, enable GitHub Pages for the repository using **GitHub Actions** as the build and deployment source and merge/push the workflow change to `main`. This repository change prepares deployment but does not itself publish the site.

The repository’s existing `Accessible Keyboard Sound Game/` source and its README are retained. The Pages workflow publishes the CPACC Study Tool rather than that game.

## Reference materials

The content is original and was informed by concepts and scope described in these IAAP resources. These sources are study references, not question sources:

- [CPACC sample exam questions](https://www.accessibilityassociation.org/cpacc-sample-exam-questions) — used to understand format and scope only; questions here are not copied from it.
- [CPACC certification content outline](https://www.accessibilityassociation.org/cpacc-certification-content-outline)
- [CPACC Body of Knowledge](https://www.accessibilityassociation.org/sfsites/c/resource/CPACCBoK)

Use current official IAAP materials for definitive exam requirements and preparation.
