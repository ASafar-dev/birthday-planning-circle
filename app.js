const config = window.APP_CONFIG;
const catalogue = Array.isArray(window.BIRTHDAY_ITEMS) ? window.BIRTHDAY_ITEMS : [];
const isConfigured = Boolean(
  config?.SUPABASE_URL?.startsWith("https://") &&
  config?.SUPABASE_PUBLISHABLE_KEY &&
  !config.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
);

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const uuid = () => crypto.randomUUID();
const demoPrefix = `birthday-circle:${config.ROOM_SLUG}:`;
const VENUE_DISCUSSION_ID = "__venue_discussion__";
const NOTIFICATION_PREFS_KEY = `${demoPrefix}notification-preferences`;
const NOTIFICATION_LAST_SEEN_KEY = `${demoPrefix}notification-last-seen`;
const DEFAULT_NOTIFICATION_PREFS = Object.freeze({
  enabled: true,
  browser: false,
  ideas: true,
  venues: true,
  items: true,
  messages: false
});

const state = {
  mode: isConfigured ? "supabase" : "demo",
  client: null,
  user: null,
  roomId: null,
  member: null,
  members: [],
  claims: [],
  purchases: [],
  messages: [],
  activity: [],
  venues: [],
  communityItems: [],
  itemVotes: [],
  eventSettings: null,
  eventSettingsAvailable: true,
  passwordRecoveryMode: false,
  pendingActions: new Set(),
  notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
  notificationPanelOpen: false,
  view: "all",
  query: "",
  sort: "recommended",
  activeItemId: null,
  channel: null,
  pendingProtectionEmail: ""
};

const els = {
  loading: $("#loading-screen"), app: $("#app"), joinDialog: $("#join-dialog"), joinForm: $("#join-form"),
  joinName: $("#join-name"), joinCode: $("#join-code"), joinError: $("#join-error"), demoHint: $("#demo-hint"),
  recoveryEmail: $("#recovery-email"), recoveryPassword: $("#recovery-password"), recoveryButton: $("#recovery-button"), recoveryStatus: $("#recovery-status"), forgotPasswordButton: $("#forgot-password-button"),
  passwordResetDialog: $("#password-reset-dialog"), passwordResetForm: $("#password-reset-form"), resetPassword: $("#reset-password"), resetPasswordConfirm: $("#reset-password-confirm"), passwordResetStatus: $("#password-reset-status"),
  eventSettingsDialog: $("#event-settings-dialog"), eventSettingsForm: $("#event-settings-form"), eventSettingsName: $("#event-settings-name"), eventSettingsDatetime: $("#event-settings-datetime"), eventSettingsLocation: $("#event-settings-location"), eventSettingsCountdown: $("#event-settings-countdown"), eventSettingsStatus: $("#event-settings-status"),
  itemDialog: $("#item-dialog"), itemDetail: $("#item-detail"), profileDialog: $("#profile-dialog"),
  profileForm: $("#profile-form"), profileName: $("#profile-name"), sidebar: $("#sidebar"), sidebarBackdrop: $("#sidebar-backdrop"),
  accountEmail: $("#account-email"), accountPassword: $("#account-password"), accountPasswordConfirm: $("#account-password-confirm"), accountPasswordFields: $("#account-password-fields"), accountProtectionCopy: $("#account-protection-copy"), protectAccountButton: $("#protect-account-button"), accountProtectionStatus: $("#account-protection-status"),
  grid: $("#items-grid"), activity: $("#activity-list"),
  search: $("#search-input"), sort: $("#sort-select"), dropZone: $("#drop-zone"),
  template: $("#item-card-template"), connection: $("#connection-pill"), modeBanner: $("#mode-banner"),
  planningView: $("#planning-view"), venueView: $("#venue-view"), venueList: $("#venue-suggestions"),
  confirmedVenue: $("#confirmed-venue"), venueDialog: $("#venue-dialog"), venueForm: $("#venue-form"),
  venueMessages: $("#venue-messages"), venueMessageForm: $("#venue-message-form"), venueMessageInput: $("#venue-message-input"),
  itemSuggestionDialog: $("#item-suggestion-dialog"), itemSuggestionForm: $("#item-suggestion-form"),
  itemImageInput: $("#suggested-item-image"), itemImageUrl: $("#suggested-item-image-url"), itemImagePreview: $("#item-image-preview img"),
  ideasView: $("#ideas-view"), pendingIdeas: $("#pending-ideas"), reviewedIdeas: $("#reviewed-ideas"),
  notificationButton: $("#notification-button"), notificationBadge: $("#notification-badge"),
  notificationPanel: $("#notification-panel"), notificationList: $("#notification-list")
};

function authRedirectUrl(mode = "") {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (mode) url.searchParams.set("auth", mode);
  return url.toString();
}
function hasVerifiedEmail() {
  return Boolean(state.user?.email && state.user?.email_confirmed_at);
}
function hasPasswordLogin() {
  return Boolean(hasVerifiedEmail() && state.user?.user_metadata?.password_login_enabled);
}
function hasRecoverableAccount() {
  return hasPasswordLogin();
}
function syncAccountProtectionUI(message = "") {
  if (!els.accountEmail || !els.protectAccountButton || !els.accountProtectionStatus) return;

  const verifiedEmail = hasVerifiedEmail();
  const passwordReady = hasPasswordLogin();
  const emailValue = state.user?.email || state.pendingProtectionEmail || "";

  els.accountEmail.value = emailValue;
  els.accountEmail.disabled = verifiedEmail;
  els.accountPasswordFields?.classList.toggle("hidden", !verifiedEmail || passwordReady);
  els.protectAccountButton.disabled = passwordReady || state.mode === "demo";

  if (els.accountProtectionCopy) {
    els.accountProtectionCopy.textContent = passwordReady
      ? "Your account is protected. Use this email and your password whenever you need to sign in on another browser or device."
      : verifiedEmail
        ? "Your email is verified. Create a password now to finish protecting this account."
        : "First verify your email once. After verification, return here and create a password for normal sign-ins.";
  }

  els.protectAccountButton.textContent = passwordReady
    ? "Password login ready"
    : verifiedEmail
      ? "Set my password"
      : "Send verification email";

  els.accountProtectionStatus.className = `account-protection-status ${passwordReady ? "success" : ""}`;
  els.accountProtectionStatus.textContent = message || (passwordReady
    ? `Protected with ${state.user.email}. Normal sign-ins now use email and password.`
    : verifiedEmail
      ? `Email verified: ${state.user.email}. Set a password below to finish.`
      : "Your current contributions remain attached to this account while you complete these steps.");
}
function openProfileDialog() {
  els.profileName.value = state.member?.display_name || "";
  syncNotificationControls();
  syncAccountProtectionUI();
  if (!els.profileDialog.open) els.profileDialog.showModal();
}
function promptAccountProtection() {
  if (state.mode !== "supabase" || hasRecoverableAccount()) return;
  window.setTimeout(() => {
    openProfileDialog();
    if (hasVerifiedEmail()) {
      els.accountPassword?.focus();
      toast("Your email is verified. Create a password to finish protecting your access.");
    } else {
      els.accountEmail?.focus();
      toast("Protect your access before closing the site.");
    }
  }, 650);
}

function defaultEventSettings() {
  return {
    room_id: state.roomId,
    event_title: String(config.EVENT_TITLE || "Aboudi & Yara's Birthday").trim(),
    event_at: null,
    event_location: "",
    countdown_enabled: true,
    updated_at: null,
    updated_by: null
  };
}
function effectiveEventSettings() {
  return { ...defaultEventSettings(), ...(state.eventSettings || {}) };
}
function eventDate() {
  const value = effectiveEventSettings().event_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isMissingEventSettingsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["42P01", "PGRST205"].includes(error?.code) || message.includes("event_settings") && (message.includes("does not exist") || message.includes("schema cache"));
}
function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
function acquireAction(key) {
  if (state.pendingActions.has(key)) return false;
  state.pendingActions.add(key);
  return true;
}
function releaseAction(key) { state.pendingActions.delete(key); }
function setButtonBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(busyLabel)}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.textContent = button.dataset.originalLabel || button.textContent;
    delete button.dataset.originalLabel;
  }
}
function cleanAuthUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("auth");
  history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: config.CURRENCY || "USD", maximumFractionDigits: 2 }).format(Number(value || 0));
}
function initials(name = "?") {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function communityRowToItem(row) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    budget: Number(row.budget || 0),
    maxPeople: Number(row.max_people || 1),
    image: row.image_data || safeHttpUrl(row.image_url) || "assets/theme/idea-default.png",
    imageAlt: `Photo for ${row.name}`,
    priority: 1000,
    isCommunity: true,
    suggestedBy: row.suggested_by,
    suggestionStatus: row.status || "pending",
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    reviewNote: row.review_note || "",
    createdAt: row.created_at
  };
}
function approvedSuggestions() { return state.communityItems.filter(row => (row.status || "pending") === "approved"); }
function pendingSuggestions() { return state.communityItems.filter(row => (row.status || "pending") === "pending"); }
function reviewedSuggestions() { return state.communityItems.filter(row => ["approved", "rejected"].includes(row.status || "pending")); }
function suggestionById(id) { return state.communityItems.find(row => String(row.id) === String(id)); }
function allItems() { return [...catalogue, ...approvedSuggestions().map(communityRowToItem)]; }
function itemById(id) { return allItems().find(item => item.id === String(id)); }
function claimsFor(id) { return state.claims.filter(claim => claim.item_id === String(id)); }
function myClaim(id) { return state.claims.find(claim => claim.item_id === String(id) && claim.user_id === state.user?.id); }
function purchaseFor(id) { return state.purchases.find(row => row.item_id === String(id)); }
function messagesFor(id) { return state.messages.filter(row => row.item_id === String(id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); }
function memberName(userId) { return state.members.find(member => member.user_id === userId)?.display_name || "Guest"; }
function contributed(id) { return claimsFor(id).reduce((sum, claim) => sum + Number(claim.contribution || 0), 0); }
function isPurchased(id) { return purchaseFor(id)?.status === "purchased"; }
function votesFor(id) { return state.itemVotes.filter(vote => vote.item_id === String(id)); }
function myVote(id) { return state.itemVotes.find(vote => vote.item_id === String(id) && vote.user_id === state.user?.id); }
function suggestedByName(item) { return memberName(item.suggestedBy); }

function safeHttpUrl(value = "") { const clean=String(value||"").trim(); if(!clean)return ""; try{const url=new URL(clean); return ["http:","https:"].includes(url.protocol)?url.href:"";}catch{return "";} }
function mapsLinkFor(venue) { return safeHttpUrl(venue.google_maps_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.address || venue.name)}`; }
function mapsEmbedFor(venue) { return `https://www.google.com/maps?q=${encodeURIComponent(venue.address || venue.name)}&output=embed`; }
function confirmedVenueRow() { return state.venues.find(venue => venue.is_confirmed); }
function venueOwnerName(venue) { return memberName(venue.suggested_by); }
function venuePerGuest(venue) { const divisor=Number(venue.capacity||0)||Math.max(1,state.members.length); return Number(venue.price||0)/divisor; }
function itemStatus(item) {
  if (isPurchased(item.id)) return "purchased";
  if (myClaim(item.id)) return "mine";
  if (claimsFor(item.id).length > 0) return "coordinating";
  return "available";
}
function setConnection(label, kind = "") {
  els.connection.className = `connection-pill ${kind}`;
  $("span", els.connection).textContent = label;
}
function toast(message, kind = "success") {
  const stack = $("#toast-stack");
  if (!stack) return;
  const normalizedKind = ["success", "error", "info"].includes(kind) ? kind : "success";
  const icon = normalizedKind === "error" ? "!" : normalizedKind === "info" ? "i" : "✓";
  const node = document.createElement("div");
  node.className = `toast ${normalizedKind}`;
  node.setAttribute("role", normalizedKind === "error" ? "alert" : "status");
  node.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span class="toast-message"></span><button class="toast-close" type="button" aria-label="Dismiss">×</button><span class="toast-progress" aria-hidden="true"></span>`;
  $(".toast-message", node).textContent = message;
  $(".toast-close", node).addEventListener("click", () => node.remove());
  stack.appendChild(node);
  requestAnimationFrame(() => node.classList.add("shown"));
  window.setTimeout(() => {
    node.classList.remove("shown");
    window.setTimeout(() => node.remove(), 220);
  }, normalizedKind === "error" ? 5200 : 3800);
}
function fail(error, fallback = "Something went wrong.") {
  console.error(error);
  toast(error?.message || fallback, "error");
}

function loadNotificationPreferences() {
  try {
    state.notificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(localStorage.getItem(NOTIFICATION_PREFS_KEY) || "{}") };
  } catch {
    state.notificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  }
  if (!localStorage.getItem(NOTIFICATION_LAST_SEEN_KEY)) {
    localStorage.setItem(NOTIFICATION_LAST_SEEN_KEY, new Date().toISOString());
  }
}
function saveNotificationPreferences() {
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(state.notificationPrefs));
}
function notificationLastSeen() {
  const value = localStorage.getItem(NOTIFICATION_LAST_SEEN_KEY);
  const time = value ? new Date(value).getTime() : Date.now();
  return Number.isFinite(time) ? time : Date.now();
}
function notificationCategory(row) {
  const action = row?.action || "";
  if (["item_suggested", "item_approved", "item_rejected"].includes(action)) return "ideas";
  if (action.startsWith("venue") || row?.item_id === VENUE_DISCUSSION_ID) return "venues";
  if (action === "message") return "messages";
  return "items";
}
function notificationSubject(row) {
  const item = itemById(row?.item_id);
  if (item) return item.name;
  const suggestion = suggestionById(row?.item_id);
  if (suggestion) return suggestion.name;
  return "Birthday Circle";
}
function notificationCopy(row) {
  const actor = memberName(row?.actor_id);
  const subject = notificationSubject(row);
  const action = row?.action || "";
  if (action === "member_joined") return { title: "Someone joined the room", body: `${actor} joined the birthday planning group.` };
  if (action === "item_suggested") return { title: "New idea awaiting review", body: `${actor} suggested ${subject}.` };
  if (action === "item_approved") return { title: "Idea approved", body: `${subject} was added to the official planning list.` };
  if (action === "item_rejected") return { title: "Idea declined", body: `${subject} was not added to the planning list.` };
  if (action === "venue_confirmed") return { title: "Venue confirmed", body: row.detail || `${actor} confirmed the birthday venue.` };
  if (action === "venue") return { title: "New venue suggestion", body: row.detail || `${actor} suggested a place.` };
  if (row?.item_id === VENUE_DISCUSSION_ID) return { title: "Venue discussion", body: `${actor} posted a new venue message.` };
  if (action === "message") return { title: `New message · ${subject}`, body: `${actor} posted an update.` };
  return { title: subject, body: `${actor} ${row?.detail || "updated the plan"}.` };
}
function shouldAlertFor(row) {
  if (!state.notificationPrefs.enabled || row?.actor_id === state.user?.id) return false;
  return Boolean(state.notificationPrefs[notificationCategory(row)]);
}
function showBrowserAlert(row) {
  if (!state.notificationPrefs.browser || !shouldAlertFor(row)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const copy = notificationCopy(row);
  const notification = new Notification(copy.title, {
    body: copy.body,
    icon: "assets/decor/sidebar-logo.gif",
    tag: `birthday-circle-${row.id || row.created_at || Math.random()}`
  });
  notification.onclick = () => { window.focus(); notification.close(); };
}
function markNotificationsRead() {
  localStorage.setItem(NOTIFICATION_LAST_SEEN_KEY, new Date().toISOString());
  renderNotificationCenter();
}
function unreadActivities() {
  const lastSeen = notificationLastSeen();
  return state.activity.filter(row => shouldAlertFor(row) && new Date(row.created_at).getTime() > lastSeen);
}
function renderNotificationCenter() {
  if (!els.notificationList) return;
  const unread = state.notificationPrefs.enabled ? unreadActivities().length : 0;
  els.notificationBadge.textContent = unread > 99 ? "99+" : String(unread);
  els.notificationBadge.classList.toggle("hidden", unread === 0 || !state.notificationPrefs.enabled);
  const rows = state.activity.filter(row => row.actor_id !== state.user?.id).slice(0, 14);
  if (!rows.length) {
    els.notificationList.innerHTML = `<div class="notification-empty"><strong>No updates yet</strong><span>New decisions and planning changes will appear here.</span></div>`;
    return;
  }
  els.notificationList.innerHTML = rows.map(row => {
    const copy = notificationCopy(row);
    const isUnread = shouldAlertFor(row) && new Date(row.created_at).getTime() > notificationLastSeen();
    return `<article class="notification-row ${isUnread ? "unread" : ""}"><span class="notification-dot"></span><div><strong>${escapeHtml(copy.title)}</strong><p>${escapeHtml(copy.body)}</p><time>${relativeTime(row.created_at)}</time></div></article>`;
  }).join("");
}
function openNotificationPanel(forceOpen = null) {
  const next = forceOpen === null ? !state.notificationPanelOpen : Boolean(forceOpen);
  state.notificationPanelOpen = next;
  els.notificationPanel.classList.toggle("hidden", !next);
  els.notificationButton.setAttribute("aria-expanded", String(next));
  if (next) markNotificationsRead();
}
function syncNotificationControls() {
  $("#notifications-enabled").checked = Boolean(state.notificationPrefs.enabled);
  $("#browser-notifications-enabled").checked = Boolean(state.notificationPrefs.browser);
  $("#notify-ideas").checked = Boolean(state.notificationPrefs.ideas);
  $("#notify-venues").checked = Boolean(state.notificationPrefs.venues);
  $("#notify-items").checked = Boolean(state.notificationPrefs.items);
  $("#notify-messages").checked = Boolean(state.notificationPrefs.messages);
  const note = $("#browser-notification-note");
  if (!("Notification" in window)) note.textContent = "This browser does not support desktop notifications. The in-app bell still works.";
  else if (Notification.permission === "denied") note.textContent = "Browser alerts are blocked. Allow notifications for this site in your browser settings.";
  else note.textContent = "These choices are saved separately on each person’s device.";
}
async function saveNotificationControls() {
  const wantsBrowser = $("#browser-notifications-enabled").checked;
  let browserEnabled = false;
  if (wantsBrowser && "Notification" in window) {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    browserEnabled = permission === "granted";
    if (!browserEnabled) toast("Browser alerts were not enabled. The in-app bell will still work.", "error");
  }
  state.notificationPrefs = {
    enabled: $("#notifications-enabled").checked,
    browser: browserEnabled,
    ideas: $("#notify-ideas").checked,
    venues: $("#notify-venues").checked,
    items: $("#notify-items").checked,
    messages: $("#notify-messages").checked
  };
  saveNotificationPreferences();
  syncNotificationControls();
  renderNotificationCenter();
}
function hideLoading() {
  els.loading.classList.add("done");
  window.setTimeout(() => els.loading.classList.add("hidden"), 260);
}

let confettiAnimationFrame = null;
function launchWelcomeConfetti() {
  const canvas = $("#confetti-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  if (confettiAnimationFrame) cancelAnimationFrame(confettiAnimationFrame);
  const context = canvas.getContext("2d");
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const colors = ["#ffffff", "#f3ffff", "#d9f7ff", "#aee9ff", "#6fc7ff", "#79f0c3", "#51f3a2", "#2ea1ff", "#1f7dff", "#0b5fcc", "#1e8d67"];

  const resize = () => {
    canvas.width = Math.round(window.innerWidth * pixelRatio);
    canvas.height = Math.round(window.innerHeight * pixelRatio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };
  resize();
  canvas.classList.add("active");

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pieces = Array.from({ length: 190 }, (_, index) => {
    const fromLeft = index % 2 === 0;
    return {
      x: fromLeft ? -20 - Math.random() * 50 : width + 20 + Math.random() * 50,
      y: height * (0.42 + Math.random() * 0.32),
      vx: (fromLeft ? 1 : -1) * (4.5 + Math.random() * 7.5),
      vy: -(5 + Math.random() * 9),
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.988 + Math.random() * 0.008,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.32,
      width: 5 + Math.random() * 7,
      height: 7 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      circle: Math.random() < 0.18
    };
  });

  const startedAt = performance.now();
  const duration = 3300;
  const draw = now => {
    context.clearRect(0, 0, width, height);
    for (const piece of pieces) {
      piece.vy += piece.gravity;
      piece.vx *= piece.drag;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.rotationSpeed;

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.fillStyle = piece.color;
      if (piece.circle) {
        context.beginPath();
        context.arc(0, 0, piece.width / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
      }
      context.restore();
    }

    if (now - startedAt < duration) {
      confettiAnimationFrame = requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, width, height);
      canvas.classList.remove("active");
      confettiAnimationFrame = null;
    }
  };
  confettiAnimationFrame = requestAnimationFrame(draw);
}

async function initialize() {
  loadNotificationPreferences();
  bindStaticEvents();
  populateEventDetails();

  if (state.mode === "demo") {
    setConnection("Demo mode", "offline");
    initializeDemoIdentity();
    const membership = demoRead("membership", null);
    if (membership) {
      state.member = membership;
      state.roomId = `demo-${config.ROOM_SLUG}`;
      await loadDemoData();
      enterApp();
    } else {
      showJoinDialog();
      hideLoading();
    }
    return;
  }

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    state.client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    state.client.auth.onAuthStateChange((event, session) => {
      if (session?.user) state.user = session.user;
      if (event === "PASSWORD_RECOVERY") {
        state.passwordRecoveryMode = true;
        window.setTimeout(openPasswordResetDialog, 120);
      }
    });

    let { data: sessionData } = await state.client.auth.getSession();
    if (!sessionData.session) {
      const { data, error } = await state.client.auth.signInAnonymously();
      if (error) throw error;
      state.user = data.user;
    } else {
      state.user = sessionData.session.user;
    }
    if (new URL(window.location.href).searchParams.get("auth") === "reset-password" && sessionData.session) {
      state.passwordRecoveryMode = true;
    }

    const { data: membership, error } = await state.client.rpc("current_room_membership", { p_room_slug: config.ROOM_SLUG });
    if (error) throw error;
    const row = Array.isArray(membership) ? membership[0] : membership;
    if (!row) {
      showJoinDialog();
      hideLoading();
      return;
    }
    state.roomId = row.room_id;
    state.member = row;
    await loadAllData();
    subscribeRealtime();
    enterApp();
  } catch (error) {
    console.error(error);
    els.joinError.textContent = "Could not connect. Check config.js, Supabase Auth, and the SQL setup.";
    showJoinDialog();
    setConnection("Setup needed", "offline");
    hideLoading();
  }
}

function initializeDemoIdentity() {
  let id = localStorage.getItem(`${demoPrefix}user-id`);
  if (!id) { id = uuid(); localStorage.setItem(`${demoPrefix}user-id`, id); }
  state.user = { id };
}
function demoRead(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`${demoPrefix}${key}`)) ?? fallback; }
  catch { return fallback; }
}
function demoWrite(key, value) {
  localStorage.setItem(`${demoPrefix}${key}`, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("birthday-demo-change"));
}
async function loadDemoData() {
  const membership = demoRead("membership", state.member);
  state.member = membership;
  const defaultMembers = membership ? [{ room_id: state.roomId, user_id: state.user.id, display_name: membership.display_name, is_organizer: Boolean(membership.is_organizer) }] : [];
  state.members = demoRead("members", defaultMembers);
  if (membership && !state.members.some(m => m.user_id === state.user.id)) {
    state.members.push(defaultMembers[0]);
    demoWrite("members", state.members);
  }
  state.claims = demoRead("claims", []);
  state.purchases = demoRead("purchases", []);
  state.messages = demoRead("messages", []);
  state.activity = demoRead("activity", []);
  state.venues = demoRead("venues", []);
  state.communityItems = demoRead("communityItems", []).map(row => ({ ...row, status: row.status || "pending", review_note: row.review_note || "" }));
  demoWrite("communityItems", state.communityItems);
  state.itemVotes = demoRead("itemVotes", []);
  state.eventSettings = demoRead("eventSettings", defaultEventSettings());
  state.eventSettingsAvailable = true;
  renderEverything();
}

function showJoinDialog() {
  els.joinError.textContent = "";
  if (!els.joinDialog.open) els.joinDialog.showModal();
  window.setTimeout(() => els.joinName.focus(), 80);
}
function enterApp() {
  els.joinDialog.close();
  els.app.classList.remove("hidden");
  syncProfileUI();
  syncNotificationControls();
  syncAccountProtectionUI();
  renderEverything();
  setConnection(state.mode === "demo" ? "Demo mode" : "Live", state.mode === "demo" ? "offline" : "online");
  hideLoading();
  promptAccountProtection();
  if (state.passwordRecoveryMode) window.setTimeout(openPasswordResetDialog, 180);
}

async function joinRoom(name, code) {
  if (state.mode === "demo") {
    if (code !== config.DEMO_INVITE_CODE) throw new Error("That invitation code is incorrect.");
    state.roomId = `demo-${config.ROOM_SLUG}`;
    const members = demoRead("members", []);
    const existing = members.find(member => member.user_id === state.user.id);
    const isOrganizer = existing ? Boolean(existing.is_organizer) : members.length === 0;
    state.member = { room_id: state.roomId, display_name: name, is_organizer: isOrganizer };
    demoWrite("membership", state.member);
    if (existing) { existing.display_name = name; existing.is_organizer = isOrganizer; }
    else members.push({ room_id: state.roomId, user_id: state.user.id, display_name: name, is_organizer: isOrganizer });
    demoWrite("members", members);
    await loadDemoData();
    enterApp();
    return;
  }

  const { data, error } = await state.client.rpc("join_birthday_room", {
    p_room_slug: config.ROOM_SLUG,
    p_invite_code: code,
    p_display_name: name
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The invitation code was not accepted.");
  state.roomId = row.room_id;
  state.member = row;
  await loadAllData();
  subscribeRealtime();
  enterApp();
}

async function loadAllData() {
  if (!state.roomId) return;
  setConnection("Syncing");
  document.body.classList.add("is-syncing");
  const [membersResult, claimsResult, purchasesResult, messagesResult, activityResult, venuesResult, communityItemsResult, itemVotesResult, eventSettingsResult] = await Promise.all([
    state.client.from("room_members").select("room_id,user_id,display_name,is_organizer,joined_at").eq("room_id", state.roomId).order("joined_at"),
    state.client.from("claims").select("*").eq("room_id", state.roomId).order("created_at"),
    state.client.from("purchases").select("*").eq("room_id", state.roomId),
    state.client.from("item_messages").select("*").eq("room_id", state.roomId).order("created_at"),
    state.client.from("activity").select("*").eq("room_id", state.roomId).order("created_at", { ascending: false }).limit(60),
    state.client.from("venue_suggestions").select("*").eq("room_id", state.roomId).order("is_confirmed", { ascending: false }).order("created_at", { ascending: false }),
    state.client.from("item_suggestions").select("*").eq("room_id", state.roomId).order("created_at"),
    state.client.from("item_votes").select("*").eq("room_id", state.roomId),
    state.client.from("event_settings").select("*").eq("room_id", state.roomId).maybeSingle()
  ]);
  try {
    const requiredResults = [membersResult, claimsResult, purchasesResult, messagesResult, activityResult, venuesResult, communityItemsResult, itemVotesResult];
    const error = requiredResults.find(result => result.error)?.error;
    if (error) throw error;
    if (eventSettingsResult.error && !isMissingEventSettingsError(eventSettingsResult.error)) throw eventSettingsResult.error;
    state.members = membersResult.data || [];
    state.claims = claimsResult.data || [];
    state.purchases = purchasesResult.data || [];
    state.messages = messagesResult.data || [];
    state.activity = activityResult.data || [];
    state.venues = venuesResult.data || [];
    state.communityItems = communityItemsResult.data || [];
    state.itemVotes = itemVotesResult.data || [];
    state.eventSettingsAvailable = !eventSettingsResult.error;
    state.eventSettings = eventSettingsResult.data || defaultEventSettings();
    renderEverything();
    setConnection("Live", "online");
  } finally {
    document.body.classList.remove("is-syncing");
  }
}

let realtimeReloadTimer = null;
function scheduleRealtimeReload() {
  window.clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer = window.setTimeout(async () => {
    try { await loadAllData(); }
    catch (error) { fail(error, "Realtime refresh failed."); }
  }, 140);
}

function subscribeRealtime() {
  if (!state.client || !state.roomId) return;
  if (state.channel) state.client.removeChannel(state.channel);
  state.channel = state.client.channel(`birthday-room-${state.roomId}`);
  const realtimeTables = ["room_members", "claims", "purchases", "item_messages", "activity", "venue_suggestions", "item_suggestions", "item_votes"];
  if (state.eventSettingsAvailable) realtimeTables.push("event_settings");
  for (const table of realtimeTables) {
    state.channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `room_id=eq.${state.roomId}` }, payload => {
      if (table === "activity" && payload.eventType === "INSERT" && payload.new) showBrowserAlert(payload.new);
      scheduleRealtimeReload();
    });
  }
  state.channel.subscribe(status => {
    if (status === "SUBSCRIBED") setConnection("Live", "online");
    if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) setConnection("Reconnecting", "offline");
  });
}


function setMobileSidebar(open) {
  const isMobile = window.matchMedia("(max-width: 820px)").matches;
  const shouldOpen = Boolean(open) && isMobile;
  els.sidebar?.classList.toggle("open", shouldOpen);
  els.sidebarBackdrop?.classList.toggle("active", shouldOpen);
  document.body.classList.toggle("sidebar-open", shouldOpen);
  const menuButton = $("#menu-button");
  menuButton?.setAttribute("aria-expanded", String(shouldOpen));
  if (!shouldOpen) menuButton?.focus({ preventScroll: true });
}

function switchView(view) {
  state.view = view;
  $$(".nav-item").forEach(node => node.classList.toggle("active", node.dataset.view === view));
  setMobileSidebar(false);
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function bindStaticEvents() {
  els.joinForm.addEventListener("submit", async event => {
    event.preventDefault();
    const name = els.joinName.value.trim();
    const code = els.joinCode.value.trim();
    if (!name || !code) return;
    els.joinError.textContent = "";
    const button = $("button[type='submit']", els.joinForm);
    button.disabled = true;
    try { await joinRoom(name, code); launchWelcomeConfetti(); }
    catch (error) { els.joinError.textContent = error.message || "Could not join this room."; }
    finally { button.disabled = false; }
  });

  $$(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));

  els.search.addEventListener("input", () => { state.query = els.search.value.trim().toLowerCase(); if (state.view !== "venue") renderBoard(); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; if (state.view !== "venue") renderBoard(); });
  $("#menu-button").addEventListener("click", () => setMobileSidebar(!els.sidebar.classList.contains("open")));
  els.sidebarBackdrop?.addEventListener("click", () => setMobileSidebar(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.sidebar.classList.contains("open")) setMobileSidebar(false);
  });
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 820px)").matches) setMobileSidebar(false);
  });
  $("#refresh-button").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.classList.add("refreshing");
    button.disabled = true;
    try { state.mode === "demo" ? await loadDemoData() : await loadAllData(); toast("Board refreshed."); }
    catch (error) { fail(error); }
    finally { button.classList.remove("refreshing"); button.disabled = false; }
  });
  $("#profile-button").addEventListener("click", openProfileDialog);
  $("#close-profile-dialog").addEventListener("click", () => els.profileDialog.close());
  $("#close-item-dialog").addEventListener("click", () => els.itemDialog.close());
  $("#leave-room-button").addEventListener("click", leaveDevice);
  els.profileForm.addEventListener("submit", updateProfile);
  els.protectAccountButton?.addEventListener("click", protectCurrentAccount);
  els.recoveryButton?.addEventListener("click", sendRecoveryLink);
  els.forgotPasswordButton?.addEventListener("click", requestPasswordReset);
  els.passwordResetForm?.addEventListener("submit", saveRecoveredPassword);
  $("#close-password-reset-dialog")?.addEventListener("click", () => els.passwordResetDialog.close());
  els.eventSettingsForm?.addEventListener("submit", saveEventSettings);
  $("#close-event-settings-dialog")?.addEventListener("click", () => els.eventSettingsDialog.close());
  $("#clear-event-date-button")?.addEventListener("click", () => { els.eventSettingsDatetime.value = ""; els.eventSettingsDatetime.focus(); });
  [$("#hero-manage-event-button"), $("#dashboard-manage-event-button")].forEach(button => button?.addEventListener("click", openEventSettingsDialog));
  $("#dashboard-review-ideas-button")?.addEventListener("click", () => switchView("ideas"));
  $("#dashboard-review-venues-button")?.addEventListener("click", () => switchView("venue"));
  [els.recoveryEmail, els.recoveryPassword].forEach(input => input?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    sendRecoveryLink();
  }));
  $("#suggest-venue-button").addEventListener("click", () => { $("#venue-form-error").textContent=""; els.venueForm.reset(); $("#venue-price").value="0"; $("#venue-nights").value="1"; $("#venue-capacity").value="10"; els.venueDialog.showModal(); });
  $("#close-venue-dialog").addEventListener("click", () => els.venueDialog.close());
  els.venueForm.addEventListener("submit", suggestVenue);
  $("#suggest-item-button").addEventListener("click", openItemSuggestionDialog);
  $("#suggest-item-button-ideas").addEventListener("click", openItemSuggestionDialog);
  $("#close-item-suggestion-dialog").addEventListener("click", () => els.itemSuggestionDialog.close());
  els.itemSuggestionForm.addEventListener("submit", suggestItem);
  els.itemImageInput.addEventListener("change", previewSuggestedItemImage);
  els.itemImageUrl.addEventListener("input", () => {
    if (!els.itemImageInput.files?.length) {
      const url = safeHttpUrl(els.itemImageUrl.value);
      els.itemImagePreview.src = url || "assets/theme/idea-default.png";
    }
  });
  els.venueMessageForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = els.venueMessageInput.value.trim();
    if (!message) return;
    const button = $("button[type='submit']", els.venueMessageForm);
    button.disabled = true;
    els.venueMessageInput.value = "";
    try {
      await sendMessage(VENUE_DISCUSSION_ID, message);
      renderVenueDiscussion();
      els.venueMessageInput.focus();
    } finally {
      button.disabled = false;
    }
  });

  els.notificationButton.addEventListener("click", event => {
    event.stopPropagation();
    openNotificationPanel();
  });
  $("#mark-notifications-read").addEventListener("click", markNotificationsRead);
  $("#open-notification-settings").addEventListener("click", () => {
    openNotificationPanel(false);
    openProfileDialog();
  });
  els.notificationPanel.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => openNotificationPanel(false));
  document.addEventListener("keydown", event => { if (event.key === "Escape") openNotificationPanel(false); });

  els.dropZone.addEventListener("dragover", event => { event.preventDefault(); els.dropZone.classList.add("drag-over"); });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("drag-over"));
  els.dropZone.addEventListener("drop", async event => {
    event.preventDefault();
    els.dropZone.classList.remove("drag-over");
    const itemId = event.dataTransfer.getData("text/birthday-item");
    if (itemId) await joinItem(itemId);
  });

  window.addEventListener("birthday-demo-change", () => { if (state.mode === "demo" && state.member) loadDemoData(); });
  window.addEventListener("storage", event => { if (state.mode === "demo" && event.key?.startsWith(demoPrefix) && state.member) loadDemoData(); });
  window.setInterval(updateCountdown, 1000);
}

function populateEventDetails() {
  const settings = effectiveEventSettings();
  const date = eventDate();
  const confirmedVenue = confirmedVenueRow();
  const location = String(settings.event_location || confirmedVenue?.name || "").trim();
  const title = String(settings.event_title || config.EVENT_TITLE || "Aboudi & Yara's Birthday").trim();
  const showCountdown = Boolean(date && settings.countdown_enabled);

  $("#event-title").textContent = title;
  $("#event-eyebrow").textContent = date ? "COUNTDOWN TO THE DOUBLE BIRTHDAY" : "DOUBLE BIRTHDAY PLANNING";
  $("#event-meta").textContent = date
    ? `${new Intl.DateTimeFormat("en-LB", { dateStyle: "full", timeStyle: "short" }).format(date)}${location ? ` · ${location}` : ""}`
    : `Date to be announced${location ? ` · ${location}` : " · Location to be announced"}`;
  $("#countdown").classList.toggle("hidden", !showCountdown);
  $("#event-date-pending").classList.toggle("hidden", Boolean(date));
  $("#hero-manage-event-button").classList.toggle("hidden", !state.member?.is_organizer);
  updateCountdown();
}
function formatCountdownValue(value) {
  return String(Math.max(0, Number(value || 0))).padStart(2, "0");
}
function updateCountdown() {
  const date = eventDate();
  if (!date || !effectiveEventSettings().countdown_enabled) return;
  const distance = date.getTime() - Date.now();
  const remaining = Number.isFinite(distance) && distance > 0 ? distance : 0;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  $("#days-value").textContent = formatCountdownValue(days);
  $("#hours-value").textContent = formatCountdownValue(hours);
  $("#minutes-value").textContent = formatCountdownValue(minutes);
  $("#seconds-value").textContent = formatCountdownValue(seconds);
}

function syncProfileUI() {
  const name = state.member?.display_name || "Guest";
  $("#profile-display-name").textContent = name;
  $("#profile-role").textContent = state.member?.is_organizer ? "Organizer · final approval" : "Guest planner";
  $("#profile-avatar").textContent = initials(name);
}
function renderEverything() {
  syncProfileUI();
  populateEventDetails();
  renderCountsAndStats();
  renderDashboardInsights();
  renderCurrentView();
  renderActivity();
  renderNotificationCenter();
  if (state.activeItemId && els.itemDialog.open) renderItemDetail(state.activeItemId);
}
function renderCurrentView() {
  const venueMode = state.view === "venue";
  const ideasMode = state.view === "ideas";
  els.planningView.classList.toggle("hidden", venueMode || ideasMode);
  els.venueView.classList.toggle("hidden", !venueMode);
  els.ideasView.classList.toggle("hidden", !ideasMode);
  if (venueMode) renderVenues();
  else if (ideasMode) renderIdeas();
  else renderBoard();
}
function renderCountsAndStats() {
  const items = allItems();
  const purchased = items.filter(item => isPurchased(item.id)).length;
  const available = items.filter(item => itemStatus(item) === "available").length;
  const coordinating = items.filter(item => itemStatus(item) === "coordinating").length;
  const mine = items.filter(item => Boolean(myClaim(item.id))).length;
  $("#count-all").textContent = items.length;
  $("#count-mine").textContent = mine;
  $("#count-available").textContent = available;
  const coordinatingCount = $("#count-coordinating");
  if (coordinatingCount) coordinatingCount.textContent = coordinating;
  $("#count-purchased").textContent = purchased;
  $("#count-ideas").textContent = pendingSuggestions().length;
  $("#count-venues").textContent = state.venues.length;
  $("#stat-items").textContent = items.length;
  $("#stat-people").textContent = state.members.length;
  $("#stat-funded").textContent = money(state.claims.reduce((sum, claim) => sum + Number(claim.contribution || 0), 0));
  $("#stat-complete").textContent = purchased;
  const assignedCount = items.filter(item => claimsFor(item.id).length > 0 || isPurchased(item.id)).length;
  const openCount = Math.max(0, items.length - assignedCount);
  const percent = items.length ? Math.round((assignedCount / items.length) * 100) : 0;
  $("#responsibility-progress-text").textContent = `${assignedCount} of ${items.length}`;
  $("#responsibility-progress-bar").style.width = `${percent}%`;
  $("#responsibility-progress-note").textContent = openCount
    ? `${openCount} item${openCount === 1 ? " still needs" : "s still need"} someone responsible`
    : "Every item has someone responsible";
}

function renderDashboardInsights() {
  const items = allItems();
  const assigned = items.filter(item => claimsFor(item.id).length > 0 || isPurchased(item.id)).length;
  const open = Math.max(0, items.length - assigned);
  const completion = items.length ? Math.round((assigned / items.length) * 100) : 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const weeklyActivity = state.activity.filter(row => new Date(row.created_at).getTime() >= weekAgo).length;
  const pending = pendingSuggestions().length;
  const missingDetails = Number(!eventDate()) + Number(!String(effectiveEventSettings().event_location || confirmedVenueRow()?.name || "").trim());

  $("#insight-completion").textContent = `${completion}%`;
  $("#insight-completion-copy").textContent = open ? `${open} item${open === 1 ? " still needs" : "s still need"} someone responsible.` : "Every item has someone responsible.";
  $("#insight-weekly-activity").textContent = `${weeklyActivity} update${weeklyActivity === 1 ? "" : "s"}`;
  $("#insight-weekly-copy").textContent = weeklyActivity ? "The group has been actively moving the plan forward." : "No changes have been recorded in the last seven days.";

  let nextTitle = "Planning is on track";
  let nextCopy = "Keep checking contributions and final purchases.";
  if (!eventDate()) { nextTitle = "Set the event date"; nextCopy = "The date can stay unannounced until organizers are ready."; }
  else if (!confirmedVenueRow() && !effectiveEventSettings().event_location) { nextTitle = "Choose the location"; nextCopy = "Compare venue suggestions or type a location in event settings."; }
  else if (pending) { nextTitle = `Review ${pending} idea${pending === 1 ? "" : "s"}`; nextCopy = "Organizers can approve or decline the pending suggestions."; }
  else if (open) { nextTitle = `Assign ${open} open item${open === 1 ? "" : "s"}`; nextCopy = "These items still need at least one person responsible."; }
  $("#insight-next-decision").textContent = nextTitle;
  $("#insight-next-copy").textContent = nextCopy;

  const dashboard = $("#organizer-dashboard");
  dashboard.classList.toggle("hidden", !state.member?.is_organizer);
  if (state.member?.is_organizer) {
    $("#organizer-pending-count").textContent = pending;
    $("#organizer-open-count").textContent = open;
    $("#organizer-setup-count").textContent = missingDetails;
    const attention = pending + open + missingDetails;
    $("#organizer-dashboard-summary").textContent = attention
      ? `${attention} planning detail${attention === 1 ? " needs" : "s need"} attention. Use the shortcuts below to handle them.`
      : "The event details and planning board are fully up to date.";
  }
}

function openEventSettingsDialog() {
  if (!state.member?.is_organizer) return toast("Only organizers can edit the event details.", "error");
  const settings = effectiveEventSettings();
  els.eventSettingsName.value = settings.event_title || config.EVENT_TITLE || "";
  els.eventSettingsDatetime.value = localDateTimeValue(settings.event_at);
  els.eventSettingsLocation.value = settings.event_location || confirmedVenueRow()?.name || "";
  els.eventSettingsCountdown.checked = settings.countdown_enabled !== false;
  els.eventSettingsStatus.textContent = state.eventSettingsAvailable || state.mode === "demo"
    ? "You can leave the date empty and add it later."
    : "Run the included Supabase SQL upgrade before saving shared event details.";
  els.eventSettingsStatus.className = "form-status";
  if (!els.eventSettingsDialog.open) els.eventSettingsDialog.showModal();
}

async function saveEventSettings(event) {
  event.preventDefault();
  if (!state.member?.is_organizer) return toast("Only organizers can edit event details.", "error");
  const actionKey = "save-event-settings";
  if (!acquireAction(actionKey)) return;
  const button = $("#save-event-settings-button");
  const title = els.eventSettingsName.value.trim();
  const location = els.eventSettingsLocation.value.trim();
  const dateValue = els.eventSettingsDatetime.value;
  const parsedDate = dateValue ? new Date(dateValue) : null;
  els.eventSettingsStatus.className = "form-status";
  if (title.length < 2) {
    els.eventSettingsStatus.textContent = "Enter an event title containing at least 2 characters.";
    releaseAction(actionKey);
    return;
  }
  if (dateValue && (!parsedDate || Number.isNaN(parsedDate.getTime()))) {
    els.eventSettingsStatus.textContent = "Choose a valid date and time, or leave it empty.";
    releaseAction(actionKey);
    return;
  }
  setButtonBusy(button, true, "Saving…");
  try {
    const payload = {
      room_id: state.roomId,
      event_title: title,
      event_at: parsedDate ? parsedDate.toISOString() : null,
      event_location: location,
      countdown_enabled: Boolean(els.eventSettingsCountdown.checked),
      updated_by: state.user.id,
      updated_at: new Date().toISOString()
    };
    if (state.mode === "demo") {
      state.eventSettings = payload;
      demoWrite("eventSettings", payload);
      addDemoActivity("event_updated", null, parsedDate ? "updated the event date and details" : "updated the event details");
      renderEverything();
    } else {
      if (!state.eventSettingsAvailable) throw new Error("The event settings database upgrade has not been installed yet. Run EVENT-SETTINGS-UPGRADE.sql in Supabase first.");
      const { error } = await state.client.rpc("update_event_settings", {
        p_room_id: state.roomId,
        p_event_title: title,
        p_event_at: parsedDate ? parsedDate.toISOString() : null,
        p_event_location: location,
        p_countdown_enabled: Boolean(els.eventSettingsCountdown.checked)
      });
      if (error) throw error;
      await loadAllData();
    }
    els.eventSettingsStatus.className = "form-status success";
    els.eventSettingsStatus.textContent = parsedDate ? "Event details saved." : "Saved. The date remains unannounced.";
    toast(parsedDate ? "Event date and details updated." : "Event details saved. The date is still to be announced.");
    window.setTimeout(() => els.eventSettingsDialog.close(), 450);
  } catch (error) {
    els.eventSettingsStatus.className = "form-status error";
    els.eventSettingsStatus.textContent = error?.message || "Could not save the event details.";
    fail(error, "Could not save event details.");
  } finally {
    setButtonBusy(button, false);
    releaseAction(actionKey);
  }
}

function filteredItems() {
  let items = allItems().filter(item => {
    const status = itemStatus(item);
    const matchesView = state.view === "all" || (state.view === "mine" ? Boolean(myClaim(item.id)) : status === state.view);
    const haystack = `${item.name} ${item.description}`.toLowerCase();
    return matchesView && (!state.query || haystack.includes(state.query));
  });
  return items.sort((a, b) => {
    if (state.sort === "support") return votesFor(b.id).length - votesFor(a.id).length || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (state.sort === "price-high") return b.budget - a.budget;
    if (state.sort === "price-low") return a.budget - b.budget;
    if (state.sort === "people") return claimsFor(b.id).length - claimsFor(a.id).length;
    if (state.sort === "progress") return planningRatio(b) - planningRatio(a);
    if (a.isCommunity && b.isCommunity) return votesFor(b.id).length - votesFor(a.id).length || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    return (a.priority ?? 999) - (b.priority ?? 999);
  });
}
function planningRatio(item) {
  const status = purchaseFor(item.id)?.status;
  if (status === "purchased") return 1;
  if (status === "ordered") return 0.75;
  if (claimsFor(item.id).length) return 0.5;
  return 0;
}
function renderIdeas() {
  $("#page-heading").textContent = "Ideas";
  $("#organizer-ideas-note").classList.toggle("hidden", !state.member?.is_organizer);
  const pending = [...pendingSuggestions()].sort((a, b) => votesFor(b.id).length - votesFor(a.id).length || new Date(b.created_at) - new Date(a.created_at));
  const reviewed = [...reviewedSuggestions()].sort((a, b) => new Date(b.reviewed_at || b.updated_at || b.created_at) - new Date(a.reviewed_at || a.updated_at || a.created_at));
  $("#pending-ideas-count").textContent = `${pending.length} idea${pending.length === 1 ? "" : "s"}`;
  $("#reviewed-ideas-count").textContent = `${reviewed.length} decision${reviewed.length === 1 ? "" : "s"}`;

  if (!pending.length) {
    els.pendingIdeas.innerHTML = `<div class="empty-state ideas-empty"><strong>No ideas waiting</strong>New suggestions will appear here for group support and organizer review.</div>`;
  } else {
    els.pendingIdeas.innerHTML = pending.map(row => {
      const image = row.image_data || safeHttpUrl(row.image_url) || "assets/theme/idea-default.png";
      const supportCount = votesFor(row.id).length;
      const supported = Boolean(myVote(row.id));
      const organizerActions = state.member?.is_organizer ? `<button class="button button-primary" type="button" data-approve-idea="${row.id}">Approve for party</button><button class="button button-danger" type="button" data-reject-idea="${row.id}">Decline</button>` : "";
      return `<article class="idea-review-card pending">
        <figure class="idea-review-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(`Photo for ${row.name}`)}"></figure>
        <div class="idea-review-copy">
          <div class="idea-review-topline"><span class="badge idea-status pending">Awaiting approval</span><span>${supportCount} support${supportCount === 1 ? "" : "s"}</span></div>
          <h3>${escapeHtml(row.name)}</h3>
          <p>${escapeHtml(row.description)}</p>
          <div class="idea-review-metrics"><div><span>Budget</span><strong>${Number(row.budget || 0) > 0 ? money(row.budget) : "No cost"}</strong></div><div><span>People needed</span><strong>${Number(row.max_people || 1)}</strong></div></div>
          <div class="idea-review-byline">Suggested by <strong>${escapeHtml(memberName(row.suggested_by))}</strong> · ${relativeTime(row.created_at)}</div>
          <div class="idea-review-actions"><button class="idea-vote-button ${supported ? "active" : ""}" type="button" data-support-idea="${row.id}">${supported ? "Supported ✓" : "Support idea"}</button>${organizerActions}</div>
        </div>
      </article>`;
    }).join("");
  }

  if (!reviewed.length) {
    els.reviewedIdeas.innerHTML = `<div class="empty-state ideas-empty"><strong>No decisions yet</strong>Approved and declined ideas will remain here for transparency.</div>`;
  } else {
    els.reviewedIdeas.innerHTML = reviewed.map(row => {
      const approved = row.status === "approved";
      const image = row.image_data || safeHttpUrl(row.image_url) || "assets/theme/idea-default.png";
      const reviewer = row.reviewed_by ? memberName(row.reviewed_by) : "Organizer";
      return `<article class="idea-history-row ${escapeHtml(row.status || "pending")}">
        <figure><img src="${escapeHtml(image)}" alt="${escapeHtml(`Photo for ${row.name}`)}"></figure>
        <div><div class="idea-history-heading"><h3>${escapeHtml(row.name)}</h3><span class="badge idea-status ${approved ? "approved" : "rejected"}">${approved ? "Approved" : "Declined"}</span></div><p>${escapeHtml(row.description)}</p><small>${approved ? "Added to the official planning list" : "Not added to the official planning list"} by ${escapeHtml(reviewer)} · ${votesFor(row.id).length} support${votesFor(row.id).length === 1 ? "" : "s"}${row.review_note ? ` · ${escapeHtml(row.review_note)}` : ""}</small></div>
      </article>`;
    }).join("");
  }

  $$('[data-support-idea]', els.pendingIdeas).forEach(button => button.addEventListener("click", () => toggleItemVote(button.dataset.supportIdea)));
  $$('[data-approve-idea]', els.pendingIdeas).forEach(button => button.addEventListener("click", () => reviewItemSuggestion(button.dataset.approveIdea, "approved")));
  $$('[data-reject-idea]', els.pendingIdeas).forEach(button => button.addEventListener("click", () => reviewItemSuggestion(button.dataset.rejectIdea, "rejected")));
}

async function reviewItemSuggestion(itemId, decision) {
  if (!state.member?.is_organizer) return toast("Only the organizer can approve or decline ideas.", "error");
  const row = suggestionById(itemId);
  if (!row || (row.status || "pending") !== "pending") return;
  const approved = decision === "approved";
  const confirmed = confirm(approved ? `Approve “${row.name}” and add it to the official planning list?` : `Decline “${row.name}”? It will stay visible in the decision history.`);
  if (!confirmed) return;
  const note = approved ? "" : (prompt("Optional: add a short reason for declining this idea.", "") || "").trim().slice(0, 240);
  try {
    if (state.mode === "demo") {
      row.status = decision;
      row.reviewed_by = state.user.id;
      row.reviewed_at = new Date().toISOString();
      row.review_note = note;
      row.updated_at = new Date().toISOString();
      demoWrite("communityItems", state.communityItems);
      addDemoActivity(approved ? "item_approved" : "item_rejected", String(row.id), approved ? "approved this idea for the party" : "declined this idea");
    } else {
      const { error } = await state.client.rpc("review_item_suggestion", { p_item_id: itemId, p_decision: decision, p_note: note });
      if (error) throw error;
      await loadAllData();
    }
    toast(approved ? `${row.name} is now part of the party plan.` : `${row.name} was declined.`);
  } catch (error) {
    fail(error, "Could not save the organizer decision.");
  }
}

function renderBoard() {
  const headings = { all: "Everything", mine: "My items", available: "Available", coordinating: "Coordinating", purchased: "Purchased" };
  const heading = headings[state.view];
  $("#page-heading").textContent = heading;
  $("#result-heading").textContent = `${heading} items`;
  const items = filteredItems();
  $("#result-count").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  els.grid.innerHTML = "";
  if (!items.length) {
    els.grid.innerHTML = `<div class="empty-state"><strong>No items found</strong>Try another view or search.</div>`;
    return;
  }
  for (const item of items) els.grid.appendChild(createItemCard(item));
}

function createItemCard(item) {
  const fragment = els.template.content.cloneNode(true);
  const card = $(".item-card", fragment);
  const participants = claimsFor(item.id);
  const joined = Boolean(myClaim(item.id));
  const purchased = isPurchased(item.id);
  const full = participants.length >= item.maxPeople;
  const total = contributed(item.id);
  const percent = item.budget > 0 ? Math.min(100, Math.round((total / item.budget) * 100)) : (participants.length ? 100 : 0);

  card.dataset.itemId = item.id;
  card.classList.toggle("community-item", Boolean(item.isCommunity));
  card.draggable = !joined && !purchased && !full;
  if (card.draggable) {
    card.addEventListener("dragstart", event => {
      card.classList.add("dragging");
      event.dataTransfer.setData("text/birthday-item", item.id);
      event.dataTransfer.effectAllowed = "copy";
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  }
  card.addEventListener("dblclick", () => openItemDetail(item.id));
  card.addEventListener("keydown", event => { if (event.key === "Enter") openItemDetail(item.id); });

  const itemPhoto = $(".item-photo-img", fragment);
  itemPhoto.src = item.image;
  itemPhoto.alt = item.imageAlt || item.name;
  itemPhoto.draggable = false;
  itemPhoto.addEventListener("error", () => itemPhoto.closest(".item-photo")?.classList.add("image-missing"));
  const statusBadge = $(".status-badge", fragment);
  statusBadge.textContent = purchased ? "Purchased" : joined ? "You joined" : participants.length ? "In progress" : "Available";
  if (purchased) statusBadge.classList.add("purchased");
  else if (joined) statusBadge.classList.add("mine");
  $(".item-name", fragment).textContent = item.name;
  $(".item-description", fragment).textContent = item.description;
  $(".item-budget", fragment).textContent = item.budget > 0 ? money(item.budget) : "No cost";
  $(".item-slots", fragment).textContent = `${participants.length} / ${item.maxPeople}`;
  $(".funding-value", fragment).textContent = item.budget > 0 ? `${money(total)} of ${money(item.budget)}` : `${participants.length} joined`;
  $(".card-progress", fragment).style.width = `${percent}%`;
  $(".split-note", fragment).textContent = item.budget > 0 && participants.length ? `Equal split would be ${money(item.budget / participants.length)} each` : "";
  renderAvatarStack($(".avatar-stack", fragment), participants);
  $(".participant-summary", fragment).textContent = participants.length ? `${participants.length} sharing` : "Nobody yet";

  const ideaStrip = $(".idea-strip", fragment);
  if (item.isCommunity) {
    ideaStrip.classList.remove("hidden");
    const supportCount = votesFor(item.id).length;
    $(".idea-byline", fragment).textContent = `Approved party idea · suggested by ${suggestedByName(item)} · ${supportCount} support${supportCount === 1 ? "" : "s"}`;
    $(".idea-vote-button", fragment).classList.add("hidden");
  }

  const joinButton = $(".join-button", fragment);
  joinButton.textContent = joined ? "Leave" : purchased ? "Purchased" : full ? "Full" : "Join item";
  joinButton.disabled = purchased || (!joined && full);
  joinButton.addEventListener("click", event => { event.stopPropagation(); joined ? leaveItem(item.id) : joinItem(item.id); });
  $(".details-button", fragment).addEventListener("click", event => { event.stopPropagation(); openItemDetail(item.id); });
  return fragment;
}
function renderAvatarStack(container, participants) {
  container.innerHTML = "";
  participants.slice(0, 4).forEach(claim => {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.title = memberName(claim.user_id);
    avatar.textContent = initials(memberName(claim.user_id));
    container.appendChild(avatar);
  });
  if (participants.length > 4) {
    const more = document.createElement("span"); more.className = "avatar"; more.textContent = `+${participants.length - 4}`; container.appendChild(more);
  }
}

async function joinItem(itemId) {
  const item = itemById(itemId);
  if (!item || myClaim(itemId) || isPurchased(itemId)) return;
  if (claimsFor(itemId).length >= item.maxPeople) return toast("That item already has enough people.", "error");
  const actionKey = `join-item:${itemId}`;
  if (!acquireAction(actionKey)) return;
  try {
    if (state.mode === "demo") {
      state.claims.push({ id: uuid(), room_id: state.roomId, item_id: itemId, user_id: state.user.id, contribution: 0, note: "", created_at: new Date().toISOString() });
      demoWrite("claims", state.claims);
      addDemoActivity("joined", itemId, "joined this item");
    } else {
      const { error } = await state.client.from("claims").insert({ room_id: state.roomId, item_id: itemId, user_id: state.user.id, contribution: 0 });
      if (error) throw error;
      await loadAllData();
    }
    toast(`You joined ${item.name}.`);
  } catch (error) { fail(error, "Could not join the item."); }
  finally { releaseAction(actionKey); }
}
async function leaveItem(itemId) {
  const claim = myClaim(itemId);
  if (!claim) return;
  const actionKey = `leave-item:${itemId}`;
  if (!acquireAction(actionKey)) return;
  try {
    if (state.mode === "demo") {
      state.claims = state.claims.filter(row => row.id !== claim.id);
      demoWrite("claims", state.claims);
      addDemoActivity("left", itemId, "left this item");
    } else {
      const { error } = await state.client.from("claims").delete().eq("id", claim.id);
      if (error) throw error;
      await loadAllData();
    }
    toast(`You left ${itemById(itemId)?.name}.`);
  } catch (error) { fail(error, "Could not leave the item."); }
  finally { releaseAction(actionKey); }
}
async function saveContribution(itemId, amount, note) {
  const claim = myClaim(itemId);
  if (!claim) return toast("Join this item before adding a contribution.", "error");
  const contribution = Math.max(0, Number(amount || 0));
  const cleanNote = String(note || "").trim().slice(0, 180);
  const actionKey = `contribution:${itemId}`;
  if (!acquireAction(actionKey)) return;
  try {
    if (state.mode === "demo") {
      claim.contribution = contribution; claim.note = cleanNote; claim.updated_at = new Date().toISOString();
      demoWrite("claims", state.claims); addDemoActivity("contribution", itemId, `updated a contribution to ${money(contribution)}`);
    } else {
      const { error } = await state.client.from("claims").update({ contribution, note: cleanNote, updated_at: new Date().toISOString() }).eq("id", claim.id);
      if (error) throw error;
      await loadAllData();
    }
    toast("Your contribution was saved.");
  } catch (error) { fail(error, "Could not save the contribution."); }
  finally { releaseAction(actionKey); }
}
async function updatePurchaseStatus(itemId, status) {
  if (!myClaim(itemId)) return toast("Only someone sharing this item can update its status.", "error");
  if (!["planning", "ordered", "purchased"].includes(status)) return toast("Choose a valid item status.", "error");
  const actionKey = `purchase-status:${itemId}`;
  if (!acquireAction(actionKey)) return;
  try {
    if (state.mode === "demo") {
      const row = purchaseFor(itemId);
      if (row) { row.status = status; row.updated_by = state.user.id; row.updated_at = new Date().toISOString(); }
      else state.purchases.push({ room_id: state.roomId, item_id: itemId, status, updated_by: state.user.id, updated_at: new Date().toISOString() });
      demoWrite("purchases", state.purchases); addDemoActivity("status", itemId, `changed the status to ${status}`);
    } else {
      const { error } = await state.client.from("purchases").upsert({ room_id: state.roomId, item_id: itemId, status, updated_by: state.user.id, updated_at: new Date().toISOString() }, { onConflict: "room_id,item_id" });
      if (error) throw error;
      await loadAllData();
    }
    toast("Item status updated.");
  } catch (error) { fail(error, "Could not update the status."); }
  finally { releaseAction(actionKey); }
}
async function sendMessage(itemId, message) {
  const clean = String(message || "").trim().slice(0, 300);
  if (!clean) return;
  const actionKey = `message:${itemId}`;
  if (!acquireAction(actionKey)) return;
  try {
    if (state.mode === "demo") {
      state.messages.push({ id: uuid(), room_id: state.roomId, item_id: itemId, user_id: state.user.id, message: clean, created_at: new Date().toISOString() });
      demoWrite("messages", state.messages);
      addDemoActivity("message", itemId, itemId === VENUE_DISCUSSION_ID ? "posted in the venue discussion" : "posted a message");
    } else {
      const { error } = await state.client.from("item_messages").insert({ room_id: state.roomId, item_id: itemId, user_id: state.user.id, message: clean });
      if (error) throw error;
      await loadAllData();
    }
  } catch (error) { fail(error, "Could not send the message."); }
  finally { releaseAction(actionKey); }
}
function addDemoActivity(action, itemId, detail) {
  state.activity.unshift({ id: uuid(), room_id: state.roomId, actor_id: state.user.id, action, item_id: itemId, detail, created_at: new Date().toISOString() });
  state.activity = state.activity.slice(0, 30);
  demoWrite("activity", state.activity);
}

function openItemDetail(itemId) {
  state.activeItemId = itemId;
  renderItemDetail(itemId);
  if (!els.itemDialog.open) els.itemDialog.showModal();
}
function renderItemDetail(itemId) {
  const item = itemById(itemId);
  if (!item) return;
  const participants = claimsFor(item.id);
  const joined = Boolean(myClaim(item.id));
  const claim = myClaim(item.id);
  const status = purchaseFor(item.id)?.status || "planning";
  const total = contributed(item.id);
  const remaining = Math.max(0, item.budget - total);
  const equalSplit = participants.length && item.budget > 0 ? item.budget / participants.length : 0;

  els.itemDetail.innerHTML = `
    <div class="detail-hero">
      <figure class="detail-photo"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.name)}"></figure>
      <div><p class="eyebrow">ITEM DETAILS</p><h2 id="detail-title">${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p></div>
    </div>
    ${item.isCommunity ? `<div class="community-detail-note"><div><strong>Organizer-approved party idea</strong><span>Suggested by ${escapeHtml(suggestedByName(item))} · supported by ${votesFor(item.id).length} planner${votesFor(item.id).length === 1 ? "" : "s"}</span></div><span class="badge idea-status approved">Approved</span></div>` : ""}
    <div class="detail-grid">
      <section class="detail-panel">
        <h3>Shared budget</h3>
        <div class="money-summary">
          <div><span>Estimated</span><strong>${item.budget > 0 ? money(item.budget) : "No cost"}</strong></div>
          <div><span>Contributed</span><strong>${money(total)}</strong></div>
          <div><span>Remaining</span><strong>${item.budget > 0 ? money(remaining) : "—"}</strong></div>
        </div>
        <div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="width:${item.budget > 0 ? Math.min(100, (total / item.budget) * 100) : (participants.length ? 100 : 0)}%"></div></div>
        <small style="display:block;margin-top:8px;color:var(--muted)">${equalSplit ? `An equal split would currently be ${money(equalSplit)} per person.` : "People may contribute different amounts."}</small>
        <form id="contribution-form" class="contribution-form">
          <label class="field"><span>Your contribution</span><input id="detail-contribution" type="number" min="0" step="0.01" value="${Number(claim?.contribution || 0)}" ${joined ? "" : "disabled"}></label>
          <button class="button button-primary" type="submit" ${joined ? "" : "disabled"}>Save</button>
          <label class="field" style="grid-column:1/-1"><span>Your note</span><input id="detail-note" maxlength="180" value="${escapeHtml(claim?.note || "")}" placeholder="e.g. I can collect it after work" ${joined ? "" : "disabled"}></label>
        </form>
      </section>
      <section class="detail-panel">
        <h3>People sharing this item (${participants.length}/${item.maxPeople})</h3>
        <div class="member-list">
          ${participants.length ? participants.map(person => `<div class="member-row"><span class="avatar">${initials(memberName(person.user_id))}</span><div><strong>${escapeHtml(memberName(person.user_id))}</strong><small>${escapeHtml(person.note || "No note added")}</small></div><strong>${money(person.contribution)}</strong></div>`).join("") : `<div class="empty-state" style="padding:22px">Nobody has joined yet.</div>`}
        </div>
      </section>
      <section class="detail-panel">
        <h3>Item status</h3>
        <label class="field"><span>Planning stage</span><select id="detail-status" ${joined ? "" : "disabled"}><option value="planning" ${status === "planning" ? "selected" : ""}>Planning</option><option value="ordered" ${status === "ordered" ? "selected" : ""}>Ordered / arranged</option><option value="purchased" ${status === "purchased" ? "selected" : ""}>Purchased / complete</option></select></label>
        <div class="detail-actions">
          <button id="detail-join" class="button ${joined ? "button-danger" : "button-primary"}" type="button" ${!joined && (participants.length >= item.maxPeople || status === "purchased") ? "disabled" : ""}>${joined ? "Leave item" : "Join shared item"}</button>
        </div>
      </section>
      <section class="detail-panel">
        <h3>Item discussion</h3>
        <div id="detail-messages" class="messages">${renderMessagesHtml(item.id)}</div>
        <form id="message-form" class="message-form"><input id="message-input" maxlength="300" placeholder="Write an update or question…" required><button class="button button-primary" type="submit">Send</button></form>
      </section>
    </div>`;

  $("#detail-join").addEventListener("click", () => joined ? leaveItem(item.id) : joinItem(item.id));
  $("#detail-status").addEventListener("change", event => updatePurchaseStatus(item.id, event.target.value));
  $("#contribution-form").addEventListener("submit", event => {
    event.preventDefault();
    saveContribution(item.id, $("#detail-contribution").value, $("#detail-note").value.trim());
  });
  $("#message-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("#message-input");
    const message = input.value;
    input.value = "";
    await sendMessage(item.id, message);
  });
}
function renderMessagesHtml(itemId) {
  const messages = messagesFor(itemId);
  if (!messages.length) return `<div class="empty-state" style="padding:20px">No messages yet. Start the coordination here.</div>`;
  return messages.map(message => `<div class="message ${message.user_id === state.user.id ? "mine" : ""}"><div class="message-head"><strong>${escapeHtml(memberName(message.user_id))}</strong><time>${relativeTime(message.created_at)}</time></div><p>${escapeHtml(message.message)}</p></div>`).join("");
}


function openItemSuggestionDialog() {
  $("#item-suggestion-error").textContent = "";
  els.itemSuggestionForm.reset();
  $("#suggested-item-budget").value = "0";
  $("#suggested-item-people").value = "3";
  els.itemImagePreview.src = "assets/theme/idea-default.png";
  els.itemSuggestionDialog.showModal();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be opened."));
    image.src = dataUrl;
  });
}

async function prepareSuggestedItemImage(file) {
  if (!file) return "";
  const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!supported.includes(file.type)) throw new Error("Use a PNG, JPG, WebP, or GIF image.");
  if (file.size > 2_200_000) throw new Error("Keep the image under 2.2 MB.");
  const original = await readFileAsDataUrl(file);
  if (file.type === "image/gif") return original;

  const image = await loadImage(original);
  const maxSide = 1000;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

async function previewSuggestedItemImage() {
  const file = els.itemImageInput.files?.[0];
  if (!file) {
    els.itemImagePreview.src = safeHttpUrl(els.itemImageUrl.value) || "assets/theme/idea-default.png";
    return;
  }
  try {
    els.itemImagePreview.src = await prepareSuggestedItemImage(file);
    $("#item-suggestion-error").textContent = "";
  } catch (error) {
    els.itemImageInput.value = "";
    els.itemImagePreview.src = "assets/theme/idea-default.png";
    $("#item-suggestion-error").textContent = error.message;
  }
}

async function suggestItem(event) {
  event.preventDefault();
  const errorNode = $("#item-suggestion-error");
  const button = $("button[type='submit']", els.itemSuggestionForm);
  errorNode.textContent = "";
  const imageUrlRaw = els.itemImageUrl.value.trim();
  const imageUrl = safeHttpUrl(imageUrlRaw);
  if (imageUrlRaw && !imageUrl) return errorNode.textContent = "Enter a valid image link beginning with http:// or https://.";

  button.disabled = true;
  try {
    const imageData = await prepareSuggestedItemImage(els.itemImageInput.files?.[0]);
    const payload = {
      room_id: state.roomId,
      suggested_by: state.user.id,
      name: $("#suggested-item-name").value.trim(),
      description: $("#suggested-item-description").value.trim(),
      budget: Math.max(0, Number($("#suggested-item-budget").value || 0)),
      max_people: Math.max(1, Number($("#suggested-item-people").value || 1)),
      image_data: imageData,
      image_url: imageData ? "" : imageUrl,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: ""
    };
    if (!payload.name || !payload.description) throw new Error("Add both a name and a description for the idea.");

    if (state.mode === "demo") {
      const row = { id: uuid(), ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      state.communityItems.push(row);
      demoWrite("communityItems", state.communityItems);
      addDemoActivity("item_suggested", row.id, "suggested a new item");
    } else {
      const { error } = await state.client.from("item_suggestions").insert(payload);
      if (error) throw error;
      await loadAllData();
    }
    els.itemSuggestionDialog.close();
    toast("Your idea was sent to the organizer for review.");
  } catch (error) {
    errorNode.textContent = error?.message || "Could not add this idea.";
  } finally {
    button.disabled = false;
  }
}

async function toggleItemVote(itemId) {
  const suggestion = suggestionById(itemId);
  if (!suggestion || (suggestion.status || "pending") !== "pending") return;
  const existing = myVote(itemId);
  try {
    if (state.mode === "demo") {
      if (existing) state.itemVotes = state.itemVotes.filter(vote => !(vote.item_id === String(itemId) && vote.user_id === state.user.id));
      else state.itemVotes.push({ room_id: state.roomId, item_id: String(itemId), user_id: state.user.id, created_at: new Date().toISOString() });
      demoWrite("itemVotes", state.itemVotes);
    } else if (existing) {
      const { error } = await state.client.from("item_votes").delete().eq("room_id", state.roomId).eq("item_id", itemId).eq("user_id", state.user.id);
      if (error) throw error;
      await loadAllData();
    } else {
      const { error } = await state.client.from("item_votes").insert({ room_id: state.roomId, item_id: itemId, user_id: state.user.id });
      if (error) throw error;
      await loadAllData();
    }
    renderEverything();
    toast(existing ? "Your support was removed." : "You supported this idea.");
  } catch (error) {
    fail(error, "Could not update your support.");
  }
}


function renderVenueDiscussion() {
  if (!els.venueMessages) return;
  const messages = messagesFor(VENUE_DISCUSSION_ID);
  $("#venue-message-count").textContent = `${messages.length} message${messages.length === 1 ? "" : "s"}`;
  if (!messages.length) {
    els.venueMessages.innerHTML = `<div class="empty-state venue-chat-empty"><strong>No venue messages yet</strong>Start the conversation about location, transport, price, or which suggestion works best.</div>`;
    return;
  }
  els.venueMessages.innerHTML = messages.map(message => `<div class="message ${message.user_id === state.user.id ? "mine" : ""}"><div class="message-head"><strong>${escapeHtml(memberName(message.user_id))}</strong><time>${relativeTime(message.created_at)}</time></div><p>${escapeHtml(message.message)}</p></div>`).join("");
  requestAnimationFrame(() => { els.venueMessages.scrollTop = els.venueMessages.scrollHeight; });
}

function renderVenues() {
  $("#page-heading").textContent="Venue";
  $("#organizer-venue-note").classList.toggle("hidden",!state.member?.is_organizer);
  $("#venue-result-count").textContent=`${state.venues.length} suggestion${state.venues.length===1?"":"s"}`;
  renderConfirmedVenue();
  renderVenueDiscussion();
  if(!state.venues.length){els.venueList.innerHTML=`<div class="empty-state"><strong>No places suggested yet</strong>Use “Suggest a place” to add the first Airbnb, rental, restaurant, or venue.</div>`;return;}
  els.venueList.innerHTML=state.venues.map(venue=>{const mapsUrl=mapsLinkFor(venue),airbnbUrl=safeHttpUrl(venue.airbnb_url),canDelete=state.member?.is_organizer||(venue.suggested_by===state.user?.id&&!venue.is_confirmed),price=Number(venue.price||0);return `<article class="venue-card ${venue.is_confirmed?"confirmed":""}"><div class="venue-card-head"><div><span class="badge category-badge">${venue.is_confirmed?"Confirmed":"Suggestion"}</span><h3>${escapeHtml(venue.name)}</h3></div><span class="venue-pin">⌖</span></div><p class="venue-address">${escapeHtml(venue.address)}</p><p class="venue-notes">${escapeHtml(venue.notes||"No extra details were added.")}</p><div class="venue-metrics"><div><span>Total price</span><strong>${price>0?money(price):"Not listed"}</strong></div><div><span>Nights</span><strong>${Number(venue.nights||1)}</strong></div><div><span>Capacity</span><strong>${Number(venue.capacity||0)||"—"}</strong></div><div><span>At full capacity</span><strong>${price>0&&venue.capacity>0?`${money(venuePerGuest(venue))} each`:"—"}</strong></div></div><div class="venue-byline">Suggested by <strong>${escapeHtml(venueOwnerName(venue))}</strong></div><div class="venue-actions"><a class="button button-ghost" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open Maps</a>${airbnbUrl?`<a class="button button-ghost" href="${escapeHtml(airbnbUrl)}" target="_blank" rel="noopener noreferrer">Open rental</a>`:""}${state.member?.is_organizer&&!venue.is_confirmed?`<button class="button button-primary" type="button" data-confirm-venue="${venue.id}">Confirm place</button>`:""}${canDelete?`<button class="button button-danger" type="button" data-delete-venue="${venue.id}">Remove</button>`:""}</div></article>`;}).join("");
  $$('[data-confirm-venue]',els.venueList).forEach(b=>b.addEventListener("click",()=>confirmVenue(b.dataset.confirmVenue)));
  $$('[data-delete-venue]',els.venueList).forEach(b=>b.addEventListener("click",()=>deleteVenue(b.dataset.deleteVenue)));
}
function renderConfirmedVenue(){const venue=confirmedVenueRow();if(!venue){els.confirmedVenue.innerHTML=`<div class="confirmed-venue-empty"><span class="confirmed-icon">⌖</span><div><strong>No place has been confirmed</strong><p>Everyone can suggest options. Only the organizer can mark the final location.</p></div></div>`;return;}const mapsUrl=mapsLinkFor(venue),airbnbUrl=safeHttpUrl(venue.airbnb_url),price=Number(venue.price||0);els.confirmedVenue.innerHTML=`<article class="confirmed-venue-card"><div class="confirmed-venue-copy"><div class="confirmed-kicker"><span>◆</span> Confirmed birthday place</div><h2>${escapeHtml(venue.name)}</h2><p class="confirmed-address">${escapeHtml(venue.address)}</p><p class="confirmed-description">${escapeHtml(venue.notes||"The organizer selected this as the official location.")}</p><div class="confirmed-metrics"><div><span>Total rental</span><strong>${price>0?money(price):"Not listed"}</strong></div><div><span>Stay</span><strong>${Number(venue.nights||1)} night${Number(venue.nights||1)===1?"":"s"}</strong></div><div><span>Capacity</span><strong>${Number(venue.capacity||0)||"—"} guests</strong></div><div><span>Full-capacity split</span><strong>${price>0&&venue.capacity>0?money(venuePerGuest(venue)):"—"}</strong></div></div><div class="confirmed-links"><a class="button button-primary" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Directions in Google Maps</a>${airbnbUrl?`<a class="button button-ghost" href="${escapeHtml(airbnbUrl)}" target="_blank" rel="noopener noreferrer">View Airbnb / rental</a>`:""}</div></div><div class="map-frame"><iframe title="Map of ${escapeHtml(venue.name)}" src="${escapeHtml(mapsEmbedFor(venue))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></article>`;}
async function suggestVenue(event){event.preventDefault();const button=$("button[type='submit']",els.venueForm),errorNode=$("#venue-form-error");errorNode.textContent="";const mapsRaw=$("#venue-maps-url").value.trim(),airRaw=$("#venue-airbnb-url").value.trim();if(mapsRaw&&!safeHttpUrl(mapsRaw))return errorNode.textContent="Enter a valid Google Maps link beginning with http:// or https://.";if(airRaw&&!safeHttpUrl(airRaw))return errorNode.textContent="Enter a valid Airbnb or rental link beginning with http:// or https://.";const payload={room_id:state.roomId,suggested_by:state.user.id,name:$("#venue-name").value.trim(),address:$("#venue-address").value.trim(),google_maps_url:safeHttpUrl(mapsRaw),airbnb_url:safeHttpUrl(airRaw),price:Number($("#venue-price").value||0),nights:Number($("#venue-nights").value||1),capacity:Number($("#venue-capacity").value||1),notes:$("#venue-notes").value.trim(),is_confirmed:false};if(!payload.name||!payload.address)return errorNode.textContent="Add both the place name and its address or area.";button.disabled=true;try{if(state.mode==="demo"){state.venues.unshift({id:uuid(),...payload,confirmed_by:null,confirmed_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});demoWrite("venues",state.venues);addDemoActivity("venue",null,`suggested the venue ${payload.name}`);}else{const{error}=await state.client.from("venue_suggestions").insert(payload);if(error)throw error;await loadAllData();}els.venueDialog.close();toast("Place suggestion added.");}catch(error){fail(error,"Could not add the place suggestion.");}finally{button.disabled=false;}}
async function confirmVenue(venueId){if(!state.member?.is_organizer)return toast("Only the organizer can confirm the birthday place.","error");const venue=state.venues.find(r=>r.id===venueId);if(!venue||!confirm(`Confirm “${venue.name}” as the official birthday place?`))return;try{if(state.mode==="demo"){state.venues.forEach(r=>{r.is_confirmed=r.id===venueId;r.confirmed_by=r.id===venueId?state.user.id:null;r.confirmed_at=r.id===venueId?new Date().toISOString():null;r.updated_at=new Date().toISOString();});demoWrite("venues",state.venues);addDemoActivity("venue_confirmed",null,`confirmed the venue ${venue.name}`);}else{const{error}=await state.client.rpc("confirm_venue",{p_venue_id:venueId});if(error)throw error;await loadAllData();}toast("The official birthday place was updated.");}catch(error){fail(error,"Could not confirm this place.");}}
async function deleteVenue(venueId){const venue=state.venues.find(r=>r.id===venueId);if(!venue||!confirm(`Remove the suggestion “${venue.name}”?`))return;try{if(state.mode==="demo"){state.venues=state.venues.filter(r=>r.id!==venueId);demoWrite("venues",state.venues);addDemoActivity("venue_removed",null,`removed the venue suggestion ${venue.name}`);}else{const{error}=await state.client.from("venue_suggestions").delete().eq("id",venueId);if(error)throw error;await loadAllData();}toast("Place suggestion removed.");}catch(error){fail(error,"Could not remove this suggestion.");}}

function activityIcon(action = "") {
  if (action === "member_joined") return "＋";
  if (action.includes("venue")) return "⌖";
  if (action.includes("item_") || action === "joined" || action === "left") return "◇";
  if (action === "contribution") return "$";
  if (action === "status") return "✓";
  if (action === "message") return "·";
  if (action === "event_updated") return "◷";
  return "↗";
}
function renderActivity() {
  if (!state.activity.length) {
    els.activity.innerHTML = `<div class="empty-state activity-empty"><strong>No activity yet</strong>Joining an item, suggesting a venue, or posting a message will appear here.</div>`;
    return;
  }
  els.activity.innerHTML = state.activity.slice(0, 12).map(row => {
    const item = itemById(row.item_id);
    const suggestion = suggestionById(row.item_id);
    const subject = item?.name || suggestion?.name || "";
    const detail = row.item_id === VENUE_DISCUSSION_ID && row.detail === "posted a message" ? "posted in the venue discussion" : (row.detail || row.action);
    const actor = memberName(row.actor_id);
    return `<article class="activity-row"><span class="activity-action-icon" aria-hidden="true">${activityIcon(row.action)}</span><span class="avatar">${initials(actor)}</span><div class="activity-copy"><p><strong>${escapeHtml(actor)}</strong> ${escapeHtml(detail)}</p>${subject ? `<span>${escapeHtml(subject)}</span>` : ""}</div><time datetime="${escapeHtml(row.created_at)}">${relativeTime(row.created_at)}</time></article>`;
  }).join("");
}
function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size || unit === "minute") return formatter.format(Math.round(seconds / size), unit);
  return "now";
}

async function requestPasswordReset() {
  if (state.mode !== "supabase") return toast("Password reset emails require Supabase.", "error");
  const email = els.recoveryEmail.value.trim().toLowerCase();
  if (!email || !els.recoveryEmail.checkValidity()) {
    els.recoveryStatus.className = "recovery-status error";
    els.recoveryStatus.textContent = "Enter your account email first, then press Forgot your password?";
    els.recoveryEmail.reportValidity();
    return;
  }
  const actionKey = `password-reset:${email}`;
  if (!acquireAction(actionKey)) return;
  setButtonBusy(els.forgotPasswordButton, true, "Sending…");
  els.recoveryStatus.className = "recovery-status";
  els.recoveryStatus.textContent = "Sending a secure password reset email…";
  try {
    const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl("reset-password") });
    if (error) throw error;
    els.recoveryStatus.className = "recovery-status success";
    els.recoveryStatus.textContent = `Reset email sent to ${email}. Open the link, then choose a new password.`;
    toast("Password reset email sent.");
  } catch (error) {
    els.recoveryStatus.className = "recovery-status error";
    els.recoveryStatus.textContent = error?.message || "Could not send the password reset email.";
    fail(error, "Could not send the password reset email.");
  } finally {
    setButtonBusy(els.forgotPasswordButton, false);
    releaseAction(actionKey);
  }
}
function openPasswordResetDialog() {
  if (!els.passwordResetDialog || els.passwordResetDialog.open) return;
  els.passwordResetStatus.textContent = "";
  els.resetPassword.value = "";
  els.resetPasswordConfirm.value = "";
  els.passwordResetDialog.showModal();
  window.setTimeout(() => els.resetPassword.focus(), 80);
}
async function saveRecoveredPassword(event) {
  event.preventDefault();
  if (!state.client || !state.user) return;
  const password = els.resetPassword.value;
  const confirmation = els.resetPasswordConfirm.value;
  if (password.length < 8) {
    els.passwordResetStatus.className = "form-status error";
    els.passwordResetStatus.textContent = "The new password must contain at least 8 characters.";
    return;
  }
  if (password !== confirmation) {
    els.passwordResetStatus.className = "form-status error";
    els.passwordResetStatus.textContent = "The two passwords do not match.";
    return;
  }
  const actionKey = "save-recovered-password";
  if (!acquireAction(actionKey)) return;
  const button = $("#save-reset-password-button");
  setButtonBusy(button, true, "Saving…");
  try {
    const { data, error } = await state.client.auth.updateUser({
      password,
      data: { ...(state.user.user_metadata || {}), password_login_enabled: true }
    });
    if (error) throw error;
    if (data?.user) state.user = data.user;
    state.passwordRecoveryMode = false;
    cleanAuthUrl();
    els.passwordResetStatus.className = "form-status success";
    els.passwordResetStatus.textContent = "Password updated successfully.";
    toast("Your new password is ready.");
    window.setTimeout(() => els.passwordResetDialog.close(), 500);
  } catch (error) {
    els.passwordResetStatus.className = "form-status error";
    els.passwordResetStatus.textContent = error?.message || "Could not update your password.";
    fail(error, "Could not update your password.");
  } finally {
    setButtonBusy(button, false);
    releaseAction(actionKey);
  }
}

async function protectCurrentAccount() {
  if (state.mode !== "supabase") return toast("Account protection is available after Supabase is connected.", "error");
  if (hasPasswordLogin()) return syncAccountProtectionUI();

  const button = els.protectAccountButton;
  button.disabled = true;
  els.accountProtectionStatus.className = "account-protection-status";

  try {
    if (!hasVerifiedEmail()) {
      const email = els.accountEmail.value.trim().toLowerCase();
      if (!email || !els.accountEmail.checkValidity()) {
        els.accountProtectionStatus.textContent = "Enter a valid email address.";
        els.accountEmail.reportValidity();
        button.disabled = false;
        return;
      }

      els.accountProtectionStatus.textContent = "Sending your one-time verification email…";
      const { data, error } = await state.client.auth.updateUser(
        { email },
        { emailRedirectTo: authRedirectUrl() }
      );
      if (error) throw error;
      if (data?.user) state.user = data.user;
      state.pendingProtectionEmail = email;
      syncAccountProtectionUI(`Verification sent to ${email}. Open that email once and click the confirmation link. Then return here to create your password.`);
      toast("Verification email sent. You only need this email step once.");
      return;
    }

    const password = els.accountPassword.value;
    const confirmation = els.accountPasswordConfirm.value;
    if (password.length < 8) {
      els.accountProtectionStatus.textContent = "Your password must contain at least 8 characters.";
      els.accountPassword.focus();
      button.disabled = false;
      return;
    }
    if (password !== confirmation) {
      els.accountProtectionStatus.textContent = "The two passwords do not match.";
      els.accountPasswordConfirm.focus();
      button.disabled = false;
      return;
    }

    els.accountProtectionStatus.textContent = "Creating your password…";
    const { data, error } = await state.client.auth.updateUser({
      password,
      data: {
        ...(state.user?.user_metadata || {}),
        password_login_enabled: true
      }
    });
    if (error) throw error;
    if (data?.user) state.user = data.user;
    els.accountPassword.value = "";
    els.accountPasswordConfirm.value = "";
    syncAccountProtectionUI("Password created. Your account can now be restored using email and password without a sign-in email.");
    toast("Password login is ready.");
  } catch (error) {
    button.disabled = false;
    els.accountProtectionStatus.textContent = error?.message || "Could not protect this account.";
    fail(error, "Could not protect this account.");
  }
}

async function sendRecoveryLink() {
  if (state.mode !== "supabase") return;
  const email = els.recoveryEmail.value.trim().toLowerCase();
  const password = els.recoveryPassword.value;

  if (!email || !els.recoveryEmail.checkValidity()) {
    els.recoveryStatus.textContent = "Enter the email connected to your original account.";
    els.recoveryEmail.reportValidity();
    return;
  }
  if (!password) {
    els.recoveryStatus.textContent = "Enter your password.";
    els.recoveryPassword.focus();
    return;
  }

  const button = els.recoveryButton;
  const actionKey = `sign-in:${email}`;
  if (!acquireAction(actionKey)) return;
  setButtonBusy(button, true, "Signing in…");
  els.recoveryStatus.className = "recovery-status";
  els.recoveryStatus.textContent = "Signing in…";

  try {
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.user || !data?.session) throw new Error("The sign-in did not create a session.");
    state.user = data.user;

    if (!state.user.user_metadata?.password_login_enabled) {
      const { data: updated } = await state.client.auth.updateUser({
        data: {
          ...(state.user.user_metadata || {}),
          password_login_enabled: true
        }
      });
      if (updated?.user) state.user = updated.user;
    }

    const { data: membership, error: membershipError } = await state.client.rpc("current_room_membership", { p_room_slug: config.ROOM_SLUG });
    if (membershipError) throw membershipError;
    const row = Array.isArray(membership) ? membership[0] : membership;

    els.recoveryStatus.className = "recovery-status success";
    if (!row) {
      state.roomId = null;
      state.member = null;
      els.recoveryStatus.textContent = "Signed in successfully. This account has not joined the room yet, so enter your name and invitation code above.";
      toast("Signed in. Enter the invitation code to join this account to the room.");
      return;
    }

    state.roomId = row.room_id;
    state.member = row;
    await loadAllData();
    subscribeRealtime();
    els.recoveryPassword.value = "";
    els.recoveryStatus.textContent = "Signed in. Restoring your original planning access…";
    enterApp();
    toast("Your original access was restored.");
  } catch (error) {
    els.recoveryStatus.className = "recovery-status error";
    els.recoveryStatus.textContent = error?.message || "The email or password was not accepted.";
  } finally {
    setButtonBusy(button, false);
    releaseAction(actionKey);
  }
}

async function updateProfile(event) {
  event.preventDefault();
  const name = els.profileName.value.trim();
  if (!name) return;
  try {
    await saveNotificationControls();
    if (state.mode === "demo") {
      state.member.display_name = name;
      demoWrite("membership", state.member);
      const member = state.members.find(row => row.user_id === state.user.id);
      if (member) member.display_name = name;
      demoWrite("members", state.members);
    } else {
      const { error } = await state.client.rpc("update_room_display_name", { p_room_id: state.roomId, p_display_name: name });
      if (error) throw error;
      state.member.display_name = name;
      await loadAllData();
    }
    els.profileDialog.close();
    syncProfileUI();
    toast("Profile and notification settings saved.");
  } catch (error) { fail(error, "Could not update your profile."); }
}
async function leaveDevice() {
  const warning = hasRecoverableAccount()
    ? "Sign out on this device? You can return later using your email and password."
    : "Remove this room from this device? Password login is not ready, so you may permanently lose control of your existing contributions.";
  if (!confirm(warning)) return;
  if (state.mode === "demo") {
    localStorage.removeItem(`${demoPrefix}membership`);
    location.reload();
    return;
  }
  await state.client.auth.signOut({ scope: "local" });
  location.reload();
}

initialize();
