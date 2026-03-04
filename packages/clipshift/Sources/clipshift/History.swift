import Foundation

// MARK: - History Entry

struct HistoryEntry: Codable, Identifiable {
    let id: UUID
    let timestamp: Date
    let preview: String
    let plainText: String?
    let rtfBase64: String?
    let htmlBase64: String?
    let format: ContentFormat

    /// Reconstruct a ClipboardContent from the stored data.
    var clipboardContent: ClipboardContent {
        ClipboardContent(
            plainText: plainText,
            rtfData: rtfBase64.flatMap { Data(base64Encoded: $0) },
            htmlData: htmlBase64.flatMap { Data(base64Encoded: $0) }
        )
    }

    /// Human-readable relative timestamp.
    func relativeTime() -> String {
        let seconds = Int(Date().timeIntervalSince(timestamp))
        if seconds < 5 { return "just now" }
        if seconds < 60 { return "\(seconds)s ago" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes) min ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) hr ago" }
        let days = hours / 24
        return "\(days) day\(days == 1 ? "" : "s") ago"
    }
}

// MARK: - History Store

final class HistoryStore {
    static let maxEntries = 10

    private let storeDir: URL
    private let storePath: URL

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        storeDir = home.appendingPathComponent(".clipshift")
        storePath = storeDir.appendingPathComponent("history.json")
    }

    // MARK: - CRUD

    func load() -> [HistoryEntry] {
        ensureDirectory()
        guard let data = try? Data(contentsOf: storePath) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([HistoryEntry].self, from: data)) ?? []
    }

    func save(_ entries: [HistoryEntry]) {
        ensureDirectory()
        let trimmed = Array(entries.suffix(Self.maxEntries))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(trimmed) else { return }
        try? data.write(to: storePath, options: .atomic)
    }

    /// Append a new entry from current clipboard content.
    func add(_ content: ClipboardContent) {
        var entries = load()

        // Skip duplicates — don't re-add if the latest entry has the same text
        if let last = entries.last, last.plainText == content.plainText {
            return
        }

        let entry = HistoryEntry(
            id: UUID(),
            timestamp: Date(),
            preview: content.preview,
            plainText: content.plainText,
            rtfBase64: content.rtfData?.base64EncodedString(),
            htmlBase64: content.htmlData?.base64EncodedString(),
            format: content.detectedFormat
        )
        entries.append(entry)
        save(entries)
    }

    /// Remove an entry by 1-based display index (1 = most recent).
    @discardableResult
    func remove(at oneBasedIndex: Int) -> Bool {
        var entries = load()
        let arrayIndex = entries.count - oneBasedIndex
        guard arrayIndex >= 0 && arrayIndex < entries.count else { return false }
        entries.remove(at: arrayIndex)
        save(entries)
        return true
    }

    /// Get an entry by 1-based display index (1 = most recent).
    func entry(at oneBasedIndex: Int) -> HistoryEntry? {
        let entries = load()
        let arrayIndex = entries.count - oneBasedIndex
        guard arrayIndex >= 0 && arrayIndex < entries.count else { return nil }
        return entries[arrayIndex]
    }

    /// Remove all entries.
    func clear() {
        save([])
    }

    // MARK: - Private

    private func ensureDirectory() {
        try? FileManager.default.createDirectory(at: storeDir, withIntermediateDirectories: true)
    }
}
