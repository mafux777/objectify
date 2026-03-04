import ArgumentParser
import AppKit
import Foundation

// ═══════════════════════════════════════════════════════════════════════
// MARK: - Root Command
// ═══════════════════════════════════════════════════════════════════════

@main
struct ClipShift: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "clipshift",
        abstract: "Convert between Markdown and rich text via the macOS clipboard.",
        discussion: """
        ClipShift reads from your clipboard, converts between rich text and \
        Markdown, and writes the result back. It also keeps a history of your \
        last 10 clipboard entries so you can recall or remove them (useful for \
        passwords you don't want lingering).
        """,
        version: "0.1.0",
        subcommands: [
            ToMarkdown.self,
            ToRichText.self,
            Show.self,
            History.self,
            Watch.self,
        ]
    )
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - to-md
// ═══════════════════════════════════════════════════════════════════════

struct ToMarkdown: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "to-md",
        abstract: "Convert clipboard rich text (RTF / HTML) to Markdown."
    )

    @Flag(name: .long, help: "Save the current clipboard to history before converting.")
    var save = false

    func run() throws {
        let clipboard = ClipboardManager.shared
        let content = clipboard.read()

        if save {
            HistoryStore().add(content)
        }

        guard content.hasRichText else {
            printError("Clipboard does not contain rich text. Detected format: \(content.detectedFormat.displayName)")
            if let text = content.plainText {
                print("Preview: \(String(text.prefix(200)))")
            }
            throw ExitCode.failure
        }

        guard let markdown = Converter.toMarkdown(content) else {
            printError("Failed to convert clipboard content to Markdown.")
            throw ExitCode.failure
        }

        clipboard.writePlainText(markdown)
        printSuccess("Converted rich text to Markdown (clipboard updated)")
        print("")
        let preview = String(markdown.prefix(300))
        print(preview)
        if markdown.count > 300 { print("...") }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - to-rtf
// ═══════════════════════════════════════════════════════════════════════

struct ToRichText: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "to-rtf",
        abstract: "Convert clipboard Markdown (plain text) to rich text."
    )

    @Flag(name: .long, help: "Save the current clipboard to history before converting.")
    var save = false

    func run() throws {
        let clipboard = ClipboardManager.shared
        let content = clipboard.read()

        if save {
            HistoryStore().add(content)
        }

        guard let plainText = content.plainText, !plainText.isEmpty else {
            printError("Clipboard is empty or has no text content.")
            throw ExitCode.failure
        }

        guard let result = Converter.toRichText(plainText) else {
            printError("Failed to convert Markdown to rich text.")
            throw ExitCode.failure
        }

        clipboard.writeRichText(
            rtfData: result.rtfData,
            htmlString: result.html,
            plainText: plainText
        )
        printSuccess("Converted Markdown to rich text (clipboard updated)")
        print("")
        let preview = String(plainText.prefix(300))
        print(preview)
        if plainText.count > 300 { print("...") }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - show
// ═══════════════════════════════════════════════════════════════════════

struct Show: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "show",
        abstract: "Show current clipboard content and its detected format."
    )

    @Flag(name: .long, help: "If the clipboard has rich text, also show the Markdown conversion.")
    var markdown = false

    func run() {
        let content = ClipboardManager.shared.read()

        print("Format:   \(content.detectedFormat.displayName)")
        print("Has RTF:  \(content.rtfData != nil ? "yes" : "no")")
        print("Has HTML: \(content.htmlData != nil ? "yes" : "no")")
        print("")

        if let text = content.plainText {
            let preview = String(text.prefix(500))
            print(preview)
            if text.count > 500 { print("\n... (\(text.count) chars total)") }
        } else {
            print("(no text content)")
        }

        if markdown && content.hasRichText {
            print("\n--- Markdown preview ---\n")
            if let md = Converter.toMarkdown(content) {
                print(String(md.prefix(500)))
                if md.count > 500 { print("\n...") }
            } else {
                print("(conversion failed)")
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - history
// ═══════════════════════════════════════════════════════════════════════

struct History: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "history",
        abstract: "Manage clipboard history (last 10 entries).",
        defaultSubcommand: ListHistory.self,
        subcommands: [
            ListHistory.self,
            PasteHistory.self,
            RemoveHistory.self,
            ClearHistory.self,
        ]
    )

    // ── history list ──

    struct ListHistory: ParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "list",
            abstract: "List clipboard history entries."
        )

        func run() {
            let entries = HistoryStore().load()

            if entries.isEmpty {
                print("No clipboard history.")
                print("Use --save with to-md / to-rtf, or run 'clipshift watch' to auto-capture.")
                return
            }

            let numW = 3
            let timeW = 14
            let fmtW = 11
            let hdrNum = " # ".padding(toLength: numW, withPad: " ", startingAt: 0)
            let hdrTime = "Time".padding(toLength: timeW, withPad: " ", startingAt: 0)
            let hdrFmt = "Format".padding(toLength: fmtW, withPad: " ", startingAt: 0)

            print("\(hdrNum) | \(hdrTime) | \(hdrFmt) | Preview")
            print(String(repeating: "-", count: numW)
                  + "-+-" + String(repeating: "-", count: timeW)
                  + "-+-" + String(repeating: "-", count: fmtW)
                  + "-+-" + String(repeating: "-", count: 40))

            for (i, entry) in entries.reversed().enumerated() {
                let num = String(format: "%2d ", i + 1)
                let time = entry.relativeTime().padding(toLength: timeW, withPad: " ", startingAt: 0)
                let fmt = entry.format.displayName.padding(toLength: fmtW, withPad: " ", startingAt: 0)
                let preview = String(entry.preview.prefix(40))
                print("\(num) | \(time) | \(fmt) | \(preview)")
            }
        }
    }

    // ── history paste ──

    struct PasteHistory: ParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "paste",
            abstract: "Restore a history entry to the clipboard."
        )

        @Argument(help: "Entry number (1 = most recent).")
        var number: Int

        @Option(name: .long, help: "Convert to a format before restoring: md, rtf.")
        var asFormat: String?

        func run() throws {
            let store = HistoryStore()
            guard let entry = store.entry(at: number) else {
                printError("No entry at position \(number). Run 'clipshift history list' to see entries.")
                throw ExitCode.failure
            }

            let clipboard = ClipboardManager.shared
            let content = entry.clipboardContent

            if let format = asFormat {
                switch format.lowercased() {
                case "md", "markdown":
                    if let md = Converter.toMarkdown(content) {
                        clipboard.writePlainText(md)
                        printSuccess("Restored entry \(number) as Markdown")
                    } else if let plain = content.plainText {
                        clipboard.writePlainText(plain)
                        printSuccess("Restored entry \(number) as plain text (no rich text to convert)")
                    } else {
                        printError("Failed to convert entry to Markdown")
                        throw ExitCode.failure
                    }
                case "rtf", "richtext", "rich":
                    let text = content.plainText ?? ""
                    if let result = Converter.toRichText(text) {
                        clipboard.writeRichText(
                            rtfData: result.rtfData,
                            htmlString: result.html,
                            plainText: text
                        )
                        printSuccess("Restored entry \(number) as rich text")
                    } else {
                        printError("Failed to convert entry to rich text")
                        throw ExitCode.failure
                    }
                default:
                    printError("Unknown format '\(format)'. Use 'md' or 'rtf'.")
                    throw ExitCode.failure
                }
            } else {
                clipboard.writeContent(content)
                printSuccess("Restored entry \(number) to clipboard (\(entry.format.displayName))")
            }
        }
    }

    // ── history remove ──

    struct RemoveHistory: ParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "remove",
            abstract: "Remove a history entry (useful for passwords)."
        )

        @Argument(help: "Entry number to remove (1 = most recent).")
        var number: Int

        func run() throws {
            if HistoryStore().remove(at: number) {
                printSuccess("Removed entry \(number)")
            } else {
                printError("No entry at position \(number)")
                throw ExitCode.failure
            }
        }
    }

    // ── history clear ──

    struct ClearHistory: ParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "clear",
            abstract: "Remove all history entries."
        )

        func run() {
            HistoryStore().clear()
            printSuccess("History cleared")
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - watch
// ═══════════════════════════════════════════════════════════════════════

struct Watch: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "watch",
        abstract: "Watch the clipboard for changes and auto-save to history."
    )

    @Option(name: .long, help: "Poll interval in seconds (default: 1).")
    var interval: Double = 1.0

    func run() throws {
        let clipboard = ClipboardManager.shared
        let store = HistoryStore()
        var lastChangeCount = clipboard.changeCount

        print("Watching clipboard... (press Ctrl+C to stop)\n")

        signal(SIGINT) { _ in
            print("\nStopped watching.")
            Foundation.exit(0)
        }

        while true {
            Thread.sleep(forTimeInterval: interval)

            let current = clipboard.changeCount
            guard current != lastChangeCount else { continue }
            lastChangeCount = current

            let content = clipboard.read()
            guard content.plainText != nil || content.rtfData != nil || content.htmlData != nil else {
                continue
            }

            store.add(content)

            let time = ISO8601DateFormatter.string(
                from: Date(), timeZone: .current,
                formatOptions: [.withTime, .withColonSeparatorInTime]
            )
            let preview = String(content.preview.prefix(50))
            let format = content.detectedFormat.displayName
            print("[\(time)] Saved: \"\(preview)\" (\(format))")
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MARK: - Helpers
// ═══════════════════════════════════════════════════════════════════════

private func printSuccess(_ message: String) {
    print("✓ \(message)")
}

private func printError(_ message: String) {
    var stderr = FileHandle.standardError
    print("✗ \(message)", to: &stderr)
}

extension FileHandle: @retroactive TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}
