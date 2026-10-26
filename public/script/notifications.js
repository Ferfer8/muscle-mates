// Notifications panel beside the sidebar: follow requests, new followers, mates, likes, comments and the daily challenge.
// Loads from GET /api/notifications; its buttons act on the server and the unread count shows as a badge on the sidebar link.

// Types of notification:
//  request  - someone asked to follow you (your account is private): Accept or Decline
//  follow   - someone follows you: Follow back
//  accepted - someone accepted your follow request
//  mates    - you and someone now follow each other
//   like     - someone liked one of your posts
//   comment  - someone commented on one of your posts
//   challenge - today's Daily Challenge, which comes from the app (no person)
const notificationTypes = {
    request: { icon: "bxs-user-plus", color: "#240090" },
    follow: { icon: "bxs-user-plus", color: "#240090" },
    accepted: { icon: "bx-check", color: "#2e7d32" },
    mates: { icon: "bxs-group", color: "#2e7d32" },
    like: { icon: "bxs-heart", color: "#D81B60" },
    comment: { icon: "bxs-message-rounded-dots", color: "#3500D3" },
    challenge: { icon: "bx-dumbbell", color: "#f57c00" }   // comes from MuscleMate itself, not a person
};

let notifications = [];
let notificationsStatus = "loading";   // loading | ready | login | error
let lastNotificationLoad = 0;

// Counts the unread notifications
function unreadNotificationCount() {
    return notifications.filter((notification) => !notification.read).length;
}

// Link to the person who caused the notification
function notificationUser(notification) {
    const username = notification.actor.username;
    return `<a class="notif-user" href="#/user/${encodeURIComponent(username)}"><b>@${escapeHtml(username)}</b></a>`;
}

// The sentence for one notification
function notificationText(notification) {
    // The Daily Challenge notification has no actor, so it is handled first
    if (notification.type === "challenge") {
        return `<b>Today's daily challenge:</b> ${escapeHtml(notification.title)}<br><span class="notif-quote">${escapeHtml(notification.task)}</span>`;
    }

    const who = notificationUser(notification);
    switch (notification.type) {
        case "request": return `${who} requested to follow you`;
        case "follow": return `${who} started following you`;
        case "accepted": return `${who} accepted your follow request`;
        case "mates": return `You and ${who} are now mates`;
        case "like": return `${who} liked your post`;
        // The server sends the start of the comment as notification.text
        case "comment": return `${who} commented: <span class="notif-quote">"${escapeHtml(notification.text)}"</span>`;
        default: return who;
    }
}

// The buttons under a notification, if it has any
function notificationActions(notification) {
    if (notification.type === "request") {
        return `
            <div class="notif-actions">
                <button type="button" class="follow-btn" data-notif-action="accept">Accept</button>
                <button type="button" class="follow-btn following" data-notif-action="decline">Decline</button>
            </div>`;
    }
    // A link to the Daily Challenge page, where you can post your attempt
    if (notification.type === "challenge") {
        return `<div class="notif-actions"><a class="follow-btn notif-link" href="#/daily-challenge">Take part</a></div>`;
    }
    if (notification.type === "follow") {
        const status = notification.followStatus;
        return `
            <div class="notif-actions">
                <button type="button" class="follow-btn${status !== "none" ? " following" : ""}" data-notif-action="follow-back" aria-pressed="${status === "following"}">${status === "following" ? "Following" : status === "requested" ? "Requested" : "Follow back"}</button>
            </div>`;
    }
    return "";
}

// Builds one notification row
function renderNotification(notification) {
    const kind = notificationTypes[notification.type] || notificationTypes.follow;
    // The challenge notification has no person, so it shows a dumbbell icon instead of a picture or initials
    const avatar = notification.type === "challenge"
        ? `<span class="notif-avatar notif-avatar-system"><i class='bx ${kind.icon}'></i></span>`
        : null;
    return `
        <li class="notif${notification.read ? "" : " unread"}" data-notif-id="${notification.id}">
            ${avatar || `<span class="notif-avatar">
                ${notification.actor.avatarUrl
                    ? `<img class="notif-initials notif-avatar-img" src="${escapeHtml(notification.actor.avatarUrl)}" alt="">`
                    : `<span class="notif-initials">${escapeHtml(notification.actor.name.split(" ").map((word) => word[0]).join("").slice(0, 2))}</span>`}
                <span class="notif-kind" style="background:${kind.color}"><i class='bx ${kind.icon}'></i></span>
            </span>`}
            <div class="notif-body">
                <p class="notif-text">${notificationText(notification)}</p>
                <span class="notif-time">${timeSince(notification.createdAt)}</span>
                ${notificationActions(notification)}
            </div>
            ${notification.post ? `<img class="notif-thumb" src="${escapeHtml(notification.post.image)}" width="44" height="44" alt="Your post">` : ""}
            ${notification.read ? "" : '<span class="notif-dot" aria-label="Unread"></span>'}
        </li>`;
}

// The whole panel: a header, then "New" (unread) and "Earlier" (read) notifications
function renderNotifications() {
    const panel = document.getElementById("notificationModal");
    if (!panel) return;

    const fresh = notifications.filter((notification) => !notification.read);
    const earlier = notifications.filter((notification) => notification.read);
    const section = (title, items) => items.length === 0 ? "" : `
        <h3 class="notif-section">${title}</h3>
        <ul class="notifs">${items.map(renderNotification).join("")}</ul>`;

    let body;
    if (notificationsStatus === "login") body = '<p class="notif-empty">Log in to see your notifications. <a href="#/login">Log in</a></p>';
    else if (notificationsStatus === "error") body = '<p class="notif-empty">Couldn\'t load your notifications right now.</p>';
    else if (notificationsStatus === "loading") body = '<p class="notif-empty">Loading...</p>';
    else if (notifications.length === 0) body = '<p class="notif-empty">You\'re all caught up. Follows, likes and requests will show up here.</p>';
    else body = section("New", fresh) + section("Earlier", earlier);

    panel.innerHTML = `
        <div class="notification-content">
            <div class="notif-header">
                <h2>Notifications</h2>
                <button type="button" class="notif-mark-read" ${fresh.length === 0 ? "disabled" : ""}>Mark all as read</button>
                <button type="button" class="notif-close" aria-label="Close notifications"><i class='bx bx-x'></i></button>
            </div>
            ${body}
        </div>`;
    updateNotificationBadge();
}

// The count on the Notifications link in the sidebar
function updateNotificationBadge() {
    const link = document.getElementById("notifications");
    if (!link) return;
    let badge = link.querySelector(".nav-badge");
    const count = unreadNotificationCount();
    if (count === 0) {
        if (badge) badge.remove();
        return;
    }
    if (!badge) {
        badge = makeElement("span", "nav-badge");
        link.appendChild(badge);
    }
    badge.textContent = count > 99 ? "99+" : count;
    badge.setAttribute("aria-label", `${count} unread notifications`);
}

// Fetches your notifications. Each load gets a number and only the newest may update the list, so a slow older response
// can't overwrite a newer one (for example a load that started before you logged in).
let notificationRequest = 0;

async function loadNotifications() {
    lastNotificationLoad = Date.now();
    const thisRequest = ++notificationRequest;
    try {
        const response = await fetch("/api/notifications");
        if (thisRequest !== notificationRequest) return;   // a newer load has started, so this answer is out of date
        if (response.status === 401) {
            notifications = [];
            notificationsStatus = "login";
        } else if (!response.ok) {
            notificationsStatus = "error";
        } else {
            const loaded = await response.json();
            if (thisRequest !== notificationRequest) return;
            notifications = loaded.map((notification) => ({
                ...notification,
                followStatus: notification.followingBack ? "following" : "none"
            }));
            notificationsStatus = "ready";
        }
    } catch (error) {
        if (thisRequest !== notificationRequest) return;
        notificationsStatus = "error";
    }
    renderNotifications();
}

// Sends a POST and says whether it worked
async function postQuietly(url) {
    try {
        return (await fetch(url, { method: "POST" })).ok;
    } catch (error) {
        return false;
    }
}

// Finds the notification object for a clicked row
function findNotification(element) {
    const row = element.closest(".notif");
    return row ? notifications.find((notification) => notification.id === row.dataset.notifId) : null;
}

document.addEventListener("click", async (e) => {
    const panel = document.getElementById("notificationModal");
    if (!panel) return;

    // Opening the panel shows the latest notifications
    if (e.target.closest("#notifications")) {
        loadNotifications();
        return;
    }

    // Clicking outside the panel closes it
    const open = panel.style.display === "block";
    if (open && !e.target.closest("#notificationModal")) {
        closeModal("notificationModal");
        return;
    }
    if (!e.target.closest("#notificationModal")) return;

    // The X button in the panel's header
    if (e.target.closest(".notif-close")) {
        closeModal("notificationModal");
        return;
    }

    if (e.target.closest(".notif-mark-read")) {
        notifications.forEach((notification) => { notification.read = true; });
        renderNotifications();
        postQuietly("/api/notifications/read-all");
        return;
    }

    const notification = findNotification(e.target);
    if (!notification) return;

    const action = e.target.closest("[data-notif-action]");
    if (action) {
        action.disabled = true;
        switch (action.dataset.notifAction) {
            case "accept":
                await postQuietly(`/api/follow-requests/${notification.actor.id}/accept`);
                return loadNotifications();
            case "decline":
                await postQuietly(`/api/follow-requests/${notification.actor.id}/decline`);
                return loadNotifications();
            case "follow-back": {
                const status = await changeFollow(notification.actor.id, notification.followStatus);
                if (status !== null) notification.followStatus = status;
                break;
            }
        }
    }

    // Opening, or acting on, a notification marks it as read
    if (!notification.read) {
        notification.read = true;
        postQuietly(`/api/notifications/${notification.id}/read`);
    }
    renderNotifications();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal("notificationModal");
});

// Going to someone's profile from a notification closes the panel
window.addEventListener("hashchange", () => {
    closeModal("notificationModal");
    // The sidebar is drawn again on each page change, so the count is put back, and the list is refreshed
    setTimeout(updateNotificationBadge, 0);
    if (Date.now() - lastNotificationLoad > 5000) loadNotifications();
});

document.addEventListener("DOMContentLoaded", () => {
    loadNotifications();
    setTimeout(updateNotificationBadge, 0);
});

// New notifications arrive while you use the site, so the list is refreshed every minute
setInterval(() => {
    if (!document.hidden) loadNotifications();
}, 60000);

renderNotifications();
