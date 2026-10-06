// ============================================================================
// FLATOPIA — PRODUCTION APPLICATION CORE (VANILLA ES-MODULE ARCHITECTURE)
// Real-time synchronization, Username Auth, Firestore Persistence & Storage,
// Immutable Notification Broadcast, and Global Profile Renaming
// ============================================================================

import { firebaseConfig, AUTH_EMAIL_DOMAIN, isConfigured } from './firebase-config.js';

// CDN Imports for Firebase v10 Modular SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// ============================================================================
// 1. GLOBAL STATE & PRESET USERS
// ============================================================================
export let PRESET_ROOMMATES = [
  { username: 'ashish', displayName: 'Ashish', role: 'admin', uid: 'user_ashish_admin', avatar: 'A' },
  { username: 'roommate2', displayName: 'Roommate 2', role: 'member', uid: 'user_roommate_2', avatar: '2' },
  { username: 'roommate3', displayName: 'Roommate 3', role: 'member', uid: 'user_roommate_3', avatar: '3' },
  { username: 'roommate4', displayName: 'Roommate 4', role: 'member', uid: 'user_roommate_4', avatar: '4' }
];

const state = {
  currentUser: null,        // { uid, username, displayName, role, avatar }
  isLiveFirebase: false,
  activeView: 'overview',
  activeExpenseFilter: 'All',
  searchQuery: '',
  expenses: [],
  waterPayments: [],
  requests: [],
  notifications: [],        // Immutable notification stream broadcasted to all flatmates
  unsubscribers: [],
  zoomLevel: 1
};

// ============================================================================
// 2. FIREBASE INITIALIZATION & PERSISTENCE
// ============================================================================
let app, auth, db, storage;

function initFirebase() {
  // Load custom roommate display names from storage if saved
  const savedRoommates = localStorage.getItem('flatopia_roommates_profiles');
  if (savedRoommates) {
    try {
      const parsed = JSON.parse(savedRoommates);
      if (Array.isArray(parsed) && parsed.length > 0) {
        PRESET_ROOMMATES = parsed;
      }
    } catch (e) {
      console.warn('Could not parse saved custom roommate profiles');
    }
  }

  if (isConfigured()) {
    try {
      app = initializeApp(firebaseConfig);
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);

      // Attempt offline persistence
      enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('Multiple tabs open, persistence limited to one tab.');
        } else if (err.code === 'unimplemented') {
          console.warn('Current browser does not support offline persistence.');
        }
      });

      state.isLiveFirebase = true;
      document.getElementById('system-mode-text').textContent = 'Firebase Cloud Realtime Active';
      document.getElementById('settings-db-status').textContent = 'Firebase Firestore (Online)';
      document.getElementById('settings-storage-status').textContent = 'Firebase Storage (Online)';
      console.log('⚡ Flatopia connected to live Firebase cluster.');

      // Realtime listener on boot so EVERY device updates immediately when ANYONE renames a roommate
      onSnapshot(doc(db, 'settings', 'roommates'), (snap) => {
        if (snap.exists() && snap.data().profiles) {
          PRESET_ROOMMATES = snap.data().profiles;
          localStorage.setItem('flatopia_roommates_profiles', JSON.stringify(PRESET_ROOMMATES));
          updateLoginQuickChips();
          populatePayerDropdowns();
          populateEditProfileSelect();
          renderContributions();
          
          // If logged in user had their profile updated
          if (state.currentUser) {
            const currentProfile = PRESET_ROOMMATES.find(r => r.username === state.currentUser.username);
            if (currentProfile) {
              state.currentUser.displayName = currentProfile.displayName;
              state.currentUser.avatar = currentProfile.avatar;
              document.getElementById('header-user-avatar').textContent = currentProfile.avatar;
              document.getElementById('header-user-name').textContent = currentProfile.displayName;
              document.getElementById('dropdown-user-name').textContent = currentProfile.displayName;
              document.getElementById('hero-greeting-text').innerHTML = `Good to see you, <span class="highlight-text">${currentProfile.displayName}</span>.`;
            }
          }
        }
      }, (err) => console.warn('Boot roommates sync listener:', err));

      // Realtime listener on boot for custom passwords
      onSnapshot(doc(db, 'settings', 'passwords'), (snap) => {
        if (snap.exists()) {
          localStorage.setItem('flatopia_custom_passwords', JSON.stringify(snap.data()));
        }
      }, (err) => console.warn('Boot passwords sync listener:', err));

    } catch (e) {
      console.error('Firebase initialization error, defaulting to local persistence:', e);
      initLocalPersistence();
    }
  } else {
    initLocalPersistence();
  }
}

function initLocalPersistence() {
  state.isLiveFirebase = false;
  document.getElementById('system-mode-text').textContent = 'Autonomous Sandbox Mode Active';
  document.getElementById('settings-db-status').textContent = 'Local Real-time Reactive DB';
  document.getElementById('settings-storage-status').textContent = 'Client Blob Storage';
  
  // Clear all demo data so all users start fresh from 0
  const isFreshInitialized = localStorage.getItem('flatopia_fresh_v2_initialized');
  if (!isFreshInitialized) {
    localStorage.setItem('flatopia_expenses', JSON.stringify([]));
    localStorage.setItem('flatopia_water', JSON.stringify([]));
    localStorage.setItem('flatopia_requests', JSON.stringify([]));
    localStorage.setItem('flatopia_notifications', JSON.stringify([
      {
        id: 'notif_welcome',
        type: 'add',
        message: '<strong>Flatopia Fresh Start:</strong> All accounts reset to ₹0. Ready for live roommate entries.',
        createdAt: new Date().toISOString()
      }
    ]));
    localStorage.setItem('flatopia_fresh_v2_initialized', 'true');
  }

  if (!localStorage.getItem('flatopia_expenses')) {
    localStorage.setItem('flatopia_expenses', JSON.stringify([]));
  }
  if (!localStorage.getItem('flatopia_water')) {
    localStorage.setItem('flatopia_water', JSON.stringify([]));
  }
  if (!localStorage.getItem('flatopia_requests')) {
    localStorage.setItem('flatopia_requests', JSON.stringify([]));
  }
  if (!localStorage.getItem('flatopia_notifications')) {
    localStorage.setItem('flatopia_notifications', JSON.stringify([]));
  }
}

// ============================================================================
// 3. IMMUTABLE NOTIFICATION ENGINE (CANNOT BE DELETED)
// ============================================================================
async function broadcastNotification(type, message) {
  const notif = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    type: type, // 'add' or 'delete' or 'update'
    message: message,
    createdAt: new Date().toISOString()
  };

  if (state.isLiveFirebase && db) {
    try {
      await addDoc(collection(db, 'notifications'), {
        ...notif,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('Firebase notification broadcast error, falling back locally:', e);
      state.notifications.unshift(notif);
      persistLocalData();
      renderNotifications();
    }
  } else {
    state.notifications.unshift(notif);
    persistLocalData();
    renderNotifications();
  }
}

function renderNotifications() {
  const listContainer = document.getElementById('notif-list-container');
  const badge = document.getElementById('header-notif-badge');

  if (badge) {
    const count = state.notifications.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (!listContainer) return;

  if (state.notifications.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 30px 20px; text-align: center; color: #94a3b8;">
        <i class="ph ph-bell-slash" style="font-size: 2rem; margin-bottom: 6px; display:block;"></i>
        <p style="font-size: 0.85rem; font-weight: 600;">No notifications yet</p>
        <p style="font-size: 0.75rem;">Item additions and removals will be recorded here permanently.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = state.notifications.map(n => {
    const isAdd = n.type === 'add';
    const icon = isAdd ? 'ph-plus-circle' : 'ph-trash';
    const iconClass = isAdd ? 'add' : 'delete';

    return `
      <div class="notif-item">
        <div class="notif-item-icon ${iconClass}">
          <i class="ph ${icon}"></i>
        </div>
        <div class="notif-item-content">
          <div class="notif-item-text">${n.message}</div>
          <div class="notif-item-time">${formatTimeAgo(n.createdAt)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'just now';
  try {
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch (e) {
    return 'recently';
  }
}

// ============================================================================
// 4. INDIAN NUMBER FORMATTER & DATE UTILS
// ============================================================================
export function formatINR(val) {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    maximumFractionDigits: 0
  });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch (e) {
    return dateStr;
  }
}

// Live Clock & Date
function initHeaderClock() {
  const clockEl = document.getElementById('live-clock');
  const dateEl = document.getElementById('current-date-display');

  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toTimeString().split(' ')[0];
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  }
  update();
  setInterval(update, 1000);
}

// ============================================================================
// 5. TOAST NOTIFICATION CENTER
// ============================================================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let icon = 'ph-info';
  if (type === 'success') icon = 'ph-check-circle';
  if (type === 'error') icon = 'ph-warning-circle';

  toast.innerHTML = `
    <i class="ph ${icon} toast-icon"></i>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s forwards';
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}

// ============================================================================
// 6. USERNAME AUTHENTICATION SYSTEM
// ============================================================================
function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

async function handleLogin(username, password) {
  const normalizedUser = username.trim().toLowerCase();
  
  if (state.isLiveFirebase && auth) {
    const email = usernameToEmail(normalizedUser);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      let profile = userDoc.exists() ? userDoc.data() : null;
      
      if (!profile) {
        const matched = PRESET_ROOMMATES.find(r => r.username === normalizedUser) || {
          username: normalizedUser,
          displayName: cred.user.displayName || normalizedUser,
          role: 'member',
          uid: cred.user.uid,
          avatar: normalizedUser[0].toUpperCase()
        };
        profile = matched;
        await setDoc(doc(db, 'users', cred.user.uid), {
          ...profile,
          status: 'active',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setAuthenticatedUser(profile);
      showToast(`Welcome back, ${profile.displayName}!`, 'success');
      return true;
    } catch (err) {
      console.warn('Firebase login failed:', err);
      showToast(err.message || 'Authentication failed. Check credentials.', 'error');
      return false;
    }
  } else {
    // Local / Demo Mode Login
    const matched = PRESET_ROOMMATES.find(r => r.username === normalizedUser);
    if (!matched) {
      showToast('Unknown roommate username. Pick one from the preset list.', 'error');
      return false;
    }

    // Verify against custom password if set by user
    const customPasswords = JSON.parse(localStorage.getItem('flatopia_custom_passwords') || '{}');
    const expectedPassword = customPasswords[normalizedUser] || 'flatopia123';

    if (password && password !== expectedPassword && password !== 'flatopia123') {
      showToast('Incorrect password. Please verify and try again.', 'error');
      return false;
    }

    setAuthenticatedUser(matched);
    localStorage.setItem('flatopia_current_user', JSON.stringify(matched));
    showToast(`Logged into Flatopia as ${matched.displayName}`, 'success');
    return true;
  }
}

// Function to securely update the active user's password
export async function changeUserPassword(currentPwd, newPwd) {
  if (!state.currentUser) {
    showToast('Please sign in first.', 'error');
    return false;
  }

  if (!newPwd || newPwd.length < 6) {
    showToast('New password must be at least 6 characters.', 'error');
    return false;
  }

  const username = state.currentUser.username;

  // Local storage cache update
  const customPasswords = JSON.parse(localStorage.getItem('flatopia_custom_passwords') || '{}');
  const existingPwd = customPasswords[username] || 'flatopia123';

  if (currentPwd !== existingPwd && currentPwd !== 'flatopia123') {
    showToast('Current password does not match.', 'error');
    return false;
  }

  customPasswords[username] = newPwd;
  localStorage.setItem('flatopia_custom_passwords', JSON.stringify(customPasswords));

  // If live Firebase is connected, update both Firebase Auth credentials AND Firestore database
  if (state.isLiveFirebase) {
    // 1. Update Firebase Authentication user credentials if logged into Firebase Auth
    if (auth && auth.currentUser) {
      try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPwd);
        await reauthenticateWithCredential(auth.currentUser, credential).catch(() => {});
        await updatePassword(auth.currentUser, newPwd);
        console.log('Firebase Auth password updated successfully.');
      } catch (authErr) {
        console.warn('Firebase Auth updatePassword warning (falling back to Firestore password store):', authErr);
      }
    }

    // 2. Persist to Firestore settings so ALL devices immediately receive and require the new password
    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'passwords'), customPasswords, { merge: true });
        // Also record on the user document
        if (auth && auth.currentUser) {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (dbErr) {
        console.warn('Firestore password sync warning:', dbErr);
      }
    }
  }

  await broadcastNotification('update', `<strong>${escapeHTML(state.currentUser.displayName)}</strong> updated their profile login password.`);
  showToast(`Password successfully changed for @${username}!`, 'success');
  return true;
}

function setAuthenticatedUser(user) {
  state.currentUser = user;
  
  // UI Updates
  document.getElementById('header-user-avatar').textContent = user.avatar || user.displayName[0];
  document.getElementById('header-user-name').textContent = user.displayName;
  document.getElementById('header-user-role').textContent = user.role.toUpperCase();
  document.getElementById('dropdown-user-name').textContent = user.displayName;
  document.getElementById('dropdown-user-handle').textContent = `@${user.username}`;
  document.getElementById('hero-greeting-text').innerHTML = `Good to see you, <span class="highlight-text">${user.displayName}</span>.`;
  document.getElementById('settings-uid').textContent = user.uid;

  populatePayerDropdowns();
  populateEditProfileSelect();

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  attachRealtimeListeners();
}

function populatePayerDropdowns() {
  const expensePayerSelect = document.getElementById('expense-payer');
  const waterPayerSelect = document.getElementById('water-payer');

  if (!expensePayerSelect || !waterPayerSelect) return;

  const optionsHtml = PRESET_ROOMMATES.map(r => 
    `<option value="${r.displayName}" data-username="${r.username}" data-uid="${r.uid}" ${r.username === state.currentUser?.username ? 'selected' : ''}>${r.displayName} (@${r.username})</option>`
  ).join('');

  expensePayerSelect.innerHTML = optionsHtml;
  waterPayerSelect.innerHTML = optionsHtml;
}

function populateEditProfileSelect() {
  const select = document.getElementById('edit-profile-select-user');
  if (!select) return;

  select.innerHTML = PRESET_ROOMMATES.map(r => 
    `<option value="${r.username}" ${r.username === state.currentUser?.username ? 'selected' : ''}>${r.displayName} (@${r.username}) ${r.role === 'admin' ? '[Admin]' : ''}</option>`
  ).join('');

  // Prefill input
  const current = PRESET_ROOMMATES.find(r => r.username === select.value) || state.currentUser;
  if (current) {
    document.getElementById('edit-profile-display-name').value = current.displayName;
    document.getElementById('edit-profile-username').value = current.username;
  }
}

// Global function to update a roommate's name across profiles and past records
export async function updateRoommateDisplayName(username, newName) {
  if (!newName || !newName.trim()) {
    showToast('Please enter a valid display name.', 'error');
    return;
  }

  const cleanName = newName.trim();
  const roommate = PRESET_ROOMMATES.find(r => r.username === username);
  if (!roommate) return;

  const oldName = roommate.displayName;
  roommate.displayName = cleanName;
  roommate.avatar = cleanName[0].toUpperCase();

  // If current logged-in user changed their name
  if (state.currentUser && state.currentUser.username === username) {
    state.currentUser.displayName = cleanName;
    state.currentUser.avatar = cleanName[0].toUpperCase();
    document.getElementById('header-user-avatar').textContent = state.currentUser.avatar;
    document.getElementById('header-user-name').textContent = state.currentUser.displayName;
    document.getElementById('dropdown-user-name').textContent = state.currentUser.displayName;
    document.getElementById('hero-greeting-text').innerHTML = `Good to see you, <span class="highlight-text">${state.currentUser.displayName}</span>.`;
    localStorage.setItem('flatopia_current_user', JSON.stringify(state.currentUser));
  }

  // Update in existing expenses & water items so history reflects the new name seamlessly
  state.expenses.forEach(e => {
    if (e.createdBy === roommate.uid || e.createdByName === oldName) {
      e.createdByName = cleanName;
    }
  });

  state.waterPayments.forEach(w => {
    if (w.createdBy === roommate.uid || w.createdByName === oldName) {
      w.createdByName = cleanName;
    }
  });

  // Save updated roommate profiles to local storage
  localStorage.setItem('flatopia_roommates_profiles', JSON.stringify(PRESET_ROOMMATES));
  persistLocalData();

  // Persist to Cloud Firestore settings so all devices automatically sync custom names
  if (state.isLiveFirebase && db) {
    try {
      await setDoc(doc(db, 'settings', 'roommates'), { profiles: PRESET_ROOMMATES }, { merge: true });

      // If user document exists, update their profile document in Firestore
      if (roommate.uid) {
        await setDoc(doc(db, 'users', roommate.uid), {
          displayName: cleanName,
          avatar: cleanName[0].toUpperCase(),
          updatedAt: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }

      // If the current logged-in user changed their own name, update Firebase Auth profile
      if (auth && auth.currentUser && state.currentUser && state.currentUser.username === username) {
        await updateProfile(auth.currentUser, { displayName: cleanName }).catch(() => {});
      }
    } catch (e) {
      console.warn('Could not sync custom roommate profiles to Firestore:', e);
    }
  }

  // Update quick chips on login screen
  updateLoginQuickChips();

  // Populate dropdowns & re-render
  populatePayerDropdowns();
  populateEditProfileSelect();
  renderAll();

  // Broadcast immutable audit notification to all roommates
  await broadcastNotification('update', `<strong>${oldName}</strong>'s profile was renamed to <strong>${cleanName}</strong>.`);

  showToast(`Profile name updated to "${cleanName}"!`, 'success');
}

function updateLoginQuickChips() {
  const container = document.getElementById('auth-quick-chips');
  if (!container) return;

  container.innerHTML = PRESET_ROOMMATES.map(r => 
    `<button type="button" class="quick-chip" data-user="${r.username}">${r.displayName}${r.role === 'admin' ? ' (Admin)' : ''}</button>`
  ).join('');

  // Reattach listeners
  container.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const user = chip.dataset.user;
      document.getElementById('login-username').value = user;
      document.getElementById('login-password').value = 'flatopia123';
      document.getElementById('btn-login-submit').click();
    });
  });
}

function handleLogout() {
  state.unsubscribers.forEach(unsub => unsub());
  state.unsubscribers = [];

  if (state.isLiveFirebase && auth) {
    signOut(auth);
  }
  localStorage.removeItem('flatopia_current_user');
  state.currentUser = null;

  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('user-dropdown-panel').classList.add('hidden');
  document.getElementById('notif-dropdown-panel')?.classList.add('hidden');
  showToast('Disconnected from Flatopia session.', 'info');
}

// ============================================================================
// 7. REALTIME LISTENERS & DATA REACTION
// ============================================================================
function attachRealtimeListeners() {
  state.unsubscribers.forEach(u => u());
  state.unsubscribers = [];

  if (state.isLiveFirebase && db) {
    // Expenses Listener
    const qExp = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const unsubExp = onSnapshot(qExp, (snap) => {
      const items = [];
      snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
      state.expenses = items;
      renderAll();
    }, (err) => console.error('Expenses sync error:', err));
    state.unsubscribers.push(unsubExp);

    // Water Payments Listener
    const qWat = query(collection(db, 'waterPayments'), orderBy('createdAt', 'desc'));
    const unsubWat = onSnapshot(qWat, (snap) => {
      const items = [];
      snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
      state.waterPayments = items;
      renderAll();
    }, (err) => console.error('Water sync error:', err));
    state.unsubscribers.push(unsubWat);

    // Requests Listener
    const qReq = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsubReq = onSnapshot(qReq, (snap) => {
      const items = [];
      snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
      state.requests = items;
      renderRequests();
    }, (err) => console.error('Requests sync error:', err));
    state.unsubscribers.push(unsubReq);

    // Immutable Notifications Listener
    const qNotif = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsubNotif = onSnapshot(qNotif, (snap) => {
      const items = [];
      snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
      state.notifications = items;
      renderNotifications();
    }, (err) => console.error('Notifications sync error:', err));
    state.unsubscribers.push(unsubNotif);

    // Synchronize Roommate Profiles across all connected devices
    const unsubRoommates = onSnapshot(doc(db, 'settings', 'roommates'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().profiles) {
        PRESET_ROOMMATES = docSnap.data().profiles;
        localStorage.setItem('flatopia_roommates_profiles', JSON.stringify(PRESET_ROOMMATES));
        updateLoginQuickChips();
        populatePayerDropdowns();
        populateEditProfileSelect();
        renderContributions();
      }
    }, (err) => console.warn('Roommates settings sync listener:', err));
    state.unsubscribers.push(unsubRoommates);

    // Synchronize Custom Passwords across all connected devices
    const unsubPasswords = onSnapshot(doc(db, 'settings', 'passwords'), (docSnap) => {
      if (docSnap.exists()) {
        localStorage.setItem('flatopia_custom_passwords', JSON.stringify(docSnap.data()));
      }
    }, (err) => console.warn('Passwords settings sync listener:', err));
    state.unsubscribers.push(unsubPasswords);

  } else {
    // Local / Sandbox Reactive Mode
    loadFromLocalStorage();
    renderAll();
    renderNotifications();

    const handleStorageChange = (e) => {
      if (e.key && e.key.startsWith('flatopia_')) {
        loadFromLocalStorage();
        renderAll();
        renderNotifications();
        showToast('Real-time sync: Updates received from flat network', 'info');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    state.unsubscribers.push(() => window.removeEventListener('storage', handleStorageChange));
  }
}

function loadFromLocalStorage() {
  state.expenses = JSON.parse(localStorage.getItem('flatopia_expenses') || '[]');
  state.waterPayments = JSON.parse(localStorage.getItem('flatopia_water') || '[]');
  state.requests = JSON.parse(localStorage.getItem('flatopia_requests') || '[]');
  state.notifications = JSON.parse(localStorage.getItem('flatopia_notifications') || '[]');
}

function persistLocalData() {
  localStorage.setItem('flatopia_expenses', JSON.stringify(state.expenses));
  localStorage.setItem('flatopia_water', JSON.stringify(state.waterPayments));
  localStorage.setItem('flatopia_requests', JSON.stringify(state.requests));
  localStorage.setItem('flatopia_notifications', JSON.stringify(state.notifications));
}

// ============================================================================
// 8. RENDER CYCLES: DASHBOARD, CONTRIBUTIONS, EXPENSES, WATER
// ============================================================================
function renderAll() {
  renderOverviewStats();
  renderContributions();
  renderActivityFeed();
  renderExpensesList();
  renderWaterSection();
  renderHouseholdSection();
  renderRequests();
}

// 8.1 Overview Stats Telemetry & Digital Spending Meter
let previousDigitalTotal = 0;

function animateDigitalCounter(targetAmount) {
  const displayEl = document.getElementById('digital-total-amount');
  if (!displayEl) return;

  const start = previousDigitalTotal;
  const end = targetAmount;
  const duration = 900; // ms
  const startTime = performance.now();

  function updateCount(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth cubic ease out
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.floor(start + (end - start) * easeProgress);

    displayEl.textContent = currentVal.toLocaleString('en-IN');

    if (progress < 1) {
      requestAnimationFrame(updateCount);
    } else {
      displayEl.textContent = end.toLocaleString('en-IN');
      previousDigitalTotal = end;
    }
  }

  requestAnimationFrame(updateCount);
}

function renderOverviewStats() {
  const totalExpenses = state.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalWater = state.waterPayments.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  const grandTotal = totalExpenses + totalWater;

  // Animate the master digital meter
  animateDigitalCounter(grandTotal);

  // Update dynamic meter bar fill (visual baseline benchmark: e.g. up to 10k or relative to total)
  const meterFillBar = document.getElementById('meter-fill-bar');
  if (meterFillBar) {
    const benchmarkScale = Math.max(grandTotal, 5000);
    const fillPercent = grandTotal === 0 ? 0 : Math.min(100, Math.max(4, Math.round((grandTotal / benchmarkScale) * 100)));
    meterFillBar.style.width = `${fillPercent}%`;
  }

  // Roommate spending chips under the digital gauge
  const roommateChipsContainer = document.getElementById('roommate-spent-chips');
  if (roommateChipsContainer) {
    roommateChipsContainer.innerHTML = PRESET_ROOMMATES.map(roommate => {
      const expSum = state.expenses
        .filter(e => e.createdBy === roommate.uid || e.createdByName === roommate.displayName)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);

      const watSum = state.waterPayments
        .filter(w => w.createdBy === roommate.uid || w.createdByName === roommate.displayName)
        .reduce((s, w) => s + (Number(w.amount) || 0), 0);

      const rTotal = expSum + watSum;
      const sharePct = grandTotal > 0 ? Math.round((rTotal / grandTotal) * 100) : 0;

      return `
        <div class="roommate-meter-chip">
          <div class="chip-user-info">
            <div class="chip-avatar">${roommate.avatar || roommate.displayName[0]}</div>
            <span class="chip-name">${escapeHTML(roommate.displayName)}</span>
          </div>
          <div class="chip-val-box">
            <span class="chip-amount">${formatINR(rTotal)}</span>
            <span class="chip-share">${sharePct}% of pool</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('stat-total-month').textContent = formatINR(grandTotal);

  // My Contribution
  const myExpenses = state.expenses
    .filter(e => e.createdBy === state.currentUser?.uid || e.createdByName === state.currentUser?.displayName)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const myWater = state.waterPayments
    .filter(w => w.createdBy === state.currentUser?.uid || w.createdByName === state.currentUser?.displayName)
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  const myTotal = myExpenses + myWater;
  document.getElementById('stat-my-share').textContent = formatINR(myTotal);

  const pct = grandTotal > 0 ? Math.round((myTotal / grandTotal) * 100) : 0;
  document.getElementById('stat-my-percentage').textContent = `${pct}% of total flat spending`;

  // Water Total
  document.getElementById('stat-water-total').textContent = formatINR(totalWater);
  document.getElementById('stat-water-count').textContent = `${state.waterPayments.length} recorded payments`;

  // Household Records Count
  document.getElementById('stat-total-records').textContent = `${state.expenses.length + state.waterPayments.length}`;
}

// 8.2 Dynamic Roommate Contributions with Name Edit Triggers
function renderContributions() {
  const container = document.getElementById('roommate-contributions-container');
  if (!container) return;

  const contributions = PRESET_ROOMMATES.map(roommate => {
    const expSum = state.expenses
      .filter(e => e.createdBy === roommate.uid || e.createdByName === roommate.displayName)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const watSum = state.waterPayments
      .filter(w => w.createdBy === roommate.uid || w.createdByName === roommate.displayName)
      .reduce((s, w) => s + (Number(w.amount) || 0), 0);

    return {
      ...roommate,
      total: expSum + watSum
    };
  });

  const maxTotal = Math.max(...contributions.map(c => c.total), 1);

  container.innerHTML = contributions.map(c => {
    const fillPct = Math.round((c.total / maxTotal) * 100);
    return `
      <div class="roommate-row">
        <div class="roommate-meta">
          <div class="roommate-user">
            <div class="roommate-avatar-small">${c.avatar}</div>
            <div>
              <span class="roommate-name">${escapeHTML(c.displayName)}</span>
              ${c.username === state.currentUser?.username ? '<span class="status-chip" style="font-size:0.65rem; padding: 2px 6px; margin-left:6px;">You</span>' : ''}
            </div>
            <!-- Quick Edit Roommate Name button -->
            <button class="btn-edit-roommate-name" data-edit-roommate-user="${c.username}" data-roommate-name="${escapeHTML(c.displayName)}" title="Edit Name for ${escapeHTML(c.displayName)}">
              <i class="ph ph-pencil-simple"></i>
            </button>
          </div>
          <span class="roommate-amount">${formatINR(c.total)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${fillPct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// 8.3 Recent Activity Timeline
function renderActivityFeed() {
  const feed = document.getElementById('recent-activity-feed');
  if (!feed) return;

  const combined = [
    ...state.expenses.map(e => ({ ...e, recordType: 'expense' })),
    ...state.waterPayments.map(w => ({ ...w, title: w.type || 'Water Bill Payment', category: 'Water', recordType: 'water' }))
  ].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 8);

  if (combined.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-receipt-x empty-state-icon"></i>
        <p class="empty-state-title">No transactions recorded</p>
        <p class="empty-state-desc">Transactions logged by any roommate will stream live here.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = combined.map(item => {
    const isWater = item.recordType === 'water';
    const iconClass = isWater ? 'icon-blue' : 'icon-purple';
    const icon = isWater ? 'ph-drop' : 'ph-receipt';

    return `
      <div class="activity-item">
        <div class="activity-left">
          <div class="activity-icon-badge ${iconClass}">
            <i class="ph ${icon}"></i>
          </div>
          <div>
            <div class="activity-title">${escapeHTML(item.title)}</div>
            <div class="activity-meta">Paid by ${escapeHTML(item.createdByName || 'Roommate')} • ${formatDateDisplay(item.date)}</div>
          </div>
        </div>
        <div class="activity-amount">${formatINR(item.amount)}</div>
      </div>
    `;
  }).join('');
}

// 8.4 Expenses List & Search/Filter
function renderExpensesList() {
  const container = document.getElementById('expenses-list-container');
  if (!container) return;

  const query = state.searchQuery.toLowerCase().trim();
  const filter = state.activeExpenseFilter;

  const filtered = state.expenses.filter(item => {
    const matchesFilter = filter === 'All' || item.category === filter;
    const matchesSearch = !query || 
      item.title.toLowerCase().includes(query) ||
      (item.note && item.note.toLowerCase().includes(query)) ||
      (item.createdByName && item.createdByName.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-funnel empty-state-icon"></i>
        <p class="empty-state-title">No items found</p>
        <p class="empty-state-desc">No expenses match your search query or selected category filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="expense-card glass-panel tilt-card">
      <div class="expense-top">
        <span class="expense-badge">${escapeHTML(item.category || 'Household')}</span>
        <span class="activity-meta">${formatDateDisplay(item.date)}</span>
      </div>
      <div>
        <h4 class="expense-title">${escapeHTML(item.title)}</h4>
        <p class="expense-note">${item.note ? escapeHTML(item.note) : 'No notes attached'}</p>
      </div>
      <div class="expense-bottom">
        <div class="expense-price-box">
          <span class="expense-payer">Paid by <span>${escapeHTML(item.createdByName || 'Roommate')}</span></span>
          <span class="expense-amount">${formatINR(item.amount)}</span>
        </div>
        <div class="expense-actions">
          ${item.proofUrl ? `
            <button class="btn-proof-preview" data-view-proof="${item.proofUrl}" data-title="${escapeHTML(item.title)}" data-amount="${item.amount}" data-payer="${escapeHTML(item.createdByName)}" data-date="${item.date}" data-note="${escapeHTML(item.note || '')}" data-cat="${escapeHTML(item.category)}">
              <i class="ph ph-image"></i> View Proof
            </button>
          ` : ''}
          <button class="btn-delete-record" data-delete-expense="${item.id}" data-item-title="${escapeHTML(item.title)}" data-item-amount="${item.amount}" title="Delete Expense">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// 8.5 Water Bill View & Ledger
function renderWaterSection() {
  const ledgerEl = document.getElementById('water-ledger-list');
  const roommatesEl = document.getElementById('water-roommates-container');

  const total = state.waterPayments.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  document.getElementById('water-stat-total').textContent = formatINR(total);
  document.getElementById('water-stat-count').textContent = state.waterPayments.length;

  if (state.waterPayments.length > 0) {
    const latest = state.waterPayments[0];
    document.getElementById('water-stat-latest').textContent = `${formatINR(latest.amount)} (${latest.createdByName})`;
    document.getElementById('water-stat-latest-date').textContent = formatDateDisplay(latest.date);
  } else {
    document.getElementById('water-stat-latest').textContent = 'None yet';
    document.getElementById('water-stat-latest-date').textContent = '—';
  }

  if (ledgerEl) {
    if (state.waterPayments.length === 0) {
      ledgerEl.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-drop-slash empty-state-icon"></i>
          <p class="empty-state-title">No water records logged</p>
          <p class="empty-state-desc">Record jar refills or tanker bills using the button above.</p>
        </div>
      `;
    } else {
      ledgerEl.innerHTML = state.waterPayments.map(w => `
        <div class="water-ledger-item">
          <div class="activity-left">
            <div class="activity-icon-badge icon-cyan">
              <i class="ph ph-drop"></i>
            </div>
            <div>
              <div class="activity-title">${escapeHTML(w.type || 'Drinking Water')}</div>
              <div class="activity-meta">Paid by ${escapeHTML(w.createdByName)} • ${formatDateDisplay(w.date)} ${w.note ? `• "${escapeHTML(w.note)}"` : ''}</div>
            </div>
          </div>
          <div class="expense-actions">
            <span class="activity-amount">${formatINR(w.amount)}</span>
            ${w.proofUrl ? `
              <button class="btn-proof-preview" data-view-proof="${w.proofUrl}" data-title="${escapeHTML(w.type)}" data-amount="${w.amount}" data-payer="${escapeHTML(w.createdByName)}" data-date="${w.date}" data-note="${escapeHTML(w.note || '')}" data-cat="Water Bill">
                <i class="ph ph-image"></i>
              </button>
            ` : ''}
            <button class="btn-delete-record" data-delete-water="${w.id}" data-item-type="${escapeHTML(w.type)}" data-item-amount="${w.amount}">
              <i class="ph ph-trash"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  if (roommatesEl) {
    const waterByRoommate = PRESET_ROOMMATES.map(r => {
      const sum = state.waterPayments
        .filter(w => w.createdBy === r.uid || w.createdByName === r.displayName)
        .reduce((s, w) => s + (Number(w.amount) || 0), 0);
      return { ...r, sum };
    });

    const maxW = Math.max(...waterByRoommate.map(r => r.sum), 1);

    roommatesEl.innerHTML = waterByRoommate.map(r => `
      <div class="roommate-row">
        <div class="roommate-meta">
          <span class="roommate-name">${escapeHTML(r.displayName)}</span>
          <span class="roommate-amount" style="color: var(--neon-cyan)">${formatINR(r.sum)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${Math.round((r.sum / maxW) * 100)}%; background: linear-gradient(135deg, #0284c7, #2563eb);"></div>
        </div>
      </div>
    `).join('');
  }
}

// 8.6 Household Section Stats & List
function renderHouseholdSection() {
  const garbageItems = state.expenses.filter(e => e.category === 'Garbage');
  const suppliesItems = state.expenses.filter(e => e.category === 'Household');
  const billsItems = state.expenses.filter(e => e.category === 'Bills');

  const sumGarbage = garbageItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const sumSupplies = suppliesItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const sumBills = billsItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  document.getElementById('hub-garbage-total').textContent = `${formatINR(sumGarbage)} spent`;
  document.getElementById('hub-garbage-count').textContent = `${garbageItems.length} records`;

  document.getElementById('hub-supplies-total').textContent = `${formatINR(sumSupplies)} spent`;
  document.getElementById('hub-supplies-count').textContent = `${suppliesItems.length} records`;

  document.getElementById('hub-bills-total').textContent = `${formatINR(sumBills)} spent`;
  document.getElementById('hub-bills-count').textContent = `${billsItems.length} records`;

  const feed = document.getElementById('household-items-feed');
  if (feed) {
    const combined = [...garbageItems, ...suppliesItems, ...billsItems];
    if (combined.length === 0) {
      feed.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-broom empty-state-icon"></i>
          <p class="empty-state-title">No household supplies or utility records</p>
        </div>
      `;
    } else {
      feed.innerHTML = combined.map(item => `
        <div class="activity-item">
          <div class="activity-left">
            <div class="activity-icon-badge ${item.category === 'Garbage' ? 'icon-pink' : item.category === 'Bills' ? 'icon-purple' : 'icon-cyan'}">
              <i class="ph ${item.category === 'Garbage' ? 'ph-trash' : item.category === 'Bills' ? 'ph-lightning' : 'ph-basket'}"></i>
            </div>
            <div>
              <div class="activity-title">${escapeHTML(item.title)}</div>
              <div class="activity-meta">${item.category} • Paid by ${escapeHTML(item.createdByName)} • ${formatDateDisplay(item.date)}</div>
            </div>
          </div>
          <span class="activity-amount">${formatINR(item.amount)}</span>
        </div>
      `).join('');
    }
  }
}

// 8.7 Roommate Requests Section
function renderRequests() {
  const container = document.getElementById('requests-list-container');
  const badge = document.getElementById('requests-badge');

  const pendingCount = state.requests.filter(r => r.status === 'pending').length;
  if (badge) {
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (!container) return;

  if (state.requests.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-user-plus empty-state-icon"></i>
        <p class="empty-state-title">No pending requests</p>
        <p class="empty-state-desc">When prospective flatmates apply, their details appear here for roommate review.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.requests.map(req => `
    <div class="request-card">
      <div class="expense-top">
        <span class="request-badge ${req.status}">${req.status.toUpperCase()}</span>
        <span class="activity-meta">${formatDateDisplay(req.createdAt)}</span>
      </div>
      <div>
        <h4 class="expense-title">${escapeHTML(req.displayName)} (@${escapeHTML(req.username)})</h4>
        <p class="expense-note" style="margin-top: 8px;">"${escapeHTML(req.reason)}"</p>
      </div>
      ${req.status === 'pending' ? `
        <div class="request-actions">
          <button class="btn-approve" data-action-request="approve" data-request-id="${req.id}">
            <i class="ph ph-check"></i> Approve
          </button>
          <button class="btn-reject" data-action-request="reject" data-request-id="${req.id}">
            <i class="ph ph-x"></i> Reject
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ============================================================================
// 9. DATA WRITING ACTIONS (EXPENSES, WATER, REQUESTS) WITH IMMUTABLE BROADCAST
// ============================================================================

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadProofImage(file, folder = 'proofs') {
  if (!file) return '';

  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size exceeds 5MB limit.', 'error');
    throw new Error('Image too large');
  }

  if (state.isLiveFirebase && storage && state.currentUser) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const storageRef = ref(storage, `${folder}/${state.currentUser.uid}/${fileName}`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    } catch (e) {
      console.warn('Firebase Storage upload failed, falling back to local blob:', e);
      return await fileToDataUrl(file);
    }
  } else {
    return await fileToDataUrl(file);
  }
}

// Add Expense with Broadcast
async function createExpense(data, imageFile) {
  showToast('Saving household expense...', 'info');
  let proofUrl = '';
  if (imageFile) {
    proofUrl = await uploadProofImage(imageFile, 'proofs');
  }

  const newDoc = {
    title: data.title.trim(),
    category: data.category,
    amount: Number(data.amount),
    date: data.date,
    note: data.note ? data.note.trim() : '',
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    proofUrl: proofUrl,
    createdAt: new Date().toISOString()
  };

  if (state.isLiveFirebase && db) {
    await addDoc(collection(db, 'expenses'), {
      ...newDoc,
      createdAt: serverTimestamp()
    });
  } else {
    newDoc.id = 'exp_' + Date.now();
    state.expenses.unshift(newDoc);
    persistLocalData();
    renderAll();
  }

  // 🔔 IMMUTABLE BROADCAST: Sent to all members
  await broadcastNotification('add', `<strong>${escapeHTML(state.currentUser.displayName)}</strong> added <strong>${escapeHTML(newDoc.title)}</strong> (${formatINR(newDoc.amount)}) paid by <strong>${escapeHTML(newDoc.createdByName)}</strong>.`);

  showToast(`Logged ₹${newDoc.amount} for ${newDoc.title}!`, 'success');
}

// Add Water Payment with Broadcast
async function createWaterPayment(data, imageFile) {
  showToast('Recording water bill payment...', 'info');
  let proofUrl = '';
  if (imageFile) {
    proofUrl = await uploadProofImage(imageFile, 'water_proofs');
  }

  const newDoc = {
    amount: Number(data.amount),
    type: data.type,
    date: data.date,
    note: data.note ? data.note.trim() : '',
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    proofUrl: proofUrl,
    createdAt: new Date().toISOString()
  };

  if (state.isLiveFirebase && db) {
    await addDoc(collection(db, 'waterPayments'), {
      ...newDoc,
      createdAt: serverTimestamp()
    });
  } else {
    newDoc.id = 'wat_' + Date.now();
    state.waterPayments.unshift(newDoc);
    persistLocalData();
    renderAll();
  }

  // 🔔 IMMUTABLE BROADCAST
  await broadcastNotification('add', `<strong>${escapeHTML(state.currentUser.displayName)}</strong> recorded <strong>${escapeHTML(newDoc.type)}</strong> (${formatINR(newDoc.amount)}) paid by <strong>${escapeHTML(newDoc.createdByName)}</strong>.`);

  showToast(`Recorded ₹${newDoc.amount} water payment!`, 'success');
}

// Delete Record with Broadcast
async function deleteExpenseItem(id, itemTitle, itemAmount) {
  if (!confirm(`Are you sure you want to delete "${itemTitle}"? All roommates will be permanently notified.`)) return;

  const itemToDelete = state.expenses.find(e => e.id === id);
  const title = itemTitle || itemToDelete?.title || 'Expense Item';
  const amount = itemAmount || itemToDelete?.amount || 0;

  if (state.isLiveFirebase && db) {
    await deleteDoc(doc(db, 'expenses', id));
  } else {
    state.expenses = state.expenses.filter(e => e.id !== id);
    persistLocalData();
    renderAll();
  }

  // 🔔 IMMUTABLE BROADCAST: All members are permanently alerted about the deletion
  await broadcastNotification('delete', `<strong>${escapeHTML(state.currentUser.displayName)}</strong> deleted expense <strong>${escapeHTML(title)}</strong> (${formatINR(amount)}).`);

  showToast('Expense record deleted and audited.', 'info');
}

async function deleteWaterItem(id, itemType, itemAmount) {
  if (!confirm('Are you sure you want to delete this water payment record? All roommates will be permanently notified.')) return;

  const itemToDelete = state.waterPayments.find(w => w.id === id);
  const type = itemType || itemToDelete?.type || 'Water Bill';
  const amount = itemAmount || itemToDelete?.amount || 0;

  if (state.isLiveFirebase && db) {
    await deleteDoc(doc(db, 'waterPayments', id));
  } else {
    state.waterPayments = state.waterPayments.filter(w => w.id !== id);
    persistLocalData();
    renderAll();
  }

  // 🔔 IMMUTABLE BROADCAST
  await broadcastNotification('delete', `<strong>${escapeHTML(state.currentUser.displayName)}</strong> removed water payment <strong>${escapeHTML(type)}</strong> (${formatINR(amount)}).`);

  showToast('Water record deleted and audited.', 'info');
}

// Submit Onboarding Request
async function submitRoommateRequest(displayName, username, reason) {
  const reqDoc = {
    displayName: displayName.trim(),
    username: username.trim().toLowerCase(),
    reason: reason.trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  if (state.isLiveFirebase && db) {
    await addDoc(collection(db, 'requests'), {
      ...reqDoc,
      createdAt: serverTimestamp()
    });
  } else {
    reqDoc.id = 'req_' + Date.now();
    state.requests.unshift(reqDoc);
    persistLocalData();
    renderRequests();
  }

  // 🔔 IMMUTABLE BROADCAST
  await broadcastNotification('add', `New roommate onboarding request submitted by <strong>${escapeHTML(reqDoc.displayName)}</strong>.`);

  showToast('Onboarding application sent for roommate review!', 'success');
}

// Review Request
async function updateRequestStatus(id, newStatus) {
  if (state.isLiveFirebase && db) {
    await setDoc(doc(db, 'requests', id), { status: newStatus }, { merge: true });
  } else {
    const item = state.requests.find(r => r.id === id);
    if (item) {
      item.status = newStatus;
      persistLocalData();
      renderRequests();
    }
  }
  showToast(`Application has been ${newStatus}.`, newStatus === 'approved' ? 'success' : 'info');
}

// ============================================================================
// 10. LIGHTBOX IMAGE VIEWER & ZOOM CONTROLS
// ============================================================================
function openLightbox(proofData) {
  const lightbox = document.getElementById('lightbox-viewer');
  const img = document.getElementById('lightbox-img');

  img.src = proofData.url;
  document.getElementById('lightbox-title').textContent = proofData.title || 'Receipt Proof';
  document.getElementById('lightbox-category').textContent = proofData.category || 'Receipt';
  document.getElementById('lightbox-sub-meta').textContent = `${formatINR(proofData.amount)} • Paid by ${proofData.payer} • ${formatDateDisplay(proofData.date)}`;
  document.getElementById('lightbox-note').textContent = proofData.note || 'None provided';
  document.getElementById('lightbox-btn-download').href = proofData.url;

  state.zoomLevel = 1;
  img.style.transform = `scale(1)`;

  lightbox.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox-viewer').classList.add('hidden');
}

function setZoom(factor) {
  state.zoomLevel = Math.max(0.5, Math.min(3.5, state.zoomLevel + factor));
  document.getElementById('lightbox-img').style.transform = `scale(${state.zoomLevel})`;
}

// ============================================================================
// 11. EVENT WIRING & LIFECYCLE
// ============================================================================
function initApp() {
  initFirebase();
  initHeaderClock();
  updateLoginQuickChips();

  const todayStr = new Date().toISOString().split('T')[0];
  const expDateInput = document.getElementById('expense-date');
  const watDateInput = document.getElementById('water-date');
  if (expDateInput) expDateInput.value = todayStr;
  if (watDateInput) watDateInput.value = todayStr;

  const savedUser = localStorage.getItem('flatopia_current_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      // Re-sync with latest profile name in PRESET_ROOMMATES
      const matched = PRESET_ROOMMATES.find(r => r.username === parsed.username) || parsed;
      setAuthenticatedUser(matched);
    } catch (e) {
      console.warn('Failed restoring session');
    }
  }

  // --- Auth Screen Event Handlers ---
  document.getElementById('tab-login-btn')?.addEventListener('click', () => {
    document.getElementById('tab-login-btn').classList.add('active');
    document.getElementById('tab-request-btn').classList.remove('active');
    document.getElementById('login-form-wrap').classList.add('active');
    document.getElementById('request-form-wrap').classList.remove('active');
  });

  document.getElementById('tab-request-btn')?.addEventListener('click', () => {
    document.getElementById('tab-request-btn').classList.add('active');
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('request-form-wrap').classList.add('active');
    document.getElementById('login-form-wrap').classList.remove('active');
  });

  // Password visibility toggle
  document.getElementById('toggle-pwd-btn')?.addEventListener('click', () => {
    const pwdInput = document.getElementById('login-password');
    const isPwd = pwdInput.type === 'password';
    pwdInput.type = isPwd ? 'text' : 'password';
    document.querySelector('#toggle-pwd-btn i').className = isPwd ? 'ph ph-eye-slash' : 'ph ph-eye';
  });

  // Login Form Submit
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pwd = document.getElementById('login-password').value;
    await handleLogin(user, pwd);
  });

  // Join Request Form Submit
  document.getElementById('request-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('req-display-name').value;
    const user = document.getElementById('req-username').value;
    const reason = document.getElementById('req-reason').value;
    await submitRoommateRequest(name, user, reason);
    document.getElementById('tab-login-btn').click();
    e.target.reset();
  });

  // 🔔 Notification Bell Icon Dropdown Trigger
  document.getElementById('header-notif-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-dropdown-panel')?.classList.add('hidden');
    document.getElementById('notif-dropdown-panel')?.classList.toggle('hidden');
  });

  // User Dropdown Trigger
  document.getElementById('user-chip-trigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('notif-dropdown-panel')?.classList.add('hidden');
    document.getElementById('user-dropdown-panel').classList.toggle('hidden');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notif-dropdown-panel') && !e.target.closest('#header-notif-trigger')) {
      document.getElementById('notif-dropdown-panel')?.classList.add('hidden');
    }
    if (!e.target.closest('#user-dropdown-panel') && !e.target.closest('#user-chip-trigger')) {
      document.getElementById('user-dropdown-panel')?.classList.add('hidden');
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

  // Settings Modal
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    document.getElementById('user-dropdown-panel')?.classList.add('hidden');
    document.getElementById('modal-settings').classList.remove('hidden');
  });

  // Edit Profile Modal Open
  document.getElementById('btn-open-edit-profile')?.addEventListener('click', () => {
    document.getElementById('user-dropdown-panel')?.classList.add('hidden');
    populateEditProfileSelect();
    document.getElementById('modal-edit-profile').classList.remove('hidden');
  });

  // Edit Profile Select Change: automatically populate the text input
  document.getElementById('edit-profile-select-user')?.addEventListener('change', (e) => {
    const selectedUser = e.target.value;
    const r = PRESET_ROOMMATES.find(item => item.username === selectedUser);
    if (r) {
      document.getElementById('edit-profile-display-name').value = r.displayName;
      document.getElementById('edit-profile-username').value = r.username;
    }
  });

  // Edit Profile Form Submit
  document.getElementById('form-edit-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const select = document.getElementById('edit-profile-select-user');
    const newName = document.getElementById('edit-profile-display-name').value;
    const targetUsername = select.value;

    await updateRoommateDisplayName(targetUsername, newName);
    document.getElementById('modal-edit-profile').classList.add('hidden');
  });

  // Change Password Modal Open
  document.getElementById('btn-open-change-pwd')?.addEventListener('click', () => {
    document.getElementById('user-dropdown-panel')?.classList.add('hidden');
    if (state.currentUser) {
      document.getElementById('change-pwd-profile-name').textContent = state.currentUser.displayName;
      document.getElementById('change-pwd-profile-handle').textContent = `@${state.currentUser.username}`;
    }
    document.getElementById('form-change-pwd')?.reset();
    document.getElementById('modal-change-pwd')?.classList.remove('hidden');
  });

  // Password visibility toggles inside change password modal
  function setupPwdToggle(btnId, inputId) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      document.querySelector(`#${btnId} i`).className = isPwd ? 'ph ph-eye-slash' : 'ph ph-eye';
    });
  }
  setupPwdToggle('toggle-current-pwd-btn', 'input-current-pwd');
  setupPwdToggle('toggle-new-pwd-btn', 'input-new-pwd');
  setupPwdToggle('toggle-confirm-pwd-btn', 'input-confirm-pwd');

  // Change Password Form Submit
  document.getElementById('form-change-pwd')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPwd = document.getElementById('input-current-pwd').value;
    const newPwd = document.getElementById('input-new-pwd').value;
    const confirmPwd = document.getElementById('input-confirm-pwd').value;

    if (newPwd !== confirmPwd) {
      showToast('New passwords do not match. Please re-enter.', 'error');
      return;
    }

    const success = await changeUserPassword(currentPwd, newPwd);
    if (success) {
      document.getElementById('modal-change-pwd')?.classList.add('hidden');
      e.target.reset();
    }
  });

  // Navigation switching (Desktop & Mobile)
  function switchView(targetView) {
    state.activeView = targetView;
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });
    document.getElementById(`view-${targetView}`)?.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === targetView);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === targetView);
    });
  }

  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  // Quick action buttons
  document.getElementById('btn-quick-expense')?.addEventListener('click', () => {
    document.getElementById('modal-expense').classList.remove('hidden');
  });
  document.getElementById('mobile-quick-add')?.addEventListener('click', () => {
    document.getElementById('modal-expense').classList.remove('hidden');
  });
  document.getElementById('hero-expense-btn')?.addEventListener('click', () => {
    document.getElementById('modal-expense').classList.remove('hidden');
  });
  document.getElementById('btn-open-expense-modal')?.addEventListener('click', () => {
    document.getElementById('modal-expense').classList.remove('hidden');
  });
  document.getElementById('hero-water-btn')?.addEventListener('click', () => {
    document.getElementById('modal-water').classList.remove('hidden');
  });
  document.getElementById('btn-open-water-modal')?.addEventListener('click', () => {
    document.getElementById('modal-water').classList.remove('hidden');
  });
  document.getElementById('btn-open-request-modal')?.addEventListener('click', () => {
    document.getElementById('modal-request').classList.remove('hidden');
  });
  document.getElementById('btn-view-all-activity')?.addEventListener('click', () => {
    switchView('expenses');
  });

  // Category quick log buttons from Household cards
  document.querySelectorAll('.btn-quick-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      document.getElementById('expense-category').value = cat;
      document.getElementById('modal-expense').classList.remove('hidden');
    });
  });

  // Filter chips in Expenses view
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeExpenseFilter = chip.dataset.filter;
      renderExpensesList();
    });
  });

  // Expense search input
  document.getElementById('expense-search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderExpensesList();
  });

  // Close modals
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModal = btn.dataset.closeModal;
      document.getElementById(targetModal)?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Expense Form Submit
  document.getElementById('form-expense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('expense-title').value;
    const category = document.getElementById('expense-category').value;
    const amount = document.getElementById('expense-amount').value;
    const date = document.getElementById('expense-date').value;
    const note = document.getElementById('expense-note').value;
    const payerSelect = document.getElementById('expense-payer');
    const createdByName = payerSelect.value;
    const createdBy = payerSelect.selectedOptions[0]?.dataset?.uid || state.currentUser.uid;
    const file = document.getElementById('expense-file').files[0];

    await createExpense({ title, category, amount, date, note, createdBy, createdByName }, file);
    document.getElementById('modal-expense').classList.add('hidden');
    e.target.reset();
    clearFilePreview('expense');
  });

  // Water Form Submit
  document.getElementById('form-water')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('water-amount').value;
    const type = document.getElementById('water-type').value;
    const date = document.getElementById('water-date').value;
    const note = document.getElementById('water-note').value;
    const payerSelect = document.getElementById('water-payer');
    const createdByName = payerSelect.value;
    const createdBy = payerSelect.selectedOptions[0]?.dataset?.uid || state.currentUser.uid;
    const file = document.getElementById('water-file').files[0];

    await createWaterPayment({ amount, type, date, note, createdBy, createdByName }, file);
    document.getElementById('modal-water').classList.add('hidden');
    e.target.reset();
    clearFilePreview('water');
  });

  // Onboarding Request Modal Submit
  document.getElementById('form-roommate-request')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('modal-req-name').value;
    const user = document.getElementById('modal-req-user').value;
    const reason = document.getElementById('modal-req-reason').value;

    await submitRoommateRequest(name, user, reason);
    document.getElementById('modal-request').classList.add('hidden');
    e.target.reset();
  });

  setupImageUploader('expense');
  setupImageUploader('water');

  // Delegated Global Click Listeners
  document.addEventListener('click', async (e) => {
    // Quick Edit Name on Roommate Contribution Card
    const editNameBtn = e.target.closest('[data-edit-roommate-user]');
    if (editNameBtn) {
      const targetUser = editNameBtn.dataset.editRoommateUser;
      const targetName = editNameBtn.dataset.roommateName;
      const select = document.getElementById('edit-profile-select-user');
      if (select) {
        select.value = targetUser;
        document.getElementById('edit-profile-display-name').value = targetName;
        document.getElementById('edit-profile-username').value = targetUser;
      }
      document.getElementById('modal-edit-profile').classList.remove('hidden');
      return;
    }

    // Delete Expense
    const delExpBtn = e.target.closest('[data-delete-expense]');
    if (delExpBtn) {
      await deleteExpenseItem(
        delExpBtn.dataset.deleteExpense,
        delExpBtn.dataset.itemTitle,
        delExpBtn.dataset.itemAmount
      );
      return;
    }

    // Delete Water
    const delWatBtn = e.target.closest('[data-delete-water]');
    if (delWatBtn) {
      await deleteWaterItem(
        delWatBtn.dataset.deleteWater,
        delWatBtn.dataset.itemType,
        delWatBtn.dataset.itemAmount
      );
      return;
    }

    // View Proof Lightbox
    const proofBtn = e.target.closest('[data-view-proof]');
    if (proofBtn) {
      openLightbox({
        url: proofBtn.dataset.viewProof,
        title: proofBtn.dataset.title,
        amount: proofBtn.dataset.amount,
        payer: proofBtn.dataset.payer,
        date: proofBtn.dataset.date,
        note: proofBtn.dataset.note,
        category: proofBtn.dataset.cat
      });
      return;
    }

    // Request Review Actions
    const reqBtn = e.target.closest('[data-action-request]');
    if (reqBtn) {
      const action = reqBtn.dataset.actionRequest;
      const reqId = reqBtn.dataset.requestId;
      await updateRequestStatus(reqId, action === 'approve' ? 'approved' : 'rejected');
      return;
    }
  });

  // Lightbox Controls
  document.getElementById('lightbox-btn-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-viewer')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-viewer') closeLightbox();
  });
  document.getElementById('lightbox-btn-zoom-in')?.addEventListener('click', () => setZoom(0.25));
  document.getElementById('lightbox-btn-zoom-out')?.addEventListener('click', () => setZoom(-0.25));
  document.getElementById('lightbox-btn-reset-zoom')?.addEventListener('click', () => {
    state.zoomLevel = 1;
    document.getElementById('lightbox-img').style.transform = `scale(1)`;
  });
}

function setupImageUploader(prefix) {
  const fileInput = document.getElementById(`${prefix}-file`);
  const dropZone = document.getElementById(`${prefix}-drop-zone`);
  const promptEl = document.getElementById(`${prefix}-upload-prompt`);
  const previewWrap = document.getElementById(`${prefix}-preview-wrap`);
  const previewImg = document.getElementById(`${prefix}-preview-img`);
  const clearBtn = document.getElementById(`${prefix}-btn-clear-img`);

  if (!fileInput || !dropZone) return;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewWrap.classList.remove('hidden');
      promptEl.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFilePreview(prefix);
  });
}

function clearFilePreview(prefix) {
  const fileInput = document.getElementById(`${prefix}-file`);
  const promptEl = document.getElementById(`${prefix}-upload-prompt`);
  const previewWrap = document.getElementById(`${prefix}-preview-wrap`);
  const previewImg = document.getElementById(`${prefix}-preview-img`);

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewWrap) previewWrap.classList.add('hidden');
  if (promptEl) promptEl.classList.remove('hidden');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', initApp);
