// App shell: a small hash router (#/login, #/feed, ...) that draws each page into #app, plus the page templates, sidebar and pop-up helpers.
// Loaded first. Logged-out visitors who open the plain address are sent to the login page.

// Restores whether the sidebar was collapsed last time (the width itself is set in CSS by the body class)
try {
    document.body.classList.toggle("sidebar-collapsed", localStorage.getItem("sidebarCollapsed") === "true");
} catch (error) {
    // localStorage can be unavailable (e.g. private mode), so the sidebar just starts expanded
}

// Collapses or expands the sidebar
document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".sidebar-toggle");
    if (!toggle) return;

    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    try {
        localStorage.setItem("sidebarCollapsed", String(collapsed));
    } catch (error) {
        // The choice just isn't remembered next time
    }
});

// Opens the page a link asks for. If the plain address is opened (no page in the link) by someone who isn't logged in, show the login page.
// Links to a specific page, such as #/signup or a password reset link, are left alone.
async function openPage(hash) {
    if ((hash === "" || hash === "#" || hash === "#/") && !(await isLoggedIn())) {
        history.replaceState(null, "", "#/login");   // replaces the entry, so the Back button doesn't return to a blank page
        navigateTo("#/login");
        return;
    }
    navigateTo(hash);
}

// Is somebody logged in? (The server answers 401 to /api/profile when there is no valid session.)
async function isLoggedIn() {
    try {
        return (await fetch("/api/profile")).ok;
    } catch (error) {
        return false;   // server unreachable: show the login page
    }
}

// Opens the first page once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    openPage(window.location.hash);
});

// Navigates to corresponding page when the hash changes
window.addEventListener("hashchange", () => {
    openPage(window.location.hash);
});

// Draws the page for a hash like #/feed or #/user/<username>
function navigateTo(hash) {
    // The part after "?" (e.g. a reset token) isn't part of the route
    const route = hash.split("?")[0];

    // Someone's profile: #/user/<username>
    if (route.startsWith("#/user/")) {
        loadUserProfilePage(decodeURIComponent(route.slice("#/user/".length)));
        return;
    }

    switch (route) {
        case "#/signup":
            loadSignupPage();
            break;
        case "#/login":
            loadLoginPage();
            break;
        case "#/reset-password":
            loadResetPasswordPage();
            break;
        case "#/forgot-password":
            loadForgotPasswordPage();
            break;
        case "#/feed":
            loadFeedPage();
            break;
        case "#/profile":
            loadProfilePage();
            break;
        case "#/daily-challenge":
            loadDailyChallenge();
            break;
        case "#/messages":
            loadDMessages();
            break;
        default:
            loadFeedPage();
            break;
    }
}

// Puts a page into #app, with the sidebar unless showSidebar is false
function loadPageContent(content, showSidebar = true) {
    const app = document.getElementById("app");
    app.innerHTML = showSidebar ? renderSidebarMenu() + content : content;
}

// Links with data-open-modal open that pop-up. A document listener is used because inline onclick is blocked by the CSP.
document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-open-modal]");
    if (!link) return;
    e.preventDefault();
    openModal(link.dataset.openModal);
});

// Shows a pop-up by id
function openModal(modalID) {
    let modal = document.getElementById(modalID);
    if (modal) {
        modal.style.display = 'block';
    }
}

// Hides a pop-up by id
function closeModal(modalID) {
    let modal = document.getElementById(modalID);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Opens the Terms & Conditions modal on the signup page
function openTermsModal() {
    const modal = document.getElementById("termsModal");
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector(".terms-close").focus();

    // The Tenor embed script only scans the page when it loads, so load it once the modal's embed exists
    if (!modal.querySelector("iframe")) {
        document.querySelectorAll('script[src*="tenor.com/embed.js"]').forEach(script => script.remove());
        const tenorScript = document.createElement("script");
        tenorScript.async = true;
        tenorScript.src = "https://tenor.com/embed.js";
        document.body.appendChild(tenorScript);
    }
}

// Closes the Terms & Conditions modal and returns focus to its link
function closeTermsModal() {
    const modal = document.getElementById("termsModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const link = document.getElementById("openTerms");
    if (link) link.focus();
}

document.addEventListener("click", (e) => {
    if (e.target.closest("#openTerms")) {
        e.preventDefault();
        openTermsModal();
    } else if (e.target.id === "termsModal" || e.target.closest(".terms-close, .terms-ok")) {
        closeTermsModal();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTermsModal();
});

// Builds the sidebar HTML
function renderSidebarMenu() {
    // The link for the page being viewed is highlighted (the feed is also the default page)
    const current = window.location.hash.split("?")[0] || "#/feed";
    // title shows the name as a tooltip when only the icons are visible
    const pageLink = (href, icon, label, id = "") =>
        `<li><a href="${href}" ${id ? `id="${id}"` : ""} title="${label}" ${href === current ? 'class="active" aria-current="page"' : ""}><i class='bx ${icon}'></i><span>${label}</span></a></li>`;
    const modalLink = (id, modal, icon, label) =>
        `<li><a href="#" id="${id}" title="${label}" data-open-modal="${modal}"><i class='bx ${icon}'></i><span>${label}</span></a></li>`;
    const collapsed = document.body.classList.contains("sidebar-collapsed");

    return `
        <div class="sidebar-menu">
            <div class="logo">
                <img src="assets/logo/logo.png" alt="Muscle Mates Logo" width="100px" height="100px">
            </div>
            <!-- Navigation bar -->
            <ul class="menu">
                ${pageLink("#/feed", "bx-news", "News Feed")}
                ${pageLink("#/daily-challenge", "bx-dumbbell", "Daily Challenge")}
                ${pageLink("#/messages", "bx-message-rounded-dots", "Messages", "messagesLink")}
                ${modalLink("create", "overlayModal", "bx-image-add", "Create")}
                ${modalLink("notifications", "notificationModal", "bx-bell", "Notifications")}
                ${pageLink("#/profile", "bx-user-circle", "Profile")}
            </ul>
            <button type="button" class="sidebar-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Expand sidebar" : "Collapse sidebar"}" title="Collapse or expand the sidebar">
                <i class='bx bx-chevrons-left'></i><span>Collapse</span>
            </button>
            <a href="#" class="sidebar-credits" id="creditsLink" title="Credits"><i class='bx bx-info-circle'></i><span>Credits</span></a>
            <p class="sidebar-copyright">&copy; 2024&ndash;2026 Jennifer Nggada</p>
        </div>
            `;
}

// Renders the left side (video, logo and text) shared by the signup and login pages
function renderAuthVisual() {
    return `
            <!-- Left side: tinted background video with branding -->
            <div class="signup-visual">
                <video id="signupVideo" autoplay muted loop playsinline aria-hidden="true">
                    <source src="assets/login_bg_video.mp4" type="video/mp4">
                </video>
                <div class="signup-overlay"></div>
                <!-- Logo pinned to the top left corner -->
                <div class="brand">
                    <img src="assets/logo/logo-light-v.png" alt="MuscleMate logo" width="150" height="150">
                </div>
                <!-- Headline, tagline and features, grouped as one block -->
                <div class="signup-copy">
                    <h2 class="copy-headline">Train together. Grow together.</h2>
                    <p class="copy-tagline">Find your gym mates.</p>
                    <ul class="copy-features">
                        <li>
                            <span class="feature-icon"><i class='bx bx-news'></i></span>
                            <div>
                                <h3>Share your progress</h3>
                            </div>
                        </li>
                        <li>
                            <span class="feature-icon"><i class='bx bx-dumbbell'></i></span>
                            <div>
                                <h3>Daily challenges</h3>
                            </div>
                        </li>
                        <li>
                            <span class="feature-icon"><i class='bx bx-message-rounded-dots'></i></span>
                            <div>
                                <h3>Connect with mates</h3>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
    `;
}

// Pauses the background video if the user prefers reduced motion
function setupAuthVideo() {
    const video = document.getElementById("signupVideo");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncVideo = () => {
        if (reducedMotion.matches) {
            video.pause();
        } else {
            video.play().catch(() => { });
        }
    };
    syncVideo();
    reducedMotion.addEventListener("change", syncVideo);
}

// Loads signup page content
function loadSignupPage() {
    const signupContent = `
        <div class="body-content-signup">
            ${renderAuthVisual()}
            <!-- Right side: sign up form -->
            <div class="signup-panel">
            <div class="form-box-signup">
                <h1 class="signup-heading">Sign Up</h1>
                <form action="" id="sForm" novalidate>
                    <div class="input-container">
                    <div class="field">
                        <label for="firstName">First Name</label>
                        <div class="control">
                            <i class='bx bxs-user-detail'></i>
                            <input type="text" id="firstName" name="firstName" placeholder="First Name" required autocomplete="given-name" aria-describedby="firstNameError">
                        </div>
                        <p class="field-error" id="firstNameError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="lastName">Last Name</label>
                        <div class="control">
                            <i class='bx bxs-user-detail'></i>
                            <input type="text" id="lastName" name="lastName" placeholder="Last Name" required autocomplete="family-name" aria-describedby="lastNameError">
                        </div>
                        <p class="field-error" id="lastNameError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="email">Email</label>
                        <div class="control">
                            <i class='bx bxs-envelope'></i>
                            <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email" aria-describedby="emailError">
                        </div>
                        <p class="field-error" id="emailError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="username">Username</label>
                        <div class="control">
                            <i class='bx bxs-user'></i>
                            <input type="text" id="username" name="username" placeholder="Username" required autocomplete="username" aria-describedby="usernameError">
                        </div>
                        <p class="field-error" id="usernameError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="gender">Gender</label>
                        <div class="control">
                            <i class='bx bx-male-female'></i>
                            <select id="gender" name="gender" required aria-describedby="genderError">
                                <option value="" disabled selected>Select gender</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Prefer not to say">Prefer not to say</option>
                            </select>
                        </div>
                        <p class="field-error" id="genderError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="birthdate">Date of Birth</label>
                        <div class="control">
                            <i class='bx bxs-calendar'></i>
                            <input type="date" id="birthdate" name="birthdate" placeholder="" required aria-describedby="birthdateError">
                        </div>
                        <p class="field-error" id="birthdateError" aria-live="polite"></p>
                    </div>
                    <div class="field">
                        <label for="password">Password</label>
                        <div class="control">
                            <i class='bx bxs-lock'></i>
                            <input type="password" id="password" name="password" placeholder="Password" required minlength="8" autocomplete="new-password" aria-describedby="passwordHint">
                            <button type="button" class="toggle-pw" data-target="password" aria-label="Show password"><i class='bx bx-show'></i></button>
                        </div>
                        <p class="field-hint" id="passwordHint">At least 8 characters</p>
                    </div>
                    <div class="field">
                        <label for="confirmPassword">Confirm Password</label>
                        <div class="control">
                            <i class='bx bxs-lock'></i>
                            <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Confirm Password" required autocomplete="new-password" aria-describedby="confirmError">
                            <button type="button" class="toggle-pw" data-target="confirmPassword" aria-label="Show password"><i class='bx bx-show'></i></button>
                        </div>
                        <p class="field-error" id="confirmError" aria-live="polite"></p>
                    </div>
                    </div>

                    <!-- Terms & condition checkbox -->
                    <div class="termCond">
                        <input type="checkbox" id="terms" required>
                        <label for="terms">Agree to <a href="#" id="openTerms" aria-haspopup="dialog">Terms & Conditions</a></label>
                    </div>
                    <p class="field-error terms-error" id="termsError" aria-live="polite"></p>
                    <p class="form-error" id="formError" role="alert"></p>
                    <button type="submit" class="btn">Create account</button>

                    <!-- Link to Login Page -->
                    <div class="link">
                        <p>Already have an account? <a href="#/login"> Log in</a></p>
                    </div>
                </form>
            </div>
            </div>

            <!-- Terms & Conditions modal -->
            <div class="terms-modal" id="termsModal" role="dialog" aria-modal="true" aria-labelledby="termsTitle" hidden>
                <div class="terms-card">
                    <button type="button" class="terms-close" aria-label="Close terms and conditions"><i class='bx bx-x'></i></button>
                    <h2 id="termsTitle">Terms &amp; Conditions</h2>
                    <p class="terms-subtitle">The MuscleMate edition (no lawyers were harmed)</p>
                    <div class="terms-gif">
                        <div class="tenor-gif-embed" data-postid="25374202" data-share-method="host" data-aspect-ratio="1" data-width="100%"><a href="https://tenor.com/view/cat-meme-working-out-workout-situp-cat-gif-25374202">Cat Meme GIF</a>from <a href="https://tenor.com/search/cat-gifs">Cat GIFs</a></div>
                    </div>
                    <ul class="terms-list">
                        <li><b>Be a good mate.</b> Cheer on everyone's wins, big or small, and keep the banter friendly.</li>
                        <li><b>Keep it real.</b> Be yourself. Filters can't lift the weights for you.</li>
                        <li><b>Respect every journey.</b> Everyone starts somewhere, so no trolling, body-shaming or gatekeeping.</li>
                        <li><b>Share the gains, not the spam.</b> Tips and progress posts are welcome. Sales pitches are not.</li>
                        <li><b>Connect and have fun.</b> Join challenges, make new mates and enjoy the pump.</li>
                    </ul>
                    <p class="terms-footer">By ticking the box, you agree to keep it positive, keep it fun and connect with your fellow lifters.</p>
                    <button type="button" class="terms-ok">Let's get pumped</button>
                </div>
            </div>
        </div>
        `;
    loadPageContent(signupContent, false);

    // Stops the date picker offering future dates
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("birthdate").max = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    setupAuthVideo();
}

// Loads login page content
function loadLoginPage() {
    const loginContent = `
    <div class="body-content-signup">
        ${renderAuthVisual()}
        <!-- Right side: login form -->
        <div class="signup-panel login-panel">
            <div class="form-box-signup login-box">
                <h1 class="signup-heading">Login</h1>
                <form id="lForm" novalidate>
                    <div class="login-fields">
                        <div class="field">
                            <label for="identifier">Username or Email</label>
                            <div class="control">
                                <i class='bx bxs-user'></i> <!-- boxicons icon for username -->
                                <input name="umail" type="text" id="identifier" placeholder="Username or email" required autocomplete="username" aria-describedby="identifierError">
                            </div>
                            <p class="field-error" id="identifierError" aria-live="polite"></p>
                        </div>
                        <div class="field">
                            <label for="password">Password</label>
                            <div class="control">
                                <i class='bx bxs-lock'></i> <!-- boxicons icon for password -->
                                <input name="passLogin" type="password" id="password" placeholder="Password" required autocomplete="current-password" aria-describedby="passwordError">
                                <button type="button" class="toggle-pw" data-target="password" aria-label="Show password"><i class='bx bx-show'></i></button>
                            </div>
                            <p class="field-error" id="passwordError" aria-live="polite"></p>
                        </div>
                        <p class="forgot-password"><a href="#/forgot-password">Forgot password?</a></p>
                    </div>
                    <p class="form-error" id="loginError" role="alert"></p>
                    <button type="submit" class="btn">Login</button>
                    <!-- Link to sign up page -->
                    <div class="link">
                        <p>Don't have an account? <a href="#/signup">Register</a></p>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    loadPageContent(loginContent, false);
    setupAuthVideo();

    // Shows a confirmation after signing up or resetting a password
    try {
        const message = sessionStorage.getItem("authMessage");
        if (message) {
            sessionStorage.removeItem("authMessage");
            const note = document.createElement("p");
            note.className = "form-success";
            note.setAttribute("role", "status");
            note.textContent = message;
            document.querySelector(".login-box .signup-heading").insertAdjacentElement("afterend", note);
        }
    } catch (error) {
        // sessionStorage can be unavailable (e.g. private mode), so the message is skipped
    }
}

// Loads forgot password page content
function loadForgotPasswordPage() {
    const forgotContent = `
    <div class="body-content-signup">
        ${renderAuthVisual()}
        <div class="signup-panel panel-centered">
            <div class="form-box-signup login-box">
                <h1 class="signup-heading">Forgot password?</h1>
                <p class="form-note">Enter your email and we'll send you a link to reset your password.</p>
                <form id="fForm" novalidate>
                    <div class="login-fields login-fields-short">
                        <div class="field">
                            <label for="resetEmail">Email</label>
                            <div class="control">
                                <i class='bx bxs-envelope'></i>
                                <input name="email" type="email" id="resetEmail" placeholder="you@example.com" required autocomplete="email" aria-describedby="resetEmailError">
                            </div>
                            <p class="field-error" id="resetEmailError" aria-live="polite"></p>
                        </div>
                    </div>
                    <p class="form-error" id="forgotError" role="alert"></p>
                    <p class="form-success" id="forgotSuccess" role="status" hidden></p>
                    <button type="submit" class="btn">Send reset link</button>
                    <div class="link">
                        <p><a href="#/login">Back to login</a></p>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    loadPageContent(forgotContent, false);
    setupAuthVideo();
}

// Loads reset password page content (opened from the link in the reset email)
function loadResetPasswordPage() {
    const resetContent = `
    <div class="body-content-signup">
        ${renderAuthVisual()}
        <div class="signup-panel panel-centered">
            <div class="form-box-signup login-box">
                <h1 class="signup-heading">New password</h1>
                <p class="form-note">Choose a new password for your account.</p>
                <form id="rForm" novalidate>
                    <div class="login-fields login-fields-short">
                        <div class="field">
                            <label for="newPassword">New Password</label>
                            <div class="control">
                                <i class='bx bxs-lock'></i>
                                <input type="password" id="newPassword" name="newPassword" placeholder="New password" class="has-toggle" required autocomplete="new-password" aria-describedby="newPasswordError">
                                <button type="button" class="toggle-pw" data-target="newPassword" aria-label="Show password"><i class='bx bx-show'></i></button>
                            </div>
                            <p class="field-hint" id="newPasswordHint">At least 8 characters</p>
                            <p class="field-error" id="newPasswordError" aria-live="polite"></p>
                        </div>
                        <div class="field">
                            <label for="confirmNewPassword">Confirm Password</label>
                            <div class="control">
                                <i class='bx bxs-lock'></i>
                                <input type="password" id="confirmNewPassword" name="confirmNewPassword" placeholder="Confirm password" required autocomplete="new-password" aria-describedby="confirmNewPasswordError">
                                <button type="button" class="toggle-pw" data-target="confirmNewPassword" aria-label="Show password"><i class='bx bx-show'></i></button>
                            </div>
                            <p class="field-error" id="confirmNewPasswordError" aria-live="polite"></p>
                        </div>
                    </div>
                    <p class="form-error" id="resetError" role="alert"></p>
                    <button type="submit" class="btn">Update password</button>
                    <div class="link">
                        <p><a href="#/login">Back to login</a></p>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    loadPageContent(resetContent, false);
    setupAuthVideo();
}

// Loads feed page content
function loadFeedPage() {
    const feedContent = `
    <!-- Header section containing the title and search form -->
        <header id="feedHeader">
            <h1>Feed</h1>
            <form id="search-feedPage">
                <input type="search" name="q" placeholder="Search"></input> <i class='bx bx-search'></i>
            </form>
        </header>

        <!-- Container for the main content of the feed page -->
        <div class="page-content-feed">
            <!-- Two controls that work together: tabs for WHOSE posts (left) and a sort order (right). Behaviour is in feed.js -->
            <div id="feedControls">
                <div id="feedTabs" role="group" aria-label="Whose posts">
                    <button type="button" class="filter-btn active" data-feed-tab="all" aria-pressed="true">All</button>
                    <button type="button" class="filter-btn" data-feed-tab="following" aria-pressed="false">Following</button>
                    <button type="button" class="filter-btn" data-feed-tab="mates" aria-pressed="false">Mates</button>
                </div>
                <label class="feed-sort" for="feedSort">
                    <span>Sort by</span>
                    <select id="feedSort">
                        <option value="recent" selected>Recent</option>
                        <option value="popular">Most Popular</option>
                    </select>
                </label>
            </div>

            <!-- Pinterest-style grid of posts (built in feed.js) -->
            <div class="masonry"></div>
        </div>

        <!-- Sidebar for stories and daily quote -->
        <div class="sidebar-stories">
            ${renderStoriesPanel()}
            <!-- Container for daily quotes -->
            <section id="quoteBox" aria-labelledby="quoteTitle">
                <h2 id="quoteTitle">Quote of the day</h2>
                <blockquote id="quote">
                    <i class='bx bxs-quote-alt-left'></i>
                    <p>Limits, like fears, are often just an illusion.</p>
                    <footer>Michael Jordan</footer>
                </blockquote>
            </section>
        </div>
              `;

    loadPageContent(feedContent);
    loadFeed(currentFeedFilter, currentFeedSort);   // keeps your tab and sort choice when the page is drawn again
    loadStories();
    loadQuoteOfTheDay();
}

// Loads profile page content
function loadProfilePage() {
    const profileContent = renderProfilePage();
    loadPageContent(profileContent);
    loadProfile();
}

// Loads daily challenge page content
function loadDailyChallenge() {
    const dailyChallengeContent = `
        <header id="challengeHeader">
            <h1>Daily Challenge</h1>
            <form>
                <input type="search" name="q" placeholder="Search"></input> <i class='bx bx-search'></i>
            </form>
        </header>

        <!-- Container for challenge posts: the same Pinterest-style grid as the feed -->
        <div class="page-content-challenge">
            <!-- Today's challenge (filled in by loadTodaysChallenge in feed.js) -->
            <section class="challenge-banner" id="challengeBanner" aria-label="Today's challenge" hidden>
                <span class="challenge-icon"><i class='bx bx-dumbbell'></i></span>
                <div class="challenge-text">
                    <p class="challenge-label">Today's challenge</p>
                    <h2 class="challenge-title"></h2>
                    <p class="challenge-task"></p>
                    <p class="challenge-show"></p>
                </div>
                <span class="challenge-time" title="Time until the next challenge"></span>
            </section>
            <div class="challenge-toolbar">
                <!-- Whose challenge posts to show (behaviour is in feed.js) -->
                <div class="challenge-filter" id="challengeFilter" role="group" aria-label="Whose challenge posts to show">
                    <button type="button" class="filter-btn" data-challenge-filter="everyone" aria-pressed="false">Everyone</button>
                    <button type="button" class="filter-btn" data-challenge-filter="following" aria-pressed="false">Following</button>
                    <button type="button" class="filter-btn" data-challenge-filter="mates" aria-pressed="false">Mates</button>
                </div>
                <button type="button" id="addPostBtn">Add post</button>
            </div>
            <div class="masonry"></div>
        </div>
        `;
    loadPageContent(dailyChallengeContent);
    loadChallengePosts();
}

// Loads messages page content
function loadDMessages() {
    const messagesContent = renderMessagesPage();
    loadPageContent(messagesContent);
    setupMessagesPage();
}


