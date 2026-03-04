import AppKit
import Foundation

// MARK: - Converter

enum Converter {

    // ═══════════════════════════════════════════════════════════════════
    // MARK: Rich Text → Markdown
    // ═══════════════════════════════════════════════════════════════════

    /// Convert clipboard rich-text content (HTML or RTF) into Markdown.
    static func toMarkdown(_ content: ClipboardContent) -> String? {
        guard let attrStr = attributedString(from: content) else {
            return content.plainText
        }
        guard attrStr.length > 0 else { return content.plainText }
        return attributedStringToMarkdown(attrStr)
    }

    // MARK: Attributed String Construction

    private static func attributedString(from content: ClipboardContent) -> NSAttributedString? {
        // Prefer HTML — it preserves more semantic structure than RTF.
        if let htmlData = content.htmlData {
            return NSAttributedString(html: htmlData, baseURL: nil, documentAttributes: nil)
        }
        if let rtfData = content.rtfData {
            return NSAttributedString(rtf: rtfData, documentAttributes: nil)
        }
        return nil
    }

    // MARK: Attributed String → Markdown

    private static func attributedStringToMarkdown(_ attrStr: NSAttributedString) -> String {
        let nsText = attrStr.string as NSString
        let baseSize = detectBaselineSize(attrStr)
        var markdownLines: [String] = []

        // Walk line-by-line through the attributed string.
        var pos = 0
        while pos < nsText.length {
            let remaining = NSRange(location: pos, length: nsText.length - pos)
            let newline = nsText.range(of: "\n", range: remaining)

            let lineRange: NSRange
            if newline.location != NSNotFound {
                lineRange = NSRange(location: pos, length: newline.location - pos)
                pos = newline.location + 1
            } else {
                lineRange = NSRange(location: pos, length: nsText.length - pos)
                pos = nsText.length
            }

            let lineText = nsText.substring(with: lineRange)
            let trimmed = lineText.trimmingCharacters(in: .whitespaces)

            // Blank line → paragraph break
            if trimmed.isEmpty {
                markdownLines.append("")
                continue
            }

            // ── Heading detection (font size relative to baseline) ──
            let headingLevel = detectHeadingLevel(attrStr, range: lineRange, baseSize: baseSize)
            if headingLevel > 0 {
                let prefix = String(repeating: "#", count: headingLevel) + " "
                let inline = processInline(attrStr, range: lineRange, suppressBold: true)
                markdownLines.append(prefix + inline)
                continue
            }

            // ── Bullet list items ──
            let bullets: Set<Character> = ["•", "◦", "‣", "⁃", "▪", "▸"]
            if let first = trimmed.first, bullets.contains(first) {
                let indent = leadingWhitespaceCount(lineText) / 4
                let indentStr = String(repeating: "  ", count: indent)
                let afterBullet = offsetAfterBullet(lineText, bullet: first)
                if afterBullet < lineRange.length {
                    let contentRange = NSRange(
                        location: lineRange.location + afterBullet,
                        length: lineRange.length - afterBullet
                    )
                    markdownLines.append(indentStr + "- " + processInline(attrStr, range: contentRange))
                } else {
                    markdownLines.append(indentStr + "- ")
                }
                continue
            }

            // ── Numbered list items ──
            if let match = trimmed.range(of: #"^\d+[\.\)]\s+"#, options: .regularExpression) {
                let numberPart = String(trimmed[match])
                let afterNumber = trimmed.distance(from: trimmed.startIndex, to: match.upperBound)
                let contentStart = lineRange.location + leadingWhitespaceCount(lineText) + afterNumber
                let contentLen = lineRange.location + lineRange.length - contentStart
                if contentLen > 0 {
                    let contentRange = NSRange(location: contentStart, length: contentLen)
                    markdownLines.append(numberPart + processInline(attrStr, range: contentRange))
                } else {
                    markdownLines.append(numberPart)
                }
                continue
            }

            // ── Regular paragraph ──
            markdownLines.append(processInline(attrStr, range: lineRange))
        }

        // Clean up: collapse 3+ blank lines to 2, trim edges.
        var result = markdownLines.joined(separator: "\n")
        result = result.replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Inline Formatting

    /// Walk attribute runs within `range` and emit Markdown inline syntax.
    private static func processInline(
        _ attrStr: NSAttributedString,
        range: NSRange,
        suppressBold: Bool = false
    ) -> String {
        guard range.length > 0 else { return "" }
        var result = ""

        attrStr.enumerateAttributes(in: range, options: []) { attrs, runRange, _ in
            let runText = (attrStr.string as NSString).substring(with: runRange)
            guard !runText.isEmpty else { return }

            var prefix = ""
            var suffix = ""

            // ── Font-based formatting ──
            if let font = attrs[.font] as? NSFont {
                let traits = font.fontDescriptor.symbolicTraits
                let isBold = traits.contains(.bold)
                let isItalic = traits.contains(.italic)
                let isMono = font.isFixedPitch || isMonospaceFont(font)

                if isMono {
                    prefix += "`"
                    suffix = "`" + suffix
                } else {
                    let effectiveBold = isBold && !suppressBold
                    if effectiveBold && isItalic {
                        prefix += "***"
                        suffix = "***" + suffix
                    } else if effectiveBold {
                        prefix += "**"
                        suffix = "**" + suffix
                    } else if isItalic {
                        prefix += "*"
                        suffix = "*" + suffix
                    }
                }
            }

            // ── Link ──
            if let link = attrs[.link] {
                let url: String
                if let urlObj = link as? URL {
                    url = urlObj.absoluteString
                } else if let urlStr = link as? String {
                    url = urlStr
                } else {
                    url = ""
                }
                if !url.isEmpty {
                    prefix = "[" + prefix
                    suffix = suffix + "](\(url))"
                }
            }

            // ── Strikethrough ──
            if let strike = attrs[.strikethroughStyle] as? Int, strike != 0 {
                prefix += "~~"
                suffix = "~~" + suffix
            }

            result += prefix + runText + suffix
        }

        return result
    }

    // MARK: Helpers — Rich Text Analysis

    /// Return the most common font size in the attributed string (the "body" size).
    private static func detectBaselineSize(_ attrStr: NSAttributedString) -> CGFloat {
        var sizeWeights: [CGFloat: Int] = [:]
        let full = NSRange(location: 0, length: attrStr.length)
        attrStr.enumerateAttribute(.font, in: full) { value, range, _ in
            guard let font = value as? NSFont else { return }
            sizeWeights[font.pointSize, default: 0] += range.length
        }
        return sizeWeights.max(by: { $0.value < $1.value })?.key ?? 12.0
    }

    /// Detect heading level (1–6) based on font size relative to baseline.
    private static func detectHeadingLevel(
        _ attrStr: NSAttributedString,
        range: NSRange,
        baseSize: CGFloat
    ) -> Int {
        guard range.length > 0 else { return 0 }

        var maxSize: CGFloat = 0
        var isBold = false
        attrStr.enumerateAttribute(.font, in: range) { value, _, _ in
            guard let font = value as? NSFont else { return }
            maxSize = max(maxSize, font.pointSize)
            if font.fontDescriptor.symbolicTraits.contains(.bold) {
                isBold = true
            }
        }

        let ratio = maxSize / baseSize
        if ratio >= 2.0 { return 1 }
        if ratio >= 1.5 { return 2 }
        if ratio >= 1.17 && isBold { return 3 }
        if ratio >= 1.08 && isBold { return 4 }
        return 0
    }

    private static func isMonospaceFont(_ font: NSFont) -> Bool {
        let name = font.fontName.lowercased()
        let indicators = [
            "mono", "courier", "menlo", "consolas",
            "source code", "firacode", "jetbrains", "cascadia",
        ]
        return indicators.contains(where: name.contains)
    }

    private static func leadingWhitespaceCount(_ text: String) -> Int {
        var count = 0
        for ch in text {
            if ch == " " { count += 1 }
            else if ch == "\t" { count += 4 }
            else { break }
        }
        return count
    }

    private static func offsetAfterBullet(_ text: String, bullet: Character) -> Int {
        guard let idx = text.firstIndex(of: bullet) else { return 0 }
        var after = text.index(after: idx)
        while after < text.endIndex && text[after] == " " {
            after = text.index(after: after)
        }
        return text.distance(from: text.startIndex, to: after)
    }

    // ═══════════════════════════════════════════════════════════════════
    // MARK: Markdown → Rich Text
    // ═══════════════════════════════════════════════════════════════════

    /// Convert Markdown text into RTF data and an HTML string, ready for the clipboard.
    static func toRichText(_ markdown: String) -> (rtfData: Data, html: String)? {
        let html = markdownToHTML(markdown)
        guard let htmlData = html.data(using: .utf8),
              let attrStr = NSAttributedString(
                  html: htmlData, baseURL: nil, documentAttributes: nil
              )
        else {
            return nil
        }

        let fullRange = NSRange(location: 0, length: attrStr.length)
        guard let rtfData = attrStr.rtf(from: fullRange, documentAttributes: [:]) else {
            return nil
        }

        return (rtfData, html)
    }

    // MARK: Markdown → HTML

    /// Simple but capable Markdown-to-HTML converter.
    /// Handles headings, emphasis, code, links, images, lists, blockquotes, code fences, and hrs.
    static func markdownToHTML(_ markdown: String) -> String {
        var html = """
        <!DOCTYPE html>
        <html><head><meta charset="utf-8">
        <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; font-size: 14px; line-height: 1.5; color: #1a1a1a; }
        code { font-family: Menlo, Monaco, "Courier New", monospace; background: #f4f4f4; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
        pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 3px solid #d0d0d0; padding-left: 12px; color: #555; margin: 8px 0; }
        h1 { font-size: 28px; } h2 { font-size: 22px; } h3 { font-size: 18px; } h4 { font-size: 16px; }
        a { color: #0366d6; }
        li { margin: 2px 0; }
        hr { border: none; border-top: 1px solid #d0d0d0; margin: 16px 0; }
        </style></head><body>\n
        """

        let lines = markdown.components(separatedBy: "\n")
        var i = 0
        var inCodeBlock = false
        var codeLanguage = ""
        var inUL = false
        var inOL = false

        while i < lines.count {
            let line = lines[i]

            // ── Code fences ──
            if line.hasPrefix("```") {
                if inCodeBlock {
                    html += "</code></pre>\n"
                    inCodeBlock = false
                    codeLanguage = ""
                } else {
                    codeLanguage = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                    let langAttr = codeLanguage.isEmpty ? "" : " class=\"language-\(escapeAttr(codeLanguage))\""
                    html += "<pre><code\(langAttr)>"
                    inCodeBlock = true
                }
                i += 1
                continue
            }

            if inCodeBlock {
                html += escapeHTML(line) + "\n"
                i += 1
                continue
            }

            // ── Close open lists if this line isn't a list item ──
            let isULItem = line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("+ ")
            let isOLItem = line.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil

            if inUL && !isULItem {
                html += "</ul>\n"
                inUL = false
            }
            if inOL && !isOLItem {
                html += "</ol>\n"
                inOL = false
            }

            // ── Blank line ──
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                i += 1
                continue
            }

            // ── Headings ──
            if line.hasPrefix("######") {
                let content = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                html += "<h6>\(inlineToHTML(content))</h6>\n"
            } else if line.hasPrefix("#####") {
                let content = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                html += "<h5>\(inlineToHTML(content))</h5>\n"
            } else if line.hasPrefix("#### ") {
                html += "<h4>\(inlineToHTML(String(line.dropFirst(5))))</h4>\n"
            } else if line.hasPrefix("### ") {
                html += "<h3>\(inlineToHTML(String(line.dropFirst(4))))</h3>\n"
            } else if line.hasPrefix("## ") {
                html += "<h2>\(inlineToHTML(String(line.dropFirst(3))))</h2>\n"
            } else if line.hasPrefix("# ") {
                html += "<h1>\(inlineToHTML(String(line.dropFirst(2))))</h1>\n"
            }

            // ── Horizontal rule ──
            else if line == "---" || line == "***" || line == "___" {
                html += "<hr>\n"
            }

            // ── Blockquote ──
            else if line.hasPrefix("> ") {
                let content = String(line.dropFirst(2))
                html += "<blockquote><p>\(inlineToHTML(content))</p></blockquote>\n"
            }

            // ── Unordered list ──
            else if isULItem {
                if !inUL { html += "<ul>\n"; inUL = true }
                let content = String(line.dropFirst(2))
                html += "<li>\(inlineToHTML(content))</li>\n"
            }

            // ── Ordered list ──
            else if isOLItem {
                if !inOL { html += "<ol>\n"; inOL = true }
                if let match = line.range(of: #"^\d+\.\s+"#, options: .regularExpression) {
                    let content = String(line[match.upperBound...])
                    html += "<li>\(inlineToHTML(content))</li>\n"
                }
            }

            // ── Regular paragraph ──
            else {
                html += "<p>\(inlineToHTML(line))</p>\n"
            }

            i += 1
        }

        // Close any remaining open elements
        if inCodeBlock { html += "</code></pre>\n" }
        if inUL { html += "</ul>\n" }
        if inOL { html += "</ol>\n" }

        html += "</body></html>"
        return html
    }

    // MARK: Inline Markdown → HTML

    private static func inlineToHTML(_ text: String) -> String {
        var result = escapeHTML(text)

        // Images (before links, since ![...](...) contains [...](...))
        result = result.replacingOccurrences(
            of: #"!\[([^\]]*)\]\(([^\)]+)\)"#,
            with: #"<img src="$2" alt="$1">"#,
            options: .regularExpression
        )

        // Code spans (before other inline, to prevent processing inside code)
        result = result.replacingOccurrences(
            of: #"`([^`]+)`"#,
            with: "<code>$1</code>",
            options: .regularExpression
        )

        // Bold + italic
        result = result.replacingOccurrences(
            of: #"\*\*\*(.+?)\*\*\*"#,
            with: "<strong><em>$1</em></strong>",
            options: .regularExpression
        )

        // Bold
        result = result.replacingOccurrences(
            of: #"\*\*(.+?)\*\*"#,
            with: "<strong>$1</strong>",
            options: .regularExpression
        )

        // Italic
        result = result.replacingOccurrences(
            of: #"\*(.+?)\*"#,
            with: "<em>$1</em>",
            options: .regularExpression
        )

        // Strikethrough
        result = result.replacingOccurrences(
            of: #"~~(.+?)~~"#,
            with: "<del>$1</del>",
            options: .regularExpression
        )

        // Links
        result = result.replacingOccurrences(
            of: #"\[([^\]]+)\]\(([^\)]+)\)"#,
            with: #"<a href="$2">$1</a>"#,
            options: .regularExpression
        )

        return result
    }

    // MARK: HTML Escaping

    private static func escapeHTML(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func escapeAttr(_ text: String) -> String {
        escapeHTML(text).replacingOccurrences(of: "'", with: "&#39;")
    }
}
