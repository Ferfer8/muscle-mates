// Two reusable pop-ups: confirmDialog ("Are you sure?", with an optional password box, returns a promise) and noticeDialog (information with one "Got it" button).
// Both handle Escape and Tab so only the pop-up on top reacts.

// Shows an "Are you sure?" box. onConfirm (optional, may be async) runs when the red button is pressed: if it returns text, that text is shown as an error
// and the box stays open, otherwise it closes. Resolves true if confirmed, false if cancelled. Escape is caught first so a pop-up underneath doesn't close too.
function confirmDialog({ title, message, confirmLabel = "Delete", askPassword = false, onConfirm = null }) {
    return new Promise((resolve) => {
        const opener = document.activeElement;

        const overlay = document.createElement("div");
        overlay.className = "confirm-modal";
        overlay.setAttribute("role", "alertdialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "confirmTitle");
        overlay.setAttribute("aria-describedby", "confirmMessage");

        const box = document.createElement("div");
        box.className = "confirm-box";

        const icon = document.createElement("span");
        icon.className = "confirm-icon";
        icon.innerHTML = "<i class='bx bx-trash'></i>";

        const heading = document.createElement("h2");
        heading.id = "confirmTitle";
        heading.textContent = title;

        const text = document.createElement("p");
        text.id = "confirmMessage";
        text.className = "confirm-message";
        text.textContent = message;   // plain text, never HTML

        box.append(icon, heading, text);

        let password = null;
        if (askPassword) {
            password = document.createElement("input");
            password.type = "password";
            password.className = "confirm-password";
            password.placeholder = "Your password";
            password.autocomplete = "current-password";
            password.setAttribute("aria-label", "Your password");
            box.appendChild(password);
        }

        const error = document.createElement("p");
        error.className = "confirm-error";
        error.setAttribute("role", "alert");
        box.appendChild(error);

        const buttons = document.createElement("div");
        buttons.className = "confirm-buttons";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "confirm-cancel";
        cancel.textContent = "Cancel";
        const ok = document.createElement("button");
        ok.type = "button";
        ok.className = "confirm-ok";
        ok.textContent = confirmLabel;
        buttons.append(cancel, ok);
        box.appendChild(buttons);
        overlay.appendChild(box);

        function finish(result) {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            if (opener && document.body.contains(opener)) opener.focus();
            resolve(result);
        }

        async function accept() {
            if (!onConfirm) return finish(true);
            ok.disabled = true;
            error.textContent = "";
            let problem = null;
            try {
                problem = await onConfirm(password ? password.value : "");
            } catch (failure) {
                problem = "Couldn't reach the server. Please try again.";
            }
            if (problem) {
                error.textContent = problem;
                ok.disabled = false;
                (password || cancel).focus();
            } else {
                finish(true);
            }
        }

        function onKey(e) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();   // the pop-up underneath must not close as well
                finish(false);
            } else if (e.key === "Tab") {
                // Keeps Tab moving around inside this pop-up only
                const items = [...box.querySelectorAll("input, button:not(:disabled)")];
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            } else if (e.key === "Enter" && password && document.activeElement === password) {
                e.preventDefault();
                accept();
            }
        }

        cancel.addEventListener("click", () => finish(false));
        ok.addEventListener("click", accept);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(false); });
        document.addEventListener("keydown", onKey, true);

        document.body.appendChild(overlay);
        (password || cancel).focus();
    });
}

// Information pop-up with one "Got it" button, styled like confirmDialog but purple. Used on the forgot-password page to say no real email is sent.
// Resolves when it is closed (the button, Escape or a click outside).
function noticeDialog({ title, message }) {
    return new Promise((resolve) => {
        const opener = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "confirm-modal notice-modal";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "noticeTitle");

        const box = document.createElement("div");
        box.className = "confirm-box";
        const icon = document.createElement("span");
        icon.className = "confirm-icon";
        icon.innerHTML = "<i class='bx bx-info-circle'></i>";
        const heading = document.createElement("h2");
        heading.id = "noticeTitle";
        heading.textContent = title;
        const text = document.createElement("p");
        text.className = "confirm-message";
        text.textContent = message;
        const ok = document.createElement("button");
        ok.type = "button";
        ok.className = "confirm-ok";
        ok.textContent = "Got it";
        const buttons = document.createElement("div");
        buttons.className = "confirm-buttons";
        buttons.appendChild(ok);
        box.append(icon, heading, text, buttons);
        overlay.appendChild(box);

        function close() {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            if (opener && document.body.contains(opener)) opener.focus();
            resolve();
        }
        function onKey(e) {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === "Tab") { e.preventDefault(); ok.focus(); }   // the only control is the button
        }
        ok.addEventListener("click", close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(overlay);
        ok.focus();
    });
}
