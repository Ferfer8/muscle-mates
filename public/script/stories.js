// Stories: the panel on the feed and the full-screen viewer. Stories are photos that last 24 hours, grouped by person (GET /api/stories).
// Each story shows for 5 seconds; hold to pause, arrow keys or chevrons to move, Escape to close. Uses helpers from feed.js and messages.js.

const STORY_IMAGE_SECONDS = 5;       // how long each story shows
const SIDEBAR_STORY_COUNT = 6;       // how many circles fit in the sidebar before "See all" (yours counts as one)

let storyGroups = [];          // [{ user, stories, hasUnseen }] from the server
let storiesStatus = "loading"; // loading | ready | login | error
let myProfile = null;          // your username and picture, for the "Your story" circle when you have no story yet

// ---------- Loading ----------
async function loadStories() {
    try {
        // Your profile gives the "Your story" circle its picture, even before you have posted a story
        const [storiesResponse, profileResponse] = await Promise.all([fetch("/api/stories"), fetch("/api/profile")]);
        if (storiesResponse.status === 401) {
            storyGroups = [];
            myProfile = null;
            storiesStatus = "login";
        } else if (!storiesResponse.ok) {
            storiesStatus = "error";
        } else {
            storyGroups = await storiesResponse.json();
            myProfile = profileResponse.ok ? await profileResponse.json() : null;
            storiesStatus = "ready";
        }
    } catch (error) {
        storiesStatus = "error";
    }
    renderStoriesGrid();
}

// ---------- The circles ----------
function storyAvatarImage(user) {
    return `<img class="story-avatar" src="${escapeHtml(user.avatarUrl || avatarPlaceholder(user))}" width="120" height="120" alt="" loading="lazy">`;
}

// A circle for someone you follow
function renderStoryCircle(group) {
    return `
        <div class="story-item">
            <button type="button" class="story" data-story-user="${escapeHtml(group.user.username)}" aria-label="View story by @${escapeHtml(group.user.username)}">
                <span class="story-ring${group.hasUnseen ? "" : " seen"}">${storyAvatarImage(group.user)}</span>
                <span class="story-name">@${escapeHtml(group.user.username)}</span>
            </button>
        </div>`;
}

// Your own circle: it views your stories if you have any, and the "+" always adds a new one
function renderOwnCircle() {
    const group = storyGroups.find((item) => item.user.isSelf);
    const user = group ? group.user : myProfile;
    if (!user) return "";

    const ringClass = group ? (group.hasUnseen ? "" : " seen") : " empty";
    // With no stories yet, the circle itself starts the "add a story" flow instead of the viewer
    const action = group ? `data-story-user="${escapeHtml(user.username)}"` : "data-add-story";
    return `
        <div class="story-item">
            <button type="button" class="story" ${action} aria-label="${group ? "View your story" : "Add to your story"}">
                <span class="story-ring${ringClass}">${storyAvatarImage(user)}</span>
                <span class="story-name">Your story</span>
            </button>
            <button type="button" class="story-add" data-add-story aria-label="Add to your story" title="Add to your story"><i class='bx bx-plus'></i></button>
        </div>`;
}

// Everyone's circles, yours first
function renderAllCircles() {
    const others = storyGroups.filter((group) => !group.user.isSelf);
    return { own: renderOwnCircle(), others };
}

// The sidebar panel's markup (the stories themselves are filled in by loadStories)
function renderStoriesPanel() {
    return `
        <div class="stories-header">
            <h1>Stories</h1>
            <button type="button" class="stories-see-all">See all</button>
        </div>
        <div class="stories-grid" id="storiesGrid"></div>`;
}

// Redraws the circles in the panel (or a login or error message)
function renderStoriesGrid() {
    const grid = document.getElementById("storiesGrid");
    if (!grid) return;

    // Messages go inside the grid element, so the grid is always there to be filled in later
    if (storiesStatus === "login") {
        grid.className = "stories-grid-note";
        grid.innerHTML = '<p class="stories-note">Log in to see stories. <a href="#/login">Log in</a></p>';
        return;
    }
    if (storiesStatus === "error") {
        grid.className = "stories-grid-note";
        grid.innerHTML = '<p class="stories-note">Couldn\'t load stories right now.</p>';
        return;
    }
    if (storiesStatus === "loading") return;

    const { own, others } = renderAllCircles();
    // Yours takes the first place, so there is room for one fewer of the others
    const shown = others.slice(0, SIDEBAR_STORY_COUNT - 1).map(renderStoryCircle).join("");
    const note = others.length === 0 ? '<p class="stories-note stories-note-wide">Follow people to see their stories here.</p>' : "";
    const element = document.getElementById("storiesGrid");
    element.className = "stories-grid";
    element.innerHTML = own + shown + note;
}

// ---------- "See all" list ----------
function openAllStories(opener) {
    closeAllStories();
    const { own, others } = renderAllCircles();

    const modal = makeElement("div", "stories-all");
    modal.id = "storiesAll";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "All stories");

    const card = makeElement("div", "stories-all-card");
    const close = makeElement("button", "stories-all-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close all stories");
    close.innerHTML = "<i class='bx bx-x'></i>";
    const grid = makeElement("div", "stories-all-grid");
    grid.innerHTML = own + others.map(renderStoryCircle).join("");
    card.append(close, makeElement("h2", "", "All stories"), grid);
    if (others.length === 0) card.appendChild(makeElement("p", "stories-note", "Follow people to see their stories here."));
    modal.appendChild(card);

    modal.opener = opener;
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    close.focus();
}

// Closes the "See all" list and returns focus to its link
function closeAllStories() {
    const modal = document.getElementById("storiesAll");
    if (!modal) return;
    const opener = modal.opener;
    modal.remove();
    if (!document.getElementById("storyViewer")) document.body.classList.remove("modal-open");
    if (opener && document.body.contains(opener)) opener.focus();
}

// ---------- Adding a story ----------
// Opens the Create pop-up in "story" mode (upload.js changes its title and sends the file to /api/stories)
function startAddStory() {
    const modal = document.getElementById("overlayModal");
    if (!modal) return;
    modal.dataset.target = "story";
    closeAllStories();
    openModal("overlayModal");
}

// ---------- The viewer ----------
let flatStories = [];       // every story of every group, in viewing order: [{ group, story, position }]
let currentStory = 0;       // an index into flatStories
let userPaused = false;     // paused with the pause button
let holding = false;        // paused because the pointer is held down on the story
let viewerOpener = null;

// Lines up all the stories in one row, remembering which group (person) each belongs to
function buildFlatStories() {
    flatStories = [];
    storyGroups.forEach((group) => group.stories.forEach((story, position) => flatStories.push({ group, story, position })));
}

// Builds the viewer's markup; showStory fills it in
function buildViewer() {
    const viewer = makeElement("div", "story-viewer");
    viewer.id = "storyViewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");

    const prev = makeElement("button", "story-nav story-prev");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous story");
    prev.innerHTML = "<i class='bx bx-chevron-left'></i>";

    const next = makeElement("button", "story-nav story-next");
    next.type = "button";
    next.setAttribute("aria-label", "Next story");
    next.innerHTML = "<i class='bx bx-chevron-right'></i>";

    const card = makeElement("div", "story-card");
    const media = makeElement("div", "story-media");
    const progress = makeElement("div", "story-progress");

    const header = makeElement("div", "story-header");
    header.append(makeElement("img", "story-header-avatar"), makeElement("span", "story-header-names"));
    header.querySelector("img").alt = "";

    const pause = makeElement("button", "story-icon-btn story-pause");
    pause.type = "button";
    pause.setAttribute("aria-label", "Pause story");
    pause.innerHTML = "<i class='bx bx-pause'></i>";

    const remove = makeElement("button", "story-icon-btn story-delete");
    remove.type = "button";
    remove.setAttribute("aria-label", "Delete this story");
    remove.title = "Delete this story";
    remove.innerHTML = "<i class='bx bx-trash'></i>";

    const close = makeElement("button", "story-icon-btn story-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close story");
    close.innerHTML = "<i class='bx bx-x'></i>";
    header.append(pause, remove, close);

    const caption = makeElement("p", "story-caption");
    card.append(media, progress, header, caption);
    viewer.append(prev, card, next);
    return viewer;
}

// Pauses or resumes the countdown bar
function updatePaused() {
    const viewer = document.getElementById("storyViewer");
    if (!viewer) return;
    const paused = userPaused || holding || document.hidden;
    viewer.classList.toggle("paused", paused);

    const button = viewer.querySelector(".story-pause");
    button.setAttribute("aria-label", userPaused ? "Play story" : "Pause story");
    button.querySelector("i").className = userPaused ? "bx bx-play" : "bx bx-pause";
}

// Starts the current segment's bar filling over the given number of seconds
function startSegment(bar, seconds) {
    bar.style.animationDuration = `${seconds}s`;
    bar.classList.remove("running");
    void bar.offsetWidth;   // makes the browser notice the class was removed, so adding it again restarts the animation
    bar.classList.add("running");
}

// Shows one story in the viewer and starts its countdown
function showStory(index) {
    const viewer = document.getElementById("storyViewer");
    if (!viewer || !flatStories[index]) return;
    currentStory = index;
    const { group, story, position } = flatStories[index];

    viewer.setAttribute("aria-label", `Story by @${group.user.username}`);

    // The photo
    const media = viewer.querySelector(".story-media");
    media.replaceChildren();
    const image = makeElement("img", "story-image");
    image.src = story.image;
    image.alt = `Story by @${group.user.username}`;
    media.appendChild(image);

    // Who posted it, and when
    const headerAvatar = viewer.querySelector(".story-header-avatar");
    headerAvatar.src = group.user.avatarUrl || avatarPlaceholder(group.user);
    viewer.querySelector(".story-header-names").replaceChildren(
        makeElement("b", "", `@${group.user.username}`), makeElement("span", "", timeSince(story.createdAt)));
    viewer.querySelector(".story-delete").hidden = !group.user.isSelf;   // only your own stories can be deleted
    viewer.querySelector(".story-caption").textContent = story.caption || "";
    viewer.querySelector(".story-caption").hidden = !story.caption;

    // The first story has nothing before it and the last has nothing after it, so those arrows are switched off
    viewer.querySelector(".story-prev").disabled = index === 0;
    viewer.querySelector(".story-next").disabled = index === flatStories.length - 1;

    // One bar segment per story this person has: earlier ones full, this one filling, later ones empty
    const progress = viewer.querySelector(".story-progress");
    progress.replaceChildren(...group.stories.map((_, i) => {
        const segment = makeElement("span", "story-seg");
        const bar = makeElement("span", `story-seg-bar${i < position ? " done" : ""}`);
        segment.appendChild(bar);
        return segment;
    }));
    const bar = progress.children[position].firstChild;

    startSegment(bar, STORY_IMAGE_SECONDS);
    updatePaused();

    markStorySeen(group, story);
}

// Tells the server you watched this story, and turns the ring grey once you have watched all of that person's
function markStorySeen(group, story) {
    if (story.seen) return;
    story.seen = true;
    group.hasUnseen = group.stories.some((item) => !item.seen);
    fetch(`/api/stories/${story.id}/view`, { method: "POST" }).catch(() => {});
    renderStoriesGrid();
}

// Opens the viewer at a person's first unwatched story (or their first story if they are all watched)
async function openStoryGroupByUsername(username, opener) {
    if (storiesStatus !== "ready") await loadStories();
    const groupIndex = storyGroups.findIndex((group) => group.user.username.toLowerCase() === String(username).toLowerCase());
    if (groupIndex === -1) return;

    closeStoryViewer(false);
    closeAllStories();
    buildFlatStories();
    const group = storyGroups[groupIndex];
    const firstUnseen = group.stories.findIndex((story) => !story.seen);
    const startPosition = firstUnseen === -1 ? 0 : firstUnseen;
    const startIndex = flatStories.findIndex((item) => item.group === group && item.position === startPosition);

    userPaused = false;
    holding = false;
    viewerOpener = opener;
    const viewer = buildViewer();
    document.body.appendChild(viewer);
    document.body.classList.add("modal-open");
    showStory(startIndex);
    viewer.querySelector(".story-close").focus();
}

// Closes the viewer. restoreFocus puts focus back on the circle that opened it
function closeStoryViewer(restoreFocus = true) {
    const viewer = document.getElementById("storyViewer");
    if (!viewer) return;
    viewer.remove();
    if (!document.getElementById("storiesAll")) document.body.classList.remove("modal-open");
    if (restoreFocus && viewerOpener && document.body.contains(viewerOpener)) viewerOpener.focus();
    viewerOpener = null;
}

// Shows the story at an index, if there is one
function goToStory(index) {
    if (index >= 0 && index < flatStories.length) showStory(index);
}

// Deletes the story being shown (yours only), then carries on with whatever is left
async function deleteCurrentStory() {
    const entry = flatStories[currentStory];
    if (!entry || !entry.group.user.isSelf) return;

    // Holds the story still while the "are you sure?" pop-up is open, so it doesn't move on by itself
    holding = true;
    updatePaused();
    const sure = await confirmDialog({
        title: "Delete this story?",
        message: "It will be removed straight away. This can't be undone.",
        confirmLabel: "Delete story"
    });
    holding = false;
    updatePaused();
    if (!sure) return;

    try {
        const response = await fetch(`/api/stories/${entry.story.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("delete failed");
    } catch (error) {
        return;
    }

    await loadStories();
    buildFlatStories();
    if (flatStories.length === 0) return closeStoryViewer();
    showStory(Math.min(currentStory, flatStories.length - 1));
}

// ---------- Events ----------
document.addEventListener("click", (e) => {
    if (e.target.closest("[data-add-story]")) return startAddStory();

    const story = e.target.closest(".story[data-story-user]");
    if (story) return openStoryGroupByUsername(story.dataset.storyUser, story);

    const seeAll = e.target.closest(".stories-see-all");
    if (seeAll) return openAllStories(seeAll);

    const allModal = document.getElementById("storiesAll");
    if (allModal && (e.target === allModal || e.target.closest(".stories-all-close"))) return closeAllStories();

    const viewer = document.getElementById("storyViewer");
    if (!viewer) return;
    if (e.target === viewer || e.target.closest(".story-close")) return closeStoryViewer();
    if (e.target.closest(".story-prev")) return goToStory(currentStory - 1);
    if (e.target.closest(".story-next")) return goToStory(currentStory + 1);
    if (e.target.closest(".story-delete")) return deleteCurrentStory();
    if (e.target.closest(".story-pause")) {
        userPaused = !userPaused;
        updatePaused();
    }
});

// When the current bar finishes filling, move to the next story (or close after the very last one)
document.addEventListener("animationend", (e) => {
    if (!e.target.classList.contains("story-seg-bar")) return;
    if (currentStory < flatStories.length - 1) goToStory(currentStory + 1);
    else closeStoryViewer();
});

// Holding the pointer down on a story pauses it, like on other social apps
document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".story-image")) {
        holding = true;
        updatePaused();
    }
});
["pointerup", "pointercancel"].forEach((type) => document.addEventListener(type, () => {
    if (holding) {
        holding = false;
        updatePaused();
    }
}));

document.addEventListener("visibilitychange", updatePaused);

document.addEventListener("keydown", (e) => {
    if (document.getElementById("storyViewer")) {
        if (e.key === "ArrowRight") goToStory(currentStory + 1);
        else if (e.key === "ArrowLeft") goToStory(currentStory - 1);
        else if (e.key === "Escape") closeStoryViewer();
    } else if (e.key === "Escape") {
        closeAllStories();
    }
});

window.addEventListener("hashchange", () => {
    closeStoryViewer(false);
    closeAllStories();
});
