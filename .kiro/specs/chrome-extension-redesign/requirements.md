# Requirements Document

## Introduction

This feature redesigns the LinkProcessingAgent Chrome extension's user-facing surfaces — the toolbar popup and the options page — and restructures the save flow around asynchronous background execution with system notifications. The current popup performs the save inline via an SSE stream; closing the popup aborts the stream, which breaks the user experience for slow LLM-driven summarization jobs.

The redesign has four goals:

1. Modernize the popup's visual design and interaction model so users can act quickly and see system state at a glance.
2. Restructure the options page with clearer information architecture and per-section grouping.
3. Move save execution to the background service worker so jobs survive popup closure.
4. Integrate Chrome notifications so users learn about completion or failure without keeping the popup open.

The redesign is a front-end-only change: the backing HTTP server (`serve` subcommand, endpoints `/v1/healthz`, `/v1/process`, `/v1/route`) is unchanged.

## Glossary

- **Popup_View**: The UI rendered by `src/popup.html` when the user clicks the toolbar icon.
- **Options_Page**: The settings UI rendered by `src/options.html`, opened via `chrome://extensions` details or the popup's gear button.
- **Background_Worker**: The MV3 service worker registered as `background.service_worker` in `manifest.json` (`src/background.js`).
- **API_Client**: The shared fetch module (`src/api.js`) used by both Popup_View and Background_Worker to talk to the Server.
- **Server**: The local HTTP server started by `link-processing serve`, exposing `/v1/healthz`, `/v1/process`, and `/v1/route`.
- **Job**: A single save-to-Obsidian task representing one URL, duplicate policy, and OSS mirror choice.
- **Job_Store**: The persistent record of recent and in-flight Jobs, backed by `chrome.storage.local`.
- **Notification_Service**: The module that wraps `chrome.notifications` and applies user preferences before emitting OS notifications.
- **Notification_Preferences**: The user-configurable toggles controlling whether notifications are emitted on success, skip, or failure.
- **Duplicate_Policy**: One of `create`, `skip`, or `update`, controlling how the Server handles a URL already present in the vault.
- **OSS_Mirror**: The optional upload of extracted content to an S3-compatible object store, toggleable per Job.
- **SSE_Stream**: The `text/event-stream` response from `POST /v1/process?stream=1` that emits `progress`, `result`, and `error` events.
- **Progress_Step**: A string identifier for one phase of a Job (`starting`, `fetching`, `preparing`, `drafting`, `extracting`, `revising`, `saving`, `mirroring`).
- **Loopback_Host**: A hostname resolving only to the local machine: `127.0.0.1`, `::1`, or `localhost`.
- **Supported_URL**: An `http:` or `https:` URL; all other schemes are unsupported.

## Requirements

### Requirement 1: Modernized Popup Visual Design

**User Story:** As a user, I want the popup to present the current tab and save controls in a clean, scannable layout, so that I can decide and act within a few seconds.

#### Acceptance Criteria

1. THE Popup_View SHALL render a header containing the product name and a settings icon button with an accessible name equivalent to "Open settings".
2. WHEN the user activates the settings icon button, THE Popup_View SHALL open the Options_Page.
3. THE Popup_View SHALL display the active tab's title (truncated to 60 characters with a trailing ellipsis when longer), origin, and favicon in a single card above the primary action.
4. IF the favicon image fails to load within 3 seconds or errors, THEN THE Popup_View SHALL render a default placeholder icon in its place and continue rendering the card.
5. THE Popup_View SHALL present a primary action button labeled "Save to Obsidian" whose width fills the popup content area.
6. THE Popup_View SHALL expose per-save overrides for Duplicate_Policy and OSS_Mirror inside a collapsible section that is collapsed on initial render and whose toggle exposes an accessible expanded or collapsed state.
7. THE Popup_View SHALL render with a content width between 360 and 420 CSS pixels.
8. WHILE the operating system color scheme preference is light, THE Popup_View SHALL render using the light scheme palette with all text achieving at least a 4.5:1 contrast ratio against its background.
9. WHILE the operating system color scheme preference is dark, THE Popup_View SHALL render using the dark scheme palette with all text achieving at least a 4.5:1 contrast ratio against its background.
10. THE Popup_View SHALL display a footer line stating the configured Server origin and its health status, where the health status is one of "healthy", "unreachable", or "checking".
11. IF the active tab's URL is not a Supported_URL, THEN THE Popup_View SHALL disable the primary action and display the message "This page cannot be saved (only http and https URLs are supported)".

### Requirement 2: Asynchronous Save Dispatch

**User Story:** As a user, I want to close the popup or switch tabs while a save is still in progress, so that I am not blocked by a slow LLM call.

#### Acceptance Criteria

1. WHEN the user activates the primary action in the Popup_View, THE Popup_View SHALL send a `dispatchJob` message to the Background_Worker and re-enable user interaction on the Popup_View controls within 200 milliseconds of the activation event.
2. THE Background_Worker SHALL execute each Job using the API_Client independently of the Popup_View lifetime.
3. WHILE a Job is executing, THE Background_Worker SHALL continue running even if the Popup_View is closed.
4. WHEN the Popup_View is closed during Job execution, THE Background_Worker SHALL NOT cancel the Job.
5. WHEN the user activates the keyboard shortcut `save_current_tab` and the active tab URL is a Supported_URL, THE Background_Worker SHALL dispatch a Job for the active tab URL using stored defaults.
6. WHEN the user clicks a context menu item registered by the Background_Worker on a link target, THE Background_Worker SHALL dispatch a Job for the link href URL.
7. WHEN the user clicks a context menu item registered by the Background_Worker on a page target without a link, THE Background_Worker SHALL dispatch a Job for the current page URL.
8. THE Background_Worker SHALL assign each dispatched Job an identifier that is unique across all Jobs stored in the Job_Store at dispatch time before starting execution.
9. IF the Background_Worker does not acknowledge the `dispatchJob` message within 2 seconds, THEN THE Popup_View SHALL display an error state to the user indicating dispatch failure and SHALL re-enable the primary action.
10. IF the keyboard shortcut `save_current_tab` is activated while the active tab URL is not a Supported_URL, THEN THE Background_Worker SHALL NOT create a Job and SHALL emit a failure notification via the Notification_Service indicating the URL is unsupported.

### Requirement 3: Job Progress Streaming and State

**User Story:** As a user, I want to see which phase a running save is in, so that I know the system is still working.

#### Acceptance Criteria

1. WHILE a Job is executing, THE Background_Worker SHALL consume events from the SSE_Stream and persist the latest Progress_Step to the Job_Store within 200 milliseconds of receiving each event.
2. WHILE the Popup_View is open AND a Job is executing, WHEN the latest Progress_Step recorded in the Job_Store changes, THE Popup_View SHALL display the new Progress_Step within 500 milliseconds of the change.
3. WHEN the Popup_View opens while a Job is executing, THE Popup_View SHALL display the latest Progress_Step currently recorded in the Job_Store within 500 milliseconds of view load completion.
4. THE Popup_View SHALL map each Progress_Step identifier to a human-readable label defined in a static identifier-to-label table (for example, `drafting` to "Drafting note (pass 1)").
5. IF the Popup_View receives a Progress_Step identifier that is not present in the identifier-to-label table, THEN THE Popup_View SHALL display the received identifier string verbatim as the label.
6. WHEN a Job transitions to a terminal state of succeeded, skipped, or failed, THE Background_Worker SHALL record in the Job_Store the terminal status and `finishedAt` formatted as an ISO 8601 UTC timestamp, together with the result payload for succeeded or skipped Jobs or the error code and error message for failed Jobs.
7. IF the SSE_Stream closes before a `result` event is received, THEN THE Background_Worker SHALL mark the Job as failed with error code `STREAM_DISCONNECTED` and an error message indicating that the stream ended before completion.
8. IF no SSE event is received from the Server for 60 consecutive seconds while a Job is executing, THEN THE Background_Worker SHALL close the SSE_Stream and mark the Job as failed with error code `STREAM_DISCONNECTED` and an error message indicating the stall timeout.
9. IF a network error (connection refusal, connection reset, DNS resolution failure, TLS handshake failure, or request timeout) occurs while consuming the SSE_Stream, THEN THE Background_Worker SHALL mark the Job as failed with error code `NETWORK` and an error message containing the underlying error description.

### Requirement 4: Job History in the Popup

**User Story:** As a user, I want to see recent saves in the popup so that I can confirm results without opening a separate history page.

#### Acceptance Criteria

1. THE Job_Store SHALL persist the 20 most recent Jobs, each including `id`, `url`, `title`, `status`, `startedAt`, `finishedAt`, `obsidianPath`, `ossUrl`, `errorCode`, and `errorMessage`.
2. WHEN the number of persisted Jobs would exceed 20, THE Background_Worker SHALL evict Jobs by earliest `startedAt` first until exactly 20 Jobs remain.
3. THE Popup_View SHALL render up to the 5 most recent Jobs ordered by `startedAt` descending below the primary action, displaying all available Jobs when fewer than 5 exist in the Job_Store.
4. THE Popup_View SHALL render each Job row with a status indicator corresponding to one of running, succeeded, skipped, or failed; the page title truncated to 60 characters with a trailing ellipsis when longer, on a single line; and a relative timestamp formatted as "Ns ago" for intervals under 60 seconds, "Nm ago" for intervals under 60 minutes, "Nh ago" for intervals under 24 hours, and "Nd ago" for longer intervals.
5. WHEN the user clicks a Job row whose status is succeeded and whose result contains a non-empty `obsidianPath`, THE Popup_View SHALL copy the `obsidianPath` to the clipboard and display a confirmation indicator on that row that remains visible for 2 seconds.
6. WHILE a Job row represents a Job whose status is failed, THE Popup_View SHALL render a "Retry" control on that row.
7. WHEN the user activates a "Retry" control on a failed Job row, THE Popup_View SHALL send a new `dispatchJob` message to the Background_Worker using the same URL and the overrides of the original Job.
8. WHEN the user activates the "Clear history" control, THE Popup_View SHALL remove all Jobs whose status is succeeded, skipped, or failed from the Job_Store and retain all Jobs whose status is running.
9. WHILE no Jobs exist in the Job_Store, THE Popup_View SHALL render an empty-state message in the Job history area instead of Job rows.
10. IF writing to the clipboard fails during a row click or retry, THEN THE Popup_View SHALL display an error indicator on the affected row that remains visible for 2 seconds and SHALL leave the Job_Store unchanged.

### Requirement 5: Chrome Notification Emission

**User Story:** As a user, I want Chrome to notify me when a background save finishes, so that I do not need to keep the popup open.

#### Acceptance Criteria

1. WHEN a Job transitions to succeeded with `skipped` not set to true and a non-empty `obsidianPath`, AND Notification_Preferences permit success notifications, THE Notification_Service SHALL emit a notification whose title is "Saved to Obsidian" and whose body is the note title followed by a single space and the relative vault path, truncated at 200 characters with a trailing ellipsis when exceeded.
2. WHEN a Job transitions to succeeded with `skipped=true`, AND Notification_Preferences permit skip notifications, THE Notification_Service SHALL emit a notification whose title is "Already in vault" and whose body is the Job's `obsidianPath`, truncated at 200 characters with a trailing ellipsis when exceeded.
3. WHEN a Job transitions to failed, AND Notification_Preferences permit failure notifications, THE Notification_Service SHALL emit a notification whose title is "Save failed" and whose body contains the error code and error message separated by a colon and a space, truncated to 300 characters total with a trailing ellipsis when exceeded.
4. THE Notification_Service SHALL set the notification `iconUrl` to the extension's 128-pixel icon asset.
5. THE Notification_Service SHALL use a notification id of the form `lp-job-{jobId}` so that repeated updates to the same Job replace the existing notification rather than stacking.
6. WHEN the user clicks a notification whose underlying Job has status succeeded or skipped with a non-empty `obsidianPath`, THE Background_Worker SHALL copy the `obsidianPath` to the clipboard and close the notification within 1 second.
7. WHEN the user clicks a failure notification, THE Background_Worker SHALL open the Options_Page and close the notification within 1 second.
8. IF emitting a notification throws (for example, OS-level notifications are disabled), THEN THE Notification_Service SHALL log the failure, leave the Job's status unchanged, and continue without propagating the error to the Job.
9. WHERE Notification_Preferences suppress the outcome type of a terminal Job transition, THE Notification_Service SHALL NOT emit any notification for that transition.
10. THE Notification_Service SHALL emit at most one notification per Job per terminal-state transition and SHALL NOT emit notifications for non-terminal Progress_Step changes.

### Requirement 6: Notification Preferences

**User Story:** As a user, I want to control which events produce notifications so that the extension is not noisy.

#### Acceptance Criteria

1. THE Options_Page SHALL expose three independent toggles in a "Notifications" section labeled "Notify on success", "Notify on skip", and "Notify on failure".
2. WHEN the extension is installed for the first time, THE Background_Worker SHALL write default values of enabled for all three Notification_Preferences toggles to `chrome.storage.local` before any Job is dispatched.
3. WHEN the user changes any Notification_Preferences toggle in the Options_Page, THE Options_Page SHALL persist the new value to `chrome.storage.local` within 200 milliseconds.
4. WHEN a Job transitions to a terminal state (succeeded not skipped, succeeded with skipped=true, or failed), THE Notification_Service SHALL read the current Notification_Preferences from `chrome.storage.local`, map the terminal state to its corresponding toggle (succeeded→"Notify on success", skipped→"Notify on skip", failed→"Notify on failure"), and emit a notification only if that toggle is enabled.
5. WHERE all three Notification_Preferences toggles are disabled, THE Notification_Service SHALL suppress all outgoing notifications.
6. IF persisting a Notification_Preferences toggle change to `chrome.storage.local` fails, THEN THE Options_Page SHALL revert the toggle control to its previous value and display an error indicator.
7. IF reading Notification_Preferences from `chrome.storage.local` fails when a Job reaches a terminal state, THEN THE Notification_Service SHALL treat all three toggles as enabled for that Job and emit the notification corresponding to that Job's terminal state.
8. WHEN the Options_Page loads, THE Options_Page SHALL initialize each of the three toggle controls from the persisted Notification_Preferences in `chrome.storage.local`.

### Requirement 7: Options Page Information Architecture

**User Story:** As a user, I want settings grouped into meaningful sections so that I can find what I need quickly.

#### Acceptance Criteria

1. THE Options_Page SHALL present settings in four labeled sections in this order: "Server Connection", "Default Save Behavior", "Notifications", "Help".
2. THE Options_Page SHALL render each section with a heading visually distinguished from body text by a larger font size or heavier weight, and with a single-line description of at most 120 characters summarizing the section's purpose.
3. WHILE the viewport width is at least 560 CSS pixels, THE Options_Page SHALL render its main content with a width between 560 and 720 CSS pixels, centered horizontally in the viewport.
4. IF the viewport width is less than 560 CSS pixels, THEN THE Options_Page SHALL render its main content at the full viewport width with horizontal padding of at least 16 CSS pixels on each side, and SHALL NOT introduce horizontal scrolling.
5. THE Options_Page SHALL render all text, controls, and borders using the color scheme (light or dark) indicated by the operating system's preference, with all text meeting a contrast ratio of at least 4.5:1 against its background and all interactive controls remaining visible and operable in both schemes.
6. THE Options_Page SHALL visually group related controls within each section using a card or bordered container that is distinguishable from the page background by either a visible border or a background-color difference.
7. WHEN the user commits a change to a setting (blur for text inputs, change event for selects and checkboxes), THE Options_Page SHALL persist the new value to `chrome.storage.local` within 500 milliseconds of the commit event, without requiring a separate "Save" button.
8. WHEN a setting value is successfully persisted, THE Options_Page SHALL display a transient "Saved" indicator associated with the changed control and SHALL remove the indicator 2 seconds after it is first shown.
9. IF persisting a changed setting to `chrome.storage.local` fails, THEN THE Options_Page SHALL revert the displayed control value to the last successfully persisted value and SHALL display an error indicator informing the user that the save failed.

### Requirement 8: Server Connection Configuration

**User Story:** As a user, I want to configure the local server URL and bearer token and verify connectivity from the Options_Page.

#### Acceptance Criteria

1. THE Options_Page SHALL expose, under the "Server Connection" section, a "Server URL" input of type url with a maximum length of 2048 characters and a "Bearer token" input of type password with a maximum length of 512 characters.
2. WHEN the "Server URL" value is edited, THE Options_Page SHALL display, within 500 milliseconds after the last keystroke, a validation hint indicating whether the parsed host is a Loopback_Host or a non-loopback host.
3. IF the entered Server URL is not a syntactically valid `http:` or `https:` URL, THEN THE Options_Page SHALL display an inline error indicator adjacent to the "Server URL" field and SHALL NOT persist the value to storage.
4. WHILE the configured Server URL host is not a Loopback_Host, THE Options_Page SHALL display a persistent warning banner within the "Server Connection" section stating that the Bearer token will be transmitted outside the Loopback_Host.
5. WHEN the user activates the "Test connection" button, THE Options_Page SHALL call `GET /v1/healthz` via the API_Client using the currently entered Server URL and Bearer token, disable the "Test connection" button until the request resolves or times out, and display an in-progress indicator.
6. WHEN the "Test connection" request returns a successful response within 5 seconds, THE Options_Page SHALL display, within 1 second of response receipt, a status message containing the literal text "Connected" followed by the response body received from the Server.
7. IF the "Test connection" request returns an error response from the API_Client within 5 seconds, THEN THE Options_Page SHALL display an error message containing the error description returned by the API_Client, re-enable the "Test connection" button, and leave the currently stored Server URL and Bearer token unchanged.
8. IF the "Test connection" request does not complete within 5 seconds, THEN THE Options_Page SHALL cancel the request, re-enable the "Test connection" button, and display the literal error message "Timed out after 5 seconds".
9. IF the user activates the "Test connection" button while either the "Server URL" field or "Bearer token" field is empty, THEN THE Options_Page SHALL display an inline validation error on the empty field and SHALL NOT issue the request.

### Requirement 9: Default Save Behavior Configuration

**User Story:** As a user, I want to choose default Duplicate_Policy and OSS_Mirror values so that the popup reflects my typical preferences.

#### Acceptance Criteria

1. THE Options_Page SHALL expose a Duplicate_Policy select with values `create`, `skip`, and `update` under the "Default Save Behavior" section, initialized to the persisted value or to `create` when no value has been persisted.
2. THE Options_Page SHALL expose an OSS_Mirror checkbox under the "Default Save Behavior" section, initialized to the persisted value or to unchecked when no value has been persisted.
3. WHEN the Popup_View is opened, THE Popup_View SHALL initialize its Duplicate_Policy and OSS_Mirror controls from the persisted defaults within 500 milliseconds of view load completion.
4. WHEN the user changes a per-save override in the Popup_View, THE Popup_View SHALL apply the override only to the next dispatched Job without modifying the persisted defaults.
5. WHEN the user changes the Duplicate_Policy select or OSS_Mirror checkbox in the Options_Page, THE Options_Page SHALL persist the new value to `chrome.storage.local` within 500 milliseconds of the change event and display a transient "Saved" indicator.
6. IF reading the persisted Duplicate_Policy or OSS_Mirror value from `chrome.storage.local` fails or returns an invalid value, THEN the consuming surface (Options_Page or Popup_View) SHALL fall back to the factory defaults (`create` and unchecked) and SHALL display an indicator informing the user that defaults could not be loaded.

### Requirement 10: Keyboard Shortcut and Context Menu Parity

**User Story:** As a user, I want saves triggered by keyboard shortcut or context menu to produce the same notifications and history entries as popup-triggered saves.

#### Acceptance Criteria

1. WHEN the keyboard shortcut `save_current_tab` is pressed and the active tab URL is a Supported_URL, THE Background_Worker SHALL dispatch a Job using the active tab URL and record it in the Job_Store with identical field structure (Job identifier, source URL, dispatch timestamp, origin marker, current status, Duplicate_Policy decision) to Jobs dispatched from the Popup_View, within 500 milliseconds of the shortcut event.
2. WHEN a context menu item is invoked on a link target whose href is a Supported_URL, THE Background_Worker SHALL dispatch a Job using the link href and record it in the Job_Store with identical field structure to Jobs dispatched from the Popup_View, within 500 milliseconds of the context menu event.
3. WHEN a context menu item is invoked on a page target without a link whose page URL is a Supported_URL, THE Background_Worker SHALL dispatch a Job using the page URL and record it in the Job_Store with identical field structure to Jobs dispatched from the Popup_View, within 500 milliseconds of the context menu event.
4. WHEN a Job dispatched via keyboard shortcut or context menu reaches a terminal state (succeeded, failed, or skipped), THE Notification_Service SHALL evaluate Notification_Preferences using the same rules and inputs applied to Popup_View-dispatched Jobs and SHALL produce notifications matching Popup_View-dispatched Job notifications in channel, content fields, and trigger conditions.
5. IF the keyboard shortcut `save_current_tab` is pressed while the active tab URL is not a Supported_URL, THEN THE Background_Worker SHALL NOT create a Job_Store entry and SHALL emit a notification via the Notification_Service indicating the URL is unsupported.
6. IF a context menu item is invoked and the selected source URL (link href for link targets, page URL for page targets) is not a Supported_URL, THEN THE Background_Worker SHALL NOT create a Job_Store entry and SHALL emit a notification via the Notification_Service indicating the URL is unsupported.

### Requirement 11: Popup Health and Error Presentation

**User Story:** As a user, I want the popup to tell me when the server is down or misconfigured so that I can fix it.

#### Acceptance Criteria

1. WHEN the Popup_View is opened, THE Popup_View SHALL call `GET /v1/healthz` via the API_Client.
2. WHEN the health check request returns a successful response, THE Popup_View SHALL display a "healthy" status indicator in the footer within 3 seconds of the Popup_View opening.
3. IF the health check request returns an unsuccessful HTTP response, times out after 3 seconds, or fails with a connection error, THEN THE Popup_View SHALL display a banner in the Popup_View indicating the Server is unreachable, containing a link that opens the Options_Page when activated.
4. IF a dispatched Job fails with HTTP status 401, THEN THE Popup_View SHALL display a banner indicating authentication failed, containing a link that opens the Options_Page when activated.
5. THE Popup_View SHALL render each failed Job row with its error code and an error message truncated to 140 characters with a trailing ellipsis appended when truncation occurs.

### Requirement 12: Accessibility and Keyboard Use

**User Story:** As a keyboard and screen-reader user, I want the popup and options page to be navigable without a mouse.

#### Acceptance Criteria

1. THE Popup_View SHALL allow Tab and Shift+Tab to visit every enabled and visible interactive control exactly once per cycle, in the same order the controls appear visually from top to bottom and left to right, skipping controls that are hidden, removed from the layout, or disabled.
2. WHEN a button-type control in the Popup_View is focused and the user presses Enter or Space, THE Popup_View SHALL invoke the same action as a mouse click on that control, including dispatching a Job when the primary action control is activated.
3. WHEN the current Job's Progress_Step changes, including transitions into terminal states (succeeded, failed, skipped), THE Popup_View SHALL announce the new step through an `aria-live="polite"` region within 1 second of the state change.
4. IF a Job transitions to a failed state, THEN THE Popup_View SHALL announce the failure and its user-facing reason through an `aria-live="assertive"` region, without removing the prior progress announcement from the accessible name of the polite region.
5. THE Options_Page SHALL associate every interactive form control with a visible label element through matching `for` and `id` attributes, such that no interactive form control is rendered without an associated label.
6. THE Popup_View and Options_Page SHALL render focus indicators on every interactive control with a minimum 3:1 contrast ratio against the adjacent background in both the light color scheme and the dark color scheme.
7. WHEN the Popup_View finishes rendering after being opened, THE Popup_View SHALL place initial keyboard focus on the primary action control, or on the first enabled interactive control in tab order if the primary action control is disabled.

### Requirement 13: Privacy and Network Scope

**User Story:** As a security-conscious user, I want assurance that the extension only talks to the server I configured.

#### Acceptance Criteria

1. THE API_Client SHALL issue HTTP requests only to URLs whose origin (scheme, host, and port) matches the Server URL configured in `chrome.storage.local`.
2. WHEN the user dispatches a Job, THE API_Client SHALL attach the bearer token only to requests whose destination origin matches the configured Server URL origin, and SHALL NOT attach the bearer token to any other request, including requests triggered by HTTP redirects to a different origin.
3. IF the API_Client encounters an HTTP redirect to an origin that does not match the configured Server URL origin, THEN THE API_Client SHALL abort the request and return an error without following the redirect.
4. IF the configured Server URL in `chrome.storage.local` is empty, unparseable, or uses a scheme other than `http:` or `https:`, THEN THE Background_Worker SHALL log an error, mark the Job as failed with an error code identifying invalid server configuration, and surface the failure through the Notification_Service.
