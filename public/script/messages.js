// Messages page: your mates on the left, the open chat on the right. Lists and history load with fetch(); new messages, online status and typing
// arrive over a Socket.IO connection that is only open on this page. Only mates can message each other (the server checks).

let chatSocket = null;        // the Socket.IO connection (null when you are not on the Messages page)
let chatMe = null;            // your own user id
let conversations = [];       // your mates and past chats, from the server
let messageSearch = "";       // what is typed in the search box
let activeChatId = null;      // the id of the person whose chat is open
let chatMessages = [];        // the messages shown in the open chat
let chatLoadId = 0;           // counts chat loads so a slow, out-of-date one can't overwrite a newer one
let typingHideTimer = null;
let lastTypingSent = 0;
let chatStatus = "loading";   // loading | ready | login | error

// Names and messages can contain anything a user typed, so they are escaped before going into the page's HTML
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

// A message's time: "14:05" for today, or "12 Mar, 14:05" for older ones
function messageTime(value) {
    const date = new Date(value);
    if (isNaN(date)) return "";
    const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return date.toDateString() === new Date().toDateString()
        ? clock
        : `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${clock}`;
}

// The person's picture, or their initials in a purple circle when they have none
function chatAvatar(person, size) {
    if (person.avatarUrl) return `<img src="${escapeHtml(person.avatarUrl)}" width="${size}" height="${size}" alt="">`;
    const initials = person.name.split(" ").map((word) => word[0]).join("").slice(0, 2);
    return `<span class="chat-initials" style="width:${size}px;height:${size}px">${escapeHtml(initials)}</span>`;
}

// The line under a name in the list: the last message, with "You: " in front of your own
function conversationPreview(conversation) {
    const last = conversation.lastMessage;
    if (!last) return "No messages yet";
    return (last.from === chatMe ? "You: " : "") + last.text;
}

// One row in the conversation list
function renderConversationRow(conversation) {
    const active = conversation.id === activeChatId;
    const last = conversation.lastMessage;
    return `
        <li>
            <button type="button" class="conversation${active ? " active" : ""}" data-conversation="${escapeHtml(conversation.id)}" aria-current="${active}">
                <span class="avatar-wrap">
                    ${chatAvatar(conversation, 48)}
                    ${conversation.online ? '<span class="online-dot" title="Online"></span>' : ""}
                </span>
                <span class="conversation-text">
                    <span class="conversation-top">
                        <span class="conversation-name">${escapeHtml(conversation.name)}</span>
                        <span class="conversation-time">${last ? escapeHtml(messageTime(last.createdAt)) : ""}</span>
                    </span>
                    <span class="conversation-bottom">
                        <span class="conversation-preview">${escapeHtml(conversationPreview(conversation))}</span>
                        ${conversation.unread ? `<span class="unread-badge" aria-label="${conversation.unread} unread">${conversation.unread}</span>` : ""}
                    </span>
                </span>
            </button>
        </li>`;
}

// One message bubble
function renderBubble(message) {
    const mine = message.from === chatMe;
    return `
        <div class="bubble-row ${mine ? "outgoing" : "incoming"}">
            <div class="bubble">
                <p>${escapeHtml(message.text)}</p>
                <span class="bubble-time">${escapeHtml(messageTime(message.createdAt))}</span>
            </div>
        </div>`;
}

// The whole chat pane for one conversation
function renderChat(conversation) {
    if (!conversation) {
        return '<p class="chat-empty chat-placeholder">Pick a mate on the left to start chatting.</p>';
    }

    const body = chatMessages.length === 0
        ? `<p class="chat-empty">No messages yet. Say hi to ${escapeHtml(conversation.name)}!</p>`
        : chatMessages.map(renderBubble).join("");

    const composer = conversation.isMate
        ? `<form class="composer" autocomplete="off">
               <input type="text" id="messageInput" placeholder="Write a message..." aria-label="Write a message" maxlength="1000">
               <button type="submit" class="send-btn" aria-label="Send message"><i class='bx bxs-send'></i></button>
           </form>`
        : `<p class="chat-locked">You and ${escapeHtml(conversation.name)} no longer follow each other, so you can't send new messages.</p>`;

    return `
        <div class="chat-header">
            <span class="avatar-wrap">
                ${chatAvatar(conversation, 44)}
                <span class="online-dot" title="Online" ${conversation.online ? "" : "hidden"}></span>
            </span>
            <div class="chat-title">
                <span class="chat-name">${escapeHtml(conversation.name)}</span>
                <span class="chat-status" id="chatStatus">@${escapeHtml(conversation.username)}${conversation.online ? " · Active now" : ""}</span>
            </div>
        </div>
        <div class="chat-messages" role="log" aria-live="polite" tabindex="0" aria-label="Messages with ${escapeHtml(conversation.name)}">
            ${body}
        </div>
        <p class="chat-error" id="chatError" role="alert"></p>
        ${composer}`;
}

// Does a name or username match what was typed in the search box?
function matchesSearch(conversation) {
    return `${conversation.name} ${conversation.username}`.toLowerCase().includes(messageSearch.trim().toLowerCase());
}

// The list under the search box
function renderConversationList() {
    if (chatStatus === "loading") return '<li class="list-note">Loading your chats...</li>';
    if (chatStatus === "login") return '<li class="list-note">Log in to message your mates.</li>';
    if (chatStatus === "error") return '<li class="list-note">Couldn\'t load your chats right now.</li>';

    if (conversations.length === 0) {
        return '<li class="list-note">No mates yet. Follow people and have them follow you back to message them.</li>';
    }
    const shown = conversations.filter(matchesSearch);
    return shown.length === 0
        ? '<li class="list-note">No mates found.</li>'
        : shown.map(renderConversationRow).join("");
}

// Redraws the conversation list and updates the sidebar badge
function refreshConversationList() {
    const list = document.querySelector(".conversation-list");
    if (list) list.innerHTML = renderConversationList();
    // On this page the list is current, so work the sidebar badge out from it instead of waiting for the next check
    if (chatStatus === "ready") {
        unreadMessageCount = conversations.reduce((total, conversation) => total + conversation.unread, 0);
        updateMessageBadge();
    }
}

// The page's markup
function renderMessagesPage() {
    messageSearch = "";
    conversations = [];
    activeChatId = null;
    chatMessages = [];
    chatStatus = "loading";

    return `
        <div class="messages-page" id="messagesPage">
            <aside class="conversations" aria-label="Conversations">
                <div class="conversations-header">
                    <h1>Messages</h1>
                </div>
                <label class="conversation-search">
                    <i class='bx bx-search'></i>
                    <input type="text" id="conversationSearch" placeholder="Search your mates" aria-label="Search your mates">
                </label>
                <ul class="conversation-list">
                    ${renderConversationList()}
                </ul>
            </aside>
            <section class="chat" id="chatPane" aria-label="Open conversation">
                ${renderChat(null)}
            </section>
        </div>`;
}

// Scrolls the chat down to the newest message
function scrollChatToBottom() {
    const messages = document.querySelector(".chat-messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
}

// The conversation that is open, or null
function activeConversation() {
    return conversations.find((conversation) => conversation.id === activeChatId) || null;
}

// Shows a short problem under the messages (cleared when empty)
function showChatError(text) {
    const note = document.getElementById("chatError");
    if (note) note.textContent = text || "";
}

// ---------- Socket.IO ----------

// Opens the connection and starts listening for events from the server
function connectChat() {
    if (chatSocket || typeof io !== "function") return;
    chatSocket = io();   // io() comes from /socket.io/socket.io.js

    // A new message arrived (also sent back to you for messages you sent, so all of your tabs stay in step)
    chatSocket.on("message:new", (message) => {
        if (!document.getElementById("messagesPage")) return;
        const otherId = message.from === chatMe ? message.to : message.from;
        const conversation = conversations.find((item) => item.id === otherId);
        if (!conversation) return loadConversations();   // someone new: ask the server for their details

        conversation.lastMessage = message;
        // Newest chat goes to the top of the list
        conversations.splice(conversations.indexOf(conversation), 1);
        conversations.unshift(conversation);

        if (otherId === activeChatId) {
            chatMessages.push(message);
            appendBubble(message);
            if (message.from !== chatMe) chatSocket.emit("message:read", { from: otherId });   // you're looking at it
        } else if (message.from !== chatMe) {
            conversation.unread += 1;
        }
        refreshConversationList();
    });

    // Someone went online or offline
    chatSocket.on("presence", ({ userId, online }) => {
        const conversation = conversations.find((item) => item.id === userId);
        if (!conversation) return;
        conversation.online = online;
        refreshConversationList();
        if (userId === activeChatId) {
            const dot = document.querySelector(".chat-header .online-dot");
            if (dot) dot.hidden = !online;
            setChatStatus(online ? " · Active now" : "");
        }
    });

    // "typing..." shows for 2 seconds and restarts each time another typing event arrives
    chatSocket.on("typing", ({ from }) => {
        if (from !== activeChatId) return;
        setChatStatus(" · typing...");
        clearTimeout(typingHideTimer);
        typingHideTimer = setTimeout(() => {
            const conversation = activeConversation();
            setChatStatus(conversation && conversation.online ? " · Active now" : "");
        }, 2000);
    });

    // The server refused the connection (not logged in)
    chatSocket.on("connect_error", (error) => {
        if (chatStatus === "ready") showChatError("Reconnecting...");
        else if (error && /log in/i.test(error.message)) { chatStatus = "login"; refreshConversationList(); }
    });
    chatSocket.on("connect", () => showChatError(""));
}

// Closes the socket
function disconnectChat() {
    clearTimeout(typingHideTimer);
    if (chatSocket) chatSocket.disconnect();
    chatSocket = null;
}

// The small line under the person's name
function setChatStatus(suffix) {
    const status = document.getElementById("chatStatus");
    const conversation = activeConversation();
    if (status && conversation) status.textContent = `@${conversation.username}${suffix}`;
}

// Adds one bubble to the open chat without redrawing everything
function appendBubble(message) {
    const messages = document.querySelector(".chat-messages");
    if (!messages) return;
    messages.querySelector(".chat-empty")?.remove();
    messages.insertAdjacentHTML("beforeend", renderBubble(message));
    scrollChatToBottom();
}

// ---------- Loading from the server ----------

// Loads your mates and past chats from GET /api/conversations
async function loadConversations() {
    try {
        const response = await fetch("/api/conversations");
        if (!document.getElementById("messagesPage")) return;   // you left the page while it loaded
        if (response.status === 401) chatStatus = "login";
        else if (!response.ok) chatStatus = "error";
        else {
            const data = await response.json();
            chatMe = data.me;
            conversations = data.conversations;
            chatStatus = "ready";
        }
    } catch (error) {
        chatStatus = "error";
    }
    refreshConversationList();
}

// Opens a chat: shows the person, loads the history, and tells the server you've read it
async function openChat(personId) {
    const conversation = conversations.find((item) => item.id === personId);
    if (!conversation) return;

    activeChatId = personId;
    chatMessages = [];
    conversation.unread = 0;
    const loadId = ++chatLoadId;
    const pane = document.getElementById("chatPane");
    pane.innerHTML = renderChat(conversation);
    refreshConversationList();

    try {
        const response = await fetch(`/api/messages/${personId}`);
        if (loadId !== chatLoadId || !document.getElementById("chatPane")) return;   // another chat was opened meanwhile
        if (!response.ok) throw new Error("history failed");
        chatMessages = await response.json();
        pane.innerHTML = renderChat(conversation);
        scrollChatToBottom();
        if (chatSocket) chatSocket.emit("message:read", { from: personId });
    } catch (error) {
        if (loadId === chatLoadId) showChatError("Couldn't load this chat right now.");
    }
    const input = document.getElementById("messageInput");
    if (input) input.focus();
}

// Called after the page is shown
async function setupMessagesPage() {
    chatLoadId++;
    connectChat();
    await loadConversations();
    openChatFromLink();
}

// A link like #/messages?with=<username> (the "Message" button on a profile) opens that person's chat
function openChatFromLink() {
    const wanted = new URLSearchParams(window.location.hash.split("?")[1] || "").get("with");
    if (!wanted || !document.getElementById("messagesPage")) return;
    const conversation = conversations.find((item) => item.username.toLowerCase() === wanted.toLowerCase());
    if (conversation) openChat(conversation.id);
}

// ---------- The unread count on the sidebar's Messages link ----------

let unreadMessageCount = 0;

// Shows the count on the Messages link, like the Notifications badge (.nav-badge)
function updateMessageBadge() {
    const link = document.getElementById("messagesLink");
    if (!link) return;
    let badge = link.querySelector(".nav-badge");
    if (unreadMessageCount === 0) {
        if (badge) badge.remove();
        return;
    }
    if (!badge) {
        badge = makeElement("span", "nav-badge");
        link.appendChild(badge);
    }
    badge.textContent = unreadMessageCount > 99 ? "99+" : unreadMessageCount;
    badge.setAttribute("aria-label", `${unreadMessageCount} unread messages`);
}

// Asks the server how many unread messages you have (when you are not on the Messages page, which knows already)
async function loadUnreadMessages() {
    if (document.getElementById("messagesPage")) return;
    try {
        const response = await fetch("/api/unread-messages");
        unreadMessageCount = response.ok ? (await response.json()).count : 0;
    } catch (error) {
        return;   // the old count stays
    }
    updateMessageBadge();
}

// The sidebar is drawn again on each page change, so the badge is put back and the count checked
window.addEventListener("hashchange", () => {
    setTimeout(updateMessageBadge, 0);
    loadUnreadMessages();
});
document.addEventListener("DOMContentLoaded", () => {
    loadUnreadMessages();
    setTimeout(updateMessageBadge, 0);
});
// New messages arrive while you use the site, so the count is checked every 30 seconds
setInterval(() => {
    if (!document.hidden) loadUnreadMessages();
}, 30000);

// ---------- Events ----------

// Typing in the search box filters your mates
document.addEventListener("input", (e) => {
    if (e.target.id === "conversationSearch") {
        messageSearch = e.target.value;
        refreshConversationList();
    } else if (e.target.id === "messageInput" && chatSocket && activeChatId) {
        // Tells your mate you are typing, at most once every 1.5 seconds
        if (Date.now() - lastTypingSent > 1500) {
            lastTypingSent = Date.now();
            chatSocket.emit("typing", { to: activeChatId });
        }
    }
});

document.addEventListener("click", (e) => {
    const row = e.target.closest(".conversation[data-conversation]");
    if (row && document.getElementById("messagesPage")) openChat(row.dataset.conversation);
});

// Send goes to the server over the socket. Nothing is drawn here: the server sends the message back as "message:new" to both people,
// and that is what draws it, so what you see is what was saved.
document.addEventListener("submit", (e) => {
    if (!e.target.classList.contains("composer")) return;
    e.preventDefault();

    const input = e.target.querySelector("input");
    const text = input.value.trim();
    if (!text || !activeChatId) return;
    if (!chatSocket || !chatSocket.connected) return showChatError("Not connected right now. Please try again in a moment.");

    showChatError("");
    chatSocket.emit("message:send", { to: activeChatId, text }, (reply) => {
        if (reply && reply.error) showChatError(reply.error);   // the server's reply (the acknowledgement)
    });
    input.value = "";
});

// Leaving the Messages page closes the socket
window.addEventListener("hashchange", () => {
    if (window.location.hash.split("?")[0] !== "#/messages") disconnectChat();
});
