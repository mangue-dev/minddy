import Foundation

/// Where a universal link goes: a page of the app, or the browser.
///
/// iOS hands the app every link of a domain listed in `App.entitlements`
/// whose path the server's `apple-app-site-association` claims, whatever
/// server the app is on. Only a link of the selected server opens in the
/// WebView. A minddy Cloud link while the app is on a self-hosted server
/// (or the reverse, on a server that declares the app) opens in the browser:
/// loading it here would leave the selected server, and the WebView keeps to
/// that server alone, since every page in it reaches the native bridge
/// (`NavigationGuard`). The browser shows the link where it lives, with the
/// session the person has there.
///
/// Foundation only, so `npm --prefix mobile run test:ios` can compile it with
/// `ServerStore` outside Xcode.
enum UniversalLink {
    enum Destination: Equatable {
        /// A path of the selected server, with its query and fragment.
        case app(path: String)
        case browser(URL)
    }

    static func destination(of url: URL, server origin: String) -> Destination {
        guard ServerStore.url(url, isWithin: origin),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return .browser(url) }

        let path = components.percentEncodedPath.isEmpty ? "/" : components.percentEncodedPath
        // `//host` would read as another server once appended to the origin.
        guard path.hasPrefix("/"), !path.hasPrefix("//") else { return .browser(url) }

        var target = path
        if let query = components.percentEncodedQuery { target += "?\(query)" }
        if let fragment = components.percentEncodedFragment { target += "#\(fragment)" }
        return .app(path: target)
    }
}
