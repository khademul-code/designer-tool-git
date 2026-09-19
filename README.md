# Git Contribution Designer & Git History Lab

A local-first, interactive learning platform and testing application for understanding **Git internals**, **commit timestamps**, **contribution calendar visualization**, and **controlled Git history management**.

---

## 1. Project Overview

This project is built for developers and learners who want to deeply understand how Git records history and timestamps, and how services like GitHub compute contribution graphs.

### Key Principles
- **Local-First**: Operates 100% offline without requiring internet for local Git operations.
- **Real Git Commits**: Uses real Git commands (`git log`, `git commit --allow-empty`, `git reset`, `git push`) via Node.js `child_process.execFile`. It never fakes history or calendar data in the UI.
- **Repository Separation**: The application source code (`Designer_Tool`) and the target test repository (e.g. `C:\GitLabs\contribution-test-repo`) remain strictly separate.
- **Safety First**: No arbitrary shell execution, with explicit confirmation dialogs for destructive history operations and remote pushes.

```text
Visual Designer / Commit Lab
         ↓
  Commit Schedule
         ↓
Real Local Git Commits (with GIT_AUTHOR_DATE)
         ↓
 Real Git History (.git)
         ↓
 Explicit Push (git push)
         ↓
 GitHub Remote Repository
         ↓
 GitHub Independently Calculates Contribution Graph
```

---

## 2. Requirements

- **Operating System**: Windows, macOS, or Linux (Fully tested on Windows with PowerShell/CMD)
- **Node.js**: Version 18.0.0 or higher
- **Git**: Git CLI installed and available in system `PATH` (`git --version`)

---

## 3. Installation

Clone or download the project folder, then install dependencies:

```powershell
# Inside Designer_Tool folder:
npm install
```

---

## 4. Running Locally

Start the application server:

```powershell
npm start
```

Or for development with automatic restarts:

```powershell
npm run dev
```

Open your browser at:
```text
http://localhost:3000
```

---

## 5. Creating a Disposable Test Repository

We recommend creating a fresh, disposable Git repository on your machine for learning and experimentation:

```powershell
# In PowerShell or CMD:
mkdir C:\GitLabs\contribution-test-repo
cd C:\GitLabs\contribution-test-repo
git init -b main
```

---

## 6. Configuring the Repository

1. In the web app, navigate to **Settings** (or **Repository Settings**).
2. Enter the absolute path to your test repository: `C:\GitLabs\contribution-test-repo`.
3. Set your preferred **Default Branch** (e.g. `main`) and **Remote Name** (e.g. `origin`).
4. Set your **Author Name** and **Author Email**.
5. Click **"Test Path"** to verify that Git is initialized.
6. Click **"Save & Apply Settings"**.
7. The **Dashboard** will immediately reflect the live branch, working tree state, and commit counts.

---

## 7. Viewing Git History

Navigate to the **Git History** tab:
- **Reverse Chronological Log**: Inspect commit hashes, author timestamps, committers, and subjects.
- **Filters**: Filter by commit message search, author name/email, start date, and end date.
- **Daily Summary**: View daily commit totals grouped by calendar date directly from `git log`.

---

## 8. Using Commit Lab

Navigate to the **Commit Lab** tab:
- Choose an explicit **Target Date** and **Target Time**.
- Enter the **Number of Commits** (1 to 100).
- Enter a custom **Commit Message** and author details.
- Click **"Preview Commits"** to inspect the timestamp and commit parameters.
- Click **"Create Real Git Commits"**:
  - The server executes `git commit --allow-empty` with `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` environment overrides.
  - The created commit hashes are displayed in real-time.
  - The Contribution Calendar and Git history update immediately.

---

## 9. Creating Contribution Designs

Navigate to the **Contribution Designer** tab:
- **Pixel Art Canvas**: 7 rows (Sunday to Saturday) representing calendar days.
- **Tools**:
  - ✏️ **Pen**: Click or drag to paint cells.
  - 🧹 **Eraser**: Reset cells to 0 commits.
  - 🪣 **Fill All**: Fill all grid cells with chosen intensity.
  - 🗑️ **Clear**: Clear grid to 0.
  - ↩️ **Undo** & ↪️ **Redo**: Full history stack for drawing actions.
- **Intensity Picker**: Select commit counts for cells (1, 2, 4, or 7 commits).
- **Presets**: Load built-in presets such as **Heart Pattern**, **Smiley Face**, or **HI! Letters**.
- **Save & Load**: Save custom patterns to `data/designs.json` and reload or duplicate them anytime.

---

## 10. Converting Designs to Commit Schedules

- In the Designer, choose a **Pattern Start Date** (e.g. `2026-09-01`).
- Click **"Preview Schedule"**:
  - The application maps the 2D grid week-by-week and day-by-day onto consecutive calendar dates.
  - Displays total calendar days, active days with commits, and total commits scheduled.

---

## 11. Applying Designs Locally

1. In the Designer, click **"Apply Locally to Git"**.
2. Review the confirmation dialog showing total commits and target repository.
3. Click **"Confirm & Create Commits"**.
4. The server creates the real Git commits locally in batch.
5. The **Contribution Calendar** updates immediately to display your designed pattern!

---

## 12. Pulling from GitHub

Navigate to the **Remote & Sync** tab:
- Click **"Pull from Remote"** (`git pull origin main`).
- Displays live terminal output from Git.

---

## 13. Pushing to GitHub

- View your configured remote URL, branch, and unpushed commits count.
- Click **"Push to GitHub Remote"**:
  - Requires explicit modal confirmation showing the exact command (`git push origin main`).
  - Uses your computer's existing Git credential manager / SSH keys.
  - Pushes real Git commits to your remote GitHub repository.
  - GitHub will independently calculate its contribution graph from the repository's commit history!

---

## 14. History Management (History Lab)

Navigate to the **History Lab** tab for controlled learning operations:
- **Undo Last 1 Commit**: Executes `git reset --hard HEAD~1`.
- **Reset Last N Commits**: Enter N and execute `git reset --hard HEAD~N`.
- **Reset Test Branch**: Resets the disposable test branch to a clean initial state.
- **Safety First**: Every operation displays a clear warning modal and explanation before execution.

---

## 15. Safety Warnings

> [!CAUTION]
> - Always perform experiments on a **disposable test repository**.
> - Never target production or team repositories for learning experiments.
> - Rewriting local history (e.g. via `git reset`) on branches already pushed to a remote will cause history divergence.

---

## 16. Offline Usage

- **100% Offline**: Starting the app, configuring repositories, reading history, viewing the calendar, designing patterns, creating plans, and generating real local Git commits works completely offline without internet.
- **Online Only**: Internet connectivity is only needed when executing `git push` or `git pull` to a remote server like GitHub.

---

## 17. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Git CLI Not Found"** | Git is not installed or not in PATH | Install Git for Windows and ensure "Add Git to PATH" was selected during install. |
| **"Directory is not a Git repository"** | The folder was not initialized | Run `git init` inside the target directory. |
| **"Working tree contains uncommitted changes"** | Files modified in working directory | Commit or stash changes before running history reset commands. |
| **"Git Push Failed: Authentication"** | GitHub authentication required | Ensure you are logged into Git using GitHub CLI (`gh auth login`) or have SSH keys configured. |

---

## License

MIT License - Built for educational and Git internals learning purposes.
