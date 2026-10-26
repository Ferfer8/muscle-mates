// User search: typing in a page's search bar lists matching users, each with a Follow button. Also defines changeFollow and setFollowState,
// which the profile and notification code reuse. Listeners are on the document because the pages are re-rendered on navigation.

const SEARCH_DELAY_MS = 250;
let searchTimer = null;
let searchCounter = 0;

// Finds (or creates) the results box that sits under a search bar
function getResultsBox(form) {
    form.classList.add("search-form");
    let box = form.querySelector(".search-results");
    if (!box) {
        box = document.createElement("div");
        box.className = "search-results";
        box.hidden = true;
        form.appendChild(box);
    }
    return box;
}

// Hides every open results box
function closeSearchResults() {
    document.querySelectorAll(".search-results").forEach((box) => { box.hidden = true; });
}

// Builds one result row. The name is set with textContent so it can't inject HTML; the picture and name link to the profile.
function buildResult(user) {
    const row = document.createElement("div");
    row.className = "search-result";

    const link = document.createElement("a");
    link.className = "search-user";
    link.href = `#/user/${encodeURIComponent(user.username)}`;

    // Their picture if they have one, otherwise their initials
    let avatar;
    if (user.avatarUrl) {
        avatar = document.createElement("img");
        avatar.className = "search-avatar search-avatar-img";
        avatar.src = user.avatarUrl;
        avatar.alt = "";
    } else {
        avatar = document.createElement("span");
        avatar.className = "search-avatar";
        avatar.textContent = (user.firstName[0] + user.lastName[0]).toUpperCase();
    }

    const info = document.createElement("span");
    info.className = "search-info";
    const name = document.createElement("span");
    name.className = "search-name";
    name.textContent = `${user.firstName} ${user.lastName}`;
    const username = document.createElement("span");
    username.className = "search-username";
    username.textContent = `@${user.username}`;
    info.append(name, username);
    link.append(avatar, info);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "follow-btn";
    button.dataset.userId = user.id;
    setFollowState(button, user.status);

    row.append(link, button);
    return row;
}

// Updates a follow button's look and label. status is "none", "requested" (a private account was asked) or "following".
function setFollowState(button, status) {
    button.dataset.status = status;
    button.classList.toggle("following", status !== "none");
    button.textContent = status === "following" ? "Following" : status === "requested" ? "Requested" : "Follow";
    button.setAttribute("aria-pressed", String(status === "following"));
}

// Follows (or unfollows / takes back a request for) a user. Returns the new status, or null if it failed.
async function changeFollow(userId, currentStatus) {
    try {
        const response = await fetch(`/api/follow/${userId}`, { method: currentStatus === "none" ? "POST" : "DELETE" });
        if (!response.ok) return null;
        return (await response.json()).status;
    } catch (error) {
        return null;
    }
}

// Shows a short message in the results box (optionally with a login link)
function showSearchMessage(box, text, withLoginLink) {
    box.replaceChildren();
    const message = document.createElement("p");
    message.className = "search-message";
    message.textContent = text;
    if (withLoginLink) {
        const link = document.createElement("a");
        link.href = "#/login";
        link.textContent = "Log in";
        message.append(" ", link);
    }
    box.appendChild(message);
    box.hidden = false;
}

// Asks the server for matching users and fills the results box
async function runSearch(input) {
    const form = input.closest("form");
    const box = getResultsBox(form);
    const query = input.value.trim();
    if (!query) {
        box.hidden = true;
        return;
    }

    // Only the newest search may show its results, even if an older one finishes later
    const thisSearch = ++searchCounter;
    try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        if (thisSearch !== searchCounter) return;

        if (response.status === 401) return showSearchMessage(box, "Log in to search for mates.", true);
        if (!response.ok) return showSearchMessage(box, "Couldn't search right now. Please try again.");

        const users = await response.json();
        if (users.length === 0) return showSearchMessage(box, `No users found for "${query}".`);

        box.replaceChildren(...users.map(buildResult));
        box.hidden = false;
    } catch (error) {
        if (thisSearch === searchCounter) showSearchMessage(box, "Couldn't reach the server. Please try again.");
    }
}

// Follows or unfollows the user on a row's button
async function toggleFollow(button) {
    button.disabled = true;
    const status = await changeFollow(button.dataset.userId, button.dataset.status);
    button.disabled = false;
    if (status !== null) setFollowState(button, status);
}

// Search as the user types (after a short pause, so a request isn't sent for every key)
document.addEventListener("input", (e) => {
    if (!e.target.matches('header input[type="search"]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target), SEARCH_DELAY_MS);
});

// Reopens the results when clicking back into a search bar that still has text
document.addEventListener("focusin", (e) => {
    if (e.target.matches('header input[type="search"]') && e.target.value.trim()) runSearch(e.target);
});

// Pressing Enter shouldn't reload the page
document.addEventListener("submit", (e) => {
    if (e.target.classList.contains("search-form") || e.target.querySelector('input[type="search"]')) {
        e.preventDefault();
    }
});

document.addEventListener("click", (e) => {
    const button = e.target.closest(".follow-btn");
    if (button) return toggleFollow(button);
    // Clicking anywhere outside a search bar closes its results
    if (!e.target.closest(".search-form")) closeSearchResults();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchResults();
});

window.addEventListener("hashchange", closeSearchResults);
