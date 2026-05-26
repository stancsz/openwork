/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Settings2 } from "lucide-react";

import { desktopBridge } from "../../../app/lib/desktop";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { registerExtensionConfig } from "./extension-registry";

type ComputerUsePermissionStatus = {
  ok: boolean;
  accessibility: boolean;
  screenRecording: boolean;
  error?: string;
};

type ComputerUseConfigProps = {
  connected: boolean;
  connecting: boolean;
  onConnect?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
};

registerExtensionConfig("computer-use", (ctx) => (
  <ComputerUseConfig
    connected={ctx.computerUse?.connected ?? false}
    connecting={ctx.computerUse?.connecting ?? false}
    onConnect={ctx.computerUse?.onConnect}
    onRefresh={ctx.computerUse?.onRefresh}
  />
));

function hasDesktopBridge() {
  return typeof window !== "undefined" && Boolean(window.__OPENWORK_ELECTRON__?.invokeDesktop);
}

function normalizePermissionStatus(value: unknown): ComputerUsePermissionStatus {
  if (typeof value !== "object" || value === null) {
    return {
      ok: false,
      accessibility: false,
      screenRecording: false,
      error: "Computer Use returned an unreadable permission response.",
    };
  }

  if (!("accessibility" in value) || !("screenRecording" in value)) {
    return {
      ok: false,
      accessibility: false,
      screenRecording: false,
      error: "Computer Use did not return both required macOS permission checks.",
    };
  }

  const error = "error" in value && typeof value.error === "string" ? value.error : undefined;
  return {
    ok: "ok" in value && value.ok === true,
    accessibility: value.accessibility === true,
    screenRecording: value.screenRecording === true,
    error,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ComputerUseConfig(props: ComputerUseConfigProps) {
  const [permissions, setPermissions] = useState<ComputerUsePermissionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [launching, setLaunching] = useState(false);
  // watchingForGrant: true while we are polling after the helper is open
  const [watchingForGrant, setWatchingForGrant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop the background polling loop.
  const stopWatching = useCallback(() => {
    if (watchIntervalRef.current !== null) {
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = null;
    }
    if (watchTimeoutRef.current !== null) {
      clearTimeout(watchTimeoutRef.current);
      watchTimeoutRef.current = null;
    }
    setWatchingForGrant(false);
  }, []);

  // Start polling every 2 s until both permissions are granted or 3 min pass.
  const startWatching = useCallback(() => {
    stopWatching();
    setWatchingForGrant(true);

    const poll = async () => {
      if (!hasDesktopBridge()) return;
      try {
        const result = await desktopBridge.checkComputerUsePermissions();
        const next = normalizePermissionStatus(result);
        setPermissions(next);
        if (next.accessibility && next.screenRecording) {
          stopWatching();
        }
      } catch {
        // silent — keep polling
      }
    };

    watchIntervalRef.current = setInterval(() => void poll(), 2_000);
    // Auto-cancel after 3 minutes so we don't poll forever.
    watchTimeoutRef.current = setTimeout(stopWatching, 3 * 60 * 1_000);
  }, [stopWatching]);

  // Clean up on unmount.
  useEffect(() => () => stopWatching(), [stopWatching]);

  const refreshPermissions = useCallback(async () => {
    if (!hasDesktopBridge()) {
      setError("Computer Use setup is only available in the OpenWork desktop app on macOS.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const result = await desktopBridge.checkComputerUsePermissions();
      setPermissions(normalizePermissionStatus(result));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const openPermissionHelper = async () => {
    if (!hasDesktopBridge()) {
      setError("OpenWork desktop is required to launch the Computer Use helper.");
      return;
    }
    setError(null);
    setLaunching(true);
    stopWatching();
    try {
      const result = await desktopBridge.openComputerUsePermissionSetup();
      const next = normalizePermissionStatus(result);
      setPermissions(next);
      // Helper is confirmed running — start polling so we pick up grants immediately.
      if (!next.accessibility || !next.screenRecording) {
        startWatching();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLaunching(false);
    }
  };

  const allGranted = permissions?.accessibility === true && permissions.screenRecording === true;
  const helperRunning = permissions?.appRunning === true;
  const initialChecking = permissions === null && checking;

  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>Computer Use setup</CardTitle>
        <CardDescription>Connect the local MCP server and grant the macOS permissions it needs to control apps.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={() => void refreshPermissions()} disabled={checking || launching || watchingForGrant}>
            <RefreshCw className={checking ? "animate-spin" : ""} />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* Step 1 */}
        <SetupRow
          title="1. Connect Computer Use MCP"
          description="Adds the local Computer Use server to this workspace so Composer can use the computer-control tools."
          complete={props.connected}
        >
          <Button
            className="min-h-10 w-full whitespace-normal text-center lg:w-auto"
            onClick={() => void props.onConnect?.()}
            disabled={!props.onConnect || props.connected || props.connecting}
          >
            {props.connecting ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
            <span className="min-w-0 break-words">
              {props.connected ? "Configured" : props.connecting ? "Connecting…" : "Connect MCP"}
            </span>
          </Button>
        </SetupRow>

        {/* Step 2 */}
        <SetupRow
          title="2. Grant macOS permissions"
          description="Opens the OpenWork Computer Use helper app. macOS grants Accessibility and Screen Recording to that app."
          complete={allGranted}
        >
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div className="grid gap-2 xl:grid-cols-2">
              <PermissionPill
                label="Accessibility"
                granted={permissions?.accessibility === true}
                unknown={initialChecking || (!helperRunning && !launching && !watchingForGrant)}
                watching={watchingForGrant && permissions?.accessibility !== true}
              />
              <PermissionPill
                label="Screen Recording"
                granted={permissions?.screenRecording === true}
                unknown={initialChecking || (!helperRunning && !launching && !watchingForGrant)}
                watching={watchingForGrant && permissions?.screenRecording !== true}
              />
            </div>

            {watchingForGrant && !allGranted ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Waiting for permissions to be granted in the helper app…
              </p>
            ) : null}

            <Button
              className="min-h-10 w-full justify-center whitespace-normal text-center"
              onClick={() => void openPermissionHelper()}
              disabled={launching || checking}
            >
              {launching ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  <span className="min-w-0 break-words">Opening helper…</span>
                </>
              ) : (
                <>
                  <Settings2 className="size-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    {allGranted ? "Reopen helper" : watchingForGrant ? "Reopen helper" : "Grant permissions"}
                  </span>
                </>
              )}
            </Button>

            {!helperRunning && !launching && !watchingForGrant && permissions !== null && !error ? (
              <p className="text-center text-xs text-muted-foreground">
                Helper app is not running — click above to open it.
              </p>
            ) : null}
          </div>
        </SetupRow>
      </CardContent>

      <CardFooter className="border-t border-border">
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-xs text-muted-foreground">
            {allGranted
              ? "Permissions verified. Try a Composer prompt that asks Computer Use to open an app and type."
              : "After granting permissions, return here and verify."}
          </p>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row">
            {props.onRefresh ? (
              <Button
                className="min-h-10 w-full whitespace-normal text-center xl:w-auto"
                variant="outline"
                onClick={() => void props.onRefresh?.()}
              >
                <span className="min-w-0 break-words">Refresh MCP</span>
              </Button>
            ) : null}
            <Button
              className="min-h-10 w-full whitespace-normal text-center xl:w-auto"
              onClick={() => { stopWatching(); void refreshPermissions(); }}
              disabled={checking || launching}
            >
              {checking ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
              <span className="min-w-0 break-words">Verify permissions</span>
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function SetupRow(props: { title: string; description: string; complete: boolean; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <StatusIcon complete={props.complete} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-card-foreground">{props.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{props.description}</div>
          </div>
        </div>
        <div className="w-full min-w-0 xl:w-[min(22rem,44%)]">{props.children}</div>
      </div>
    </div>
  );
}

function PermissionPill(props: { label: string; granted: boolean; unknown: boolean; watching?: boolean }) {
  const { label, granted, unknown, watching } = props;
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {watching ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <StatusIcon complete={granted} muted={unknown} />
        )}
        <span className="truncate">{label}</span>
      </div>
      <span className={`shrink-0 text-xs font-medium ${granted ? "text-green-11" : watching || unknown ? "text-muted-foreground" : "text-amber-11"}`}>
        {watching ? "Waiting…" : unknown ? "Unknown" : granted ? "Granted" : "Needed"}
      </span>
    </div>
  );
}

function StatusIcon(props: { complete: boolean; muted?: boolean }) {
  if (props.complete) {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-11" />;
  }
  return <CircleAlert className={`mt-0.5 size-4 shrink-0 ${props.muted ? "text-muted-foreground" : "text-amber-11"}`} />;
}
