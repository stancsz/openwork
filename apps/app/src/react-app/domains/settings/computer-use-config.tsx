/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from "lucide-react";

import { desktopBridge } from "../../../app/lib/desktop";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { registerExtensionConfig } from "./extension-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ComputerUsePermissionStatus = {
  ok: boolean;
  accessibility: boolean;
  screenRecording: boolean;
  appRunning: boolean;
  error?: string;
};

type ComputerUseConfigProps = {
  connected: boolean;
  connecting: boolean;
  onConnect?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
};

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

registerExtensionConfig("computer-use", (ctx) => (
  <ComputerUseConfig
    connected={ctx.computerUse?.connected ?? false}
    connecting={ctx.computerUse?.connecting ?? false}
    onConnect={ctx.computerUse?.onConnect}
    onRefresh={ctx.computerUse?.onRefresh}
  />
));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasDesktopBridge() {
  return typeof window !== "undefined" && Boolean(window.__OPENWORK_ELECTRON__?.invokeDesktop);
}

function normalizePermissionStatus(value: unknown): ComputerUsePermissionStatus {
  if (typeof value !== "object" || value === null) {
    return { ok: false, accessibility: false, screenRecording: false, appRunning: false };
  }
  return {
    ok: "ok" in value && value.ok === true,
    accessibility: "accessibility" in value && value.accessibility === true,
    screenRecording: "screenRecording" in value && value.screenRecording === true,
    appRunning: "appRunning" in value && value.appRunning === true,
    error: "error" in value && typeof value.error === "string" ? value.error : undefined,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ComputerUseConfig(props: ComputerUseConfigProps) {
  const [permissions, setPermissions] = useState<ComputerUsePermissionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick silent check (no launch) — run on mount to see if helper is already running.
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

  // Launch the helper app, wait until it responds, then update status.
  const openPermissionHelper = async () => {
    if (!hasDesktopBridge()) {
      setError("OpenWork desktop is required to open the Computer Use helper.");
      return;
    }
    setError(null);
    setLaunching(true);
    try {
      const result = await desktopBridge.openComputerUsePermissionSetup();
      setPermissions(normalizePermissionStatus(result));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLaunching(false);
    }
  };

  const allGranted = permissions?.accessibility === true && permissions.screenRecording === true;
  // Helper is running but we can see its real state.
  const appRunning = permissions?.appRunning === true;
  // Still waiting for initial check.
  const initialChecking = permissions === null && checking;

  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>Computer Use setup</CardTitle>
        <CardDescription>
          Connect the local MCP server and grant the macOS permissions it needs to control apps.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refreshPermissions()}
            disabled={checking || launching}
          >
            <RefreshCw className={checking ? "animate-spin" : ""} />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {/* Step 1 — MCP */}
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
              {props.connected ? "Configured" : props.connecting ? "Connecting..." : "Connect MCP"}
            </span>
          </Button>
        </SetupRow>

        {/* Step 2 — Permissions */}
        <SetupRow
          title="2. Grant macOS permissions"
          description="Open the separate OpenWork Computer Use app. macOS grants permissions to that app, not to OpenWork."
          complete={allGranted}
        >
          <div className="flex w-full min-w-0 flex-col gap-3">
            {/* Permission status badges */}
            <div className="grid gap-2 xl:grid-cols-2">
              <PermissionPill
                label="Accessibility"
                granted={permissions?.accessibility === true}
                loading={initialChecking}
                appRunning={appRunning}
              />
              <PermissionPill
                label="Screen Recording"
                granted={permissions?.screenRecording === true}
                loading={initialChecking}
                appRunning={appRunning}
              />
            </div>

            {/* Grant / launch button */}
            <Button
              className="min-h-10 w-full justify-center whitespace-normal text-center"
              onClick={() => void openPermissionHelper()}
              disabled={launching || checking}
            >
              {launching ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  <span className="min-w-0 break-words">Opening helper app…</span>
                </>
              ) : (
                <span className="min-w-0 break-words">
                  {allGranted ? "Reopen helper app" : "Grant permissions"}
                </span>
              )}
            </Button>

            {/* Offline hint — shown only when app is confirmed not running */}
            {!appRunning && !launching && permissions !== null ? (
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
              onClick={() => void refreshPermissions()}
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function PermissionPill(props: {
  label: string;
  granted: boolean;
  loading: boolean;
  appRunning: boolean;
}) {
  const { label, granted, loading, appRunning } = props;

  let statusText: string;
  let statusClass: string;

  if (loading) {
    statusText = "Checking";
    statusClass = "text-muted-foreground";
  } else if (!appRunning) {
    statusText = "Unknown";
    statusClass = "text-muted-foreground";
  } else if (granted) {
    statusText = "Granted";
    statusClass = "text-green-11";
  } else {
    statusText = "Needed";
    statusClass = "text-amber-11";
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {loading ? (
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <StatusIcon complete={granted} muted={!appRunning} />
        )}
        <span className="truncate">{label}</span>
      </div>
      <span className={`shrink-0 text-xs font-medium ${statusClass}`}>{statusText}</span>
    </div>
  );
}

function StatusIcon(props: { complete: boolean; muted?: boolean }) {
  if (props.complete) {
    return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-11" />;
  }
  return (
    <CircleAlert
      className={`mt-0.5 size-4 shrink-0 ${props.muted ? "text-muted-foreground" : "text-amber-11"}`}
    />
  );
}
