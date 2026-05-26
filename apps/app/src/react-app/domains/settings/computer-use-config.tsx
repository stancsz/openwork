/** @jsxImportSource react */
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const refreshPermissions = useCallback(async () => {
    if (!hasDesktopBridge()) {
      setError("Computer Use setup is only available in the OpenWork desktop app on macOS.");
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const result = await desktopBridge.checkComputerUsePermissions();
      const next = normalizePermissionStatus(result);
      setPermissions(next);
      if (next.error) {
        setError(next.error);
      }
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
      setError("OpenWork desktop is required to open the Computer Use app.");
      return;
    }

    setError(null);
    try {
      const result = await desktopBridge.openComputerUsePermissionSetup();
      const next = normalizePermissionStatus(result);
      setPermissions(next);
      setHint("OpenWork Computer Use is open. Grant both permissions there, then come back and verify.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const relaunchOpenWork = async () => {
    if (!hasDesktopBridge()) {
      setError("OpenWork desktop is required to relaunch.");
      return;
    }

    setError(null);
    try {
      await desktopBridge.relaunchOpenWork();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const allPermissionsGranted = permissions?.accessibility === true && permissions.screenRecording === true;

  return (
    <Card variant="outline" size="sm">
      <CardHeader>
        <CardTitle>Computer Use setup</CardTitle>
        <CardDescription>Connect the local MCP server and grant the macOS permissions it needs to control apps.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={() => void refreshPermissions()} disabled={checking}>
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

        {hint ? (
          <Alert>
            <Settings2 />
            <AlertDescription>{hint}</AlertDescription>
          </Alert>
        ) : null}

        <SetupRow
          title="1. Connect Computer Use MCP"
          description="Adds the local Computer Use server to this workspace so Composer can use the computer-control tools."
          complete={props.connected}
        >
          <Button className="w-full sm:w-auto" onClick={() => void props.onConnect?.()} disabled={!props.onConnect || props.connected || props.connecting}>
            {props.connecting ? <Loader2 className="size-4 animate-spin" /> : null}
            {props.connected ? "MCP configured" : props.connecting ? "Connecting..." : "Connect MCP"}
          </Button>
        </SetupRow>

        <SetupRow
          title="2. Grant macOS permissions"
          description="Open the separate OpenWork Computer Use app. macOS grants permissions to that app, not to OpenWork."
          complete={allPermissionsGranted}
        >
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <PermissionStatus label="Accessibility" granted={permissions?.accessibility === true} unknown={!permissions} />
              <PermissionStatus label="Screen Recording" granted={permissions?.screenRecording === true} unknown={!permissions} />
            </div>
            <Button className="min-h-10 w-full justify-center" onClick={() => void (allPermissionsGranted ? relaunchOpenWork() : openPermissionHelper())}>
              <Settings2 className="size-4" />
              {allPermissionsGranted ? "Relaunch OpenWork" : "Grant permissions"}
            </Button>
          </div>
        </SetupRow>
      </CardContent>
      <CardFooter className="border-t border-border">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {allPermissionsGranted ? "Permissions verified. Try a Composer prompt that asks Computer Use to open an app and type." : "After granting permissions, return here and verify again."}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {props.onRefresh ? (
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => void props.onRefresh?.()}>
                Refresh MCP
              </Button>
            ) : null}
            <Button className="w-full sm:w-auto" onClick={() => void refreshPermissions()} disabled={checking}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : null}
              Verify permissions
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <StatusIcon complete={props.complete} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-card-foreground">{props.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{props.description}</div>
          </div>
        </div>
        <div className="w-full min-w-0 sm:w-[min(22rem,44%)]">{props.children}</div>
      </div>
    </div>
  );
}

function PermissionStatus(props: { label: string; granted: boolean; unknown: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <StatusIcon complete={props.granted} muted={props.unknown} />
        <span className="truncate">{props.label}</span>
      </div>
      <span className={`shrink-0 text-xs font-medium ${props.granted ? "text-green-11" : "text-amber-11"}`}>
        {props.unknown ? "Check" : props.granted ? "Granted" : "Needed"}
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
