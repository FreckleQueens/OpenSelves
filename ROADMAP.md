# 🚀 Roadmap

This is our& personal todo list. It is not a promise and may change at anytime without prior notice. There is no
deadline or ETA

## ✅ 0.1.0
<details>
  <summary>todolist</summary>

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
  <summary>todolist</summary>

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
  <summary>todolist</summary>

- [x] set favicon to logo
- [x] set android app icon to logo
- [x] self-hosting (choose server url in client)
- [x] client config (default server url)
- [x] PWA (service worker)

</details>

## ✅ 0.4.0

<details>
  <summary>todolist</summary>

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
  <summary>todolist</summary>

- [x] bug: members/records are saved with userId "offline"
- [x] bug: some pages (i.e. /front) don't redirect when userId is lost
- [x] PWA: fallback to "/" response if no response found for svelte routes

</details>

## ✅ 0.4.2

<details>
  <summary>todolist</summary>

- [x] partial IndexedDB upgrades hang indefinitely
- [x] server: serve all delete logs on initial sync to account for lost timestamp edgecase

</details>

## ✅ 0.5.0 - Member profile picture

<details>
  <summary>todolist</summary>

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
  <summary>todolist</summary>

- [x] fix desktop frame background color regression
- [x] fix server warning for route pattern "/attachment/*"
- [x] fix server deployment needing package.json 2 levels above with version
- [x] Add dialog for app updates to allow user to easily reload the app
- [x] server: check file upload dir for readwrite permissions

</details>

## ✅ 0.6.0 - Basic account features

<details>
  <summary>todolist</summary>

- [x] public registrations with captcha
  - [x] simple implementation
  - [x] protect against replay attacks by caching solved challenges in memory for their TTL
  - [x] increase work requirement by n when criteria met n times before 600s release period (memory cache):
    - [x] same ip (beware of reverse proxy with x-forwarded-for header)
    - [x] same email (for actions that send emails)
- [x] email verification
  - [x] basic verification link
  - [x] send the link via email directly (basic text email) -> use sendmail (system provided program and config)
  - [x] queue emails and never send 2 emails simultaneously (number of simultaneous jobs could be increased in future updates)
  - [x] allow user to re-send verification email
  - [x] add unverified email warning
  - [x] periodically delete accounts that didn't verify their email 7 days after registration
- [x] password recovery
- [x] change password
- [x] change email
- [x] add a warning about data being accessible even after a logout
  - [x] add a warning popup
  - [x] add an option to logout and wipe IDB
- [x] display list of unauthenticated users with locally stored data in auth settings
- [x] allow wiping data by-user while unauthenticated
- [x] add warning popup when user is logged out without wiping data
- [x] add "This is a safe, personal device - remember me" checkbox to opt in for a persistent refreshToken and default to
a short-lived one
- [x] PWA manifest: change display back to standalone and override theme_color with theme-color meta tag
- [x] fix: initial sync doesn't set correct attachment url (wrong logId) for member image
- [x] fix: create/update front and delete its member in the same request 500
- [x] fix: email not verified warning stays when logging out
- [x] fix: member images hosted in object storage are not cached by the client (should be cached forever)

</details>

## ✅ 0.6.1

<details>
  <summary>todolist</summary>

- [x] fix: cannot perform captcha-protected api called when using ipv6 
- [x] Add beta warning on registration page

</details>

## 🚧 0.6.2
- [x] add a word of thanks for contributors in the repo, the app and the website
- [x] Make the success message when clicking "Resend verification email" clearer (separate success and time to retry)
- [x] does the client actually use its `idb` dependency? -> no, remove it
- [x] remove dependency on @capacitor/assets
- [x] /members:
  - [x] sort fronting members at the top of the list
  - [x] allow adding and removing member from front
  - [x] rename item menu to "Members and Front"
  - [x] allow searching/filtering members by name
- [x] /front:
  - [x] move toolbar and history to /members
  - [x] remove all front edit actions
  - [x] click anywhere on current front goes to /members
  - [x] rename to /dashboard "Dashboard"
- [x] Ignore case when sorting stuff by name

## 🚧 0.7.0 - Import data from Simply Plural
- [ ] find an alternative to playwright
- [ ] Willow data model, e2e encryption and moving to a zero-trust model
  As per https://willowprotocol.org/specs/data-model/index.html#data_model
  - [ ] Make the server store members and fronts in a single table of entries - this also replaces the logs table. Each entry represents a single field (i.e. members.name would have a path akin to /members/[memberId]/name)
    - [ ] migrate the database to the new format
        ```ts
        // MAX_UPLOAD_SIZE=5242880 (5MiB), the maximum individual payload_length at the controller level
        // MAX_STORAGE_PER_USER=5368709120 (5GiB), the maximum sum of payload_length per user at the service level
        // hash_payload is 
        interface Entry {
            // Not a db field
            readonly namespace_id: "org.openselves";
            // foreignKey users.userId
            readonly subspace_id: string;
            readonly path: string;
            // was logs.executedAt
            timestamp: number;
            // length of entries.payload in bytes
            payload_length: U64;
            // The result of applying hash_payload to the Payload.
            payload_digest: PayloadDigest;
    
            // null means the payload was not transmitted yet
            payload: string | null;
		
            // Server-only field
            // null, 0 to 8192 bytes, payload contains the raw value
            // "s3", 8193 to Infinity bytes, means payload contains the necessary reference to identify, fetch or delete the s3 object
            payload_storage: null | "s3";
    
            // Server-only field
            // was logs.pushedAt
            // is set to now() when entry is created
            // is updated to now() whenever any other non-readonly field changes
            updated_at: number;
        }
        ```
    - [ ] Drop uploaded entries for which there exists a newer entry in DB whose path prefixes the uploaded entry
    - [ ] For each uploaded entry, delete all entries in the same namespace AND subspace AND whose path is prefixed by the uploaded entry
    - [ ] insert remaining entries in DB
    - [ ] initial sync is no longer a separate process. to retrieve all data, call /sync/pull with the timestamp set to 0
- [ ] simply plural data importer (save all simply plural ids!)
- [ ] simply plural data vault
- [ ] encryption (client side)
  - [ ] make sure the password is never sent to the server (srp? opaque?)
  - [ ] use PBKDF2 to derive the KEK from the password, store it securely (idb?)
  - [ ] generate a CEK, encrypt it with the KEK and store the result as an entry
  - [ ] check the
  - [ ] generate a CEK, encrypt it with the KEK and store as entry /encryption/CEK/recovery
  - [ ] put the public key in a "/public.key"
  - [ ] encrypt path components
  - [ ] encrypt payloads

## 0.8.0 - Optimizations
- [ ] client
  - [ ] drop prior unsynced create and update operations when deleting a record
  - [ ] leverage @capacitor/background-runner
  - [ ] leverage Background Sync API when available
  - [ ] detect unused translations and fail build
- [ ] server
  - [ ] preload all records used by sub-functions of computeOperations (solveHistory, filterCascadeDeletedRecordsOperations...) in computeOperations 
  - [ ] purge logs that don't have an effect anymore
  - [ ] use @nestjs/cache-manager to cache s3 get responses
  - [ ] throttle requests using @nestjs/throttler
  - [ ] sign cookies (accessToken, refreshToken) (this should harden against DDOS)
  - [ ] turn on Secure flag on cookies (except in dev and test mode)
  - [ ] lock rows in sync engine operations transaction

## 0.9.0 - Exclusive-offline mode
- [ ] add data export to zip file (json files + image files)
- [ ] add data import from zip file
- [ ] add data export to a consolidated json
- [ ] add an option to create a local profile without registering an account
- [ ] add an option to switch to a local profile without authentication
- [ ] warn the user that using the app in this mode has potential data loss risks and that they should backup their data regularly
- [ ] add data backup reminder
- [ ] add a way to copy data to the active local profile from any other local profile
- [ ] Android: store data in a more persistent place than IndexedDB? Auto-backup?

## 0.10.0 - UI tweaks
- [ ] make sure FABs menu buttons in members page (and others?) show on screen without the need to scroll on browsers
- [ ] show proper language names in language switcher
- [ ] current fronts: buttons are unclear, show hint tooltip on long press (and vibrate)
- [ ] fab menus: don't use fab menus, always show "add" action (with a tooltip), put secondary actions in a toolbar?
- [ ] ListInput: make the text field focus when clicking anywhere inside the whole visible box (+ cursor change)
- [ ] member edit: make profile picture edit button always visible (maybe move it outside the image's box)
- [ ] ListInput: make clear button better (example: member edit form color field)
- [ ] bug: click on a member's card image captures click events, preventing from performing card click action
- [ ] Member color picker: use a custom color picker (android doesn't let you customize it)
- [ ] bug: s3-uploaded profile pictures aren't loaded on browser tab restore (caching issue?)
- [ ] normalize all dialog `buttons()` to `DialogButton` instead of `Button`
- [ ] add <title> to all client pages

## 1.0.0 - Official release
- [ ] general UI/UX accessibility check
- [ ] add demo screenshots to https://openselves.org and the PWA's manifest
- [ ] prepare for release on Android app stores (Google Play, F-Droid)
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

## To plan
- [ ] Add rich html version of emails
- [ ] Translate emails
- [ ] Translate form validation errors received from server

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
- data trust and privacy
  - encrypt and decrypt synced data in client
  - sign sync operations in client and verify incoming operations
  - move reduction and conflict resolution algorithm to client?
- save a backup of remote (url) images (member pfp) in IDB as data uris
- warn the user when the remote image doesn't load and allow them to use the backup image instead
- Member onboarding procedure (needs thought out UX)
- Make different types of groups? (sub-system, geographical, tag...) -> "visual only"
- Public system page (optional, show name, optional show {profile picture, description, fronts, members}) -> needs a
  separate privacy setting for individual members
- Public member page
- Automatic PluralKit integration
- Instant Messaging app designed for plural people first