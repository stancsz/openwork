# Session sidebar status flows

End-to-end scenarios for sidebar indicators that show session activity while a
task is running. These flows extend the existing streaming evals by verifying
the off-screen sidebar state, not just transcript streaming.

## Preflight

1. Start the Electron app through Daytona or locally.
2. Create or select a local workspace with a working model/provider.
3. Open the main session route and verify the footer/status bar is ready.

## Flow 1: Off-screen session shows streaming

**Goal:** A user can start a long task, switch away, and still see which session
is running from the sidebar.

### Steps

1. Create Session A.
2. Send a long prompt that includes a final marker such as
   `SIDEBAR_STREAM_A_DONE`.
3. Immediately create or open Session B.
4. While Session B is selected, inspect the Session A row in the sidebar.
5. Return to Session A after the run completes.

### CDP steering

- Use `browser_eval` to click `New task`, focus `[contenteditable=true]`, insert
  the prompt with `document.execCommand('insertText', false, text)`, and click
  `Run task`.
- Use `window.location.hash` or sidebar row clicks to switch sessions.
- Query the sidebar DOM for the row matching Session A and any accessible
  streaming/status indicator inside it.

### Verification

- Session A status is running while Session B is selected.
- Session A transcript eventually contains `SIDEBAR_STREAM_A_DONE`.

### Pass criteria

- Session A shows a visible or accessible streaming indicator while off-screen.
- Session B does not inherit Session A's running state.
- The Session A indicator clears after idle without a reload.

## Flow 2: Stop clears the sidebar indicator

**Goal:** Stopping a task clears both the composer status and the sidebar
activity state.

### Steps

1. Create a new session.
2. Send a long-running prompt.
3. Wait until the run button changes to `Stop` and the sidebar row shows
   streaming.
4. Click `Stop`.
5. Poll the status bar and sidebar row.

### CDP steering

- Use visible button text for `Run task` and `Stop`.
- Poll `document.body.innerText` and sidebar row attributes for active status.

### Verification

- Session status becomes idle/ready through the session status API or renderer
  query cache.
- Transcript stops receiving new streamed text after abort.

### Pass criteria

- The status bar returns to ready.
- The sidebar indicator clears without navigating away or reloading.
- Streaming does not continue after stop.

## Flow 3: Independent status for two sessions

**Goal:** The sidebar distinguishes a completed session from another session
that is still running.

### Steps

1. Start Session A with a short prompt containing `SESSION_A_DONE`.
2. Start Session B with a longer prompt containing `SESSION_B_DONE`.
3. Switch between both sessions while Session B is still running.
4. Inspect both sidebar rows.
5. Wait until Session B completes.

### CDP steering

- Capture each session id from the current URL or renderer route state after
  creation.
- Query rows by session title, route target, or captured session id.

### Verification

- Session A transcript contains `SESSION_A_DONE` and has idle status.
- Session B has running status until its final marker arrives.

### Pass criteria

- Session A has no streaming indicator after completion.
- Session B still shows streaming while running.
- Both indicators clear once both sessions are idle.
