/// Computer Use: semantic AX and background-safe macOS computer use.
///
/// The runtime is MCP-independent. This binary exposes it over a small stdio
/// adapter because existing agent clients already speak MCP.

import AppKit
import Foundation

setbuf(stdout, nil)

let args = CommandLine.arguments
if args.count >= 2 && args[1] == "mcp" {
    if ProcessInfo.processInfo.environment["OPENWORK_COMPUTER_USE_CURSOR_OVERLAY"] == "0" {
        let server = MCPServer()
        await server.run()
    } else {
        await runMCPServerWithOverlay()
    }
} else {
    await runPermissionSetupApp()
}

@MainActor
func runMCPServerWithOverlay() async {
    NSApplication.shared.setActivationPolicy(.accessory)
    let server = MCPServer()
    Task.detached {
        await server.run()
        await MainActor.run {
            NSApplication.shared.terminate(nil)
        }
    }
    NSApplication.shared.run()
}

@MainActor
func runPermissionSetupApp() async {
    NSApplication.shared.setActivationPolicy(.regular)
    let appDelegate = PermissionSetupAppDelegate()
    NSApplication.shared.delegate = appDelegate
    NSApplication.shared.run()
}
