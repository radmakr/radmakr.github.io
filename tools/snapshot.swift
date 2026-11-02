// Renders a web page to a PNG (or a PNG-in-ICO) with WebKit, the engine
// behind Safari, so the site's images come out exactly as Apple devices draw it.
// SVG files skip WebKit and rasterize through AppKit, which keeps transparency.
//
//   swiftc -O -swift-version 6 -parse-as-library tools/snapshot.swift -o .build/snapshot
//   .build/snapshot tools/og.html og.png --size 1200x630
//   .build/snapshot favicon.svg favicon.ico --size 32x32
//   .build/snapshot http://localhost:3000 home.png --size 1440x900 --scale 2 --full-page --dark
//
// Options:
//   --size WxH     viewport in points (default 1280x800)
//   --scale N      pixels per point in the output (default 1)
//   --full-page    grow the viewport to the page's full height first
//   --dark         render with the dark appearance (prefers-color-scheme: dark)
//   --wait MS      extra settle time before the snapshot (default 150)
//   --script JS    async JavaScript to run before the snapshot; `await` works

import AppKit
import WebKit

// MARK: - Options

struct Options {
    var source: URL
    var output: URL
    var viewport = CGSize(width: 1280, height: 800)
    var scale: CGFloat = 1
    var fullPage = false
    var dark = false
    var settle: Duration = .milliseconds(150)
    var script: String?

    init(arguments: [String]) throws(UsageError) {
        var positional: [String] = []
        var remaining = arguments[...]

        func value(for option: String) throws(UsageError) -> String {
            guard let value = remaining.popFirst() else { throw .missingValue(option) }
            return value
        }

        var size: CGSize?
        var scale: CGFloat?
        var settle: Duration?
        var fullPage = false
        var dark = false
        var script: String?

        while let argument = remaining.popFirst() {
            switch argument {
            case "--size":
                let text = try value(for: argument)
                let parts = text.split(separator: "x").compactMap { Double($0) }
                guard parts.count == 2, parts.allSatisfy({ $0 > 0 }) else { throw .invalidValue(argument, text) }
                size = CGSize(width: parts[0], height: parts[1])
            case "--scale":
                let text = try value(for: argument)
                guard let number = Double(text), number > 0 else { throw .invalidValue(argument, text) }
                scale = number
            case "--wait":
                let text = try value(for: argument)
                guard let milliseconds = Int(text), milliseconds >= 0 else { throw .invalidValue(argument, text) }
                settle = .milliseconds(milliseconds)
            case "--script":
                script = try value(for: argument)
            case "--full-page":
                fullPage = true
            case "--dark":
                dark = true
            case let option where option.hasPrefix("--"):
                throw .unknownOption(option)
            default:
                positional.append(argument)
            }
        }

        guard positional.count == 2 else { throw .wrongArgumentCount }
        let (input, output) = (positional[0], positional[1])
        let workingDirectory = URL(filePath: FileManager.default.currentDirectoryPath, directoryHint: .isDirectory)

        if let url = URL(string: input), let scheme = url.scheme, ["http", "https", "file"].contains(scheme) {
            source = url
        } else {
            source = URL(filePath: input, relativeTo: workingDirectory).standardizedFileURL
        }
        self.output = URL(filePath: output, relativeTo: workingDirectory).standardizedFileURL
        self.viewport = size ?? viewport
        self.scale = scale ?? self.scale
        self.settle = settle ?? self.settle
        self.fullPage = fullPage
        self.dark = dark
        self.script = script
    }
}

enum UsageError: Error, CustomStringConvertible {
    case wrongArgumentCount
    case missingValue(String)
    case invalidValue(String, String)
    case unknownOption(String)

    var description: String {
        switch self {
        case .wrongArgumentCount: "Expected an input page and an output file."
        case .missingValue(let option): "\(option) needs a value."
        case .invalidValue(let option, let value): "\(value) isn’t a valid value for \(option)."
        case .unknownOption(let option): "Unknown option \(option)."
        }
    }

    static let usage = """
        usage: snapshot <url-or-file> <output.png|output.ico> [--size WxH] [--scale N] \
        [--full-page] [--dark] [--wait MS] [--script JS]
        """
}

enum SnapshotError: Error, CustomStringConvertible {
    case loadFailed(String)
    case unreadableImage(URL)
    case unmeasurablePage
    case encodingFailed
    case icoTooLarge(CGSize)

    var description: String {
        switch self {
        case .loadFailed(let reason): "The page didn’t load: \(reason)"
        case .unreadableImage(let url): "Couldn’t read \(url.lastPathComponent) as an image."
        case .unmeasurablePage: "Couldn’t measure the page’s height."
        case .encodingFailed: "Couldn’t encode the snapshot."
        case .icoTooLarge(let size): "ICO images top out at 256×256; this one is \(Int(size.width))×\(Int(size.height))."
        }
    }
}

// MARK: - Loading

@MainActor
final class NavigationWaiter: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Void, any Error>?

    func load(_ source: URL, in webView: WKWebView) async throws {
        webView.navigationDelegate = self
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            if source.isFileURL {
                webView.loadFileURL(source, allowingReadAccessTo: source.deletingLastPathComponent().deletingLastPathComponent())
            } else {
                webView.load(URLRequest(url: source))
            }
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
        finish(with: .success(()))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: any Error) {
        finish(with: .failure(SnapshotError.loadFailed(error.localizedDescription)))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: any Error) {
        finish(with: .failure(SnapshotError.loadFailed(error.localizedDescription)))
    }

    private func finish(with result: Result<Void, any Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }
}

// MARK: - Rendering

@MainActor
struct Renderer {
    let options: Options

    func render() async throws -> Data {
        let isSVG = options.source.isFileURL && options.source.pathExtension.lowercased() == "svg"
        let (image, size) = if isSVG { try rasterizedSVG() } else { try await snapshotOfPage() }
        return try encode(image, size: size)
    }

    private func rasterizedSVG() throws -> (NSImage, CGSize) {
        guard let image = NSImage(contentsOf: options.source) else {
            throw SnapshotError.unreadableImage(options.source)
        }
        return (image, options.viewport)
    }

    private func snapshotOfPage() async throws -> (NSImage, CGSize) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()

        let frame = CGRect(origin: .zero, size: options.viewport)
        let webView = WKWebView(frame: frame, configuration: configuration)
        let window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = webView
        if options.dark {
            webView.appearance = NSAppearance(named: .darkAqua)
        } else {
            webView.appearance = NSAppearance(named: .aqua)
        }

        let waiter = NavigationWaiter()
        try await waiter.load(options.source, in: webView)
        try await settle(webView)

        if let script = options.script {
            _ = try await webView.callAsyncJavaScript(script, contentWorld: .page)
            try await settle(webView)
        }

        var size = options.viewport
        if options.fullPage {
            let height = try await webView.evaluateJavaScript("document.documentElement.scrollHeight")
            guard let height = height as? Double, height > 0 else { throw SnapshotError.unmeasurablePage }
            size.height = max(size.height, height.rounded(.up))
            window.setContentSize(size)
            webView.frame = CGRect(origin: .zero, size: size)
            try await settle(webView)
        }

        let snapshotConfiguration = WKSnapshotConfiguration()
        snapshotConfiguration.rect = CGRect(origin: .zero, size: size)
        let image = try await webView.takeSnapshot(configuration: snapshotConfiguration)
        return (image, size)
    }

    /// Waits for images and fonts, then gives layout a moment to settle. The window
    /// is never on screen, so lazy images load eagerly and nothing waits on
    /// requestAnimationFrame, which hidden pages don't run.
    private func settle(_ webView: WKWebView) async throws {
        _ = try await webView.callAsyncJavaScript(
            """
            for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = "eager";
            const images = Promise.all([...document.images].map((image) =>
              image.complete ? null : new Promise((done) => { image.onload = image.onerror = done; })
            ));
            await Promise.race([images, new Promise((done) => setTimeout(done, 5000))]);
            await document.fonts.ready;
            """,
            contentWorld: .page
        )
        try await Task.sleep(for: options.settle)
    }

    private func encode(_ image: NSImage, size: CGSize) throws -> Data {
        let pixelsWide = Int((size.width * options.scale).rounded())
        let pixelsHigh = Int((size.height * options.scale).rounded())

        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelsWide,
            pixelsHigh: pixelsHigh,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else { throw SnapshotError.encodingFailed }
        bitmap.size = size

        guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else { throw SnapshotError.encodingFailed }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        context.imageInterpolation = .high
        image.draw(in: CGRect(origin: .zero, size: size))
        NSGraphicsContext.restoreGraphicsState()

        guard let png = bitmap.representation(using: .png, properties: [:]) else { throw SnapshotError.encodingFailed }
        guard options.output.pathExtension.lowercased() == "ico" else { return png }

        let pixels = CGSize(width: pixelsWide, height: pixelsHigh)
        guard pixelsWide <= 256, pixelsHigh <= 256 else { throw SnapshotError.icoTooLarge(pixels) }
        return ico(wrapping: png, size: pixels)
    }

    /// An ICO file holding a single PNG image, which every browser since IE 9 reads.
    private func ico(wrapping png: Data, size: CGSize) -> Data {
        var data = Data()
        func append<T: FixedWidthInteger>(_ value: T) {
            withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) }
        }
        let headerLength = 6 + 16

        append(UInt16(0)) // reserved
        append(UInt16(1)) // type: icon
        append(UInt16(1)) // image count
        append(UInt8(truncatingIfNeeded: Int(size.width) % 256)) // 0 means 256
        append(UInt8(truncatingIfNeeded: Int(size.height) % 256))
        append(UInt8(0)) // palette size
        append(UInt8(0)) // reserved
        append(UInt16(1)) // color planes
        append(UInt16(32)) // bits per pixel
        append(UInt32(png.count))
        append(UInt32(headerLength))
        data.append(png)
        return data
    }
}

// MARK: - Main

@main
enum Snapshot {
    static func main() async {
        let options: Options
        do {
            options = try Options(arguments: Array(CommandLine.arguments.dropFirst()))
        } catch {
            print("\(error)\n\(UsageError.usage)")
            exit(64)
        }

        NSApplication.shared.setActivationPolicy(.prohibited)

        do {
            let data = try await Renderer(options: options).render()
            try FileManager.default.createDirectory(
                at: options.output.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: options.output)
            print("Wrote \(options.output.relativePath)")
        } catch {
            print("snapshot: \(error)")
            exit(1)
        }
    }
}
