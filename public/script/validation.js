// Sign-up form: client-side validation (the same rules as the server), inline error messages and the call to POST /api/users.

const MIN_PASSWORD_LENGTH = 8;
const MIN_AGE = 16;

const NAME_PATTERN = /^[\p{L}][\p{L}\s'’-]*$/u;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Fields in the order they appear on the form, so the first error can be focused
const SIGNUP_FIELDS = ["firstName", "lastName", "email", "username", "gender", "birthdate", "password", "confirmPassword", "terms"];

// Returns the element that shows the error message for a field
function errorElementFor(id) {
    const ids = { password: "passwordHint", confirmPassword: "confirmError" };
    return document.getElementById(ids[id] || `${id}Error`);
}

// Shows (or clears, if message is empty) the error for a field
function setFieldError(id, message) {
    const input = document.getElementById(id);
    const error = errorElementFor(id);
    if (!input || !error) return;

    // The password hint is permanent text, so it only turns red
    if (id === "password") {
        error.classList.toggle("invalid", message !== "");
    } else {
        error.textContent = message;
    }
    input.classList.toggle("invalid", message !== "");
    input.setAttribute("aria-invalid", message !== "" ? "true" : "false");
}

// Returns the age in whole years for a YYYY-MM-DD string, or null if it is not a real date
function ageFromBirthdate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

    const today = new Date();
    let age = today.getFullYear() - year;
    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
    return age;
}

// Each validator returns an error message, or an empty string if the value is fine
const validators = {
    firstName(value) {
        if (!value) return "Enter your first name";
        if (value.length > 50 || !NAME_PATTERN.test(value)) return "Use letters, spaces, hyphens or apostrophes only";
        return "";
    },
    lastName(value) {
        if (!value) return "Enter your last name";
        if (value.length > 50 || !NAME_PATTERN.test(value)) return "Use letters, spaces, hyphens or apostrophes only";
        return "";
    },
    email(value) {
        if (!value) return "Enter your email address";
        if (value.length > 254 || !EMAIL_PATTERN.test(value)) return "Enter a valid email address";
        return "";
    },
    username(value) {
        if (!value) return "Choose a username";
        if (!USERNAME_PATTERN.test(value)) return "Use 3-20 letters, numbers or underscores";
        return "";
    },
    gender(value) {
        return value ? "" : "Select an option";
    },
    birthdate(value) {
        if (!value) return "Enter your date of birth";
        const age = ageFromBirthdate(value);
        if (age === null || age > 120) return "Enter a valid date of birth";
        if (age < 0) return "Date of birth can't be in the future";
        if (age < MIN_AGE) return `You must be at least ${MIN_AGE} years old to sign up`;
        return "";
    },
    password(value) {
        if (value.length < MIN_PASSWORD_LENGTH) return "Password must be at least 8 characters";
        if (value.length > 128) return "Password must be 128 characters or fewer";
        return "";
    },
    confirmPassword(value) {
        if (!value) return "Confirm your password";
        if (value !== document.getElementById("password").value) return "Passwords do not match";
        return "";
    },
    terms(checked) {
        return checked ? "" : "You must agree to the Terms & Conditions";
    }
};

// Reads a field's value; text fields are trimmed except passwords
function fieldValue(id) {
    const input = document.getElementById(id);
    if (id === "terms") return input.checked;
    return id === "password" || id === "confirmPassword" ? input.value : input.value.trim();
}

// Validates one field and shows its error. Returns true if the field is valid
function validateField(id) {
    const message = validators[id](fieldValue(id));
    setFieldError(id, message);
    return message === "";
}

// Validates the whole form and returns the id of the first invalid field (or null)
function validateSignupForm() {
    let firstInvalid = null;
    SIGNUP_FIELDS.forEach((id) => {
        if (!validateField(id) && firstInvalid === null) firstInvalid = id;
    });
    return firstInvalid;
}

// Shows a general (non-field) error above the Create account button
function setFormError(message) {
    const formError = document.getElementById("formError");
    if (formError) formError.textContent = message;
}

// Sends the signup details to the server
async function submitSignup(form) {
    const button = form.querySelector("button[type='submit']");
    const buttonText = button.textContent;
    button.disabled = true;
    button.textContent = "Creating account...";

    const payload = {};
    SIGNUP_FIELDS.forEach((id) => { payload[id] = fieldValue(id); });

    try {
        const response = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            try {
                sessionStorage.setItem("authMessage", "Account created! Log in to continue.");
            } catch (error) {
                // The login page just won't show the confirmation message
            }
            window.location.hash = "#/login";
            return;
        }

        // Server-side validation errors (including duplicate email or username)
        if (data.errors) {
            let firstInvalid = null;
            SIGNUP_FIELDS.forEach((id) => {
                if (data.errors[id]) {
                    setFieldError(id, data.errors[id]);
                    if (firstInvalid === null) firstInvalid = id;
                }
            });
            if (firstInvalid) document.getElementById(firstInvalid).focus();
        } else {
            setFormError(data.message || "Something went wrong. Please try again.");
        }
    } catch (error) {
        setFormError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
        button.disabled = false;
        button.textContent = buttonText;
    }
}

// The signup page is re-rendered on navigation, so listeners are delegated from the document
document.addEventListener("submit", (e) => {
    if (e.target.id !== "sForm") return;

    e.preventDefault();
    setFormError("");

    const firstInvalid = validateSignupForm();
    if (firstInvalid) {
        document.getElementById(firstInvalid).focus();
        return;
    }
    submitSignup(e.target);
});

// Validates a field when the user leaves it
document.addEventListener("focusout", (e) => {
    if (!e.target.closest("#sForm") || !validators[e.target.id] || e.target.type === "checkbox") return;
    // An untouched, empty field isn't flagged just for being tabbed through
    if (e.target.value === "" && !e.target.classList.contains("invalid")) return;
    validateField(e.target.id);
    if (e.target.id === "password" && document.getElementById("confirmPassword").value !== "") validateField("confirmPassword");
});

// Re-checks fields as the user types or changes them
document.addEventListener("input", (e) => {
    if (!e.target.closest("#sForm")) return;
    const id = e.target.id;
    setFormError("");

    if (id === "password") {
        // Hint turns red once something is typed that is too short
        setFieldError("password", e.target.value !== "" && e.target.value.length < MIN_PASSWORD_LENGTH ? "short" : "");
        if (document.getElementById("confirmPassword").value !== "") validateField("confirmPassword");
    } else if (id === "confirmPassword") {
        validateField("confirmPassword");
    } else if (validators[id] && e.target.classList.contains("invalid")) {
        validateField(id);
    }
});

document.addEventListener("change", (e) => {
    if (!e.target.closest("#sForm")) return;
    if (e.target.id === "gender" || e.target.id === "birthdate" || e.target.id === "terms") {
        validateField(e.target.id);
        setFormError("");
    }
});

// Show/hide password toggle
document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".toggle-pw");
    if (!toggle) return;

    const input = document.getElementById(toggle.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    toggle.querySelector("i").className = show ? "bx bx-hide" : "bx bx-show";
});
