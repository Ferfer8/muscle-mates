// Profile pages, yours and other people's: details, counts, Follow/Message button and the posts in the same grid as the feed.
// Your own profile also has the settings pop-up (profile, picture, public/private, password, log out, delete account).

let currentProfile = null;   // your own profile
let viewedProfile = null;    // the profile of the person you are looking at, when it isn't yours
let profileTab = "posts";

const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced"];
const STATUS_OPTIONS = ["Training", "Resting", "Recovering", "Taking a break"];
const BIO_LIMIT = 160;
const GOAL_LIMIT = 60;
const PROFILE_NAME_PATTERN = /^[\p{L}][\p{L}\s'’-]*$/u;
const PROFILE_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

// ---------- The page ----------
function renderProfilePage() {
    return `
        <header id="profileHeader">
            <h1>Profile</h1>
            <form>
                <input type="search" name="q" placeholder="Search"></input> <i class='bx bx-search'></i>
            </form>
        </header>
        <div class="profile-page" id="profilePage">
            <p class="profile-loading">Loading profile...</p>
        </div>`;
}

// The profile being shown (yours, or someone else's) and whether it is yours
function shownProfile() {
    return document.getElementById("profilePage")?.dataset.owner === "self" ? currentProfile : viewedProfile;
}

// True when the profile on screen is your own
function isOwnProfileShown() {
    return document.getElementById("profilePage")?.dataset.owner === "self";
}

// The picture has a soft glow, plus a purple ring when the person has a story (hasStory comes from the server); clicking it opens the story.
function renderProfileAvatar(profile) {
    // The person's own picture if they have uploaded one, otherwise their initials in a purple square
    const image = `<img src="${escapeHtml(profile.avatarUrl || avatarPlaceholder(profile))}" width="140" height="140" alt="Profile picture">`;
    if (profile.hasStory) {
        return `<button type="button" class="profile-avatar has-story" data-story-user="${escapeHtml(profile.username)}" aria-label="View story">${image}</button>`;
    }
    return `<div class="profile-avatar">${image}</div>`;
}

// "Message" goes to the chat with this person. It only shows for mates, because only mates can message each other.
function renderMessageButton(profile) {
    if (!profile.relationship.mates) return "";
    return `<a class="profile-message-btn" href="#/messages?with=${encodeURIComponent(profile.username)}"><i class='bx bx-message-rounded-dots'></i>Message</a>`;
}

// The button on someone else's profile: Follow, Requested (private accounts) or Following
function renderFollowButton(profile) {
    const status = profile.relationship.status;
    const label = status === "following" ? "Following" : status === "requested" ? "Requested" : "Follow";
    return `<button type="button" class="follow-btn profile-follow-btn${status !== "none" ? " following" : ""}" data-profile-follow aria-pressed="${status === "following"}">${label}</button>`;
}

// Builds the top card: picture, name, bio, details, counts and the action buttons
function renderProfileCard(profile, isSelf) {
    const fullName = `${profile.firstName} ${profile.lastName}`;
    const details = [
        profile.fitnessLevel ? `<li class="profile-chip"><i class='bx bx-trending-up'></i>${escapeHtml(profile.fitnessLevel)}</li>` : "",
        profile.goal ? `<li class="profile-chip"><i class='bx bx-target-lock'></i>Goal: ${escapeHtml(profile.goal)}</li>` : "",
        profile.status ? `<li class="profile-chip"><i class='bx bx-pulse'></i>${escapeHtml(profile.status)}</li>` : ""
    ].join("");
    const emptyBio = isSelf ? "No bio yet. Add one in Settings." : "No bio yet.";

    const actions = isSelf
        ? `<button type="button" class="profile-settings-btn" data-open-settings="profile" aria-label="Settings" title="Settings"><i class='bx bx-cog'></i></button>`
        : renderMessageButton(profile) + renderFollowButton(profile);

    return `
        <section class="profile-card" aria-label="Profile">
            ${renderProfileAvatar(profile)}
            <div class="profile-main">
                <div class="profile-title-row">
                    <h2 class="profile-name">${escapeHtml(fullName)}</h2>
                    <span class="profile-privacy"><i class='bx ${profile.isPrivate ? "bx-lock-alt" : "bx-globe"}'></i>${profile.isPrivate ? "Private account" : "Public account"}</span>
                </div>
                <p class="profile-handle">@${escapeHtml(profile.username)}</p>
                ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : `<p class="profile-bio profile-bio-empty">${emptyBio}</p>`}
                ${details ? `<ul class="profile-details">${details}</ul>` : ""}
                <ul class="profile-stats">
                    <li><b>${profile.postCount}</b><span>Posts</span></li>
                    <li><b>${profile.mates}</b><span>Mates</span></li>
                    <li><b>${profile.followers}</b><span>Followers</span></li>
                    <li><b>${profile.following}</b><span>Following</span></li>
                </ul>
            </div>
            <div class="profile-actions">${actions}</div>
        </section>`;
}

// Builds the Posts / Daily Challenge / Saved tabs (Saved only on your own profile)
function renderProfileTabs(isSelf) {
    const tab = (id, label) =>
        `<button type="button" class="profile-tab${profileTab === id ? " active" : ""}" data-profile-tab="${id}" aria-pressed="${profileTab === id}">${label}</button>`;
    return `<div class="profile-tabs" role="group" aria-label="Posts">${tab("posts", "Posts")}${tab("challenge", "Daily Challenge")}${isSelf ? tab("saved", "Saved") : ""}</div>`;
}

// Shown instead of the posts when the account is private and you don't follow it
function renderLockedNotice(profile) {
    const asked = profile.relationship.status === "requested";
    return `
        <div class="profile-locked">
            <i class='bx bx-lock-alt'></i>
            <h3>This account is private</h3>
            <p>${asked ? `Your request to follow @${escapeHtml(profile.username)} is waiting for them to approve it.` : `Follow @${escapeHtml(profile.username)} to see their posts.`}</p>
        </div>`;
}

// Draws the whole profile (card, tabs and posts) for the profile in view
function renderProfileContent() {
    const page = document.getElementById("profilePage");
    const profile = shownProfile();
    if (!page || !profile) return;
    const isSelf = isOwnProfileShown();

    const locked = !isSelf && profile.locked;
    page.innerHTML = `
        ${renderProfileCard(profile, isSelf)}
        ${locked ? renderLockedNotice(profile) : `${renderProfileTabs(isSelf)}<div class="masonry"></div>`}`;
    if (!locked) loadProfileTab();
}

// Loads the posts for the open tab
async function loadProfileTab() {
    const profile = shownProfile();
    if (!profile) return;
    const isSelf = isOwnProfileShown();
    const tab = profileTab;

    let url;
    if (tab === "saved") url = "/api/saved";
    else url = `/api/users/${encodeURIComponent(profile.username)}/posts?type=${tab === "challenge" ? "challenge" : "feed"}`;

    const messages = {
        posts: isSelf ? "You haven't posted to the feed yet." : "No posts yet.",
        challenge: isSelf ? "You haven't posted to the Daily Challenge yet." : "No Daily Challenge posts yet.",
        saved: "Posts you save will show up here."
    };
    const result = await fetchPosts(url);
    if (tab !== profileTab || shownProfile() !== profile) return;   // the tab or page changed while this loaded
    showPostsInGrid(document.querySelector("#profilePage .masonry"), result, messages[tab]);
}

// Fetches your own profile and shows the page
async function loadProfile() {
    const page = document.getElementById("profilePage");
    if (!page) return;
    page.dataset.owner = "self";
    try {
        const response = await fetch("/api/profile");
        if (response.status === 401) {
            page.innerHTML = '<p class="profile-loading">Log in to see your profile. <a href="#/login">Log in</a></p>';
            return;
        }
        if (!response.ok) throw new Error("profile request failed");
        currentProfile = await response.json();
        profileTab = "posts";
        renderProfileContent();
    } catch (error) {
        page.innerHTML = "<p class=\"profile-loading\">Couldn't load your profile. Please try again.</p>";
    }
}

// Fetches someone else's profile (#/user/<username>) and shows the page
async function fetchViewedProfile(username) {
    const response = await fetch(`/api/users/${encodeURIComponent(username)}`);
    if (response.status === 401) return { error: "login" };
    if (response.status === 404) return { error: "missing" };
    if (!response.ok) return { error: "failed" };
    return { profile: await response.json() };
}

// Shows another person's profile page (#/user/<username>), or a message if they can't be found
async function loadUserProfilePage(username) {
    loadPageContent(renderProfilePage());
    const page = document.getElementById("profilePage");
    page.dataset.owner = "other";
    viewedProfile = null;

    try {
        const result = await fetchViewedProfile(username);
        if (result.error === "login") {
            page.innerHTML = '<p class="profile-loading">Log in to see this profile. <a href="#/login">Log in</a></p>';
        } else if (result.error === "missing") {
            page.innerHTML = '<p class="profile-loading">We couldn\'t find that user.</p>';
        } else if (result.error) {
            page.innerHTML = "<p class=\"profile-loading\">Couldn't load this profile. Please try again.</p>";
        } else if (result.profile.relationship.isSelf) {
            window.location.hash = "#/profile";   // your own page has the settings
        } else {
            viewedProfile = result.profile;
            profileTab = "posts";
            renderProfileContent();
        }
    } catch (error) {
        page.innerHTML = "<p class=\"profile-loading\">Couldn't load this profile. Please try again.</p>";
    }
}

// Follows, unfollows or takes back a request from the profile you are looking at, then shows the new state
async function toggleProfileFollow(button) {
    const profile = viewedProfile;
    if (!profile) return;
    button.disabled = true;
    const status = await changeFollow(profile.id, profile.relationship.status);
    if (status === null) {
        button.disabled = false;
        return;
    }
    // Counts, and whether a private account's posts are now visible, come back from the server
    const result = await fetchViewedProfile(profile.username);
    if (result.profile && viewedProfile === profile) {
        viewedProfile = result.profile;
        renderProfileContent();
    } else {
        button.disabled = false;
    }
}

// ---------- Settings pop-up ----------
function settingsField(id, label, control, extra = "") {
    return `
        <div class="settings-field">
            <label for="${id}">${label}</label>
            ${control}
            ${extra}
            <p class="settings-error" id="${id}Error" aria-live="polite"></p>
        </div>`;
}

// Builds the <option> tags for a dropdown
function optionList(options, placeholder) {
    return `<option value="">${placeholder}</option>` + options.map((option) => `<option value="${option}">${option}</option>`).join("");
}

// Builds the settings pop-up's markup
function buildSettingsModal() {
    const modal = document.createElement("div");
    modal.className = "settings-modal";
    modal.id = "settingsModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "settingsTitle");

    modal.innerHTML = `
        <div class="settings-card">
            <button type="button" class="settings-close" aria-label="Close settings"><i class='bx bx-x'></i></button>
            <nav class="settings-nav" aria-label="Settings sections">
                <h2 id="settingsTitle">Settings</h2>
                <button type="button" class="settings-tab" data-settings-tab="profile"><i class='bx bx-user'></i>Profile</button>
                <button type="button" class="settings-tab" data-settings-tab="privacy"><i class='bx bx-lock-alt'></i>Privacy</button>
                <button type="button" class="settings-tab" data-settings-tab="password"><i class='bx bx-key'></i>Password</button>
                <button type="button" class="settings-tab" data-settings-tab="account"><i class='bx bx-id-card'></i>Account</button>
            </nav>
            <div class="settings-panel">

                <section data-settings-section="profile" hidden>
                    <h3>Edit profile</h3>

                    <!-- Profile picture: the file input is hidden, and the "Upload photo" button opens it -->
                    <div class="settings-avatar">
                        <img id="settingsAvatar" width="84" height="84" alt="Your profile picture">
                        <div class="settings-avatar-actions">
                            <input type="file" id="avatarInput" accept="image/*" hidden>
                            <button type="button" class="settings-upload" id="avatarUploadBtn">Upload photo</button>
                            <button type="button" class="settings-remove" id="avatarRemoveBtn">Remove</button>
                            <p class="settings-help">JPG, PNG or GIF. It is cropped to a square.</p>
                            <p class="settings-message" id="avatarMessage" role="status"></p>
                        </div>
                    </div>
                    <form id="profileForm" novalidate>
                        <div class="settings-row">
                            ${settingsField("setFirstName", "First name", '<input type="text" id="setFirstName" maxlength="50" autocomplete="given-name">')}
                            ${settingsField("setLastName", "Last name", '<input type="text" id="setLastName" maxlength="50" autocomplete="family-name">')}
                        </div>
                        ${settingsField("setUsername", "Username", '<div class="settings-prefixed"><span>@</span><input type="text" id="setUsername" maxlength="20" autocomplete="username"></div>')}
                        ${settingsField("setBio", "Bio", `<textarea id="setBio" rows="3" maxlength="${BIO_LIMIT}" placeholder="Tell your gym mates about yourself"></textarea>`, `<span class="settings-count" id="setBioCount">0/${BIO_LIMIT}</span>`)}
                        <div class="settings-row">
                            ${settingsField("setFitnessLevel", "Fitness level", `<select id="setFitnessLevel">${optionList(FITNESS_LEVELS, "Not set")}</select>`)}
                            ${settingsField("setStatus", "Status", `<select id="setStatus">${optionList(STATUS_OPTIONS, "Not set")}</select>`)}
                        </div>
                        ${settingsField("setGoal", "Goal", `<input type="text" id="setGoal" maxlength="${GOAL_LIMIT}" placeholder="e.g. Run a 10k">`)}
                        <p class="settings-message" id="profileMessage" role="status"></p>
                        <button type="submit" class="settings-save">Save changes</button>
                    </form>
                </section>

                <section data-settings-section="privacy" hidden>
                    <h3>Privacy</h3>
                    <div class="settings-switch-row">
                        <div>
                            <p class="settings-switch-title">Private account</p>
                            <p class="settings-help" id="privacyHelp"></p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="privateToggle" role="switch" aria-describedby="privacyHelp">
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <p class="settings-message" id="privacyMessage" role="status"></p>
                </section>

                <section data-settings-section="password" hidden>
                    <h3>Change password</h3>
                    <form id="passwordForm" novalidate>
                        ${settingsField("setCurrentPassword", "Current password", '<input type="password" id="setCurrentPassword" autocomplete="current-password">')}
                        ${settingsField("setNewPassword", "New password", '<input type="password" id="setNewPassword" autocomplete="new-password">', '<span class="settings-count">At least 8 characters</span>')}
                        ${settingsField("setConfirmPassword", "Confirm new password", '<input type="password" id="setConfirmPassword" autocomplete="new-password">')}
                        <p class="settings-message" id="passwordMessage" role="status"></p>
                        <button type="submit" class="settings-save">Update password</button>
                        <p class="settings-help">Forgot your current password? <a href="#/forgot-password">Reset it by email</a></p>
                    </form>
                </section>

                <section data-settings-section="account" hidden>
                    <h3>Account</h3>
                    <div class="settings-field">
                        <label for="setEmail">Email</label>
                        <input type="email" id="setEmail" disabled>
                    </div>
                    <p class="settings-help" id="memberSince"></p>
                    <button type="button" class="settings-logout" id="logoutBtn"><i class='bx bx-log-out'></i>Log out</button>

                    <div class="danger-zone">
                        <h4>Delete account</h4>
                        <p class="settings-help">This permanently deletes your account, posts, stories, comments, likes and follows. It can't be undone.</p>
                        <button type="button" class="settings-delete" id="deleteAccountBtn"><i class='bx bx-trash'></i>Delete account</button>
                    </div>
                </section>
            </div>
        </div>`;
    return modal;
}

// Puts the profile's current values into the settings fields
function fillSettings(profile) {
    const set = (id, value) => { document.getElementById(id).value = value; };
    set("setFirstName", profile.firstName);
    set("setLastName", profile.lastName);
    set("setUsername", profile.username);
    set("setBio", profile.bio);
    set("setFitnessLevel", profile.fitnessLevel);
    set("setStatus", profile.status);
    set("setGoal", profile.goal);
    set("setEmail", profile.email);
    document.getElementById("setBioCount").textContent = `${profile.bio.length}/${BIO_LIMIT}`;
    updateAvatarEditor();

    const toggle = document.getElementById("privateToggle");
    toggle.checked = profile.isPrivate;
    updatePrivacyHelp(profile.isPrivate);

    const joined = new Date(profile.createdAt);
    document.getElementById("memberSince").textContent = isNaN(joined)
        ? ""
        : `Member since ${joined.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
}

// Shows the help text for a public or private account
function updatePrivacyHelp(isPrivate) {
    document.getElementById("privacyHelp").textContent = isPrivate
        ? "People must send a follow request, which you approve. Only your followers can see your posts."
        : "Anyone can follow you and see your posts.";
}

// Shows one settings section and highlights its tab
function showSettingsTab(tab) {
    document.querySelectorAll("#settingsModal [data-settings-section]").forEach((section) => {
        section.hidden = section.dataset.settingsSection !== tab;
    });
    document.querySelectorAll("#settingsModal .settings-tab").forEach((button) => {
        const active = button.dataset.settingsTab === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-current", String(active));
    });
}

let settingsOpener = null;

// Opens the settings pop-up on a given tab
function openSettings(tab, opener) {
    if (!currentProfile) return;
    closeSettings(false);
    settingsOpener = opener;
    const modal = buildSettingsModal();
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    fillSettings(currentProfile);
    showSettingsTab(tab);
    modal.querySelector(".settings-close").focus();
}

// Closes the settings pop-up; restoreFocus puts focus back on the button that opened it
function closeSettings(restoreFocus = true) {
    const modal = document.getElementById("settingsModal");
    if (!modal) return;
    modal.remove();
    document.body.classList.remove("modal-open");
    if (restoreFocus && settingsOpener && document.body.contains(settingsOpener)) settingsOpener.focus();
    settingsOpener = null;
}

// Shows (or clears) the error under a settings field
function setSettingsError(id, message) {
    const input = document.getElementById(id);
    const error = document.getElementById(`${id}Error`);
    if (!input || !error) return;
    error.textContent = message;
    input.classList.toggle("invalid", message !== "");
}

// Shows a status message in a settings section (styled as an error if isError)
function setSettingsMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
}

// Sends JSON with any method and returns { ok, status, data }
async function sendJson(method, url, body) {
    const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

// Shows server errors under their fields; returns the id of the first one
function showServerErrors(errors, fieldIds) {
    let first = null;
    Object.entries(errors || {}).forEach(([key, message]) => {
        if (fieldIds[key]) {
            setSettingsError(fieldIds[key], message);
            if (!first) first = fieldIds[key];
        }
    });
    return first;
}

// ---------- Profile picture ----------

// Shows your current picture in the settings (or the placeholder), and hides "Remove" if there is nothing to remove
function updateAvatarEditor() {
    const picture = document.getElementById("settingsAvatar");
    if (!picture || !currentProfile) return;
    picture.src = currentProfile.avatarUrl || avatarPlaceholder(currentProfile);
    document.getElementById("avatarRemoveBtn").hidden = !currentProfile.avatarUrl;
}

// Crops a picture to a centred square and shrinks it to size x size pixels, in the browser. Returns a JPEG file.
function makeSquareAvatar(file, size = 400) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);   // a temporary address for the chosen file, so an <img> can load it
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            // The square is as wide as the picture's shorter side, taken from the middle
            const side = Math.min(image.naturalWidth, image.naturalHeight);
            const left = (image.naturalWidth - side) / 2;
            const top = (image.naturalHeight - side) / 2;

            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext("2d");
            context.fillStyle = "#fff";   // a white background, so transparent PNGs don't turn black as JPEGs
            context.fillRect(0, 0, size, size);
            // drawImage(picture, cropLeft, cropTop, cropWidth, cropHeight, drawLeft, drawTop, drawWidth, drawHeight)
            context.drawImage(image, left, top, side, side, 0, 0, size, size);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not convert"))), "image/jpeg", 0.9);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("not a picture"));
        };
        image.src = url;
    });
}

// Uploads a chosen picture and shows it everywhere
async function uploadAvatar(file) {
    setSettingsMessage("avatarMessage", "");
    if (!file.type.startsWith("image/")) return setSettingsMessage("avatarMessage", "Please choose a picture (JPG, PNG or GIF).", true);
    if (file.size > 15 * 1024 * 1024) return setSettingsMessage("avatarMessage", "That picture is too big. Please choose one under 15 MB.", true);

    try {
        const blob = await makeSquareAvatar(file);
        const form = new FormData();
        form.append("avatar", blob, "avatar.jpg");

        // No Content-Type header is set on purpose: the browser adds the right one for a file upload
        const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = (data.errors && data.errors.avatar) || data.message || "Something went wrong. Please try again.";
            return setSettingsMessage("avatarMessage", message, true);
        }

        // The new address has a new "?v=" number, so the browser loads the new picture, not a cached one
        currentProfile.avatarUrl = data.avatarUrl;
        updateAvatarEditor();
        if (isOwnProfileShown()) renderProfileContent();
        setSettingsMessage("avatarMessage", "Profile picture updated.");
    } catch (error) {
        setSettingsMessage("avatarMessage", "Couldn't use that picture. Please try a different one.", true);
    }
}

// Removes your picture
async function removeAvatar() {
    setSettingsMessage("avatarMessage", "");
    try {
        const response = await fetch("/api/profile/avatar", { method: "DELETE" });
        if (!response.ok) throw new Error("remove failed");
        currentProfile.avatarUrl = null;
        updateAvatarEditor();
        if (isOwnProfileShown()) renderProfileContent();
        setSettingsMessage("avatarMessage", "Profile picture removed.");
    } catch (error) {
        setSettingsMessage("avatarMessage", "Couldn't remove it. Please try again.", true);
    }
}

// ---------- Saving the profile ----------
const profileFieldIds = {
    firstName: "setFirstName", lastName: "setLastName", username: "setUsername", bio: "setBio",
    fitnessLevel: "setFitnessLevel", status: "setStatus", goal: "setGoal"
};

// Checks the profile fields and returns the errors, keyed by field
function validateProfileForm(values) {
    const errors = {};
    if (!values.firstName) errors.firstName = "Enter your first name";
    else if (values.firstName.length > 50 || !PROFILE_NAME_PATTERN.test(values.firstName)) errors.firstName = "Use letters, spaces, hyphens or apostrophes only";
    if (!values.lastName) errors.lastName = "Enter your last name";
    else if (values.lastName.length > 50 || !PROFILE_NAME_PATTERN.test(values.lastName)) errors.lastName = "Use letters, spaces, hyphens or apostrophes only";
    if (!values.username) errors.username = "Choose a username";
    else if (!PROFILE_USERNAME_PATTERN.test(values.username)) errors.username = "Use 3-20 letters, numbers or underscores";
    if (values.bio.length > BIO_LIMIT) errors.bio = `Your bio can be up to ${BIO_LIMIT} characters`;
    if (values.goal.length > GOAL_LIMIT) errors.goal = `Your goal can be up to ${GOAL_LIMIT} characters`;
    return errors;
}

// Validates and saves the profile form with PATCH /api/profile
async function saveProfile(form) {
    const values = {
        firstName: document.getElementById("setFirstName").value.trim(),
        lastName: document.getElementById("setLastName").value.trim(),
        username: document.getElementById("setUsername").value.trim(),
        bio: document.getElementById("setBio").value.trim(),
        fitnessLevel: document.getElementById("setFitnessLevel").value,
        status: document.getElementById("setStatus").value,
        goal: document.getElementById("setGoal").value.trim()
    };

    Object.values(profileFieldIds).forEach((id) => setSettingsError(id, ""));
    setSettingsMessage("profileMessage", "");
    const errors = validateProfileForm(values);
    const clientFirst = showServerErrors(errors, profileFieldIds);
    if (clientFirst) return document.getElementById(clientFirst).focus();

    const button = form.querySelector(".settings-save");
    button.disabled = true;
    try {
        const { ok, data } = await sendJson("PATCH", "/api/profile", values);
        if (ok) {
            currentProfile = { ...currentProfile, ...data };
            if (isOwnProfileShown()) renderProfileContent();
            fillSettings(currentProfile);
            setSettingsMessage("profileMessage", "Profile updated.");
        } else {
            const first = showServerErrors(data.errors, profileFieldIds);
            if (first) document.getElementById(first).focus();
            else setSettingsMessage("profileMessage", data.message || "Something went wrong. Please try again.", true);
        }
    } catch (error) {
        setSettingsMessage("profileMessage", "Couldn't reach the server. Please try again.", true);
    } finally {
        button.disabled = false;
    }
}

// ---------- Public / private ----------
async function savePrivacy(toggle) {
    const wanted = toggle.checked;
    toggle.disabled = true;
    setSettingsMessage("privacyMessage", "");
    try {
        const { ok, data } = await sendJson("PATCH", "/api/profile", { isPrivate: wanted });
        if (!ok) throw new Error(data.message || "failed");
        currentProfile = { ...currentProfile, ...data };
        if (isOwnProfileShown()) renderProfileContent();
        updatePrivacyHelp(currentProfile.isPrivate);
        setSettingsMessage("privacyMessage", currentProfile.isPrivate ? "Your account is now private." : "Your account is now public.");
    } catch (error) {
        toggle.checked = !wanted;   // puts the switch back, since the change didn't save
        setSettingsMessage("privacyMessage", "Couldn't save that change. Please try again.", true);
    } finally {
        toggle.disabled = false;
    }
}

// ---------- Password ----------
const passwordFieldIds = { currentPassword: "setCurrentPassword", newPassword: "setNewPassword", confirmPassword: "setConfirmPassword" };

// Validates and changes the password with POST /api/change-password
async function savePassword(form) {
    const values = {
        currentPassword: document.getElementById("setCurrentPassword").value,
        newPassword: document.getElementById("setNewPassword").value,
        confirmPassword: document.getElementById("setConfirmPassword").value
    };

    Object.values(passwordFieldIds).forEach((id) => setSettingsError(id, ""));
    setSettingsMessage("passwordMessage", "");

    const errors = {};
    if (!values.currentPassword) errors.currentPassword = "Enter your current password";
    if (values.newPassword.length < 8) errors.newPassword = "Password must be at least 8 characters";
    else if (values.newPassword.length > 128) errors.newPassword = "Password must be 128 characters or fewer";
    else if (values.newPassword === values.currentPassword) errors.newPassword = "Choose a password you are not already using";
    if (!values.confirmPassword) errors.confirmPassword = "Confirm your new password";
    else if (values.confirmPassword !== values.newPassword) errors.confirmPassword = "Passwords do not match";
    const clientFirst = showServerErrors(errors, passwordFieldIds);
    if (clientFirst) return document.getElementById(clientFirst).focus();

    const button = form.querySelector(".settings-save");
    button.disabled = true;
    try {
        const { ok, data } = await sendJson("POST", "/api/change-password", values);
        if (ok) {
            form.reset();
            setSettingsMessage("passwordMessage", "Password updated. Your other devices have been logged out.");
        } else {
            const first = showServerErrors(data.errors, passwordFieldIds);
            if (first) document.getElementById(first).focus();
            else setSettingsMessage("passwordMessage", data.message || "Something went wrong. Please try again.", true);
        }
    } catch (error) {
        setSettingsMessage("passwordMessage", "Couldn't reach the server. Please try again.", true);
    } finally {
        button.disabled = false;
    }
}

// ---------- Events ----------
document.addEventListener("click", async (e) => {
    // The profile picture opens the story, when there is one
    const storyAvatar = e.target.closest(".profile-avatar.has-story");
    if (storyAvatar) return openStoryGroupByUsername(storyAvatar.dataset.storyUser, storyAvatar);

    const openButton = e.target.closest("[data-open-settings]");
    if (openButton) return openSettings(openButton.dataset.openSettings, openButton);

    const followButton = e.target.closest("[data-profile-follow]");
    if (followButton) return toggleProfileFollow(followButton);

    const tab = e.target.closest("[data-profile-tab]");
    if (tab) {
        profileTab = tab.dataset.profileTab;
        document.querySelectorAll(".profile-tab").forEach((button) => {
            const active = button === tab;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        loadProfileTab();
        return;
    }

    const modal = document.getElementById("settingsModal");
    if (!modal) return;
    if (e.target === modal || e.target.closest(".settings-close")) return closeSettings();

    const settingsTab = e.target.closest(".settings-tab");
    if (settingsTab) return showSettingsTab(settingsTab.dataset.settingsTab);

    // Profile picture buttons: "Upload photo" opens the hidden file picker, "Remove" deletes the picture
    if (e.target.closest("#avatarUploadBtn")) return document.getElementById("avatarInput").click();
    if (e.target.closest("#avatarRemoveBtn")) return removeAvatar();

    if (e.target.closest("#logoutBtn")) {
        try {
            await fetch("/api/logout", { method: "POST" });
        } catch (error) {
            // ignore the error and go to the login page anyway
        }
        closeSettings(false);
        currentProfile = null;
        window.location.hash = "#/login";
        return;
    }

    if (e.target.closest("#deleteAccountBtn")) return deleteAccount();

    // The "Reset it by email" link leaves the page, so the pop-up closes
    if (e.target.closest(".settings-help a")) closeSettings(false);
});

// Deletes your account after an "are you sure?" box that asks for your password. A wrong password shows the server's message and keeps the box open;
// on success you are logged out and sent to the login page.
async function deleteAccount() {
    const sure = await confirmDialog({
        title: "Delete your account?",
        message: "Everything you have shared will be removed for good: your posts, stories, comments, likes and follows. Enter your password to confirm.",
        confirmLabel: "Delete my account",
        askPassword: true,
        onConfirm: async (password) => {
            const response = await fetch("/api/profile", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });
            if (response.ok) return null;
            const data = await response.json().catch(() => ({}));
            return (data.errors && data.errors.password) || data.message || "Something went wrong. Please try again.";
        }
    });
    if (!sure) return;

    closeSettings(false);
    currentProfile = null;
    sessionStorage.setItem("authMessage", "Your account has been deleted.");
    window.location.hash = "#/login";
}

document.addEventListener("submit", (e) => {
    if (e.target.id === "profileForm") {
        e.preventDefault();
        saveProfile(e.target);
    } else if (e.target.id === "passwordForm") {
        e.preventDefault();
        savePassword(e.target);
    }
});

document.addEventListener("change", (e) => {
    if (e.target.id === "privateToggle") savePrivacy(e.target);
    // A picture was chosen in the picker: upload it, then clear the picker so choosing the same file again still works
    if (e.target.id === "avatarInput" && e.target.files[0]) {
        uploadAvatar(e.target.files[0]);
        e.target.value = "";
    }
});

document.addEventListener("input", (e) => {
    if (!e.target.closest("#settingsModal")) return;
    setSettingsError(e.target.id, "");
    if (e.target.id === "setBio") {
        document.getElementById("setBioCount").textContent = `${e.target.value.length}/${BIO_LIMIT}`;
    }
});

// Saving or unsaving a post in the pop-up updates your Saved tab if it is showing
document.addEventListener("savedchange", () => {
    if (document.getElementById("profilePage") && isOwnProfileShown() && profileTab === "saved") loadProfileTab();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
});

window.addEventListener("hashchange", () => closeSettings(false));
