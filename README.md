# 🌌 FLATOPIA — Autonomous Roommate Management Hub

> **Apple-level simplicity + futuristic SaaS dashboard + shared-apartment command center.**

Flatopia is a zero-cost, serverless, production-grade roommate management system designed for roommates to track shared expenses, water bill distributions, household supplies, and immutable group notifications.

---

## 🚀 Live Demo & GitHub Pages Access

Flatopia is built using browser-native ES Modules and client-side reactive storage with Firebase Cloud synchronization. It requires **zero backend build steps** and runs directly via GitHub Pages:

👉 **URL Format:** `https://<your-username>.github.io/<your-repository-name>/`

---

## 🛠️ Step-by-Step GitHub Upload & Hosting Guide

### Method 1: Using the GitHub Web Interface (Simplest & Fastest)
1. Go to [GitHub.com](https://github.com) and sign in.
2. Click the **`+`** icon in the top right and select **New repository**.
3. Name your repository (e.g., `flatopia`), set it to **Public**, and click **Create repository**.
4. In the empty repository page, click **uploading an existing file**.
5. Drag and drop all the files and the `assets/` folder from `FLATOPIA` into the browser:
   ```text
   assets/
     ├── favicon.svg
     └── logo.svg
   .nojekyll
   README.md
   app.js
   firebase-config.js
   firebase-config.example.js
   firestore.rules
   index.html
   storage.rules
   styles.css
   ```
6. Click **Commit changes**.

#### Enable GitHub Pages:
1. In your GitHub repository, click **Settings** (tab at top).
2. In the left navigation, click **Pages**.
3. Under **Build and deployment > Branch**:
   - Select **`main`** branch (or `master`).
   - Select folder **`/(root)`**.
   - Click **Save**.
4. Within 1–2 minutes, GitHub will generate your live public link:
   `https://<your-username>.github.io/<repository-name>/`

---

### Method 2: Using Git Terminal (Command Line)
If you have Git installed on your computer:

```bash
cd C:\Users\Asus\Desktop\FLATOPIA
git init
git add .
git commit -m "Initial Flatopia release for GitHub Pages"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```
Then follow the **Enable GitHub Pages** steps above in repository settings.

---

## 👥 Default Roommates & Passwords (Fresh Start)

All initial demo expenses and transactions have been reset to **₹0.00**.

| Roommate | Flatopia Username | Default Password | Role |
| :--- | :--- | :--- | :--- |
| **Ashish** | `ashish` | `flatopia123` | Admin |
| **Roommate 2** | `roommate2` | `flatopia123` | Member |
| **Roommate 3** | `roommate3` | `flatopia123` | Member |
| **Roommate 4** | `roommate4` | `flatopia123` | Member |

*(Each roommate can click their profile avatar in the top right and select **"Change Password"** to set their private password at any time).*

---

## ⚡ Core Features

- **Digital Overall Spent Meter**: Live LED digital count-up odometer showing total pooled expenditure (`₹0000.00`) alongside individual roommate breakdown chips.
- **Immutable Notification Audit**: Notification bell (`ph-bell`) in the header records every item addition, deletion, and profile renaming permanently for all roommates.
- **Edit Profile Names**: Change display names across all roommate profiles with instant cascaded updates across past transactions.
- **Water Bill Command**: Specialized tracking for 20L drinking jars, tankers, and municipal pipeline bills.
- **Household & Utilities Hub**: Categorized tracking for garbage cleaning, groceries, Wi-Fi, and home maintenance.
- **Proof Receipts Lightbox**: Upload payment screenshots (JPG, PNG, WEBP) with zoom-in and inspection controls.
- **Autonomous Sandbox & Firebase Ready**: Works out of the box on GitHub Pages with local reactive persistence, and connects to live Firebase Firestore/Storage by updating `firebase-config.js`.

---

## 🌐 Multi-Device Synchronization (Why Custom Changes Reset on New Devices)

### Why this happens without Firebase:
When running on GitHub Pages **without** pasting your Firebase keys in `firebase-config.js`, Flatopia runs in **Autonomous Sandbox Mode**. In this mode, each browser or phone stores its changes inside that specific device's browser memory (`localStorage`). Therefore:
- If you change a password or rename Roommate 2 on your laptop, your phone (another device) doesn't have access to your laptop's local storage and displays the default profile until connected to a shared cloud database.

### ⚡ How to Enable Instant Sync Across All Phones & Laptops (Free Firebase):
To synchronize all roommates, name changes, passwords, and expenses across all roommates' phones simultaneously in real time:

1. **Create Free Project**: Go to [console.firebase.google.com](https://console.firebase.google.com/) and click **Add Project**.
2. **Enable Authentication**:
   - Go to **Build > Authentication > Sign-in method** and turn on **Email/Password**.
3. **Enable Firestore Database**:
   - Go to **Build > Firestore Database > Create Database**.
   - Under the **Rules** tab, paste the contents of `firestore.rules` and click **Publish**.
4. **Get Your Config Keys**:
   - Go to **Project Settings** (gear icon) > **General** > **Your Apps** > click the web icon (`</>`).
   - Copy your `firebaseConfig` object and paste it into `firebase-config.js`:
   ```javascript
   export const firebaseConfig = {
     apiKey: "AIzaSyYourActualKey...",
     authDomain: "your-app.firebaseapp.com",
     projectId: "your-app",
     storageBucket: "your-app.appspot.com",
     messagingSenderId: "123456789...",
     appId: "1:123456789:web:..."
   };
   ```
5. **Commit and Push to GitHub**:
   - Once `firebase-config.js` has your real project keys, Flatopia activates **Firebase Cloud Realtime**.
   - Custom roommate names, changed passwords, and expenses will now instantly synchronize across every roommate's phone, tablet, and PC!

