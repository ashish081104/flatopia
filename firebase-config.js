// ============================================================================
// FLATOPIA - LIVE FIREBASE CONFIGURATION & DEMO MODE SUPPORT
// ============================================================================
// If you haven't set up Firebase yet, Flatopia automatically runs in
// a smooth, fully interactive DEMO MODE using mock persistent state,
// so you can experience the complete futuristic UI immediately!
//
// To connect your real Firebase project:
// 1. Visit https://console.firebase.google.com/
// 2. Create a project and register a Web App
// 3. Paste the config keys into the object below.

export const firebaseConfig = {
  apiKey: "DEMO_MODE_API_KEY",
  authDomain: "flatopia-demo.firebaseapp.com",
  projectId: "flatopia-demo",
  storageBucket: "flatopia-demo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:demo1234567890"
};

// Internal domain for Username-based authentication
export const AUTH_EMAIL_DOMAIN = "flatopia.internal";

// Helper checking if real Firebase credentials are provided
export const isConfigured = () => {
  return firebaseConfig.apiKey && 
         firebaseConfig.apiKey !== "DEMO_MODE_API_KEY" && 
         !firebaseConfig.apiKey.includes("YOUR_API_KEY");
};
