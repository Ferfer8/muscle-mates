// Credits pop-up, opened from the sidebar's Credits link. Lists the third-party assets used (Flaticon icon, Pexels photos and video, Tenor GIF, Boxicons)
// with links to their sources. Closes with the X, Escape or a click outside.

// The pop-up's content. It is fixed text written here (nothing typed by a user), so it is safe to put in as HTML.
const CREDITS_HTML = `
    <button type="button" class="credits-close" aria-label="Close credits"><i class='bx bx-x'></i></button>
    <h2 id="creditsTitle">Credits</h2>
    <p class="credits-intro">Muscle Mates uses the following work by other people. Thank you to everyone who shares it.</p>

    <section class="credit-item">
        <a class="credit-image" href="https://www.flaticon.com/free-icon/add-image_5007662" target="_blank" rel="noopener noreferrer" aria-label="Open the add image icon on Flaticon">
            <img src="assets/upload.png" width="72" height="72" alt="The add image icon used on the upload button">
        </a>
        <div class="credit-text">
            <h3>Upload icon</h3>
            <p class="credit-meta">From: Flaticon &middot; Creator: mim_studio</p>
            <p><a href="https://www.flaticon.com/free-icons/add-image" title="add image icons" target="_blank" rel="noopener noreferrer">Add image icons created by mim_studio - Flaticon</a></p>
        </div>
    </section>

    <section class="credit-item">
        <a class="credit-logo" href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Pexels">Pexels</a>
        <div class="credit-text">
            <h3>Photos and videos</h3>
            <p class="credit-meta">From: Pexels</p>
            <p>The photos on the demo users' posts and the video on the login and sign-up pages are from
               <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Pexels</a>.
               Pexels doesn't require attribution, but I decided to credit them anyway.</p>
        </div>
    </section>

    <section class="credit-item">
        <a class="credit-logo" href="https://tenor.com/en-GB/view/cat-meme-working-out-workout-situp-cat-gif-25374202" target="_blank" rel="noopener noreferrer" aria-label="Open the GIF on Tenor">Tenor</a>
        <div class="credit-text">
            <h3>GIF in the Terms &amp; Conditions</h3>
            <p class="credit-meta">From: Tenor &middot; Creator: bezorp</p>
            <p><a href="https://tenor.com/en-GB/view/cat-meme-working-out-workout-situp-cat-gif-25374202" target="_blank" rel="noopener noreferrer">Cat Meme GIF by bezorp on Tenor</a></p>
        </div>
    </section>

    <section class="credit-item">
        <a class="credit-logo" href="https://boxicons.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Boxicons">Boxicons</a>
        <div class="credit-text">
            <h3>Icons</h3>
            <p class="credit-meta">From: Boxicons</p>
            <p>The sidebar and button icons are from <a href="https://boxicons.com" target="_blank" rel="noopener noreferrer">Boxicons</a>.
               Boxicons doesn't require attribution, but I decided to credit them anyway.</p>
        </div>
    </section>`;

let creditsOpener = null;   // the link that opened the pop-up, so focus can go back to it

// Builds and shows the pop-up (opener is the link that opened it)
function openCredits(opener) {
    if (document.getElementById("creditsModal")) return;
    creditsOpener = opener;

    const overlay = document.createElement("div");
    overlay.className = "credits-modal";
    overlay.id = "creditsModal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "creditsTitle");

    const card = document.createElement("div");
    card.className = "credits-card";
    card.innerHTML = CREDITS_HTML;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector(".credits-close").focus();
}

// Closes the pop-up and returns focus to the link
function closeCredits() {
    const modal = document.getElementById("creditsModal");
    if (!modal) return;
    modal.remove();
    if (creditsOpener && document.body.contains(creditsOpener)) creditsOpener.focus();
    creditsOpener = null;
}

document.addEventListener("click", (e) => {
    const link = e.target.closest("#creditsLink");
    if (link) {
        e.preventDefault();   // it is a "#" link, so it must not jump to the top of the page or change the route
        return openCredits(link);
    }

    const modal = document.getElementById("creditsModal");
    if (modal && (e.target === modal || e.target.closest(".credits-close"))) closeCredits();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCredits();
});

// Moving to another page closes it too
window.addEventListener("hashchange", closeCredits);
