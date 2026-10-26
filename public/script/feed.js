// Posts: the grid (feed, Daily Challenge, profiles, saved), the post pop-up (likes, saves, comments, edit, delete), the feed tabs and sort,
// "Load more", the Daily Challenge banner and the quote of the day. Also defines helpers other scripts use: makeElement, timeSince, avatarPlaceholder.

// Every post the pages have loaded, by id, so the pop-up can find the post that was clicked
const postRegistry = new Map();

// Stores posts by id so the pop-up can look one up when its tile is clicked
function registerPosts(posts) {
    posts.forEach((post) => postRegistry.set(post.id, post));
    return posts;
}

// Text like "just now", "5m ago", "3h ago" or "2d ago" for a date
function timeSince(dateString) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(dateString).getTime()) / 60000));
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

// Stand-in picture for someone without a profile picture: a purple square with their initials, built as an SVG data URL (the CSS rounds it).
// Needs no file or outside site. person can have a name, firstName and lastName, or a username.
function avatarPlaceholder(person = {}) {
    const name = person.name || [person.firstName, person.lastName].filter(Boolean).join(" ") || person.username || "";
    const initials = name.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
    const safe = initials.replace(/[&<>"']/g, "");   // strips characters that could break the SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#240090"/>` +
        `<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Verdana, Geneva, sans-serif" font-size="40" font-weight="bold" fill="#fff">${safe}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Builds an element with optional class and text (text is set with textContent, so it can never inject HTML)
function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// The grid markup for a list of posts. Each post is a button, so it works with the keyboard too.
function renderPins(posts) {
    return posts.map((post) => `
        <button type="button" class="pin" data-post-id="${post.id}" data-ratio="${post.height / post.width}" aria-label="Open post by @${escapeHtml(post.username)}">
            <img src="${escapeHtml(post.image)}" width="${post.width}" height="${post.height}" alt="Post by @${escapeHtml(post.username)}" loading="lazy">
            <span class="pin-overlay"><span class="pin-username">@${escapeHtml(post.username)}</span></span>
        </button>`).join("");
}

// ---------- Loading posts ----------

// Asks the server for posts. Returns { posts } or { error: "login" | "locked" | "failed" }.
async function fetchPosts(url) {
    try {
        const response = await fetch(url);
        if (response.status === 401) return { error: "login" };
        if (response.status === 403) return { error: "locked" };
        if (!response.ok) return { error: "failed" };
        // The server sends "X-Has-More: true" when there are more posts than it sent (see pageSkip in server.js)
        return { posts: registerPosts(await response.json()), hasMore: response.headers.get("X-Has-More") === "true", url };
    } catch (error) {
        return { error: "failed" };
    }
}

// Fills a grid with posts, or shows a short message (with a login link when you aren't logged in)
function showPostsInGrid(container, result, emptyMessage, loginMessage = "Log in to see posts.") {
    if (!container) return;
    container.nextElementSibling?.classList.contains("load-more") && container.nextElementSibling.remove();   // removes the old "Load more" button
    container.loadState = null;
    const message = (text, withLogin) => {
        if (masonryObserver) masonryObserver.disconnect();
        delete container.dataset.columns;
        const note = makeElement("p", "feed-empty", text);
        if (withLogin) {
            const link = makeElement("a", "", "Log in");
            link.href = "#/login";
            note.append(" ", link);
        }
        container.replaceChildren(note);
    };

    if (result.error === "login") return message(loginMessage, true);
    if (result.error === "locked") return message("This account is private.");
    if (result.error) return message("Couldn't load posts right now. Please try again.");
    if (result.posts.length === 0) return message(emptyMessage);

    // The grid remembers which address it came from and which posts it shows, so "Load more" can ask for the next batch
    container.loadState = { url: result.url, posts: [...result.posts] };
    container.innerHTML = renderPins(result.posts);
    setupMasonry();
    if (result.hasMore) addLoadMoreButton(container);
}

// The "Load more" button under a grid
function addLoadMoreButton(container) {
    const wrap = makeElement("div", "load-more");
    const button = makeElement("button", "load-more-btn", "Load more");
    button.type = "button";
    wrap.appendChild(button);
    container.insertAdjacentElement("afterend", wrap);
}

// Loads the next batch (same address plus ?skip=<number shown>) and adds it to the grid; the button comes back if there is more
document.addEventListener("click", async (e) => {
    const button = e.target.closest(".load-more-btn");
    if (!button) return;
    const wrap = button.parentElement;
    const container = wrap.previousElementSibling;
    const state = container && container.loadState;
    if (!state) return;

    button.disabled = true;
    button.textContent = "Loading...";
    const joiner = state.url.includes("?") ? "&" : "?";
    const result = await fetchPosts(`${state.url}${joiner}skip=${state.posts.length}`);
    if (container.loadState !== state) return;   // the filter or page changed while this loaded

    if (result.error) {
        button.disabled = false;
        button.textContent = "Couldn't load. Try again";
        return;
    }
    state.posts.push(...result.posts);
    container.innerHTML = renderPins(state.posts);
    setupMasonry();
    wrap.remove();
    if (result.hasMore) addLoadMoreButton(container);
});

// ---------- Grid layout ----------
// Posts go into whichever column is currently shortest, newest first, so the newest run along the top and older ones fill the gaps (Pinterest style).

const MIN_COLUMN_WIDTH = 230;
const COLUMN_GAP = 16;
let masonryObserver = null;

// Spreads the posts over the right number of columns for the container's current width
function layoutMasonry(container, pins, columnCount) {
    const columns = Array.from({ length: columnCount }, () => {
        const column = makeElement("div", "masonry-column");
        column.height = 0;
        return column;
    });

    // Each picture is as wide as its column and as tall as its shape (ratio) says, so heights are known up front
    pins.forEach((pin) => {
        const shortest = columns.reduce((best, column) => (column.height < best.height ? column : best));
        shortest.appendChild(pin);
        shortest.height += Number(pin.dataset.ratio) + 0.06;   // 0.06 stands in for the gap between posts
    });

    container.replaceChildren(...columns);
    container.dataset.columns = columnCount;
}

// Called after posts are put in a grid: builds the columns, and rebuilds them if the width changes
function setupMasonry() {
    if (masonryObserver) masonryObserver.disconnect();

    const container = document.querySelector(".masonry");
    if (!container) return;
    delete container.dataset.columns;   // forces the columns to be rebuilt for the new posts
    const pins = Array.from(container.querySelectorAll(".pin"));   // kept in newest-first order

    masonryObserver = new ResizeObserver(() => {
        const count = Math.max(1, Math.floor((container.clientWidth + COLUMN_GAP) / (MIN_COLUMN_WIDTH + COLUMN_GAP)));
        // Only rebuilds when the number of columns actually changes (e.g. when the sidebar is collapsed)
        if (Number(container.dataset.columns) !== count) layoutMasonry(container, pins, count);
    });
    masonryObserver.observe(container);
}

// ---------- The post pop-up ----------

// Sets the like and save buttons to match a post
function refreshPostButtons(modal, post) {
    const like = modal.querySelector(".post-like");
    like.setAttribute("aria-pressed", String(post.likedByMe));
    like.classList.toggle("active", post.likedByMe);
    like.querySelector("i").className = post.likedByMe ? "bx bxs-heart" : "bx bx-heart";
    like.querySelector("span").textContent = post.likes;

    const save = modal.querySelector(".post-save");
    save.setAttribute("aria-pressed", String(post.savedByMe));
    save.setAttribute("aria-label", post.savedByMe ? "Unsave post" : "Save post");
    save.classList.toggle("active", post.savedByMe);
    save.querySelector("i").className = post.savedByMe ? "bx bxs-bookmark" : "bx bx-bookmark";
}

// Builds the pop-up showing one post in full
function buildPostModal(post) {
    const modal = makeElement("div", "post-modal");
    modal.id = "postModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", `Post by @${post.username}`);
    modal.dataset.postId = post.id;

    const card = makeElement("div", "post-card");

    const close = makeElement("button", "post-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close post");
    close.innerHTML = "<i class='bx bx-x'></i>";

    // A bin button, only for the person who wrote the post
    let removeButton = null;
    if (post.isMine) {
        removeButton = makeElement("button", "post-delete");
        removeButton.type = "button";
        removeButton.setAttribute("aria-label", "Delete post");
        removeButton.title = "Delete post";
        removeButton.innerHTML = "<i class='bx bx-trash'></i>";
    }

    // A pencil button to edit the caption, also only for the owner
    let editButton = null;
    if (post.isMine) {
        editButton = makeElement("button", "post-edit");
        editButton.type = "button";
        editButton.setAttribute("aria-label", "Edit caption");
        editButton.title = "Edit caption";
        editButton.innerHTML = "<i class='bx bx-edit-alt'></i>";
    }

    const picture = makeElement("div", "post-picture");
    const image = makeElement("img");
    image.src = post.image;
    image.alt = `Post by @${post.username}`;
    picture.appendChild(image);

    const details = makeElement("div", "post-details");

    // Who posted it: a link to their profile
    const author = makeElement("a", "post-author");
    author.href = `#/user/${encodeURIComponent(post.username)}`;
    if (post.avatarUrl) {
        const picture = makeElement("img", "post-avatar post-avatar-img");
        picture.src = post.avatarUrl;
        picture.alt = "";
        author.appendChild(picture);
    } else {
        // No picture: the first letters of their name in a circle
        author.appendChild(makeElement("span", "post-avatar", post.name.split(" ").map((word) => word[0]).join("").slice(0, 2)));
    }
    const names = makeElement("div", "post-names");
    names.append(makeElement("span", "post-name", post.name), makeElement("span", "post-handle", `@${post.username}`));
    author.append(names, makeElement("span", "post-time", timeSince(post.createdAt)));

    // Caption and tags
    const caption = makeElement("p", "post-caption", post.caption);
    const tags = makeElement("p", "post-tags", post.tags.join(" "));

    // Like, comment and save
    const actions = makeElement("div", "post-actions");
    const like = makeElement("button", "post-action post-like");
    like.type = "button";
    like.innerHTML = "<i class='bx bx-heart'></i><span></span>";
    const comment = makeElement("span", "post-action");
    comment.innerHTML = `<i class='bx bx-comment-dots'></i><span class="post-comment-count">${post.comments}</span>`;
    const save = makeElement("button", "post-action post-save");
    save.type = "button";
    save.innerHTML = "<i class='bx bx-bookmark'></i>";
    actions.append(like, comment, save);

    // The comments list (filled in by loadComments once the pop-up is on the page) and the box to write a new one
    const comments = makeElement("div", "post-comments");
    comments.setAttribute("aria-live", "polite");
    comments.appendChild(makeElement("p", "comments-note", "Loading comments..."));

    const form = makeElement("form", "post-comment-form");
    form.autocomplete = "off";
    const input = makeElement("input", "post-comment-input");
    input.type = "text";
    input.placeholder = "Add a comment...";
    input.maxLength = 300;
    input.setAttribute("aria-label", "Add a comment");
    const send = makeElement("button", "post-comment-send");
    send.type = "submit";
    send.setAttribute("aria-label", "Post comment");
    send.innerHTML = "<i class='bx bxs-send'></i>";
    form.append(input, send);
    const commentError = makeElement("p", "comment-error");
    commentError.setAttribute("role", "alert");

    details.append(author, caption, tags, actions, comments, commentError, form);
    card.append(close, ...(removeButton ? [removeButton] : []), ...(editButton ? [editButton] : []), picture, details);
    modal.appendChild(card);
    refreshPostButtons(modal, post);
    return modal;
}

let lastPinOpened = null;

// Opens the pop-up for a post and loads its comments
function openPostModal(postId, pin) {
    const post = postRegistry.get(postId);
    if (!post) return;
    closePostModal();

    lastPinOpened = pin;
    const modal = buildPostModal(post);
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    modal.querySelector(".post-close").focus();
    loadComments(modal, post);
}

// ---------- Comments ----------

// One comment: the writer's picture (or initials), their name and text, how long ago, and a bin button if you may delete it
function renderComment(comment) {
    const row = makeElement("div", "post-comment");
    row.dataset.commentId = comment.id;

    if (comment.avatarUrl) {
        const picture = makeElement("img", "comment-avatar");
        picture.src = comment.avatarUrl;
        picture.alt = "";
        row.appendChild(picture);
    } else {
        row.appendChild(makeElement("span", "comment-avatar", comment.name.split(" ").map((word) => word[0]).join("").slice(0, 2)));
    }

    const body = makeElement("div", "comment-body");
    const line = makeElement("p", "comment-text");
    const name = makeElement("a", "comment-name", comment.name);
    name.href = `#/user/${encodeURIComponent(comment.username)}`;
    line.append(name, " ", comment.text);   // a string is added as plain text, never as HTML
    body.append(line, makeElement("span", "comment-time", timeSince(comment.createdAt)));
    row.appendChild(body);

    if (comment.canDelete) {
        const remove = makeElement("button", "comment-delete");
        remove.type = "button";
        remove.setAttribute("aria-label", "Delete comment");
        remove.title = "Delete comment";
        remove.innerHTML = "<i class='bx bx-trash'></i>";
        row.appendChild(remove);
    }
    return row;
}

// Updates the comment count next to the speech bubble and on the post object
function setCommentCount(modal, post, count) {
    post.comments = count;
    const counter = modal.querySelector(".post-comment-count");
    if (counter) counter.textContent = count;
}

// Loads the comments for the open post
async function loadComments(modal, post) {
    const list = modal.querySelector(".post-comments");
    try {
        const response = await fetch(`/api/posts/${post.id}/comments`);
        if (document.getElementById("postModal") !== modal) return;   // the pop-up was closed while this loaded
        if (response.status === 401) return list.replaceChildren(makeElement("p", "comments-note", "Log in to see comments."));
        if (!response.ok) throw new Error("comments request failed");

        const comments = await response.json();
        list.replaceChildren(...(comments.length === 0
            ? [makeElement("p", "comments-note", "No comments yet. Be the first!")]
            : comments.map(renderComment)));
    } catch (error) {
        list.replaceChildren(makeElement("p", "comments-note", "Couldn't load comments right now."));
    }
}

// Sends a new comment to the server and adds it to the list
async function submitComment(form, modal, post) {
    const input = form.querySelector("input");
    const send = form.querySelector("button");
    const error = modal.querySelector(".comment-error");
    const text = input.value.trim();
    error.textContent = "";
    if (!text) return;

    send.disabled = true;
    try {
        const response = await fetch(`/api/posts/${post.id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            error.textContent = response.status === 401
                ? "Log in to comment."
                : (data.errors && data.errors.text) || data.message || "Something went wrong. Please try again.";
            return;
        }

        const list = modal.querySelector(".post-comments");
        list.querySelector(".comments-note")?.remove();   // "No comments yet" goes away
        list.appendChild(renderComment(data.comment));
        list.scrollTop = list.scrollHeight;               // scrolls down to the new comment
        setCommentCount(modal, post, data.commentCount);
        input.value = "";
    } catch (failure) {
        error.textContent = "Couldn't reach the server. Please try again.";
    } finally {
        send.disabled = false;
        input.focus();
    }
}

// Deletes a comment (your own, or any on your post)
async function deleteComment(row, modal, post) {
    const sure = await confirmDialog({
        title: "Delete this comment?",
        message: "This can't be undone.",
        confirmLabel: "Delete comment"
    });
    if (!sure || !document.body.contains(row)) return;

    try {
        const response = await fetch(`/api/comments/${row.dataset.commentId}`, { method: "DELETE" });
        if (!response.ok) return;
        const data = await response.json();
        row.remove();
        setCommentCount(modal, post, data.commentCount);
        const list = modal.querySelector(".post-comments");
        if (!list.querySelector(".post-comment")) list.appendChild(makeElement("p", "comments-note", "No comments yet. Be the first!"));
    } catch (error) {
        // network error: the comment stays
    }
}

// Turns the caption into a box you can edit, with Save and Cancel. Saving sends PATCH /api/posts/:id.
function startEditingCaption(modal, post) {
    if (modal.querySelector(".caption-editor")) return;
    const caption = modal.querySelector(".post-caption");
    const tags = modal.querySelector(".post-tags");

    const editor = makeElement("div", "caption-editor");
    const box = makeElement("textarea", "caption-input");
    box.value = post.caption;
    box.maxLength = 300;
    box.rows = 3;
    box.setAttribute("aria-label", "Caption");
    const error = makeElement("p", "comment-error");
    error.setAttribute("role", "alert");
    const buttons = makeElement("div", "caption-buttons");
    const cancel = makeElement("button", "caption-cancel", "Cancel");
    cancel.type = "button";
    const save = makeElement("button", "caption-save", "Save");
    save.type = "button";
    buttons.append(cancel, save);
    editor.append(box, error, buttons);

    caption.hidden = true;
    tags.hidden = true;
    caption.insertAdjacentElement("afterend", editor);
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);

    const stop = () => {
        editor.remove();
        caption.hidden = false;
        tags.hidden = false;
    };
    cancel.addEventListener("click", stop);
    // Escape cancels the edit only (and doesn't close the whole post pop-up)
    box.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.stopPropagation(); stop(); }
    });
    save.addEventListener("click", async () => {
        save.disabled = true;
        error.textContent = "";
        try {
            const response = await fetch(`/api/posts/${post.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caption: box.value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                error.textContent = (data.errors && data.errors.caption) || data.message || "Something went wrong. Please try again.";
                save.disabled = false;
                return;
            }
            post.caption = data.caption;   // the same post object is used by the grid, so it is updated everywhere
            post.tags = data.tags;
            caption.textContent = data.caption;
            tags.textContent = data.tags.join(" ");
            stop();
        } catch (failure) {
            error.textContent = "Couldn't reach the server. Please try again.";
            save.disabled = false;
        }
    });
}

// Deletes the open post (yours only) after asking "are you sure?", then refreshes the page it was shown on
async function deletePost(modal, post) {
    const sure = await confirmDialog({
        title: "Delete this post?",
        message: "The post will be removed for good, along with its likes and comments. This can't be undone.",
        confirmLabel: "Delete post",
        onConfirm: async () => {
            const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
            if (response.ok || response.status === 404) return null;   // 404: it is already gone, which is what was wanted
            const data = await response.json().catch(() => ({}));
            return data.message || "Something went wrong. Please try again.";
        }
    });
    if (!sure) return;

    postRegistry.delete(post.id);
    closePostModal();
    navigateTo(window.location.hash);   // draws the current page again without the post
}

// Closes the post pop-up and returns focus to the tile that opened it
function closePostModal() {
    const modal = document.getElementById("postModal");
    if (!modal) return;
    modal.remove();
    document.body.classList.remove("modal-open");
    if (lastPinOpened && document.body.contains(lastPinOpened)) lastPinOpened.focus();
    lastPinOpened = null;
}

// Likes or saves (or undoes it) on the server. The button changes straight away and goes back if the request fails.
async function togglePostAction(modal, post, kind) {
    const field = kind === "like" ? "likedByMe" : "savedByMe";
    const wasOn = post[field];
    post[field] = !wasOn;
    if (kind === "like") post.likes += wasOn ? -1 : 1;
    refreshPostButtons(modal, post);

    try {
        const response = await fetch(`/api/posts/${post.id}/${kind}`, { method: wasOn ? "DELETE" : "POST" });
        if (!response.ok) throw new Error("request failed");
        const data = await response.json();
        if (kind === "like") post.likes = data.likes;
    } catch (error) {
        post[field] = wasOn;
        if (kind === "like") post.likes += wasOn ? 1 : -1;
    }
    if (document.getElementById("postModal") === modal) refreshPostButtons(modal, post);
    if (kind === "save") document.dispatchEvent(new CustomEvent("savedchange"));   // lets the profile's Saved tab update
}

document.addEventListener("click", (e) => {
    const pin = e.target.closest(".pin");
    if (pin) return openPostModal(pin.dataset.postId, pin);

    const modal = document.getElementById("postModal");
    if (!modal) return;

    // Close: the X button, or a click on the dark area around the card
    if (e.target === modal || e.target.closest(".post-close")) return closePostModal();
    if (e.target.closest(".post-delete")) return deletePost(modal, postRegistry.get(modal.dataset.postId));
    if (e.target.closest(".post-edit")) return startEditingCaption(modal, postRegistry.get(modal.dataset.postId));

    const post = postRegistry.get(modal.dataset.postId);
    if (!post) return;
    if (e.target.closest(".post-like")) togglePostAction(modal, post, "like");
    else if (e.target.closest(".post-save")) togglePostAction(modal, post, "save");
    else if (e.target.closest(".comment-delete")) deleteComment(e.target.closest(".post-comment"), modal, post);
});

// Pressing Enter in the comment box (or the send button) posts the comment
document.addEventListener("submit", (e) => {
    if (!e.target.classList.contains("post-comment-form")) return;
    e.preventDefault();
    const modal = document.getElementById("postModal");
    const post = modal && postRegistry.get(modal.dataset.postId);
    if (post) submitComment(e.target, modal, post);
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePostModal();
});

// Leaving the page closes the pop-up
window.addEventListener("hashchange", closePostModal);

// ---------- Feed filters ----------
// The server does the filtering and sorting (GET /api/posts?type=feed&filter=...&sort=...). The two controls can be combined.
// Tabs: All = public accounts (plus your own posts and private accounts you follow when logged in), Following = people you follow (mates included), Mates = mutual follows.
// Sort: Recent = newest first, Most Popular = most likes first. Visitors who aren't logged in can use All; Following and Mates ask them to log in.
const feedEmptyMessages = {
    all: "No posts yet. Be the first to post!",
    following: "No posts from people you follow yet. You may not be following anyone yet, so explore the All tab to find people.",
    mates: "No posts from your mates yet. Follow people and have them follow you back to see their posts here."
};
const feedLoginMessages = {
    all: "Log in to see posts.",
    following: "Log in to see posts from people you follow.",
    mates: "Log in to see posts from your mates."
};

let currentFeedFilter = "all";     // the tab: all | following | mates
let currentFeedSort = "recent";    // the sort: recent | popular

// Shows the posts for a tab and a sort order, and marks the chosen tab (and menu option) as current
async function loadFeed(filter = "all", sort = "recent") {
    currentFeedFilter = filter;
    currentFeedSort = sort;
    document.querySelectorAll("#feedTabs .filter-btn").forEach((button) => {
        const active = button.dataset.feedTab === filter;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    const menu = document.getElementById("feedSort");
    if (menu) menu.value = sort;

    const result = await fetchPosts(`/api/posts?type=feed&filter=${encodeURIComponent(filter)}&sort=${encodeURIComponent(sort)}`);
    // If another tab or sort was chosen (or the page changed) while this loaded, this answer is out of date
    if (filter !== currentFeedFilter || sort !== currentFeedSort) return;
    showPostsInGrid(document.querySelector(".masonry"), result, feedEmptyMessages[filter], feedLoginMessages[filter]);
}

document.addEventListener("click", (e) => {
    const tab = e.target.closest("#feedTabs [data-feed-tab]");
    if (tab) loadFeed(tab.dataset.feedTab, currentFeedSort);
});

document.addEventListener("change", (e) => {
    if (e.target.id === "feedSort") loadFeed(currentFeedFilter, e.target.value);
});

// ---------- Daily Challenge ----------

// Today's challenge banner. The server picks the challenge (see challenges.js), so everyone sees the same one until midnight.
let challengeCountdown = null;

// "5h 12m left" until your device's midnight, when the next challenge starts
function timeLeftToday() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const minutes = Math.max(0, Math.round((midnight - now) / 60000));
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

// Fills the banner from GET /api/daily-challenge and starts the countdown
async function loadTodaysChallenge() {
    const banner = document.getElementById("challengeBanner");
    if (!banner) return;

    try {
        const response = await fetch("/api/daily-challenge");
        if (!response.ok) throw new Error("challenge request failed");
        const challenge = await response.json();

        // textContent (not innerHTML) keeps the text from ever being treated as HTML
        banner.querySelector(".challenge-title").textContent = challenge.title;
        banner.querySelector(".challenge-task").textContent = challenge.task;
        banner.querySelector(".challenge-show").textContent = `Post ${challenge.show}.`;
        banner.hidden = false;

        // The "time left" updates every minute while you are on the page
        const timeLeft = banner.querySelector(".challenge-time");
        timeLeft.textContent = timeLeftToday();
        clearInterval(challengeCountdown);
        challengeCountdown = setInterval(() => {
            if (document.contains(timeLeft)) timeLeft.textContent = timeLeftToday();
            else clearInterval(challengeCountdown);   // the page was left, so stop counting
        }, 60000);
    } catch (error) {
        banner.hidden = true;   // no banner is better than a broken one
    }
}

// Daily Challenge filter: Everyone (public accounts, people you follow, you), Following, or Mates. The choice is saved in the browser.
const challengeEmptyMessages = {
    everyone: "No challenge posts yet. Add the first one!",
    following: "No challenge posts from people you follow yet. Try Everyone to see more.",
    mates: "No challenge posts from your mates yet. Try Following or Everyone to see more."
};

let currentChallengeFilter = "everyone";

// The filter you picked last time (everyone if you haven't picked one, or the browser can't remember)
function savedChallengeFilter() {
    try {
        const saved = localStorage.getItem("challengeFilter");
        return saved in challengeEmptyMessages ? saved : "everyone";
    } catch (error) {
        return "everyone";
    }
}

// Shows the challenge posts for a filter and marks that filter's button as the current one
async function loadChallengeFeed(filter) {
    currentChallengeFilter = filter;
    try {
        localStorage.setItem("challengeFilter", filter);
    } catch (error) {
        // The choice just isn't remembered next time
    }
    document.querySelectorAll("#challengeFilter .filter-btn").forEach((button) => {
        const active = button.dataset.challengeFilter === filter;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    const result = await fetchPosts(`/api/posts?type=challenge&filter=${encodeURIComponent(filter)}`);
    if (filter !== currentChallengeFilter) return;   // another filter was picked while this loaded
    showPostsInGrid(document.querySelector(".masonry"), result, challengeEmptyMessages[filter]);
}

// The whole Daily Challenge page: today's challenge banner, then the posts for your remembered filter
function loadChallengePosts() {
    loadTodaysChallenge();
    return loadChallengeFeed(savedChallengeFilter());
}

document.addEventListener("click", (e) => {
    const button = e.target.closest("#challengeFilter .filter-btn");
    if (button) loadChallengeFeed(button.dataset.challengeFilter);
});

// Fills the "Quote of the day" box from the server (the box starts with a fallback quote in case the request fails)
async function loadQuoteOfTheDay() {
    try {
        const response = await fetch("/api/quote-of-the-day");
        if (!response.ok) return;
        const quote = await response.json();

        const box = document.getElementById("quote");
        if (!box) return;
        box.querySelector("p").textContent = quote.text;
        box.querySelector("footer").textContent = quote.author;
        box.title = `Source: ${quote.source}`;
    } catch (error) {
        // The fallback quote stays
    }
}
