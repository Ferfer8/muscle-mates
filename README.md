# 💪 Muscle Mates

**Share your workouts, find your mates, keep each other going.**

Muscle Mates is a social app for gym-goers. Post workout photos, take on a new Daily Challenge every day, follow people, make mates (people who follow each other) and chat with them in real time.

**[▶ Try Muscle Mates](LIVE-LINK-GOES-HERE)**

---

## About the Project

Muscle Mates started in 2024 as a very basic web project for university coursework. Its purpose was simply to get me familiar with using a database and a client-server connection: a browser sending requests to a server, and the server reading from and writing to a database.

In 2026, I revisited the project to prepare it for my portfolio. I wanted to take it further than the original, adding things like hashed and salted passwords, so I improved a lot of it. I deliberately kept its original foundations, so it still reflects where I was as a developer at the time. See [What's Changed](#whats-changed-in-2026) below.

### A Note on the Demo Data

The demo accounts and their posts are sample data, so the app feels lived in when you first open it. They aren't real people. The photos come from Pexels (see [CREDITS.md](CREDITS.md)).

---

## Features

- **Photo feed:** posts show in a Pinterest-style grid. Use the **All**, **Following** and **Mates** tabs, sort by **Recent** or **Most Popular**, and press **Load more** for older posts.
- **Daily Challenge:** a new fitness challenge every day, the same for everyone. Posts to the challenge disappear after 24 hours, ready for the next one.
- **Stories:** share a photo that disappears after 24 hours. Tap a story to watch, pause or skip.
- **Mates:** follow people, and when they follow you back you become mates.
- **Real-time chat:** message your mates with live delivery, online status, a typing indicator and unread badges, powered by Socket.IO.
- **Likes, saves and comments:** like to posts, save your favourites and comment on them.
- **Public and private accounts:** private accounts approve follow requests, and only their followers see their posts and stories.
- **Profiles and settings:** add a bio, goal and fitness level, upload a profile picture, change your password, or delete your account.
- **Notifications:** follow requests, new followers, new mates, likes, comments and the daily challenge.
- **Safe uploads:** photos are shrunk in the browser before they are sent, and the server checks that they are really JPEG, PNG or WebP images.
- **Credits:** every third-party asset is credited to its creator.

## How to Use

1. Sign up (you must be 16 or older), or log in with a demo account: username `liftwithjordan` and password `password123`.
2. Follow a few people and check the feed tabs.
3. Post a photo from the **Create** button, or take on today's **Daily Challenge**.
4. Follow someone who follows you back to become mates, then message them from the **Messages** page.

On the hosted demo, "Forgot password" doesn't send a real email, because the demo has no email service. The page explains this when you try it.

---

## Built With

- **Node.js and Express** for the server and the REST API
- **MongoDB Atlas** for the database, with **GridFS** for storing photos
- **Socket.IO** for real-time messaging
- **HTML, CSS and vanilla JavaScript** for the front end (no frameworks)
- **helmet**, **multer** and **nodemailer** for security headers, file uploads and the password reset email

## What's Changed in 2026

**Updated:**
- **Passwords and tokens:** passwords are now hashed and salted (with Node's built-in scrypt). Login sessions and password reset links use random tokens that are stored only as hashes, and sessions are kept in httpOnly cookies (HTTPS-only when deployed). Login, password reset and similar attempts are rate limited.
- **Security:** added security headers and a Content-Security-Policy. Every rule (such as the age limit and allowed file types) is checked on the server as well as in the browser.
- **Photos:** images are stored in the database, shrunk in the browser before upload, and only sent to people allowed to see them.
- **Design:** Made the sidebar collapsible and friendlier 404 page.
- **Structure:** the front end is split into one script per feature.

**Added or rebuilt:**
- **Real-time chat with Socket.IO:** the main new feature. Mates can message each other live.
- **Safer actions:** "Are you sure?" confirmations before deleting anything, and a way to delete your whole account.

**Intentionally kept from the original:**
- **Vanilla JavaScript front end:** still one page with simple hash-based routing and no framework.
- **Express with MongoDB:** the original REST-style API (for example `/api/users`) is still the base of the app.

Keeping these lets the project show both where I started and how I've grown.

## If I Rebuilt It Today

- Use a component-based framework like React for the repeated parts of the interface, such as the sidebar, post cards and pop-ups.
- Send real password reset emails and verify email addresses at sign-up, with a proper email service.
- Add automated tests, covering the API and the main user journeys.
- Improve accessibility (keyboard navigation and screen reader support) and design mobile-first, with touch support.
- Add search for posts and hashtags, plus blocking and reporting, and group chats with image messages.

---

## Credits

Muscle Mates uses an icon, a background video, photos, an icon font and a GIF from other creators. See [CREDITS.md](CREDITS.md) for the full list. Thank you to all of them!

## License

© 2024–2026 Jennifer Nggada. All rights reserved.

This code is shared publicly as part of my portfolio. You're welcome to view it, but please don't copy, modify, or reuse it without my permission. Interested in using it? Contact me on [GitHub](https://github.com/Ferfer8/) or [LinkedIn](https://www.linkedin.com/in/jennifer-nggada-662219314/).

## Author

**Jennifer Nggada**
