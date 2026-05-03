# 🚀 Roadmap

This is our& personal todo list. It is not a promise and may change at anytime without prior notice. There is no
deadline or ETA

## ✅ 0.1.0
<details>
  <summary>dev todo</summary>

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
- [x] system mapping
    - [x] client offline mode with prisma-idb
    - [x] add member (created_at, updated_at, name, pronouns, description)
    - [x] show member
    - [x] edit member
    - [x] delete member
- [x] sync engine
    - [x] logs (Log) table (table, id, type (create,update,delete), data, executedAt, pushedAt)
    - [x] client: add Log when operation with pushedAt=null
        - [x] create
        - [x] update
        - [x] delete
    - [x] server: /push endpoint
        - [x] create
            - [x] basic
            - [x] validation
        - [x] update
            - [x] basic (add records unedited and always apply changes to model)
            - [x] validation
            - [x] reduced from existing history (remove fields modified more recently, keep the rest, save and apply to model)
        - [x] delete
            - [x] basic
            - [x] validation
        - [x] refactor service method
    - [x] /pull endpoint
        - [x] return create operations for all records of all models when client provides no timestamp
        - [x] cursor (return all records after requested timestamp, return timestamp)
    - [x] client: flush logs table to /push (records where pushedAt is null, set pushedAt on server confirmation)
    - [x] client: pull once push is complete
    - [x] client: pull regularly
    - [x] client: update member list when syncing
    - [x] client: optionally pause or resume syncing on navigation with AppPage prop (default is do nothing)
- [x] add icons to buttons, fields and links/navigation items
- [x] archive member (test flow of performing client IndexedDB migration)
- [x] replace prisma and prisma-idb with AI-free FOSS orm and idb abstraction
- [x] client: make server url openselves.org in production
- [x] deployment with CI (build and deploy on release tags)
- [x] contribution CI (test and build on every commit and PRs)

</details>

## ✅ 0.2.0

<details>
  <summary>dev todo</summary>

- [x] linting (git hooks)
- [x] client: add a check to prevent an update log from saving with no data (empty object)
- [x] client: graceful error handling
- [x] add a max-width to general interface size (layout?) for widescreen use (desktop, tablet...)
- [x] dark theme
- [x] client: hide FABs when scrolling in members list
- [x] client: put FABs behind a FAB menu
- [x] localization

</details>

## ✅ 0.3.0

<details>
  <summary>dev todo</summary>

- [x] set favicon to logo
- [x] set android app icon to logo
- [x] self-hosting (choose server url in client)
- [x] client config (default server url)
- [x] PWA (service worker)

</details>

## ✅ 0.4.0

<details>
  <summary>dev todo</summary>

- [x] client: offline icons
- [x] client: improve service worker's ability to start from offline
- [x] db: fronts
- [x] server: create, update, delete fronts
- [x] server: both fronts and members in single request
- [x] client: add front
- [x] client: delete a member's fronts when deleting a member (in the same transaction)
- [x] client: end front
- [x] client: end all fronts at once with confirmation
- [x] client: display live front duration
- [x] client: search member list by name when selecting a fronter
- [x] client: fix /members list missing padding
- [x] client: clicking on front goes to member edit page
- [x] client: add note to front
- [x] client: edit front start datetime
- [x] client: replace front member
- [x] client: show front list (history table)
- [x] client: edit front end datetime
- [x] client: delete front
- [x] client: show current fronts
- [x] client: validate form fields with native html validation in member edit and front edit pages
- [x] client: don't show network errors, simply put the app in offline mode
- [x] client: show a banner on all pages when the app is in offline mode (server unreachable, network offline...)

</details>

## ✅ 0.4.1

<details>
  <summary>dev todo</summary>

- [x] bug: members/records are saved with userId "offline"
- [x] bug: some pages (i.e. /front) don't redirect when userId is lost
- [x] PWA: fallback to "/" response if no response found for svelte routes

</details>

## ✅ 0.4.2

<details>
  <summary>dev todo</summary>

- [x] partial IndexedDB upgrades hang indefinitely
- [x] server: serve all delete logs on initial sync to account for lost timestamp edgecase

</details>

## ✅ 0.5.0 - Member profile picture

<details>
  <summary>dev todo</summary>

- [ ] ~~client: switch to a better md3 library~~ (canceled)
- [x] add version checks on /push and /pull endpoints
- [x] member profile picture
  - [x] simple URL field with reasonable length limit (allow data urls)
  - [x] allow "upload" of image by converting it to a data url
  - [x] upload larger image files to s3-compatible private object storage
  - [x] delete attachments on update operation
  - [x] delete attachments on delete operation
- [x] member color
- [x] verify and fix iOS colors

</details>

## ✅ 0.5.1

<details>
  <summary>dev todo</summary>

- [x] fix desktop frame background color regression
- [x] fix server warning for route pattern "/attachment/*"
- [x] fix server deployment needing package.json 2 levels above with version
- [x] Add dialog for app updates to allow user to easily reload the app
- [x] server: check file upload dir for readwrite permissions

</details>

## 🚧 0.6.0 - Basic account features
- [ ] password recovery
- [ ] change password
- [ ] change email
- [ ] sign cookies (accessToken, refreshToken) (this should harden against DDOS)
- [ ] turn on Secure flag on cookies (except in dev and test mode)
- [ ] add a warning about data being accessible even after a logout
- [ ] add ability to wipe IDB from auth settings menu
- [ ] add "This is a safe, personal device - remember me" checkbox to opt in for a persistent refreshToken and default to
a short-lived one 

## 0.7.0 - Import data from Simply Plural
- [ ] simply plural data importer (save all simply plural ids!)
- [ ] simply plural data vault

## 0.8.0 - Optimizations
- [ ] Sync engine optimizations
    - [ ] client
        - [ ] drop prior unsynced create and update operations when deleting a record
        - [ ] leverage @capacitor/background-runner
        - [ ] leverage Background Sync API when available
    - [ ] server
        - [ ] purge logs that don't have an effect anymore

## 0.9.0 - Exclusive-offline mode
- [ ] add data export to json
- [ ] add data import from json
- [ ] add an option to use the app without an account
- [ ] warn the user that using the app in this mode has potential data loss risks and that they should backup their data regularly
- [ ] add data backup reminder
- [ ] Android: store data in a more persistent place than IndexedDB? Auto-backup?
- 
## 0.10.0 - UI tweaks
- [ ] make sure FABs menu buttons in members page (and others?) show on screen without the need to scroll on browsers
- [ ] show proper language names in language switcher
- [ ] current fronts: buttons are unclear, show hint tooltip on long press (and vibrate)
- [ ] fab menus: don't use fab menus, always show "add" action (with a tooltip), put secondary actions in a toolbar?
- [ ] ListInput: make the text field focus when clicking anywhere inside the whole visible box (+ cursor change)
- [ ] member edit: make profile picture edit button always visible (maybe move it outside the image's box)
- [ ] ListInput: make clear button better (example: member edit form color field)

## 1.0.0 - Official release
- [ ] email verification
- [ ] public registrations with captcha
- [ ] general UI/UX accessibility check
- [ ] review [private launch items](./private%20launch%20items.md) (not accessible publicly)

## 1.1.0
- [ ] groups (folders) (created_at, name, description, custom emoji, color)
- [ ] Member front history tab
- [ ] Beautiful front history chronological graph
- [ ] PluralKit manual synchronization (per-member)
- [ ] PluralKit manual synchronization (all members)
- [ ] simply plural data vault updater

## 1.2.0
- [ ] Useful links page
- [ ] Better default dark theme colors (monochrome?)
- [ ] switch between light theme, dark theme and system theme manually
- [ ] add primary color theme options
- [ ] add monochrome and vibrant colors toggles

---

# Simply Plural parity
## High priority
- [ ] Member custom fields
- [ ] Friends, individual friend privacy settings (share members, share front) turned off by default
- [ ] Privacy buckets (members, groups, custom fields)
- [ ] Front change notifications (per-friend toggle, per-member inhibition toggle) with generic concept of notifications
  (must be able to show history to user later)
- [ ] User documentation

## Medium priority
- [ ] client: logger
- [ ] server: logger
- [ ] Reminders (post front events (add member, add custom, add any)) and reoccurring (notifications)
- [ ] Custom fronts

## Low priority
- [ ] Notification history
- [ ] Member message board tab (authored messages, notification on switch in)
- [ ] Member notes tab (authorless messages)
- [ ] System "analytics" (as in graphs and stats for users, not in the traditional usage data collection/tracking)
- [ ] Polls
- [ ] Internal chat
- [ ] Third-party integration API with access tokens
- [ ] Account color
- [ ] Hide plural features toggle (for singlets), off by default, choice at registration
- [ ] Show system member count
- [ ] Show group member count
- [ ] android adaptive icon

---

## Ideas for future releases
- save a backup of remote (url) images (member pfp) in IDB as data uris
- warn the user when the remote image doesn't load and allow them to use the backup image instead
- Member onboarding procedure (needs thought out UX)
- Make different types of groups? (sub-system, geographical, tag...) -> "visual only"
- Public system page (optional, show name, optional show {profile picture, description, fronts, members}) -> needs a
  separate privacy setting for individual members
- Public member page
- Automatic PluralKit integration
- Instant Messaging app designed for plural people first