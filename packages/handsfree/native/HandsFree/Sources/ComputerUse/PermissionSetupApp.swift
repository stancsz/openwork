import AppKit
import ApplicationServices
import Foundation
import Network

private let permissionServerPort: UInt16 = 49731

enum ComputerUsePermissionTarget: String {
    case accessibility
    case screenRecording = "screen-recording"
}

struct ComputerUsePermissionStatus {
    let accessibility: Bool
    let screenRecording: Bool

    var ok: Bool { accessibility && screenRecording }

    var dictionary: [String: Any] {
        [
            "ok": ok,
            "accessibility": accessibility,
            "screenRecording": screenRecording,
        ]
    }
}

enum ComputerUsePermissions {
    static func status() -> ComputerUsePermissionStatus {
        ComputerUsePermissionStatus(
            accessibility: AXIsProcessTrusted(),
            screenRecording: CGPreflightScreenCaptureAccess()
        )
    }

    static func request(_ target: ComputerUsePermissionTarget) {
        switch target {
        case .accessibility:
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
        case .screenRecording:
            _ = CGRequestScreenCaptureAccess()
        }
    }
}

@MainActor
final class PermissionSetupAppDelegate: NSObject, NSApplicationDelegate {
    private var windowController: PermissionSetupWindowController?
    private var server: PermissionSetupHTTPServer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let server = try PermissionSetupHTTPServer()
            server.start()
            self.server = server
        } catch {
            fputs("[ComputerUse] Failed to start permission server: \(error.localizedDescription)\n", stderr)
        }

        let windowController = PermissionSetupWindowController()
        self.windowController = windowController
        windowController.showWindow(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@MainActor
final class PermissionSetupWindowController: NSWindowController {
    private let accessibilityStatus = NSTextField(labelWithString: "")
    private let screenRecordingStatus = NSTextField(labelWithString: "")
    private let footerLabel = NSTextField(wrappingLabelWithString: "")
    private var timer: Timer?

    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 620),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OpenWork Computer Use"
        window.minSize = NSSize(width: 420, height: 560)
        window.center()
        super.init(window: window)
        window.contentView = makeContentView()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    required init?(coder: NSCoder) {
        nil
    }

    deinit {
        timer?.invalidate()
    }

    private func makeContentView() -> NSView {
        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let icon = DraggableAppIconView(frame: NSRect(x: 0, y: 0, width: 84, height: 84))
        icon.image = NSApplication.shared.applicationIconImage
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 84).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 84).isActive = true

        let iconHint = NSTextField(labelWithString: "Drag this icon into Screen Recording if macOS does not list the app.")
        iconHint.font = .systemFont(ofSize: 12)
        iconHint.textColor = .secondaryLabelColor
        iconHint.alignment = .center
        iconHint.lineBreakMode = .byWordWrapping
        iconHint.maximumNumberOfLines = 2

        let title = NSTextField(labelWithString: "OpenWork Computer Use")
        title.font = .systemFont(ofSize: 26, weight: .semibold)
        title.alignment = .center
        title.lineBreakMode = .byTruncatingTail

        let subtitle = NSTextField(wrappingLabelWithString: "Grant Accessibility and Screen Recording to this app. After both are granted, relaunch OpenWork so macOS applies the new permissions cleanly.")
        subtitle.font = .systemFont(ofSize: 14)
        subtitle.textColor = .secondaryLabelColor
        subtitle.alignment = .center

        let accessibilityRow = permissionRow(
            title: "Accessibility",
            body: "Allows semantic UI actions, focusing controls, and keyboard input.",
            statusLabel: accessibilityStatus,
            action: #selector(requestAccessibility)
        )
        let screenRecordingRow = permissionRow(
            title: "Screen Recording",
            body: "Allows snapshots so agents can understand what is on screen. If macOS opens Privacy & Security, enable OpenWork Computer Use. If it is not listed, drag the app icon above into Screen Recording.",
            statusLabel: screenRecordingStatus,
            action: #selector(requestScreenRecording)
        )

        footerLabel.font = .systemFont(ofSize: 13)
        footerLabel.textColor = .secondaryLabelColor
        footerLabel.alignment = .center

        let doneButton = NSButton(title: "Done", target: self, action: #selector(done))
        doneButton.bezelStyle = .rounded
        doneButton.controlSize = .large

        let stack = NSStackView(views: [icon, iconHint, title, subtitle, accessibilityRow, screenRecordingRow, footerLabel, doneButton])
        stack.orientation = .vertical
        stack.spacing = 16
        stack.alignment = .centerX
        stack.translatesAutoresizingMaskIntoConstraints = false

        accessibilityRow.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        screenRecordingRow.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        iconHint.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        subtitle.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        footerLabel.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true

        root.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(greaterThanOrEqualTo: root.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: root.centerYAnchor),
        ])
        return root
    }

    private func permissionRow(title: String, body: String, statusLabel: NSTextField, action: Selector) -> NSView {
        let titleLabel = NSTextField(labelWithString: title)
        titleLabel.font = .systemFont(ofSize: 16, weight: .medium)
        titleLabel.lineBreakMode = .byTruncatingTail

        let bodyLabel = NSTextField(wrappingLabelWithString: body)
        bodyLabel.font = .systemFont(ofSize: 13)
        bodyLabel.textColor = .secondaryLabelColor

        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.lineBreakMode = .byTruncatingTail

        let button = NSButton(title: "Grant Permission", target: self, action: action)
        button.bezelStyle = .rounded
        button.controlSize = .large
        button.lineBreakMode = .byTruncatingTail
        button.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let textStack = NSStackView(views: [titleLabel, bodyLabel, statusLabel])
        textStack.orientation = .vertical
        textStack.spacing = 4
        textStack.alignment = .leading

        let row = NSStackView(views: [textStack, button])
        row.orientation = .vertical
        row.spacing = 12
        row.alignment = .leading
        row.distribution = .fill
        textStack.setContentHuggingPriority(.defaultLow, for: .horizontal)
        button.widthAnchor.constraint(equalTo: row.widthAnchor).isActive = true

        let container = NSBox()
        container.boxType = .custom
        container.cornerRadius = 14
        container.borderWidth = 1
        container.borderColor = .separatorColor
        container.contentViewMargins = NSSize(width: 18, height: 14)
        container.contentView = row
        container.translatesAutoresizingMaskIntoConstraints = false
        container.heightAnchor.constraint(greaterThanOrEqualToConstant: 150).isActive = true
        return container
    }

    private func refresh() {
        let status = ComputerUsePermissions.status()
        update(label: accessibilityStatus, granted: status.accessibility)
        update(label: screenRecordingStatus, granted: status.screenRecording)
        footerLabel.stringValue = status.ok
            ? "All permissions are granted. Click Done, then relaunch OpenWork from the setup screen."
            : "Grant both permissions here. macOS may ask you to quit and reopen apps after Screen Recording changes."
    }

    private func update(label: NSTextField, granted: Bool) {
        label.stringValue = granted ? "Granted" : "Needed"
        label.textColor = granted ? .systemGreen : .systemOrange
    }

    @objc private func requestAccessibility() {
        ComputerUsePermissions.request(.accessibility)
        refresh()
    }

    @objc private func requestScreenRecording() {
        ComputerUsePermissions.request(.screenRecording)
        refresh()
    }

    @objc private func done() {
        NSApplication.shared.terminate(nil)
    }
}

final class DraggableAppIconView: NSImageView, NSDraggingSource {
    override func mouseDown(with event: NSEvent) {
        let appURL = Bundle.main.bundleURL
        guard let image else { return }
        let pasteboardItem = NSPasteboardItem()
        pasteboardItem.setString(appURL.absoluteString, forType: .fileURL)

        let draggingItem = NSDraggingItem(pasteboardWriter: pasteboardItem)
        draggingItem.setDraggingFrame(bounds, contents: image)
        beginDraggingSession(with: [draggingItem], event: event, source: self)
    }

    func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation {
        .copy
    }
}

final class PermissionSetupHTTPServer {
    private let listener: NWListener

    init() throws {
        guard let port = NWEndpoint.Port(rawValue: permissionServerPort) else {
            throw NSError(domain: "ComputerUse", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid permission server port."])
        }
        listener = try NWListener(using: .tcp, on: port)
    }

    func start() {
        listener.newConnectionHandler = { connection in
            connection.start(queue: .main)
            self.handle(connection: connection)
        }
        listener.start(queue: .main)
    }

    private func handle(connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
            let request = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let response = self.response(for: request)
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func response(for request: String) -> String {
        let firstLine = request.components(separatedBy: "\r\n").first ?? ""
        let parts = firstLine.split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        let path = parts.dropFirst().first.map(String.init) ?? "/"

        if method == "POST", path == "/request/accessibility" {
            ComputerUsePermissions.request(.accessibility)
            return jsonResponse(ComputerUsePermissions.status().dictionary)
        }
        if method == "POST", path == "/request/screen-recording" {
            ComputerUsePermissions.request(.screenRecording)
            return jsonResponse(ComputerUsePermissions.status().dictionary)
        }
        if path == "/status" || path == "/" {
            return jsonResponse(ComputerUsePermissions.status().dictionary)
        }
        return jsonResponse(["ok": false, "error": "Not found"], status: "404 Not Found")
    }

    private func jsonResponse(_ body: [String: Any], status: String = "200 OK") -> String {
        let data = try? JSONSerialization.data(withJSONObject: body)
        let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? "{\"ok\":false}"
        return "HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nContent-Length: \(text.utf8.count)\r\nConnection: close\r\n\r\n\(text)"
    }
}
