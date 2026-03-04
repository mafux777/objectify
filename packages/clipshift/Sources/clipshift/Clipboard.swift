import AppKit
import Foundation

// MARK: - Content Format

enum ContentFormat: String, Codable, CaseIterable {
    case richText = "richtext"
    case markdown = "markdown"
    case plain = "plain"

    var displayName: String {
        switch self {
        case .richText: return "Rich Text"
        case .markdown: return "Markdown"
        case .plain: return "Plain Text"
        }
    }
}

// MARK: - Clipboard Content

struct ClipboardContent {
    let plainText: String?
    let rtfData: Data?
    let htmlData: Data?

    var hasRichText: Bool {
        rtfData != nil || htmlData != nil
    }

    var detectedFormat: ContentFormat {
        if hasRichText { return .richText }
        if let text = plainText, Self.looksLikeMarkdown(text) { return .markdown }
        return .plain
    }

    var preview: String {
        let text = plainText ?? "(no text content)"
        let singleLine = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return String(singleLine.prefix(80))
    }

    /// Heuristic: does this plain text look like Markdown?
    static func looksLikeMarkdown(_ text: String) -> Bool {
        let patterns = [
            #"^#{1,6}\s"#,                        // headings
            #"\*\*[^*]+\*\*"#,                     // bold
            #"(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*(?!\*)"#, // italic
            #"\[[^\]]+\]\([^\)]+\)"#,              // links
            #"^[-*+]\s"#,                          // unordered list
            #"^\d+\.\s"#,                          // ordered list
            #"^```"#,                              // code fence
            #"^>\s"#,                              // blockquote
            #"`[^`]+`"#,                           // inline code
        ]

        var score = 0
        for pattern in patterns {
            if text.range(of: pattern, options: [.regularExpression, .anchorsMatchLines]) != nil {
                score += 1
            }
        }
        return score >= 2
    }
}

// MARK: - Clipboard Manager

final class ClipboardManager {
    static let shared = ClipboardManager()
    private let pasteboard = NSPasteboard.general

    var changeCount: Int {
        pasteboard.changeCount
    }

    func read() -> ClipboardContent {
        let plainText = pasteboard.string(forType: .string)
        let rtfData = pasteboard.data(forType: .rtf)
        let htmlData = pasteboard.data(forType: .html)
        return ClipboardContent(plainText: plainText, rtfData: rtfData, htmlData: htmlData)
    }

    func writePlainText(_ text: String) {
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    func writeRichText(rtfData: Data, htmlString: String? = nil, plainText: String? = nil) {
        pasteboard.clearContents()
        pasteboard.setData(rtfData, forType: .rtf)
        if let html = htmlString, let htmlData = html.data(using: .utf8) {
            pasteboard.setData(htmlData, forType: .html)
        }
        if let plain = plainText {
            pasteboard.setString(plain, forType: .string)
        }
    }

    func writeContent(_ content: ClipboardContent) {
        pasteboard.clearContents()
        if let rtf = content.rtfData {
            pasteboard.setData(rtf, forType: .rtf)
        }
        if let html = content.htmlData {
            pasteboard.setData(html, forType: .html)
        }
        if let plain = content.plainText {
            pasteboard.setString(plain, forType: .string)
        }
    }
}
