// Login, forgot-password and reset-password forms: validation and the calls to the auth API.
// Listeners are on the document because the pages are re-rendered on navigation.

const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Shows (or clears, if message is empty) the error under a field
function setAuthError(inputId, message) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(`${inputId}Error`);
    if (!input || !error) return;
    error.textContent = message;
    input.classList.toggle("invalid", message !== "");
    input.setAttribute("aria-invalid", message !== "" ? "true" : "false");
}

// Shows a general message above a form's button (an element with the given id)
function setAuthMessage(id, message) {
    const element = document.getElementById(id);
    if (element) element.textContent = message;
}

// Sends JSON to the server and returns { ok, status, data }
async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

// Shows server-side field errors; returns the id of the first field with an error
function applyServerErrors(errors, fieldMap) {
    let firstInvalid = null;
    Object.entries(errors || {}).forEach(([key, message]) => {
        const id = fieldMap[key];
        if (id) {
            setAuthError(id, message);
            if (firstInvalid === null) firstInvalid = id;
        }
    });
    return firstInvalid;
}

// Disables a form's button while a request is running
function setBusy(form, busy, busyText) {
    const button = form.querySelector("button[type='submit']");
    if (busy) {
        button.dataset.label = button.textContent;
        button.textContent = busyText;
    } else {
        button.textContent = button.dataset.label || button.textContent;
    }
    button.disabled = busy;
}

const NETWORK_ERROR = "Couldn't reach the server. Please check your connection and try again.";

// ---------- Login ----------
async function handleLogin(form) {
    setAuthMessage("loginError", "");
    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    setAuthError("identifier", identifier ? "" : "Enter your username or email");
    setAuthError("password", password ? "" : "Enter your password");
    if (!identifier) return document.getElementById("identifier").focus();
    if (!password) return document.getElementById("password").focus();

    setBusy(form, true, "Logging in...");
    try {
        const { ok, data } = await postJson("/api/login", { identifier, password });
        if (ok) {
            window.location.hash = "#/feed";
            return;
        }
        const first = applyServerErrors(data.errors, { identifier: "identifier", password: "password" });
        if (first) document.getElementById(first).focus();
        else setAuthMessage("loginError", data.message || "Something went wrong. Please try again.");
    } catch (error) {
        setAuthMessage("loginError", NETWORK_ERROR);
    } finally {
        setBusy(form, false);
    }
}

// ---------- Forgot password ----------
async function handleForgotPassword(form) {
    setAuthMessage("forgotError", "");
    const success = document.getElementById("forgotSuccess");
    success.hidden = true;

    const email = document.getElementById("resetEmail").value.trim();
    let message = "";
    if (!email) message = "Enter your email address";
    else if (!AUTH_EMAIL_PATTERN.test(email)) message = "Enter a valid email address";
    setAuthError("resetEmail", message);
    if (message) return document.getElementById("resetEmail").focus();

    setBusy(form, true, "Sending...");
    try {
        const { ok, data } = await postJson("/api/forgot-password", { email });
        if (ok) {
            success.textContent = data.message;
            success.hidden = false;

            // This is a portfolio demo, so tell the visitor no real email is sent (noticeDialog is in confirm.js).
            // data.demo is true on the hosted site, where the server doesn't even try to send; locally the email goes to Ethereal.
            noticeDialog({
                title: "Demo project: no real email",
                message: data.demo
                    ? "MuscleMate is a portfolio project, so it doesn't send real emails and passwords can't be reset on this demo. Nothing will arrive in your inbox."
                    : "MuscleMate is a portfolio project, so it doesn't send real emails. The reset email is caught by Ethereal, a fake inbox for developers, and its link is printed in the server's terminal. You won't receive anything in your own inbox."
            });
        } else {
            const first = applyServerErrors(data.errors, { email: "resetEmail" });
            if (!first) setAuthMessage("forgotError", data.message || "Something went wrong. Please try again.");
        }
    } catch (error) {
        setAuthMessage("forgotError", NETWORK_ERROR);
    } finally {
        setBusy(form, false);
    }
}

// ---------- Reset password ----------

// Checks the new password fields; returns the id of the first invalid one (or null)
function validateResetFields() {
    const password = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmNewPassword").value;

    let passwordMessage = "";
    if (!password) passwordMessage = "Enter a new password";
    else if (password.length < 8) passwordMessage = "Password must be at least 8 characters";
    else if (password.length > 128) passwordMessage = "Password must be 128 characters or fewer";

    let confirmMessage = "";
    if (!confirm) confirmMessage = "Confirm your new password";
    else if (confirm !== password) confirmMessage = "Passwords do not match";

    setAuthError("newPassword", passwordMessage);
    setAuthError("confirmNewPassword", confirmMessage);
    if (passwordMessage) return "newPassword";
    return confirmMessage ? "confirmNewPassword" : null;
}

// Submits the new password along with the token from the link
async function handleResetPassword(form) {
    setAuthMessage("resetError", "");
    const firstInvalid = validateResetFields();
    if (firstInvalid) return document.getElementById(firstInvalid).focus();

    // The token comes from the link in the email: #/reset-password?token=...
    const token = new URLSearchParams(window.location.hash.split("?")[1] || "").get("token") || "";

    setBusy(form, true, "Updating...");
    try {
        const { ok, data } = await postJson("/api/reset-password", {
            token,
            password: document.getElementById("newPassword").value,
            confirmPassword: document.getElementById("confirmNewPassword").value
        });
        if (ok) {
            try {
                sessionStorage.setItem("authMessage", "Password updated! Log in with your new password.");
            } catch (error) {
                // The login page just won't show the confirmation message
            }
            window.location.hash = "#/login";
            return;
        }
        const first = applyServerErrors(data.errors, { password: "newPassword", confirmPassword: "confirmNewPassword" });
        if (first) document.getElementById(first).focus();
        else setAuthMessage("resetError", data.message || "Something went wrong. Please try again.");
    } catch (error) {
        setAuthMessage("resetError", NETWORK_ERROR);
    } finally {
        setBusy(form, false);
    }
}

document.addEventListener("submit", (e) => {
    const handlers = { lForm: handleLogin, fForm: handleForgotPassword, rForm: handleResetPassword };
    const handler = handlers[e.target.id];
    if (!handler) return;
    e.preventDefault();
    handler(e.target);
});

// Clears a field's error as soon as the user edits it
document.addEventListener("input", (e) => {
    const form = e.target.closest("#lForm, #fForm, #rForm");
    if (!form) return;

    if (form.id === "lForm") {
        setAuthError(e.target.id, "");
        setAuthMessage("loginError", "");
    } else if (form.id === "fForm") {
        setAuthError("resetEmail", "");
        setAuthMessage("forgotError", "");
    } else {
        validateResetFieldsLive(e.target.id);
        setAuthMessage("resetError", "");
    }
});

// On the reset page, the match check updates live once the confirm field has text
function validateResetFieldsLive(changedId) {
    const confirm = document.getElementById("confirmNewPassword");
    const password = document.getElementById("newPassword");
    if (changedId === "newPassword") setAuthError("newPassword", "");
    if (confirm.value !== "" && (changedId === "confirmNewPassword" || changedId === "newPassword")) {
        setAuthError("confirmNewPassword", confirm.value !== password.value ? "Passwords do not match" : "");
    } else if (changedId === "confirmNewPassword") {
        setAuthError("confirmNewPassword", "");
    }
}
