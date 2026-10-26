// Express server: serves the frontend from /public, handles the JSON API (auth, users, posts, stories, messages) and runs the Socket.IO chat.
// Data lives in MongoDB Atlas (post photos in GridFS). Settings come from .env.

require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId, Binary, GridFSBucket } = require('mongodb');   // Binary stores profile pictures; GridFSBucket stores post and story photos
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { quoteOfTheDay } = require('./quotes');
const { challengeOfTheDay } = require('./public/script/challenges');
const PORT = process.env.PORT || 8042;
const DB_NAME = process.env.DB_NAME || 'musclemates';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const SESSION_COOKIE = 'mm_session';
const SESSION_DAYS = 7;
const RESET_MINUTES = 15;

const app = express();
const httpServer = http.createServer(app);   // Socket.IO attaches to this, Express handles the normal routes
const io = new Server(httpServer);

// Security headers. The CSP only allows the site's own server plus unpkg (icon font) and tenor (GIF), so injected scripts can't run or send data out.
// Inline scripts are blocked; inline styles are allowed because some pop-ups set sizes with style attributes.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://tenor.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
            fontSrc: ["'self'", 'https://unpkg.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],   // data: = initials avatars, blob: = the photo preview, https: = Tenor
            mediaSrc: ["'self'", 'blob:'],
            connectSrc: ["'self'"],                           // fetch requests and the chat's WebSocket, both to the site's own server
            frameSrc: ['https://tenor.com', 'https://*.tenor.com'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            // Helmet's default HTTPS upgrade would break running over plain http://localhost, so it is only used in production
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    }
}));
app.use(express.json());

// Sent from here, ahead of the static files, so the link-preview tags can carry the real BASE_URL (previews need full addresses).
// Built on the first request, then reused.
let homePage = null;
app.get(['/', '/index.html'], (req, res) => {
    if (!homePage) {
        homePage = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replace(/__BASE_URL__/g, BASE_URL.replace(/\/$/, ''));
    }
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(homePage);
});

app.use(express.static(path.join(__dirname, "public")));

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

const MIN_AGE = 16;
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const NAME_PATTERN = /^[\p{L}][\p{L}\s'’-]*$/u;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Hashes a password with a random salt using Node's built-in scrypt
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Checks a password against a stored "salt:hash" string in constant time
function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(':');
    if (!salt || !hash) return false;
    const attempt = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
}

// Hashes a one-time token (session or reset) so the database never holds the usable value
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Checks the password rules shared by signup and password reset
function validateNewPassword(password, confirmPassword) {
    const errors = {};
    if (!password) errors.password = 'Enter a password';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (password.length > 128) errors.password = 'Password must be 128 characters or fewer';

    if (!confirmPassword) errors.confirmPassword = 'Confirm your password';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
    return errors;
}

// Returns the age in whole years for a YYYY-MM-DD date, or null if the date is invalid
function ageFromBirthdate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

    const today = new Date();
    let age = today.getUTCFullYear() - year;
    if (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)) age--;
    return age;
}

// Validates the signup body and returns an object of field errors (empty if valid)
function validateSignup(body) {
    const errors = {};
    const { firstName, lastName, email, username, gender, birthdate, password, confirmPassword, terms } = body;

    if (!firstName) errors.firstName = 'Enter your first name';
    else if (firstName.length > 50 || !NAME_PATTERN.test(firstName)) errors.firstName = 'Use letters, spaces, hyphens or apostrophes only';

    if (!lastName) errors.lastName = 'Enter your last name';
    else if (lastName.length > 50 || !NAME_PATTERN.test(lastName)) errors.lastName = 'Use letters, spaces, hyphens or apostrophes only';

    if (!email) errors.email = 'Enter your email address';
    else if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address';

    if (!username) errors.username = 'Choose a username';
    else if (!USERNAME_PATTERN.test(username)) errors.username = 'Use 3-20 letters, numbers or underscores';

    if (!GENDERS.includes(gender)) errors.gender = 'Select an option';

    const age = ageFromBirthdate(birthdate);
    if (!birthdate) errors.birthdate = 'Enter your date of birth';
    else if (age === null) errors.birthdate = 'Enter a valid date of birth';
    else if (age < 0) errors.birthdate = "Date of birth can't be in the future";
    else if (age < MIN_AGE) errors.birthdate = `You must be at least ${MIN_AGE} years old to sign up`;
    else if (age > 120) errors.birthdate = 'Enter a valid date of birth';

    Object.assign(errors, validateNewPassword(password, confirmPassword));

    if (terms !== true) errors.terms = 'You must agree to the Terms & Conditions';

    return errors;
}

// POST to create a new user (signup)
app.post('/api/users', async (req, res) => {
    try {
        const body = req.body || {};

        // Trims text fields; passwords are left exactly as typed
        const clean = {
            firstName: String(body.firstName ?? '').trim(),
            lastName: String(body.lastName ?? '').trim(),
            email: String(body.email ?? '').trim().toLowerCase(),
            username: String(body.username ?? '').trim(),
            gender: String(body.gender ?? ''),
            birthdate: String(body.birthdate ?? ''),
            password: String(body.password ?? ''),
            confirmPassword: String(body.confirmPassword ?? ''),
            terms: body.terms
        };

        const errors = validateSignup(clean);
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ errors });
        }

        const users = client.db(DB_NAME).collection('users');

        // Checks for an existing email or username (case-insensitive)
        const usernameLower = clean.username.toLowerCase();
        const existing = await users.find({ $or: [{ email: clean.email }, { usernameLower }] }).toArray();
        const duplicates = {};
        if (existing.some(user => user.email === clean.email)) duplicates.email = 'An account with this email already exists';
        if (existing.some(user => user.usernameLower === usernameLower)) duplicates.username = 'This username is already taken';
        if (Object.keys(duplicates).length > 0) {
            return res.status(409).json({ errors: duplicates });
        }

        await users.insertOne({
            firstName: clean.firstName,
            lastName: clean.lastName,
            username: clean.username,
            usernameLower,
            email: clean.email,
            gender: clean.gender,
            birthdate: new Date(`${clean.birthdate}T00:00:00Z`),
            passwordHash: hashPassword(clean.password),
            createdAt: new Date()
        });

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        // A unique index catches a duplicate that slipped in between the check and the insert
        if (error.code === 11000) {
            const field = error.message.includes('usernameLower') ? 'username' : 'email';
            const message = field === 'username' ? 'This username is already taken' : 'An account with this email already exists';
            return res.status(409).json({ errors: { [field]: message } });
        }
        console.error('Signup failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Sessions ----------

// Reads one cookie value from the request
function getCookie(req, name) {
    const cookies = (req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const [key, ...rest] = cookie.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

// Creates a session in the database and sets its cookie (the cookie holds the token, the database its hash)
async function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await client.db(DB_NAME).collection('sessions').insertOne({ tokenHash: hashToken(token), userId, expiresAt });

    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,                                    // JavaScript on the page can't read it
        sameSite: 'lax',                                   // not sent on cross-site POSTs
        secure: process.env.NODE_ENV === 'production',     // HTTPS only when deployed
        expires: expiresAt
    });
}

// Looks up the logged-in user from the session cookie (null if not logged in)
async function getSessionUser(req) {
    const token = getCookie(req, SESSION_COOKIE);
    if (!token) return null;

    const db = client.db(DB_NAME);
    const session = await db.collection('sessions').findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!session) return null;

    return db.collection('users').findOne({ _id: session.userId }, { projection: { passwordHash: 0, usernameLower: 0 } });
}

// Middleware: only lets logged-in users through
async function requireAuth(req, res, next) {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ message: 'Please log in first.' });
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth check failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
}

// Middleware: works out who is logged in, but lets everyone through (req.user is null for visitors)
async function optionalAuth(req, res, next) {
    try {
        req.user = await getSessionUser(req);
        next();
    } catch (error) {
        console.error('Auth check failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
}

// Simple in-memory limiter: stops repeated guesses or email spam (resets on server restart)
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map();
// True once a key has used up its attempts in the current window
function isLimited(key, max = 5) {
    const entry = attempts.get(key);
    if (!entry || entry.resetAt < Date.now()) return false;
    return entry.count >= max;
}
// Counts one attempt, starting a new window if the last one has ended
function recordAttempt(key) {
    const entry = attempts.get(key);
    if (!entry || entry.resetAt < Date.now()) attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
    else entry.count++;
}

// POST to log in with a username or email
app.post('/api/login', async (req, res) => {
    try {
        const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
        const password = String(req.body?.password ?? '');

        const errors = {};
        if (!identifier) errors.identifier = 'Enter your username or email';
        if (!password) errors.password = 'Enter your password';
        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const limitKey = `login:${req.ip}:${identifier}`;
        if (isLimited(limitKey)) {
            return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes and try again.' });
        }

        const user = await client.db(DB_NAME).collection('users')
            .findOne({ $or: [{ email: identifier }, { usernameLower: identifier }] });

        // Always runs the (slow) hash check, even for unknown users, so response time doesn't reveal which exist
        const passwordOk = verifyPassword(password, user ? user.passwordHash : 'ab:cd');

        // The same message for "no such user" and "wrong password", so neither is revealed
        if (!user || !passwordOk) {
            recordAttempt(limitKey);
            return res.status(401).json({ message: 'Incorrect username/email or password.' });
        }

        attempts.delete(limitKey);
        await startSession(res, user._id);
        res.json({ message: 'Logged in!', user: { firstName: user.firstName, username: user.username } });
    } catch (error) {
        console.error('Login failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET the currently logged-in user
app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.user);
});

// POST to log out
app.post('/api/logout', async (req, res) => {
    try {
        const token = getCookie(req, SESSION_COOKIE);
        if (token) await client.db(DB_NAME).collection('sessions').deleteOne({ tokenHash: hashToken(token) });
        res.clearCookie(SESSION_COOKIE);
        res.json({ message: 'Logged out.' });
    } catch (error) {
        console.error('Logout failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Password reset ----------

// Ethereal is a free fake inbox for developers: emails are caught there, never delivered.
// It is only used when running locally. In production (NODE_ENV=production) no email is sent at all, because free hosts such as
// Render block the outgoing mail ports, so the request would just hang until it timed out.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MAIL_TIMEOUT_MS = 8000;   // the longest a reset request waits for the email to be handed over
let mailTransport = null;

// Rejects if a promise takes longer than ms, so a stuck connection can't leave a request hanging
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms); });
    promise.catch(() => {});   // if the timeout wins, a later failure of the original promise is ignored
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Creates the Ethereal test account and mail transport on first use, then reuses it
async function getMailTransport() {
    if (!mailTransport) {
        const account = await nodemailer.createTestAccount();
        mailTransport = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: { user: account.user, pass: account.pass },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 7000
        });
    }
    return mailTransport;
}

// Sends the reset email (text and HTML versions)
async function sendResetEmail(user, link) {
    const transport = await getMailTransport();
    const info = await transport.sendMail({
        from: '"MuscleMate" <no-reply@musclemate.example>',
        to: user.email,
        subject: 'Reset your MuscleMate password',
        text: `Hi ${user.firstName},\n\nSomeone (hopefully you) asked to reset your MuscleMate password. ` +
            `Use this link within ${RESET_MINUTES} minutes:\n\n${link}\n\nDidn't ask for this? Ignore this email and nothing changes.\n\nSee you at the gym,\nMuscleMate`,
        html: `<p>Hi ${user.firstName},</p><p>Someone (hopefully you) asked to reset your MuscleMate password.</p>` +
            `<p><a href="${link}">Reset my password</a> (valid for ${RESET_MINUTES} minutes)</p>` +
            `<p>Didn't ask for this? Ignore this email and nothing changes.</p><p>See you at the gym,<br>MuscleMate</p>`
    });
    // Ethereal gives a link to read the "sent" email; in development that is the only way to see it
    console.log(`Password reset email for ${user.email}: ${nodemailer.getTestMessageUrl(info)}`);
}

// POST to request a reset link
app.post('/api/forgot-password', async (req, res) => {
    // The same reply whether or not the email has an account, so this can't be used to find out which emails are registered
    const reply = { message: "If an account exists for that email, we've sent a reset link." };
    try {
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        if (!email) return res.status(400).json({ errors: { email: 'Enter your email address' } });
        if (!EMAIL_PATTERN.test(email) || email.length > 254) return res.status(400).json({ errors: { email: 'Enter a valid email address' } });

        const limitKey = `forgot:${req.ip}`;
        if (isLimited(limitKey)) {
            return res.status(429).json({ message: 'Too many requests. Please wait 15 minutes and try again.' });
        }
        recordAttempt(limitKey);

        // The hosted demo never sends mail. Answer straight away, without looking anyone up or creating a token, so the
        // reply is instant and says nothing about which emails have accounts. The link or token is never put in a response.
        if (IS_PRODUCTION) {
            return res.json({ message: 'This is a demo project, so no reset email is sent and passwords cannot be reset here.', demo: true });
        }

        const db = client.db(DB_NAME);
        const user = await db.collection('users').findOne({ email });
        if (user) {
            // A random token goes in the email; only its hash is stored
            const token = crypto.randomBytes(32).toString('hex');
            await db.collection('passwordResets').deleteMany({ userId: user._id });
            await db.collection('passwordResets').insertOne({
                userId: user._id,
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000)
            });
            try {
                await withTimeout(sendResetEmail(user, `${BASE_URL}/#/reset-password?token=${token}`), MAIL_TIMEOUT_MS);
            } catch (error) {
                // The link never reached anyone, so the token is removed and the person is told to try again
                console.error('Sending the reset email failed:', error.message);
                await db.collection('passwordResets').deleteMany({ userId: user._id });
                return res.status(503).json({ message: "We couldn't send the reset email just now. Please try again in a moment." });
            }
        }
        res.json(reply);
    } catch (error) {
        console.error('Forgot password failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to set a new password using a reset token
app.post('/api/reset-password', async (req, res) => {
    try {
        const token = String(req.body?.token ?? '');
        const password = String(req.body?.password ?? '');
        const confirmPassword = String(req.body?.confirmPassword ?? '');

        const errors = validateNewPassword(password, confirmPassword);
        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const db = client.db(DB_NAME);
        const reset = await db.collection('passwordResets').findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
        if (!reset) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
        }

        await db.collection('users').updateOne({ _id: reset.userId }, { $set: { passwordHash: hashPassword(password) } });
        // The link works once, and any logins from before the change are signed out
        await db.collection('passwordResets').deleteMany({ userId: reset.userId });
        await db.collection('sessions').deleteMany({ userId: reset.userId });

        res.json({ message: 'Password updated.' });
    } catch (error) {
        console.error('Reset password failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Quote of the day ----------

// GET today's quote (the same for everyone, and it changes at midnight)
app.get('/api/quote-of-the-day', (req, res) => {
    const { text, author, source, url } = quoteOfTheDay();
    res.json({ text, author, source, url });
});

// ---------- Daily challenge ----------

// GET today's challenge (the same for everyone, and it changes at midnight; see challenges.js for how it is chosen)
app.get('/api/daily-challenge', (req, res) => {
    const { title, task, show, date } = challengeOfTheDay();
    res.json({ title, task, show, date });
});

// Creates today's challenge notification the first time you load notifications each day, so no scheduled job is needed.
// The upsert (create if missing) stops duplicates for the same day.
async function ensureDailyChallengeNotification(userId) {
    const { title, task, date } = challengeOfTheDay();
    await collection('notifications').updateOne(
        { userId, type: 'challenge', challengeDate: date },
        { $setOnInsert: { title, task, read: false, createdAt: new Date() } },
        { upsert: true }
    );
}

// ---------- User search and following ----------

// Makes user-typed text safe to put inside a regular expression
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET to search for other users by name or username
app.get('/api/users/search', requireAuth, async (req, res) => {
    try {
        const query = String(req.query.q ?? '').trim().slice(0, 50);
        if (!query) return res.json([]);

        // Every word typed must match the start of a first name, last name or username ("sam le" finds Sam Lee)
        const words = query.split(/\s+/).map(word => new RegExp('^' + escapeRegex(word), 'i'));
        const db = client.db(DB_NAME);
        const users = await db.collection('users').find({
            _id: { $ne: req.user._id },
            $and: words.map(word => ({ $or: [{ firstName: word }, { lastName: word }, { username: word }] }))
        }, { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 }, limit: 8 }).toArray();

        // Marks the users the searcher already follows, or has asked to follow
        const ids = users.map(user => user._id);
        const follows = await db.collection('follows').find({ followerId: req.user._id, followingId: { $in: ids } }).toArray();
        const requests = await db.collection('followRequests').find({ requesterId: req.user._id, targetId: { $in: ids } }).toArray();
        const followingIds = new Set(follows.map(follow => String(follow.followingId)));
        const requestedIds = new Set(requests.map(request => String(request.targetId)));

        res.json(users.map(user => ({
            id: String(user._id),
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            avatarUrl: avatarUrlFor(user),
            following: followingIds.has(String(user._id)),
            status: followingIds.has(String(user._id)) ? 'following' : requestedIds.has(String(user._id)) ? 'requested' : 'none'
        })));
    } catch (error) {
        console.error('User search failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET your mates: people you follow who also follow you back
app.get('/api/mates', requireAuth, async (req, res) => {
    try {
        const db = client.db(DB_NAME);
        const following = await db.collection('follows').find({ followerId: req.user._id }).toArray();
        const followingIds = following.map(follow => follow.followingId);

        // Of the people you follow, the ones who also follow you
        const followBack = await db.collection('follows')
            .find({ followingId: req.user._id, followerId: { $in: followingIds } })
            .toArray();

        const mates = await db.collection('users')
            .find({ _id: { $in: followBack.map(follow => follow.followerId) } }, { projection: { firstName: 1, lastName: 1, username: 1 } })
            .toArray();

        res.json(mates.map(user => ({ id: String(user._id), firstName: user.firstName, lastName: user.lastName, username: user.username })));
    } catch (error) {
        console.error('Fetching mates failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Following, follow requests and notifications ----------
//
// follows         { followerId, followingId, createdAt }         accepted follows only
// followRequests  { requesterId, targetId, createdAt }           waiting for a private account to approve
// notifications   { userId, type, actorId, postId?, read, createdAt }
//    types: request, follow, accepted, mates, like, comment, challenge

// Turns a string into an ObjectId, or null if it isn't a valid id (new ObjectId() would throw)
function toObjectId(value) {
    return ObjectId.isValid(value) && String(new ObjectId(value)) === String(value) ? new ObjectId(value) : null;
}

const collection = (name) => client.db(DB_NAME).collection(name);

// Who follows whom, as sets of id strings
async function followSets(userId) {
    const follows = collection('follows');
    const following = await follows.find({ followerId: userId }).toArray();
    const followers = await follows.find({ followingId: userId }).toArray();
    return {
        following: new Set(following.map(follow => String(follow.followingId))),
        followers: new Set(followers.map(follow => String(follow.followerId)))
    };
}

// How a viewer is connected to another user
async function relationshipBetween(viewerId, targetId) {
    const isSelf = String(viewerId) === String(targetId);
    if (isSelf) return { isSelf: true, following: false, requested: false, followedBy: false, mates: false };

    const [follow, followBack, request] = await Promise.all([
        collection('follows').findOne({ followerId: viewerId, followingId: targetId }),
        collection('follows').findOne({ followerId: targetId, followingId: viewerId }),
        collection('followRequests').findOne({ requesterId: viewerId, targetId })
    ]);
    return { isSelf: false, following: Boolean(follow), requested: Boolean(request), followedBy: Boolean(followBack), mates: Boolean(follow && followBack) };
}

// The follow state shown on buttons: "following", "requested" or "none"
function followStatus(relationship) {
    if (relationship.following) return 'following';
    if (relationship.requested) return 'requested';
    return 'none';
}

// Can the viewer see this user's posts? Public accounts, your own, and private accounts you follow.
async function canViewPostsOf(viewerId, author) {
    if (!author.isPrivate) return true;
    if (!viewerId) return false;   // visitors who are not logged in only see public accounts
    if (String(author._id) === String(viewerId)) return true;
    return Boolean(await collection('follows').findOne({ followerId: viewerId, followingId: author._id }));
}

// Adds a notification once per person, type and post (the upsert stops duplicates)
async function addNotification(userId, type, actorId, postId) {
    const filter = { userId, type, actorId };
    if (postId) filter.postId = postId;
    await collection('notifications').updateOne(filter, { $setOnInsert: { read: false, createdAt: new Date() } }, { upsert: true });
}

// Two people now follow each other: both are told they are mates
async function addMatesNotifications(a, b) {
    await addNotification(a, 'mates', b);
    await addNotification(b, 'mates', a);
}

// Creates an accepted follow (and the notifications that go with it)
async function createFollow(followerId, targetId) {
    const result = await collection('follows').updateOne(
        { followerId, followingId: targetId },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
    );
    if (!result.upsertedCount) return;   // already following

    await addNotification(targetId, 'follow', followerId);
    if (await collection('follows').findOne({ followerId: targetId, followingId: followerId })) {
        await addMatesNotifications(followerId, targetId);
    }
}

// Finds the user in a :id URL (sends the error response itself if it fails)
async function loadTargetUser(req, res) {
    const targetId = toObjectId(req.params.id);
    if (!targetId) {
        res.status(400).json({ message: 'Invalid user.' });
        return null;
    }
    if (targetId.equals(req.user._id)) {
        res.status(400).json({ message: "You can't follow yourself." });
        return null;
    }
    const target = await collection('users').findOne({ _id: targetId });
    if (!target) {
        res.status(404).json({ message: 'User not found.' });
        return null;
    }
    return target;
}

// POST to follow someone. A private account is asked first (a follow request); a public one is followed straight away.
app.post('/api/follow/:id', requireAuth, async (req, res) => {
    try {
        const target = await loadTargetUser(req, res);
        if (!target) return;
        const me = req.user._id;

        const relationship = await relationshipBetween(me, target._id);
        if (relationship.following) return res.json({ status: 'following' });

        if (target.isPrivate) {
            await collection('followRequests').updateOne(
                { requesterId: me, targetId: target._id },
                { $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            );
            await addNotification(target._id, 'request', me);
            return res.json({ status: 'requested' });
        }

        await createFollow(me, target._id);
        res.json({ status: 'following' });
    } catch (error) {
        console.error('Follow failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE to unfollow someone, or to take back a follow request
app.delete('/api/follow/:id', requireAuth, async (req, res) => {
    try {
        const target = await loadTargetUser(req, res);
        if (!target) return;
        const me = req.user._id;

        await collection('follows').deleteOne({ followerId: me, followingId: target._id });
        await collection('followRequests').deleteOne({ requesterId: me, targetId: target._id });
        // The notifications that came from the follow or request go too (and the "mates" ones, if you were mates)
        await collection('notifications').deleteMany({ userId: target._id, actorId: me, type: { $in: ['follow', 'request', 'mates', 'accepted'] } });
        await collection('notifications').deleteMany({ userId: me, actorId: target._id, type: 'mates' });

        res.json({ status: 'none' });
    } catch (error) {
        console.error('Unfollow failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to accept someone's follow request (:id is the person who asked)
app.post('/api/follow-requests/:id/accept', requireAuth, async (req, res) => {
    try {
        const requesterId = toObjectId(req.params.id);
        if (!requesterId) return res.status(400).json({ message: 'Invalid user.' });
        const me = req.user._id;

        const request = await collection('followRequests').findOne({ requesterId, targetId: me });
        if (!request) return res.status(404).json({ message: 'That follow request is no longer there.' });

        await collection('followRequests').deleteOne({ requesterId, targetId: me });
        await collection('follows').updateOne(
            { followerId: requesterId, followingId: me },
            { $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
        // Their request notification becomes a normal "started following you" one, and they hear they were accepted
        await collection('notifications').updateOne({ userId: me, type: 'request', actorId: requesterId }, { $set: { type: 'follow', read: true } });
        await addNotification(requesterId, 'accepted', me);
        if (await collection('follows').findOne({ followerId: me, followingId: requesterId })) {
            await addMatesNotifications(me, requesterId);
        }
        res.json({ status: 'accepted' });
    } catch (error) {
        console.error('Accepting request failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to decline a follow request
app.post('/api/follow-requests/:id/decline', requireAuth, async (req, res) => {
    try {
        const requesterId = toObjectId(req.params.id);
        if (!requesterId) return res.status(400).json({ message: 'Invalid user.' });
        const me = req.user._id;

        await collection('followRequests').deleteOne({ requesterId, targetId: me });
        await collection('notifications').deleteMany({ userId: me, type: 'request', actorId: requesterId });
        res.json({ status: 'declined' });
    } catch (error) {
        console.error('Declining request failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Notifications ----------

// GET your notifications, newest first
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const me = req.user._id;
        await ensureDailyChallengeNotification(me);   // today's challenge shows up as a notification
        const items = await collection('notifications').find({ userId: me }, { sort: { createdAt: -1 }, limit: 50 }).toArray();

        // The challenge notification comes from MuscleMate, not a person, so it has no actorId
        const actorIds = [...new Set(items.filter(item => item.actorId).map(item => String(item.actorId)))].map(id => new ObjectId(id));
        const postIds = items.filter(item => item.postId).map(item => item.postId);
        const actors = await collection('users').find({ _id: { $in: actorIds } }, { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 } }).toArray();
        const posts = await collection('posts').find({ _id: { $in: postIds } }, { projection: { imageId: 1 } }).toArray();
        const actorById = new Map(actors.map(actor => [String(actor._id), actor]));
        const postById = new Map(posts.map(post => [String(post._id), post]));
        const { following } = await followSets(me);

        res.json(items
            .filter(item => item.type === 'challenge' || actorById.has(String(item.actorId)))
            .map(item => {
                // Challenge notifications carry their own text and have no person
                if (item.type === 'challenge') {
                    return {
                        id: String(item._id),
                        type: 'challenge',
                        read: item.read,
                        createdAt: item.createdAt,
                        title: item.title,
                        task: item.task,
                        actor: null,
                        post: null,
                        followingBack: false
                    };
                }
                const actor = actorById.get(String(item.actorId));
                const post = item.postId ? postById.get(String(item.postId)) : null;
                return {
                    id: String(item._id),
                    type: item.type,
                    read: item.read,
                    createdAt: item.createdAt,
                    text: item.text || '',   // the start of the comment, for "comment" notifications
                    actor: { id: String(actor._id), username: actor.username, name: `${actor.firstName} ${actor.lastName}`, avatarUrl: avatarUrlFor(actor) },
                    post: post && post.imageId ? { id: String(post._id), image: imageUrlFor(post) } : null,
                    followingBack: following.has(String(actor._id))
                };
            }));
    } catch (error) {
        console.error('Fetching notifications failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to mark every notification as read
app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
        await collection('notifications').updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
        res.json({ message: 'Done.' });
    } catch (error) {
        console.error('Marking notifications read failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to mark one notification as read
app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) return res.status(400).json({ message: 'Invalid notification.' });
        await collection('notifications').updateOne({ _id: id, userId: req.user._id }, { $set: { read: true } });
        res.json({ message: 'Done.' });
    } catch (error) {
        console.error('Marking notification read failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Other people's profiles ----------

// GET someone's profile, with how you are connected to them. Posts are only included on the /posts route below.
app.get('/api/users/:username', requireAuth, async (req, res) => {
    try {
        const user = await collection('users').findOne({ usernameLower: String(req.params.username).toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const relationship = await relationshipBetween(req.user._id, user._id);
        const posts = await collection('posts').find({ authorId: user._id, ...liveOnly() }, { projection: { _id: 1 } }).toArray();
        const profile = publicProfile(user, { ...(await followCounts(user._id)), postCount: posts.length });
        if (!relationship.isSelf) delete profile.email;

        res.json({
            ...profile,
            relationship: { ...relationship, status: followStatus(relationship) },
            hasStory: await hasVisibleStory(req.user._id, user._id),   // draws the story ring around their picture
            locked: Boolean(user.isPrivate) && !relationship.isSelf && !relationship.following
        });
    } catch (error) {
        console.error('Fetching user failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Posts ----------

const POST_TYPES = ['feed', 'challenge'];
const CAPTION_MAX = 300;

// The hashtags in a caption (up to 10, no repeats)
function tagsFrom(caption) {
    return [...new Set(caption.match(/#[\p{L}\p{N}_]+/gu) || [])].slice(0, 10);
}
// Daily Challenge posts last 24 hours. (Feed posts last until they are deleted.)
const CHALLENGE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const challengeCutoff = () => new Date(Date.now() - CHALLENGE_LIFETIME_MS);   // challenge posts made before this are expired
// Added to a posts query to leave out expired challenge posts: feed posts, or challenge posts newer than the cutoff
const liveOnly = () => ({ $or: [{ type: 'feed' }, { createdAt: { $gt: challengeCutoff() } }] });
const isExpired = (post) => post.type === 'challenge' && new Date(post.createdAt) <= challengeCutoff();

const FEED_LIMIT = 30;   // posts sent at a time: the page shows a "Load more" button for the next batch

// How many posts to skip: the page sends ?skip=30 to get the second batch, and so on
function pageSkip(req) {
    const skip = parseInt(req.query.skip, 10);
    return Number.isInteger(skip) && skip > 0 ? Math.min(skip, 100000) : 0;
}

// The database was asked for FEED_LIMIT + 1 items. If the extra one came back there is more: tell the page, and drop it.
function trimPage(res, items) {
    res.set('X-Has-More', String(items.length > FEED_LIMIT));
    return items.slice(0, FEED_LIMIT);
}

// ---------- Photos (stored in MongoDB with GridFS) ----------

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;   // 2 MB per photo (the page shrinks photos to about 1 MB before sending)
// multer reads the uploaded file into memory and refuses anything over the limit
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

// The kinds of photo that are allowed, and the Content-Type each one is sent with
const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Detects the real image type from the file's first bytes (names and types can be faked).
// Also allows GIFs, so it is only used for profile pictures.
function detectImageType(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
    if (buffer.length > 6 && buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
    return null;
}

// Same check for post and story photos, but JPEG, PNG and WebP only.
// A WebP file starts with "RIFF", then the size, then "WEBP".
function detectPhotoType(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
    if (buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    return null;
}

// APNG and animated WebP are GIFs in disguise, so they are refused.
// Animated WebP: the VP8X format with the animation bit set in byte 20.
// Animated PNG: an "acTL" chunk before the image data ("IDAT").
function isAnimatedPhoto(buffer, type) {
    if (type === 'webp') return buffer.subarray(12, 16).toString('ascii') === 'VP8X' && buffer.length > 20 && (buffer[20] & 0x02) !== 0;
    if (type === 'png') {
        const control = buffer.indexOf('acTL');
        const data = buffer.indexOf('IDAT');
        return control !== -1 && (data === -1 || control < data);
    }
    return false;
}

// Is an uploaded file an allowed photo? Returns { type } (jpg, png or webp) or { error }.
function checkPhoto(file) {
    if (!file) return { error: 'Choose a photo to upload' };
    const type = detectPhotoType(file.buffer);
    if (!type) return { error: 'Please choose a JPG, PNG or WebP photo. Videos and GIFs are not supported.' };
    if (isAnimatedPhoto(file.buffer, type)) return { error: 'Animated pictures are not supported. Please choose a still photo.' };
    return { type };
}

// GridFS keeps files in the collections photos.files and photos.chunks
const photoBucket = () => new GridFSBucket(client.db(DB_NAME), { bucketName: 'photos' });

// Saves a photo in GridFS and gives back its id
function savePhoto(buffer, type) {
    return new Promise((resolve, reject) => {
        const stream = photoBucket().openUploadStream(`photo.${type}`, { metadata: { contentType: PHOTO_TYPES[type] } });
        stream.on('error', reject);
        stream.on('finish', () => resolve(stream.id));
        stream.end(buffer);
    });
}

// Deletes a photo from GridFS. It does nothing if the photo is already gone (or the post never had one).
async function deletePhoto(imageId) {
    if (!imageId) return;
    await photoBucket().delete(imageId).catch(() => {});
}

// The address the pages use to show a post's or story's photo
const imageUrlFor = (item) => `/api/images/${item.imageId}`;

// GET a photo. Only photos of posts and stories the viewer may see are sent (visitors who aren't logged in get public posts only).
app.get('/api/images/:id', optionalAuth, async (req, res) => {
    try {
        const imageId = toObjectId(req.params.id);
        if (!imageId) return res.status(404).json({ message: 'Photo not found.' });

        // Which post or story does this photo belong to, and may you see it?
        let allowed = false;
        const post = await collection('posts').findOne({ imageId });
        if (post) {
            const author = await collection('users').findOne({ _id: post.authorId });
            allowed = Boolean(author) && !isExpired(post) && await canViewPostsOf(req.user && req.user._id, author);
        } else {
            const story = await collection('stories').findOne({ imageId, expiresAt: { $gt: new Date() } });
            allowed = Boolean(story) && await canSeeStoriesOf(req.user && req.user._id, story.authorId);
        }
        if (!allowed) return res.status(404).json({ message: 'Photo not found.' });

        const bucket = photoBucket();
        const file = await bucket.find({ _id: imageId }).next();
        if (!file) return res.status(404).json({ message: 'Photo not found.' });

        // A photo never changes, so its id works as an ETag: if the browser already has it, a tiny 304 answer is enough
        const etag = `"${imageId}"`;
        res.set({
            'Content-Type': (file.metadata && file.metadata.contentType) || 'application/octet-stream',
            'Cache-Control': 'private, max-age=86400',
            'ETag': etag,
            'X-Content-Type-Options': 'nosniff'
        });
        if (req.headers['if-none-match'] === etag) return res.status(304).end();

        res.set('Content-Length', String(file.length));
        bucket.openDownloadStream(imageId)
            .on('error', () => res.destroy())
            .pipe(res);
    } catch (error) {
        console.error('Fetching photo failed', error);
        if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// Keeps a client-supplied width or height in a sensible range, otherwise uses the fallback
function clampSize(value, fallback) {
    const number = parseInt(value, 10);
    return Number.isFinite(number) && number >= 20 && number <= 12000 ? number : fallback;
}

// Adds the author and your own like/save state to a list of posts, in the shape the pages use
async function serializePosts(posts, viewerId) {
    if (posts.length === 0) return [];
    const ids = posts.map(post => post._id);
    const authorIds = [...new Set(posts.map(post => String(post.authorId)))].map(id => new ObjectId(id));

    const authors = await collection('users').find({ _id: { $in: authorIds } }, { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 } }).toArray();
    // A visitor who is not logged in (viewerId is null) has liked and saved nothing
    const likes = viewerId ? await collection('likes').find({ userId: viewerId, postId: { $in: ids } }).toArray() : [];
    const saves = viewerId ? await collection('saves').find({ userId: viewerId, postId: { $in: ids } }).toArray() : [];
    const authorById = new Map(authors.map(author => [String(author._id), author]));
    const likedIds = new Set(likes.map(like => String(like.postId)));
    const savedIds = new Set(saves.map(save => String(save.postId)));

    return posts
        .filter(post => authorById.has(String(post.authorId)) && post.imageId)   // a post with no photo in GridFS can't be shown
        .map(post => {
            const author = authorById.get(String(post.authorId));
            return {
                id: String(post._id),
                type: post.type,
                image: imageUrlFor(post),   // the address of the photo, e.g. /api/images/<id>
                width: post.width,
                height: post.height,
                caption: post.caption,
                tags: post.tags || [],
                likes: post.likeCount || 0,
                comments: post.commentCount || 0,
                createdAt: post.createdAt,
                name: `${author.firstName} ${author.lastName}`,
                username: author.username,
                avatarUrl: avatarUrlFor(author),
                isMine: Boolean(viewerId) && String(post.authorId) === String(viewerId),   // only the owner is offered a delete button
                likedByMe: likedIds.has(String(post._id)),
                savedByMe: savedIds.has(String(post._id))
            };
        });
}

// POST a new post: a photo (JPG, PNG or WebP, up to 2 MB) and a caption, to the feed or to the Daily Challenge
app.post('/api/posts', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE' ? 'That photo is over 2 MB. Please choose a smaller one.' : 'Could not read that upload.';
            return res.status(400).json({ errors: { image: message } });
        }
        next();
    });
}, async (req, res) => {
    try {
        const limitKey = `post:${req.user._id}`;
        if (isLimited(limitKey, 20)) return res.status(429).json({ message: 'You are posting very quickly. Please wait a few minutes.' });

        const errors = {};
        const type = String(req.body.type ?? 'feed');
        const caption = String(req.body.caption ?? '').trim();
        if (!POST_TYPES.includes(type)) errors.type = 'Choose the feed or the Daily Challenge';
        if (caption.length > CAPTION_MAX) errors.caption = `Your caption can be up to ${CAPTION_MAX} characters`;

        // The file must really be a JPG, PNG or WebP photo (anything else, such as a video or GIF, is refused)
        const photo = checkPhoto(req.file);
        if (photo.error) errors.image = photo.error;
        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const tags = tagsFrom(caption);
        const post = {
            authorId: req.user._id,
            type,
            imageId: await savePhoto(req.file.buffer, photo.type),   // the photo is stored in GridFS; the post keeps its id
            width: clampSize(req.body.width, 300),
            height: clampSize(req.body.height, 400),
            caption,
            tags,
            likeCount: 0,
            commentCount: 0,
            createdAt: new Date()
        };
        await collection('posts').insertOne(post);
        recordAttempt(limitKey);

        const [serialized] = await serializePosts([post], req.user._id);
        res.status(201).json(serialized);
    } catch (error) {
        console.error('Creating post failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// Whose posts the Daily Challenge filters show (the feed tabs use feedAuthorIds below)
async function authorIdsFor(viewerId, filter) {
    const { following, followers } = await followSets(viewerId);
    const toIds = (set) => [...set].map(id => new ObjectId(id));
    const self = String(viewerId);

    if (filter === 'mates') return toIds(new Set([...following].filter(id => followers.has(id))));
    if (filter === 'all') return toIds(new Set([...following, self]));

    // Recent and Most Popular look across everyone you can see: public accounts, people you follow, and you
    const publicUsers = await collection('users').find({ isPrivate: { $ne: true } }, { projection: { _id: 1 }, limit: 2000 }).toArray();
    return toIds(new Set([...publicUsers.map(user => String(user._id)), ...following, self]));
}

// The people whose posts the feed tabs show: filter is all, following or mates (viewerId is null for a visitor)
async function feedAuthorIds(viewerId, filter) {
    const toIds = (set) => [...set].map(id => new ObjectId(id));
    const { following, followers } = viewerId ? await followSets(viewerId) : { following: new Set(), followers: new Set() };

    if (filter === 'mates') return toIds(new Set([...following].filter(id => followers.has(id))));
    if (filter === 'following') return toIds(following);

    // all: every public account. A logged-in person also sees themselves and the private accounts they follow.
    const publicUsers = await collection('users').find({ isPrivate: { $ne: true } }, { projection: { _id: 1 }, limit: 2000 }).toArray();
    const ids = new Set(publicUsers.map(user => String(user._id)));
    if (viewerId) {
        following.forEach(id => ids.add(id));
        ids.add(String(viewerId));
    }
    return toIds(ids);
}

// Who may call GET /api/posts: visitors can only use the feed's "all" tab. Everything else needs a login (401 if not).
function feedAuth(req, res, next) {
    const isFeed = req.query.type !== 'challenge';
    const filter = String(req.query.filter ?? 'all');
    return isFeed && filter === 'all' ? optionalAuth(req, res, next) : requireAuth(req, res, next);
}

// GET posts for the feed (filter = all | following | mates, sort = recent | popular) or the Daily Challenge (type=challenge)
app.get('/api/posts', feedAuth, async (req, res) => {
    try {
        const viewerId = req.user ? req.user._id : null;
        const type = req.query.type === 'challenge' ? 'challenge' : 'feed';
        let authorIds;
        let sort = { createdAt: -1, _id: -1 };   // newest first (_id keeps the order steady between batches)

        if (type === 'challenge') {
            // The Daily Challenge is newest first, with its own three filters:
            //   everyone  = public accounts, people you follow, and you
            //   following = people you follow, and you
            //   mates     = people who follow each other with you
            const requested = String(req.query.filter ?? 'everyone');
            const challengeAudience = { everyone: 'recent', following: 'all', mates: 'mates' };
            authorIds = await authorIdsFor(viewerId, challengeAudience[requested] || 'recent');
        } else {
            const filter = String(req.query.filter ?? 'all');
            const sortBy = String(req.query.sort ?? 'recent');
            if (!['all', 'following', 'mates'].includes(filter)) return res.status(400).json({ message: 'Unknown filter. Use all, following or mates.' });
            if (!['recent', 'popular'].includes(sortBy)) return res.status(400).json({ message: 'Unknown sort. Use recent or popular.' });
            authorIds = await feedAuthorIds(viewerId, filter);
            if (sortBy === 'popular') sort = { likeCount: -1, createdAt: -1, _id: -1 };
        }

        const posts = await collection('posts').find({ authorId: { $in: authorIds }, type, ...liveOnly() }, { sort, skip: pageSkip(req), limit: FEED_LIMIT + 1 }).toArray();
        res.json(await serializePosts(trimPage(res, posts), viewerId));
    } catch (error) {
        console.error('Fetching posts failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET one person's posts (type=feed or challenge). A private account's posts are only shown to its followers.
app.get('/api/users/:username/posts', requireAuth, async (req, res) => {
    try {
        const user = await collection('users').findOne({ usernameLower: String(req.params.username).toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found.' });
        if (!(await canViewPostsOf(req.user._id, user))) {
            return res.status(403).json({ locked: true, message: 'This account is private.' });
        }
        const type = req.query.type === 'challenge' ? 'challenge' : 'feed';
        const found = await collection('posts').find({ authorId: user._id, type, ...liveOnly() }, { sort: { createdAt: -1, _id: -1 }, skip: pageSkip(req), limit: FEED_LIMIT + 1 }).toArray();
        res.json(await serializePosts(trimPage(res, found), req.user._id));
    } catch (error) {
        console.error('Fetching user posts failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET the posts you have saved (posts from accounts you can no longer see are left out)
app.get('/api/saved', requireAuth, async (req, res) => {
    try {
        const foundSaves = await collection('saves').find({ userId: req.user._id }, { sort: { createdAt: -1, _id: -1 }, skip: pageSkip(req), limit: FEED_LIMIT + 1 }).toArray();
        const saves = trimPage(res, foundSaves);
        const posts = await collection('posts').find({ _id: { $in: saves.map(save => save.postId) } }).toArray();

        const authors = await collection('users').find({ _id: { $in: [...new Set(posts.map(post => String(post.authorId)))].map(id => new ObjectId(id)) } }).toArray();
        const visibleAuthorIds = new Set();
        for (const author of authors) {
            if (await canViewPostsOf(req.user._id, author)) visibleAuthorIds.add(String(author._id));
        }
        const visible = posts.filter(post => visibleAuthorIds.has(String(post.authorId)) && !isExpired(post));

        // Keeps the order you saved them in
        const order = new Map(saves.map((save, index) => [String(save.postId), index]));
        visible.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
        res.json(await serializePosts(visible, req.user._id));
    } catch (error) {
        console.error('Fetching saved posts failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// Finds a post by :id that the viewer is allowed to see (sends the error response itself if not)
async function loadVisiblePost(req, res) {
    const postId = toObjectId(req.params.id);
    if (!postId) {
        res.status(400).json({ message: 'Invalid post.' });
        return null;
    }
    const post = await collection('posts').findOne({ _id: postId });
    const author = post ? await collection('users').findOne({ _id: post.authorId }) : null;
    if (!post || isExpired(post) || !author || !(await canViewPostsOf(req.user._id, author))) {
        res.status(404).json({ message: 'Post not found.' });
        return null;
    }
    return post;
}

// POST to like a post
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;
        const result = await collection('likes').updateOne(
            { userId: req.user._id, postId: post._id },
            { $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
        let likes = post.likeCount || 0;
        if (result.upsertedCount) {
            await collection('posts').updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
            likes++;
            if (String(post.authorId) !== String(req.user._id)) await addNotification(post.authorId, 'like', req.user._id, post._id);
        }
        res.json({ liked: true, likes });
    } catch (error) {
        console.error('Liking failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE to unlike a post
app.delete('/api/posts/:id/like', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;
        const result = await collection('likes').deleteOne({ userId: req.user._id, postId: post._id });
        let likes = post.likeCount || 0;
        if (result.deletedCount) {
            await collection('posts').updateOne({ _id: post._id }, { $inc: { likeCount: -1 } });
            likes = Math.max(0, likes - 1);
            await collection('notifications').deleteMany({ userId: post.authorId, type: 'like', actorId: req.user._id, postId: post._id });
        }
        res.json({ liked: false, likes });
    } catch (error) {
        console.error('Unliking failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to save a post
app.post('/api/posts/:id/save', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;
        await collection('saves').updateOne(
            { userId: req.user._id, postId: post._id },
            { $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
        res.json({ saved: true });
    } catch (error) {
        console.error('Saving failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE to unsave a post
app.delete('/api/posts/:id/save', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;
        await collection('saves').deleteOne({ userId: req.user._id, postId: post._id });
        res.json({ saved: false });
    } catch (error) {
        console.error('Unsaving failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Messages (Socket.IO) ----------

const MESSAGE_MAX = 1000;
const roomOf = (userId) => `user:${userId}`;   // every user joins a room named after their own id, so a message can be sent to a person
const onlineCounts = new Map();                // userId -> how many tabs they have connected (one person can have several)

// Are these two people mates? (each follows the other)
async function areMates(a, b) {
    const [one, two] = await Promise.all([
        collection('follows').findOne({ followerId: a, followingId: b }),
        collection('follows').findOne({ followerId: b, followingId: a })
    ]);
    return Boolean(one && two);
}

// What the pages need to know about a message
function serializeMessage(message) {
    return { id: String(message._id), from: String(message.fromId), to: String(message.toId), text: message.text, createdAt: message.createdAt };
}

// Socket.IO "middleware": runs once for each new connection. Only logged-in people get through.
io.use(async (socket, next) => {
    try {
        const user = await getSessionUser(socket.request);   // the request carries the same session cookie as normal pages
        if (!user) return next(new Error('Please log in first.'));
        socket.data.user = user;
        next();
    } catch (error) {
        next(new Error('Something went wrong.'));
    }
});

// Runs for every connected browser tab
io.on('connection', (socket) => {
    const me = socket.data.user._id;
    socket.join(roomOf(me));

    // Online status: the first tab announces "online", the last tab to close announces "offline"
    onlineCounts.set(String(me), (onlineCounts.get(String(me)) || 0) + 1);
    if (onlineCounts.get(String(me)) === 1) io.emit('presence', { userId: String(me), online: true });

    // A message from this person to a mate. The last argument, "reply", is the acknowledgement callback.
    socket.on('message:send', async (data, reply) => {
        const answer = typeof reply === 'function' ? reply : () => {};
        try {
            const toId = toObjectId(String(data?.to ?? ''));
            const text = String(data?.text ?? '').trim();
            if (!toId) return answer({ error: 'Choose someone to message.' });
            if (!text) return answer({ error: 'Write a message first.' });
            if (text.length > MESSAGE_MAX) return answer({ error: `Messages can be up to ${MESSAGE_MAX} characters.` });
            if (!(await areMates(me, toId))) return answer({ error: 'You can only message your mates (people who follow each other).' });

            const limitKey = `message:${me}`;
            if (isLimited(limitKey, 60)) return answer({ error: 'You are sending messages very quickly. Please wait a few minutes.' });
            recordAttempt(limitKey);

            const message = { fromId: me, toId, text, read: false, createdAt: new Date() };
            await collection('messages').insertOne(message);

            const payload = serializeMessage(message);
            io.to(roomOf(toId)).to(roomOf(me)).emit('message:new', payload);   // to both people (and all of their open tabs)
            answer({ ok: true });
        } catch (error) {
            console.error('Sending message failed', error);
            answer({ error: 'Something went wrong. Please try again.' });
        }
    });

    // This person opened a chat, so what the other person sent them is now read
    socket.on('message:read', async (data) => {
        try {
            const fromId = toObjectId(String(data?.from ?? ''));
            if (fromId) await collection('messages').updateMany({ fromId, toId: me, read: false }, { $set: { read: true } });
        } catch (error) {
            console.error('Marking messages read failed', error);
        }
    });

    // "is typing...": passed straight on, nothing is saved. Only mates are told.
    socket.on('typing', async (data) => {
        try {
            const toId = toObjectId(String(data?.to ?? ''));
            if (toId && (await areMates(me, toId))) io.to(roomOf(toId)).emit('typing', { from: String(me) });
        } catch (error) {
            // A missed typing indicator doesn't matter
        }
    });

    socket.on('disconnect', () => {
        const left = (onlineCounts.get(String(me)) || 1) - 1;
        if (left <= 0) {
            onlineCounts.delete(String(me));
            io.emit('presence', { userId: String(me), online: false });
        } else {
            onlineCounts.set(String(me), left);
        }
    });
});

// GET your conversations: all your mates plus anyone you have chatted with, newest chat first.
// Reads the 1000 most recent messages and works out the rest here, which is fine at this size.
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const me = req.user._id;
        const { following, followers } = await followSets(me);
        const mateIds = new Set([...following].filter(id => followers.has(id)));

        const recent = await collection('messages').find({ $or: [{ fromId: me }, { toId: me }] }, { sort: { createdAt: -1 }, limit: 1000 }).toArray();
        const last = new Map();      // other person -> their newest message
        const unread = new Map();    // other person -> how many of their messages you haven't read
        for (const message of recent) {
            const other = String(message.fromId) === String(me) ? String(message.toId) : String(message.fromId);
            if (!last.has(other)) last.set(other, message);
            if (String(message.toId) === String(me) && !message.read) unread.set(other, (unread.get(other) || 0) + 1);
        }

        const ids = [...new Set([...mateIds, ...last.keys()])];
        const people = ids.length === 0 ? [] : await collection('users').find(
            { _id: { $in: ids.map(id => new ObjectId(id)) } },
            { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 } }
        ).toArray();

        const conversations = people.map(person => {
            const id = String(person._id);
            return {
                id,
                name: `${person.firstName} ${person.lastName}`,
                username: person.username,
                avatarUrl: avatarUrlFor(person),
                isMate: mateIds.has(id),                  // false if you have stopped following each other: you can read, not send
                online: onlineCounts.has(id),
                unread: unread.get(id) || 0,
                lastMessage: last.has(id) ? serializeMessage(last.get(id)) : null
            };
        });
        // Chats with messages first (newest on top), then mates you haven't spoken to yet (A to Z)
        conversations.sort((a, b) => {
            if (a.lastMessage && b.lastMessage) return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
            if (a.lastMessage) return -1;
            if (b.lastMessage) return 1;
            return a.name.localeCompare(b.name);
        });
        res.json({ me: String(me), conversations });
    } catch (error) {
        console.error('Fetching conversations failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET how many messages sent to you are still unread (for the badge on the sidebar's Messages link)
app.get('/api/unread-messages', requireAuth, async (req, res) => {
    try {
        res.json({ count: await collection('messages').countDocuments({ toId: req.user._id, read: false }) });
    } catch (error) {
        console.error('Counting unread messages failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET the messages between you and one person, oldest first (and marks theirs as read)
app.get('/api/messages/:userId', requireAuth, async (req, res) => {
    try {
        const me = req.user._id;
        const otherId = toObjectId(req.params.userId);
        if (!otherId) return res.status(404).json({ message: 'User not found.' });

        // Only people you are mates with, or have chatted with before
        const messages = await collection('messages').find(
            { $or: [{ fromId: me, toId: otherId }, { fromId: otherId, toId: me }] },
            { sort: { createdAt: -1 }, limit: 200 }
        ).toArray();
        if (messages.length === 0 && !(await areMates(me, otherId))) return res.status(403).json({ message: 'You can only message your mates.' });

        await collection('messages').updateMany({ fromId: otherId, toId: me, read: false }, { $set: { read: true } });
        res.json(messages.reverse().map(serializeMessage));
    } catch (error) {
        console.error('Fetching messages failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Deleting posts ----------

// Removes a post completely: its photo, and everything that belonged to it
async function removePost(post) {
    await deletePhoto(post.imageId);
    await collection('comments').deleteMany({ postId: post._id });
    await collection('likes').deleteMany({ postId: post._id });
    await collection('saves').deleteMany({ postId: post._id });
    await collection('notifications').deleteMany({ postId: post._id });
    await collection('posts').deleteOne({ _id: post._id });
}

// DELETE a post (only its owner can do this)
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
    try {
        const postId = toObjectId(req.params.id);
        const post = postId ? await collection('posts').findOne({ _id: postId }) : null;
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        if (String(post.authorId) !== String(req.user._id)) return res.status(403).json({ message: 'You can only delete your own posts.' });

        await removePost(post);
        res.json({ deleted: true });
    } catch (error) {
        console.error('Deleting post failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// EDIT a post's caption (only its owner can do this)
app.patch('/api/posts/:id', requireAuth, async (req, res) => {
    try {
        const postId = toObjectId(req.params.id);
        const post = postId ? await collection('posts').findOne({ _id: postId }) : null;
        if (!post) return res.status(404).json({ message: 'Post not found.' });
        if (String(post.authorId) !== String(req.user._id)) return res.status(403).json({ message: 'You can only edit your own posts.' });

        const caption = String(req.body?.caption ?? '').trim();
        if (caption.length > CAPTION_MAX) return res.status(400).json({ errors: { caption: `Your caption can be up to ${CAPTION_MAX} characters` } });

        const tags = tagsFrom(caption);
        await collection('posts').updateOne({ _id: post._id }, { $set: { caption, tags } });
        post.caption = caption;
        post.tags = tags;
        const [saved] = await serializePosts([post], req.user._id);
        res.json(saved);
    } catch (error) {
        console.error('Editing post failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Comments ----------

const COMMENT_MAX = 300;      // the longest a comment can be
const COMMENTS_LOADED = 100;  // the most comments loaded for one post

// Turns saved comments into what the page needs: who wrote each one, and whether you may delete it
async function serializeComments(comments, viewerId, post) {
    if (comments.length === 0) return [];
    const authorIds = [...new Set(comments.map(comment => String(comment.authorId)))].map(id => new ObjectId(id));
    const authors = await collection('users').find({ _id: { $in: authorIds } }, { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 } }).toArray();
    const authorById = new Map(authors.map(author => [String(author._id), author]));

    return comments
        .filter(comment => authorById.has(String(comment.authorId)))
        .map(comment => {
            const author = authorById.get(String(comment.authorId));
            return {
                id: String(comment._id),
                text: comment.text,
                createdAt: comment.createdAt,
                name: `${author.firstName} ${author.lastName}`,
                username: author.username,
                avatarUrl: avatarUrlFor(author),
                // You can delete your own comments, and any comment on your own post
                canDelete: String(comment.authorId) === String(viewerId) || String(post.authorId) === String(viewerId)
            };
        });
}

// GET the comments on a post, oldest first
app.get('/api/posts/:id/comments', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;
        const comments = await collection('comments').find({ postId: post._id }, { sort: { createdAt: 1 }, limit: COMMENTS_LOADED }).toArray();
        res.json(await serializeComments(comments, req.user._id, post));
    } catch (error) {
        console.error('Fetching comments failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST a new comment on a post
app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
    try {
        const post = await loadVisiblePost(req, res);
        if (!post) return;

        const limitKey = `comment:${req.user._id}`;
        if (isLimited(limitKey, 30)) return res.status(429).json({ message: 'You are commenting very quickly. Please wait a few minutes.' });

        const text = String(req.body?.text ?? '').trim();
        if (!text) return res.status(400).json({ errors: { text: 'Write a comment first' } });
        if (text.length > COMMENT_MAX) return res.status(400).json({ errors: { text: `Comments can be up to ${COMMENT_MAX} characters` } });

        const comment = { postId: post._id, authorId: req.user._id, text, createdAt: new Date() };
        await collection('comments').insertOne(comment);
        await collection('posts').updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
        recordAttempt(limitKey);

        // Tells the post's owner (not when you comment on your own post). Each comment gets its own notification,
        // and it remembers which comment it came from so deleting the comment can remove it.
        if (String(post.authorId) !== String(req.user._id)) {
            await collection('notifications').insertOne({
                userId: post.authorId,
                type: 'comment',
                actorId: req.user._id,
                postId: post._id,
                commentId: comment._id,
                text: text.length > 80 ? `${text.slice(0, 80)}...` : text,
                read: false,
                createdAt: new Date()
            });
        }

        const [saved] = await serializeComments([comment], req.user._id, post);
        res.status(201).json({ comment: saved, commentCount: (post.commentCount || 0) + 1 });
    } catch (error) {
        console.error('Adding comment failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE a comment (its writer, or the owner of the post, can do this)
app.delete('/api/comments/:id', requireAuth, async (req, res) => {
    try {
        const commentId = toObjectId(req.params.id);
        const comment = commentId ? await collection('comments').findOne({ _id: commentId }) : null;
        const post = comment ? await collection('posts').findOne({ _id: comment.postId }) : null;
        if (!comment || !post) return res.status(404).json({ message: 'Comment not found.' });

        const isWriter = String(comment.authorId) === String(req.user._id);
        const isPostOwner = String(post.authorId) === String(req.user._id);
        if (!isWriter && !isPostOwner) return res.status(403).json({ message: 'You can only delete your own comments.' });

        await collection('comments').deleteOne({ _id: comment._id });
        await collection('posts').updateOne({ _id: post._id }, { $inc: { commentCount: -1 } });
        await collection('notifications').deleteMany({ commentId: comment._id });   // the "commented on your post" notification goes too
        res.json({ commentCount: Math.max(0, (post.commentCount || 0) - 1) });
    } catch (error) {
        console.error('Deleting comment failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Stories ----------

const STORY_HOURS = 24;             // a story disappears this many hours after it is posted
const STORY_CAPTION_MAX = 150;

// Can the viewer see this person's stories? Yourself, and people you follow.
async function canSeeStoriesOf(viewerId, authorId) {
    if (!viewerId) return false;
    if (String(viewerId) === String(authorId)) return true;
    return Boolean(await collection('follows').findOne({ followerId: viewerId, followingId: authorId }));
}

// Does this person have a story the viewer can watch right now? (Used for the ring around a profile picture.)
async function hasVisibleStory(viewerId, authorId) {
    if (!(await canSeeStoriesOf(viewerId, authorId))) return false;
    return Boolean(await collection('stories').findOne({ authorId, expiresAt: { $gt: new Date() } }));
}

// Deletes stories that have expired, along with their files and view records
async function cleanupExpiredStories() {
    try {
        const expired = await collection('stories').find({ expiresAt: { $lte: new Date() } }).toArray();
        for (const story of expired) {
            await deletePhoto(story.imageId);
            await collection('storyViews').deleteMany({ storyId: story._id });
            await collection('stories').deleteOne({ _id: story._id });
        }
    } catch (error) {
        console.error('Cleaning up stories failed', error);
    }
}

// Removes Daily Challenge posts that are over 24 hours old, with their files, comments, likes and saves
async function cleanupExpiredChallengePosts() {
    try {
        const expired = await collection('posts').find({ type: 'challenge', createdAt: { $lte: challengeCutoff() } }).toArray();
        for (const post of expired) await removePost(post);
    } catch (error) {
        console.error('Cleaning up challenge posts failed', error);
    }
}

// POST a new story (a photo, and an optional short caption)
app.post('/api/stories', requireAuth, (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE' ? 'That photo is over 2 MB. Please choose a smaller one.' : 'Could not read that upload.';
            return res.status(400).json({ errors: { image: message } });
        }
        next();
    });
}, async (req, res) => {
    try {
        const limitKey = `story:${req.user._id}`;
        if (isLimited(limitKey, 20)) return res.status(429).json({ message: 'You are adding stories very quickly. Please wait a few minutes.' });

        const errors = {};
        const caption = String(req.body.caption ?? '').trim();
        if (caption.length > STORY_CAPTION_MAX) errors.caption = `A story caption can be up to ${STORY_CAPTION_MAX} characters`;
        const photo = checkPhoto(req.file);   // JPG, PNG or WebP only
        if (photo.error) errors.image = photo.error;
        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const now = new Date();
        const story = {
            authorId: req.user._id,
            imageId: await savePhoto(req.file.buffer, photo.type),   // the photo is stored in GridFS
            width: clampSize(req.body.width, 360),
            height: clampSize(req.body.height, 640),
            caption,
            createdAt: now,
            expiresAt: new Date(now.getTime() + STORY_HOURS * 60 * 60 * 1000)
        };
        await collection('stories').insertOne(story);
        recordAttempt(limitKey);
        res.status(201).json({ id: String(story._id), expiresAt: story.expiresAt });
    } catch (error) {
        console.error('Creating story failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET the stories you can watch, grouped by person: yours first, then people with stories you haven't watched,
// then the rest. Within a person the oldest story comes first, like on other apps.
app.get('/api/stories', requireAuth, async (req, res) => {
    try {
        const me = req.user._id;
        const { following } = await followSets(me);
        const authorIds = [...following, String(me)].map(id => new ObjectId(id));

        const stories = await collection('stories').find(
            { authorId: { $in: authorIds }, expiresAt: { $gt: new Date() } },
            { sort: { createdAt: 1 } }
        ).toArray();
        if (stories.length === 0) return res.json([]);

        const views = await collection('storyViews').find({ userId: me, storyId: { $in: stories.map(story => story._id) } }).toArray();
        const watched = new Set(views.map(view => String(view.storyId)));
        const authors = await collection('users').find(
            { _id: { $in: [...new Set(stories.map(story => String(story.authorId)))].map(id => new ObjectId(id)) } },
            { projection: { firstName: 1, lastName: 1, username: 1, avatarVersion: 1 } }
        ).toArray();
        const authorById = new Map(authors.map(author => [String(author._id), author]));

        // Builds one group per person
        const groups = new Map();
        for (const story of stories) {
            const author = authorById.get(String(story.authorId));
            if (!author || !story.imageId) continue;
            if (!groups.has(String(author._id))) {
                groups.set(String(author._id), {
                    user: { id: String(author._id), username: author.username, name: `${author.firstName} ${author.lastName}`, avatarUrl: avatarUrlFor(author), isSelf: String(author._id) === String(me) },
                    stories: [],
                    hasUnseen: false,
                    latest: 0
                });
            }
            const group = groups.get(String(author._id));
            const seen = watched.has(String(story._id));
            group.stories.push({
                id: String(story._id),
                image: imageUrlFor(story),
                width: story.width,
                height: story.height,
                caption: story.caption,
                createdAt: story.createdAt,
                seen
            });
            if (!seen) group.hasUnseen = true;
            group.latest = Math.max(group.latest, new Date(story.createdAt).getTime());
        }

        const ordered = [...groups.values()].sort((a, b) =>
            (b.user.isSelf - a.user.isSelf) || (b.hasUnseen - a.hasUnseen) || (b.latest - a.latest));
        res.json(ordered.map(({ latest, ...group }) => group));
    } catch (error) {
        console.error('Fetching stories failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// Finds a story by :id that the viewer is allowed to see (sends the error response itself if not)
async function loadVisibleStory(req, res) {
    const storyId = toObjectId(req.params.id);
    const story = storyId ? await collection('stories').findOne({ _id: storyId, expiresAt: { $gt: new Date() } }) : null;
    if (!story || !(await canSeeStoriesOf(req.user._id, story.authorId))) {
        res.status(404).json({ message: 'Story not found.' });
        return null;
    }
    return story;
}

// POST to record that you have watched a story
app.post('/api/stories/:id/view', requireAuth, async (req, res) => {
    try {
        const story = await loadVisibleStory(req, res);
        if (!story) return;
        await collection('storyViews').updateOne(
            { userId: req.user._id, storyId: story._id },
            { $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
        res.json({ seen: true });
    } catch (error) {
        console.error('Recording story view failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE one of your own stories
app.delete('/api/stories/:id', requireAuth, async (req, res) => {
    try {
        const story = await loadVisibleStory(req, res);
        if (!story) return;
        if (String(story.authorId) !== String(req.user._id)) return res.status(403).json({ message: 'You can only delete your own stories.' });

        await deletePhoto(story.imageId);
        await collection('storyViews').deleteMany({ storyId: story._id });
        await collection('stories').deleteOne({ _id: story._id });
        res.json({ deleted: true });
    } catch (error) {
        console.error('Deleting story failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Profile and settings ----------

const FITNESS_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const STATUSES = ['Training', 'Resting', 'Recovering', 'Taking a break'];
const BIO_MAX = 160;
const GOAL_MAX = 60;

// What the profile page and settings need to know about a user (never the password hash)
function publicProfile(user, counts) {
    return {
        id: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        bio: user.bio || '',
        fitnessLevel: user.fitnessLevel || '',
        goal: user.goal || '',
        status: user.status || '',
        isPrivate: Boolean(user.isPrivate),
        createdAt: user.createdAt,
        avatarUrl: avatarUrlFor(user),   // null when the user hasn't set a picture
        ...counts
    };
}

// Followers, following and mates (people who follow each other) for a user
async function followCounts(userId) {
    const follows = client.db(DB_NAME).collection('follows');
    const following = await follows.find({ followerId: userId }).toArray();
    const followers = await follows.find({ followingId: userId }).toArray();
    const followingIds = new Set(following.map(follow => String(follow.followingId)));
    const mates = followers.filter(follow => followingIds.has(String(follow.followerId)));
    return { followers: followers.length, following: following.length, mates: mates.length };
}

// GET your own profile
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const posts = await client.db(DB_NAME).collection('posts').find({ authorId: req.user._id, ...liveOnly() }, { projection: { _id: 1 } }).toArray();
        const hasStory = await hasVisibleStory(req.user._id, req.user._id);   // draws the ring around your own picture
        res.json({ ...publicProfile(req.user, { ...(await followCounts(req.user._id)), postCount: posts.length }), hasStory });
    } catch (error) {
        console.error('Fetching profile failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// PATCH to edit your profile and privacy. Only the fields that are sent are changed.
app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
        const body = req.body || {};
        const changes = {};
        const errors = {};

        if ('firstName' in body) {
            const value = String(body.firstName ?? '').trim();
            if (!value) errors.firstName = 'Enter your first name';
            else if (value.length > 50 || !NAME_PATTERN.test(value)) errors.firstName = 'Use letters, spaces, hyphens or apostrophes only';
            else changes.firstName = value;
        }
        if ('lastName' in body) {
            const value = String(body.lastName ?? '').trim();
            if (!value) errors.lastName = 'Enter your last name';
            else if (value.length > 50 || !NAME_PATTERN.test(value)) errors.lastName = 'Use letters, spaces, hyphens or apostrophes only';
            else changes.lastName = value;
        }
        if ('username' in body) {
            const value = String(body.username ?? '').trim();
            if (!value) errors.username = 'Choose a username';
            else if (!USERNAME_PATTERN.test(value)) errors.username = 'Use 3-20 letters, numbers or underscores';
            else changes.username = value;
        }
        if ('bio' in body) {
            const value = String(body.bio ?? '').trim();
            if (value.length > BIO_MAX) errors.bio = `Your bio can be up to ${BIO_MAX} characters`;
            else changes.bio = value;
        }
        if ('goal' in body) {
            const value = String(body.goal ?? '').trim();
            if (value.length > GOAL_MAX) errors.goal = `Your goal can be up to ${GOAL_MAX} characters`;
            else changes.goal = value;
        }
        if ('fitnessLevel' in body) {
            const value = String(body.fitnessLevel ?? '');
            if (value && !FITNESS_LEVELS.includes(value)) errors.fitnessLevel = 'Choose one of the options';
            else changes.fitnessLevel = value;
        }
        if ('status' in body) {
            const value = String(body.status ?? '');
            if (value && !STATUSES.includes(value)) errors.status = 'Choose one of the options';
            else changes.status = value;
        }
        if ('isPrivate' in body) {
            if (typeof body.isPrivate !== 'boolean') errors.isPrivate = 'Choose public or private';
            else changes.isPrivate = body.isPrivate;
        }

        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const users = client.db(DB_NAME).collection('users');

        // A new username must not belong to anyone else (the same check as signing up)
        if (changes.username !== undefined) {
            const usernameLower = changes.username.toLowerCase();
            const taken = await users.findOne({ usernameLower, _id: { $ne: req.user._id } });
            if (taken) return res.status(409).json({ errors: { username: 'This username is already taken' } });
            changes.usernameLower = usernameLower;
        }

        if (Object.keys(changes).length > 0) {
            await users.updateOne({ _id: req.user._id }, { $set: changes });
        }

        const updated = await users.findOne({ _id: req.user._id });
        res.json(publicProfile(updated, await followCounts(req.user._id)));
    } catch (error) {
        // A unique index catches two people taking a username at the same moment
        if (error.code === 11000) return res.status(409).json({ errors: { username: 'This username is already taken' } });
        console.error('Updating profile failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST to change your password from settings (you need your current one)
app.post('/api/change-password', requireAuth, async (req, res) => {
    try {
        const currentPassword = String(req.body?.currentPassword ?? '');
        const newPassword = String(req.body?.newPassword ?? '');
        const confirmPassword = String(req.body?.confirmPassword ?? '');

        const errors = {};
        if (!currentPassword) errors.currentPassword = 'Enter your current password';
        const check = validateNewPassword(newPassword, confirmPassword);
        if (check.password) errors.newPassword = check.password;
        if (check.confirmPassword) errors.confirmPassword = check.confirmPassword;
        if (!errors.newPassword && !errors.currentPassword && newPassword === currentPassword) {
            errors.newPassword = 'Choose a password you are not already using';
        }
        if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

        const limitKey = `password:${req.user._id}`;
        if (isLimited(limitKey)) {
            return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes and try again.' });
        }

        const db = client.db(DB_NAME);
        const user = await db.collection('users').findOne({ _id: req.user._id });
        if (!verifyPassword(currentPassword, user.passwordHash)) {
            recordAttempt(limitKey);
            return res.status(400).json({ errors: { currentPassword: 'That is not your current password' } });
        }

        attempts.delete(limitKey);
        await db.collection('users').updateOne({ _id: user._id }, { $set: { passwordHash: hashPassword(newPassword) } });

        // Signs out every other device, and keeps this one logged in
        const currentToken = getCookie(req, SESSION_COOKIE);
        await db.collection('sessions').deleteMany({ userId: user._id, tokenHash: { $ne: hashToken(currentToken) } });

        res.json({ message: 'Password updated.' });
    } catch (error) {
        console.error('Changing password failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Deleting your account ----------

// Removes everything that belongs to a user, and then the user. The order matters: the user's own document is
// deleted last, so if something fails half way you can try again.
async function deleteAccount(userId) {
    // Their posts (with files, comments, likes, saves and notifications)
    const posts = await collection('posts').find({ authorId: userId }).toArray();
    for (const post of posts) await removePost(post);

    // Their stories, with files and view records
    const stories = await collection('stories').find({ authorId: userId }).toArray();
    for (const story of stories) {
        await deletePhoto(story.imageId);
        await collection('storyViews').deleteMany({ storyId: story._id });
        await collection('stories').deleteOne({ _id: story._id });
    }
    await collection('storyViews').deleteMany({ userId });

    // Their likes on other people's posts: each liked post's like count goes down by one
    const likes = await collection('likes').find({ userId }).toArray();
    for (const like of likes) await collection('posts').updateOne({ _id: like.postId }, { $inc: { likeCount: -1 } });
    await collection('likes').deleteMany({ userId });

    // Their comments on other people's posts: each post's comment count goes down by how many they wrote there
    const comments = await collection('comments').find({ authorId: userId }).toArray();
    const perPost = new Map();
    for (const comment of comments) perPost.set(String(comment.postId), (perPost.get(String(comment.postId)) || 0) + 1);
    for (const [postId, count] of perPost) await collection('posts').updateOne({ _id: new ObjectId(postId) }, { $inc: { commentCount: -count } });
    await collection('comments').deleteMany({ authorId: userId });

    await collection('saves').deleteMany({ userId });
    await collection('messages').deleteMany({ $or: [{ fromId: userId }, { toId: userId }] });
    await collection('follows').deleteMany({ $or: [{ followerId: userId }, { followingId: userId }] });
    await collection('followRequests').deleteMany({ $or: [{ requesterId: userId }, { targetId: userId }] });
    await collection('notifications').deleteMany({ $or: [{ userId }, { actorId: userId }] });
    await collection('avatars').deleteMany({ userId });
    await collection('passwordResets').deleteMany({ userId });
    await collection('sessions').deleteMany({ userId });
    await collection('users').deleteOne({ _id: userId });
}

// DELETE your account. You must send your password, as well as confirming on the page.
app.delete('/api/profile', requireAuth, async (req, res) => {
    try {
        const password = String(req.body?.password ?? '');
        if (!password) return res.status(400).json({ errors: { password: 'Enter your password to delete your account' } });

        const limitKey = `delete:${req.user._id}`;
        if (isLimited(limitKey)) return res.status(429).json({ message: 'Too many attempts. Please wait 15 minutes and try again.' });

        const user = await collection('users').findOne({ _id: req.user._id });
        if (!verifyPassword(password, user.passwordHash)) {
            recordAttempt(limitKey);
            return res.status(400).json({ errors: { password: 'That is not your password' } });
        }

        await deleteAccount(user._id);
        io.in(roomOf(user._id)).disconnectSockets(true);   // closes their open chat connections too
        res.clearCookie(SESSION_COOKIE);   // you are logged out as the account disappears
        res.json({ message: 'Your account has been deleted.' });
    } catch (error) {
        console.error('Deleting account failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Profile pictures ----------
//
// The picture is stored in the "avatars" collection: { userId, contentType, data (binary), updatedAt }.
// The user document keeps only "avatarVersion", a timestamp that changes whenever the picture changes.

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;   // 2 MB is plenty: the browser shrinks the picture before sending it
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });

// The web address of a user's picture, or null if they have none. The "?v=" part changes when the picture changes,
// so browsers don't keep showing an old cached copy.
function avatarUrlFor(user) {
    if (!user || !user.avatarVersion) return null;
    return `/api/avatars/${encodeURIComponent(user.username)}?v=${user.avatarVersion}`;
}

// The content type to send a picture with, from what the file really is (not what it is called)
const AVATAR_CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

// GET a user's profile picture (you have to be logged in, like the rest of the site)
app.get('/api/avatars/:username', requireAuth, async (req, res) => {
    try {
        const user = await collection('users').findOne({ usernameLower: String(req.params.username).toLowerCase() });
        const avatar = user ? await collection('avatars').findOne({ userId: user._id }) : null;
        if (!avatar) return res.status(404).json({ message: 'No picture.' });

        // MongoDB hands back a Binary object, whose bytes are in .buffer
        const bytes = avatar.data instanceof Binary ? avatar.data.buffer : avatar.data;
        res.set({
            'Content-Type': avatar.contentType,
            'Content-Length': bytes.length,
            // Safe to cache for a day: a changed picture gets a new "?v=" address
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff'
        });
        res.send(Buffer.from(bytes));
    } catch (error) {
        console.error('Fetching avatar failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// POST a new profile picture (replaces the old one)
app.post('/api/profile/avatar', requireAuth, (req, res, next) => {
    // multer reads the uploaded file; if it is too big or unreadable the error is returned here
    avatarUpload.single('avatar')(req, res, (error) => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE' ? 'That picture is over 2 MB.' : 'Could not read that upload.';
            return res.status(400).json({ errors: { avatar: message } });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ errors: { avatar: 'Choose a picture to upload' } });

        // Checks the file's first bytes: only real JPG, PNG or GIF pictures are accepted
        const type = detectImageType(req.file.buffer);
        if (!type) return res.status(400).json({ errors: { avatar: 'Please choose a JPG, PNG or GIF picture' } });

        // upsert: true means "create it if the user has no picture yet, replace it if they do"
        await collection('avatars').updateOne(
            { userId: req.user._id },
            { $set: { contentType: AVATAR_CONTENT_TYPES[type], data: new Binary(req.file.buffer), updatedAt: new Date() } },
            { upsert: true }
        );

        // A new version number gives the picture a new web address, so every page shows the new one
        const avatarVersion = Date.now();
        await collection('users').updateOne({ _id: req.user._id }, { $set: { avatarVersion } });

        res.json({ avatarUrl: avatarUrlFor({ username: req.user.username, avatarVersion }) });
    } catch (error) {
        console.error('Saving avatar failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// DELETE your profile picture (you go back to the default one)
app.delete('/api/profile/avatar', requireAuth, async (req, res) => {
    try {
        await collection('avatars').deleteOne({ userId: req.user._id });
        await collection('users').updateOne({ _id: req.user._id }, { $unset: { avatarVersion: '' } });
        res.json({ avatarUrl: null });
    } catch (error) {
        console.error('Removing avatar failed', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// GET the list of users (login needed). Entries use public fields only, the same details a profile page already shows;
// email, date of birth, gender and password hash are never included. Sorted by username, paged with ?limit=50 (max 100) and ?skip=N.
function publicUser(user) {
    return {
        id: String(user._id),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        bio: user.bio || '',
        fitnessLevel: user.fitnessLevel || '',
        goal: user.goal || '',
        status: user.status || '',
        isPrivate: Boolean(user.isPrivate),
        avatarUrl: avatarUrlFor(user),
        createdAt: user.createdAt
    };
}

app.get('/api/users', requireAuth, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
        // The projection asks the database for only the fields publicUser needs, so private ones never leave it
        const users = await client.db(DB_NAME).collection('users')
            .find({}, { projection: { firstName: 1, lastName: 1, username: 1, bio: 1, fitnessLevel: 1, goal: 1, status: 1, isPrivate: 1, avatarVersion: 1, createdAt: 1 }, sort: { usernameLower: 1 }, skip, limit })
            .toArray();
        res.json(users.map(publicUser));
    } catch (error) {
        console.error('Failed to fetch users', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// ---------- Not found and errors ----------
// Must come after every route above. Unknown /api addresses get JSON; any other unknown page gets the 404 page.
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'Not found.' });
});

app.use((req, res) => {
    // Only browsers asking for a page (Accept lists text/html) get the 404 page; a missing image or script gets plain text
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    res.status(404).type('text').send('Not found');
});

// Catches anything thrown by a route or Express (e.g. invalid JSON in a request body) and answers with short JSON, never a stack trace
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status >= 500) console.error('Unhandled error', error);
    res.status(status).json({ message: status < 500 ? 'That request could not be understood.' : 'Something went wrong. Please try again.' });
});

// Connects to MongoDB Atlas first, then starts the server
async function start() {
    try {
        await client.connect();
        console.log('Connected to MongoDB Atlas');

        // Unique indexes stop two accounts sharing an email or username
        const users = client.db(DB_NAME).collection('users');
        await users.createIndex({ email: 1 }, { unique: true });
        await users.createIndex({ usernameLower: 1 }, { unique: true });

        // Sessions and reset tokens delete themselves once their expiry time passes
        const sessions = client.db(DB_NAME).collection('sessions');
        await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await sessions.createIndex({ tokenHash: 1 }, { unique: true });
        const resets = client.db(DB_NAME).collection('passwordResets');
        await resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await resets.createIndex({ tokenHash: 1 }, { unique: true });

        // One follow per pair of users, one request per pair, and one like or save per person and post
        const db = client.db(DB_NAME);
        await db.collection('follows').createIndex({ followerId: 1, followingId: 1 }, { unique: true });
        await db.collection('avatars').createIndex({ userId: 1 }, { unique: true });   // one picture per user
        await db.collection('comments').createIndex({ postId: 1, createdAt: 1 });
        await db.collection('posts').createIndex({ imageId: 1 });     // finds the post a photo belongs to (GET /api/images/:id)
        await db.collection('stories').createIndex({ imageId: 1 });
        await db.collection('messages').createIndex({ fromId: 1, toId: 1, createdAt: -1 });
        await db.collection('stories').createIndex({ authorId: 1, expiresAt: 1 });
        await db.collection('storyViews').createIndex({ userId: 1, storyId: 1 }, { unique: true });   // one view record per person and story
        await db.collection('followRequests').createIndex({ requesterId: 1, targetId: 1 }, { unique: true });
        await db.collection('likes').createIndex({ userId: 1, postId: 1 }, { unique: true });
        await db.collection('saves').createIndex({ userId: 1, postId: 1 }, { unique: true });
        await db.collection('posts').createIndex({ authorId: 1, createdAt: -1 });
        await db.collection('posts').createIndex({ createdAt: -1 });
        await db.collection('notifications').createIndex({ userId: 1, createdAt: -1 });

        // Expired stories (and their files) are removed now, and then once an hour
        await cleanupExpiredStories();
        setInterval(cleanupExpiredStories, 60 * 60 * 1000).unref();
        await cleanupExpiredChallengePosts();
        setInterval(cleanupExpiredChallengePosts, 10 * 60 * 1000).unref();   // unref: this timer alone won't keep the server alive

        httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));   // not app.listen: Socket.IO shares this server
    } catch (error) {
        console.error('Failed to connect to Atlas', error);
        process.exit(1);
    }
}

start();