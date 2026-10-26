// Create-post pop-up, also used for stories. Accepts JPEG, PNG and WebP only (no GIFs or videos), shrinks the photo in the browser, then sends it
// to POST /api/posts or /api/stories. The pop-up's HTML is in index.html and the sidebar's Create link opens it.

const PHOTO_TYPES_ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_SIDE = 1600;                  // photos are shrunk to at most this many pixels on the longest side
const PHOTO_TARGET_BYTES = 1024 * 1024;       // ...and compressed to about 1 MB or less
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;      // the server refuses anything over 2 MB
let captionLimit = 300;   // 300 for posts, 150 for stories (set by applyCreateTarget)

let previewUrl = null;
let selectedFile = null;
let selectedSize = { width: 300, height: 400 };   // the shrunk photo's size, sent with the post
let previewRequest = 0;                           // counts picks, so a slow, old one can't replace a newer choice

// Shorthand for getElementById
function createEl(id) {
    return document.getElementById(id);
}

// Shows or clears the message under the picture area
function setUploadError(message) {
    const error = createEl("uploadError");
    if (error) error.textContent = message;
}

// Posting needs a picture
function updatePostButton() {
    const button = createEl("postBtn");
    if (button) button.disabled = !previewUrl;
}

// Loads a photo file into an <img> so it can be drawn on a canvas
function loadPhoto(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("could not read")); };
        image.src = url;
    });
}

// Turns a canvas into a JPEG blob at the given quality
function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not convert"))), "image/jpeg", quality));
}

// Shrinks a photo to at most 1600px and about 1 MB as a JPEG, which keeps uploads fast and the database small. Lowers the quality first and only
// makes the picture smaller if it has to. Returns { blob, width, height }.
async function shrinkPhoto(file) {
    const image = await loadPhoto(file);
    let scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    let smallest = null;

    for (let round = 0; round < 4; round++) {
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";   // JPEG has no see-through parts, so transparent areas of a PNG or WebP become white
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        for (let quality = 0.85; quality >= 0.5; quality -= 0.1) {
            const blob = await canvasToBlob(canvas, quality);
            if (!smallest || blob.size < smallest.blob.size) smallest = { blob, width, height };
            if (blob.size <= PHOTO_TARGET_BYTES) return { blob, width, height };
        }
        scale *= 0.8;   // still too big at the lowest quality: make the picture itself smaller and try again
    }
    return smallest;
}

// Refuses a file with a message, and forgets it so the same file can be picked again later
function rejectFile(message) {
    setUploadError(message);
    const input = createEl("fileInput");
    if (input) input.value = "";
}

// Checks the chosen photo, shrinks it, and shows it in place of the upload prompt
async function showPreview(file) {
    setUploadError("");
    // Only JPG, PNG and WebP photos. GIFs and videos get their own clearer messages.
    if (file.type === "image/gif") return rejectFile("GIFs aren't supported. Please choose a JPG, PNG or WebP photo.");
    if (file.type.startsWith("video/")) return rejectFile("Videos aren't supported. Please choose a JPG, PNG or WebP photo.");
    if (!PHOTO_TYPES_ALLOWED.includes(file.type)) return rejectFile("Please choose a JPG, PNG or WebP photo.");

    const request = ++previewRequest;
    let result;
    try {
        result = await shrinkPhoto(file);
    } catch (error) {
        if (request === previewRequest) rejectFile("Couldn't read that photo. Please try a different one.");
        return;
    }
    if (request !== previewRequest) return;   // another photo was chosen (or the pop-up closed) meanwhile
    if (result.blob.size > PHOTO_MAX_BYTES) return rejectFile("That photo is still over 2 MB after shrinking. Please choose a different one.");

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedFile = new File([result.blob], "photo.jpg", { type: "image/jpeg" });   // this smaller copy is what gets uploaded
    selectedSize = { width: result.width, height: result.height };
    previewUrl = URL.createObjectURL(result.blob);   // a temporary address that lets the page show the photo
    createEl("previewImage").src = previewUrl;
    createEl("uploadContainer").hidden = true;
    createEl("uploadPreview").hidden = false;
    updatePostButton();
}

// Back to the empty upload prompt
function clearPreview() {
    previewRequest++;   // cancels a photo that is still being shrunk
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selectedFile = null;
    const input = createEl("fileInput");
    if (input) input.value = "";
    const preview = createEl("uploadPreview");
    if (preview) preview.hidden = true;
    const prompt = createEl("uploadContainer");
    if (prompt) prompt.hidden = false;
    setUploadError("");
    updatePostButton();
}

// Closes the pop-up and empties it, ready for next time
function closeCreateModal() {
    closeModal("overlayModal");
    clearPreview();
    createEl("captionInput").value = "";
    updateCaptionCount();
}

// Updates the character counter under the caption
function updateCaptionCount() {
    const input = createEl("captionInput");
    createEl("captionCount").textContent = `${input.value.length}/${captionLimit}`;
}

// The text on the Post button: "Share story" when adding a story, otherwise "Post"
function postButtonLabel() {
    return createModal.dataset.target === "story" ? "Share story" : "Post";
}

// Changes the pop-up to suit what is being created (a post or a story)
function applyCreateTarget() {
    const isStory = createModal.dataset.target === "story";
    createEl("createTitle").textContent = isStory ? "Add to your story" : "Create new post";
    captionLimit = isStory ? 150 : 300;
    const caption = createEl("captionInput");
    caption.maxLength = captionLimit;
    caption.placeholder = isStory ? "Add a caption (optional)..." : "Write a caption...";
    createEl("postBtn").textContent = postButtonLabel();
    updateCaptionCount();
}

// Shows YOUR @username and profile picture above the caption. It asks the server every time the pop-up opens and never
// remembers the answer, so it can't show the name of someone who was logged in earlier.
async function loadCreateUsername() {
    // Reset first, so a previous person's name or picture is never left on screen while the answer loads
    createEl("createUsername").textContent = "@username";
    createEl("createAvatar").src = avatarPlaceholder();

    try {
        const response = await fetch("/api/profile");   // answers with whoever the session cookie says is logged in
        if (!response.ok) return;                       // not logged in: the placeholder stays
        const profile = await response.json();
        createEl("createUsername").textContent = `@${profile.username}`;
        createEl("createAvatar").src = profile.avatarUrl || avatarPlaceholder(profile);
    } catch (error) {
        // The placeholder stays
    }
}

// The pop-up is opened by main.js's openModal, which only changes its display, so this watches for that
const createModal = createEl("overlayModal");
if (createModal) {
    new MutationObserver(() => {
        if (createModal.style.display === "block") {
            applyCreateTarget();
            loadCreateUsername();
            createEl("closeUpload").focus();
        }
    }).observe(createModal, { attributes: true, attributeFilter: ["style"] });
}

document.addEventListener("change", (e) => {
    if (e.target.id === "fileInput" && e.target.files[0]) showPreview(e.target.files[0]);
});

// Dragging a photo onto the upload area
document.addEventListener("dragover", (e) => {
    if (e.target.closest("#uploadContainer")) {
        e.preventDefault();
        createEl("uploadContainer").classList.add("dragging");
    }
});

document.addEventListener("dragleave", (e) => {
    if (e.target.closest("#uploadContainer")) createEl("uploadContainer").classList.remove("dragging");
});

document.addEventListener("drop", (e) => {
    if (!e.target.closest("#uploadContainer")) return;
    e.preventDefault();
    createEl("uploadContainer").classList.remove("dragging");
    if (e.dataTransfer.files[0]) showPreview(e.dataTransfer.files[0]);
});

document.addEventListener("input", (e) => {
    if (e.target.id === "captionInput") updateCaptionCount();
});

// data-target records where the post goes (feed, Daily Challenge or story). The sidebar's Create link opens the pop-up from main.js;
// the Daily Challenge's "Add post" button opens the same pop-up here.
document.addEventListener("click", (e) => {
    if (!createModal) return;
    if (e.target.closest("#addPostBtn")) {
        createModal.dataset.target = "challenge";
        openModal("overlayModal");
    } else if (e.target.closest("#create")) {
        createModal.dataset.target = "feed";
    }
});

document.addEventListener("click", (e) => {
    if (!createModal || createModal.style.display !== "block") return;

    // The X button, or a click on the dark area around the pop-up
    if (e.target === createModal || e.target.closest("#closeUpload")) return closeCreateModal();
    if (e.target.closest("#removeImage")) return clearPreview();
    if (e.target.closest("#postBtn") && previewUrl) submitPost();
});

// Sends the post to the server. On success the pop-up closes and the page you are on is refreshed to show it.
async function submitPost() {
    const button = createEl("postBtn");
    const form = new FormData();
    form.append("image", selectedFile);
    form.append("caption", createEl("captionInput").value.trim());
    // Stories go to their own route and have no post "type"
    const isStory = createModal.dataset.target === "story";
    if (!isStory) form.append("type", createModal.dataset.target === "challenge" ? "challenge" : "feed");
    // The size of the shrunk photo, so the feed can lay the grid out before the photo has loaded
    form.append("width", selectedSize.width);
    form.append("height", selectedSize.height);

    setUploadError("");
    button.disabled = true;
    button.textContent = "Posting...";
    try {
        const response = await fetch(isStory ? "/api/stories" : "/api/posts", { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
            closeCreateModal();
            navigateTo(window.location.hash);   // shows the page again, now with the new post
            return;
        }
        if (response.status === 401) setUploadError(isStory ? "Log in to add a story." : "Log in to post.");
        else setUploadError((data.errors && Object.values(data.errors)[0]) || data.message || "Something went wrong. Please try again.");
    } catch (error) {
        setUploadError("Couldn't reach the server. Please try again.");
    } finally {
        button.textContent = postButtonLabel();
        updatePostButton();
    }
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && createModal && createModal.style.display === "block") closeCreateModal();
});
