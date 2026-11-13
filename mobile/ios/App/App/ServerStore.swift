import Foundation

/// The server the app loads minddy from.
///
/// The app starts on minddy Cloud, like the web and the desktop app. A
/// self-hosted server is chosen on the bundled server-choice page and stored
/// here; `nil` means Cloud. The rules match the desktop app's
/// (`lib/desktop/server-origin.ts`): an origin only, HTTPS for remote servers,
/// HTTP for loopback addresses alone.
enum ServerStore {
    private static let customOriginKey = "minddy.serverOrigin"
    private static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "::1", "[::1]"]

    /// The path the app opens on a server, the desktop app's too.
    static let entryPath = "home"

    /// minddy Cloud's origin, from `MinddyCloudOrigin` in Info.plist. A debug
    /// build started with `MINDDY_MOBILE_ORIGIN` loads that server instead,
    /// which is how a local `npm run dev` is opened in the simulator.
    static var cloudOrigin: String {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["MINDDY_MOBILE_ORIGIN"],
           let origin = normalize(override) {
            return origin
        }
        #endif
        return configuredCloudOrigin
    }

    /// minddy Cloud as the build configures it, never the debug override.
    static var configuredCloudOrigin: String {
        let configured = Bundle.main.object(forInfoDictionaryKey: "MinddyCloudOrigin") as? String
        return configured.flatMap(normalize) ?? "https://www.minddy.app"
    }

    /// What to store for the server chosen on the server-choice page: nothing
    /// for minddy Cloud, the origin otherwise. The comparison is with Cloud as
    /// configured: the debug override lasts one launch only, so a server equal
    /// to it must be stored, or the next launch from the home screen would
    /// fall back to Cloud.
    static func storedOrigin(forChosen origin: String, cloud: String) -> String? {
        origin == cloud ? nil : origin
    }

    /// The self-hosted server the user entered, validated again on every read.
    static var customOrigin: String? {
        get {
            UserDefaults.standard.string(forKey: customOriginKey).flatMap(normalize)
        }
        set {
            if let origin = newValue {
                UserDefaults.standard.set(origin, forKey: customOriginKey)
            } else {
                UserDefaults.standard.removeObject(forKey: customOriginKey)
            }
        }
    }

    static var origin: String {
        customOrigin ?? cloudOrigin
    }

    /// Returns the origin of `raw`, or `nil` when it is not an acceptable
    /// server address.
    static func normalize(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(), !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              components.path.isEmpty || components.path == "/"
        else { return nil }

        guard scheme == "https" || (scheme == "http" && loopbackHosts.contains(host)) else { return nil }
        components.scheme = scheme
        components.host = host
        components.path = ""
        return components.string
    }

    /// True when `url` belongs to `origin`: same scheme, host and port.
    static func url(_ url: URL, isWithin origin: String) -> Bool {
        guard let server = URLComponents(string: origin),
              let candidate = URLComponents(url: url, resolvingAgainstBaseURL: true)
        else { return false }
        return candidate.scheme?.lowercased() == server.scheme
            && candidate.host?.lowercased() == server.host
            && effectivePort(candidate) == effectivePort(server)
    }

    private static func effectivePort(_ components: URLComponents) -> Int? {
        components.port ?? (components.scheme?.lowercased() == "https" ? 443 : 80)
    }
}
