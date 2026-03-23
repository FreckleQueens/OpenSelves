# OpenSelves&

A free and open source alternative to Simply Plural (R.I.P.)

## 📝 Main features (WIP)
- 🗺 System mapping
- 👥 Front tracking

...and hopefully more to come

---

## Technical overview
- By default, the user's primary data source is on the server to allow syncing and provide online services
- Clients can go offline. In this situation they will cache CRUD operations. If server data changes in the meantime,
clients will prompt the user on what to do when they go back online
- Client can run in a local-only mode where it starts the server locally (without online features such as user
accounts). This gives the choice to users to use the app without relying on an internet connection
- Switching between default mode and local-only mode (and vice versa) is done by exporting data from the old server and
importing it in the new server

---

## 🚀 Roadmap

This is my personal todo list. It is not a promise and may change at anytime without prior notice. There is no deadline
or ETA

### 0.1.0
- [x] DB orm (prisma?)
- [x] Single command dev env build and start (client and server)
- [x] basic auth with email and password (createdAt, email, passwordHash)
  - [x] Basic API with jwt
  - [x] Refresh tokens and expiration time tuning
  - [x] Client logic
  - [x] Client interface
  - [x] Client logout
- [x] refactor logout handling (onServerLoggedOut => set storage key to offline, navigate to "/")
- [x] test cannot create 2 users with same email address
- [x] make tests db separate from dev db
- [x] populate dev db with test data
- [x] private registration gated by unsecure clear-text password in config
- [ ] system mapping
  - [x] client offline mode with prisma-idb
  - [x] add member (created_at, updated_at, name, pronouns, description)
  - [x] show member
  - [x] edit member
  - [ ] delete member
  - [ ] server sync
- [ ] archive member (test flow of performing client IndexedDB migration)
- [ ] client: make server url openselves.org in production
- [ ] deployment with CI (build and deploy on release tags)

### 0.2.0
- [ ] linting (git hooks)
- [ ] contribution CI (test and build on every commit and PRs)
- [ ] localization

### 0.3.0
- [ ] self-hosting (choose server url in client)
- [ ] client config (default server url, web-client listen addr and port)
- [ ] api config (listen addr and port)
- [ ] PWA (service worker)

### 0.4.0
- [ ] add icons to buttons, fields and links/navigation items
- [ ] add front (created_at, start_at, end_at, member_id, note)
- [ ] show front list (history table)
- [ ] edit front
- [ ] delete front
- [ ] show current fronts

### 0.5.0
- [ ] member profile picture
- [ ] password recovery
- [ ] change password
- [ ] change email
- [ ] sign cookies (accessToken, refreshToken) (this should harden against DDOS)

### 0.6.0
- [ ] simply plural data importer (save all simply plural ids!)
- [ ] simply plural data vault

### 1.0.0
- [ ] email verification
- [ ] public registrations with captcha
- [ ] general UI/UX accessibility check
- [ ] data export to json
- [ ] review [private launch items](./private%20launch%20items.md) (not accessible publicly)

### 2.0.0
- [ ] Member color
- [ ] groups (folders) (created_at, name, description, custom emoji, color)
- [ ] Member front history tab
- [ ] Beautiful front history chronological graph
- [ ] PluralKit manual synchronization (per-member)
- [ ] PluralKit manual synchronization (all members)
- [ ] simply plural data vault updater

### 3.0.0
- [ ] Useful links page

---

## Simply Plural parity
### High priority
- [ ] Member custom fields
- [ ] Friends, individual friend privacy settings (share members, share front) turned off by default
- [ ] Privacy buckets (members, groups, custom fields)
- [ ] Front change notifications (per-friend toggle, per-member inhibition toggle) with generic concept of notifications
(must be able to show history to user later)
- [ ] User documentation

### Medium priority
- [ ] Reminders (post front events (add member, add custom, add any)) and reoccurring (notifications)
- [ ] Custom fronts

### Low priority
- [ ] Notification history
- [ ] Member message board tab (authored messages, notification on switch in)
- [ ] Member notes tab (authorless messages)
- [ ] Analytics
- [ ] Polls
- [ ] Internal chat
- [ ] Third-party integration API with access tokens
- [ ] Account color
- [ ] Hide plural features toggle (for singlets), off by default, choice at registration
- [ ] Show system member count
- [ ] Show group member count

---

## Ideas for future releases
- Member onboarding procedure (needs thought out UX)
- Make different types of groups? (sub-system, geographical, tag...) -> "visual only"
- Public system page (optional, show name, optional show {profile picture, description, fronts, members}) -> needs a
separate privacy setting for individual members
- Public member page
- Automatic PluralKit integration
- Instant Messaging app designed for plural people first
