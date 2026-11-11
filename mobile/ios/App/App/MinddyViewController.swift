import Capacitor
import UIKit
import WebKit

/// The app's single screen: a WebView on the selected minddy server.
///
/// Capacitor reads its server from a file fixed at build time. minddy's server
/// is chosen in the app, so this controller sets it at launch, and a change of
/// server replaces the controller (`restart`). It also keeps the WebView on
/// that server: any other site opens in the browser.
final class MinddyViewController: CAPBridgeViewController {
    private var navigationGuard: NavigationGuard?
    private var loadingObservation: NSKeyValueObservation?
    private weak var launchCover: UIView?
    private let navigationBar = NavigationBar()
    private weak var shellPlugin: MinddyShellPlugin?
    private var offsetObservation: NSKeyValueObservation?
    /// Where the page's scroll stays while the keyboard is up (`holdOffset`).
    private var keyboardOffset: CGPoint?

    /// The server this controller was built for.
    private(set) var origin = ServerStore.origin

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        origin = ServerStore.origin
        descriptor.serverURL = origin
        // For server logs and the device label; the web app detects the shell
        // from the object Capacitor injects (`lib/mobile/bridge.ts`).
        descriptor.appendedUserAgentString = "minddy-mobile/\(Self.version)"
        return descriptor
    }

    override func capacitorDidLoad() {
        let plugin = MinddyShellPlugin()
        plugin.controller = self
        bridge?.registerPluginInstance(plugin)
        shellPlugin = plugin
        navigationBar.onSelect = { [weak plugin] id in plugin?.navigationBarDidSelect(id) }

        guard let webView, let capacitorDelegate = webView.navigationDelegate as? NSObject else { return }
        let guardDelegate = NavigationGuard(forwardingTo: capacitorDelegate, controller: self)
        navigationGuard = guardDelegate
        webView.navigationDelegate = guardDelegate
        // No edge swipe for history: the product owns the horizontal swipe from
        // the left, which opens its sidebar.
        webView.allowsBackForwardNavigationGestures = false
        Self.hideFormAccessoryBar
        observeKeyboard()
    }

    // MARK: - Keyboard

    /// Tells the page where the keyboard is going as soon as it starts to
    /// move, with the movement's duration. WebKit reports the keyboard to the
    /// page only once it has stopped (`visualViewport`), so what makes room
    /// for it jumped after it, or moved on a guessed height and timing.
    ///
    /// WebKit's own handling of the keyboard is switched off: it scrolls the
    /// page to reveal the focused field once the keyboard has stopped, and
    /// gives that scroll back when the keyboard leaves, each time a jump on
    /// top of the page's own movement. The page makes room for the keyboard
    /// itself, from these reports (`lib/use-mobile-layout.ts`), and reveals
    /// the field in its own scroll area. As Capacitor's keyboard plugin does
    /// in its `none` mode, the WebView stops listening to the keyboard.
    private func observeKeyboard() {
        let center = NotificationCenter.default
        if let webView {
            for name in [
                UIResponder.keyboardWillShowNotification,
                UIResponder.keyboardWillHideNotification,
                UIResponder.keyboardWillChangeFrameNotification,
                UIResponder.keyboardDidChangeFrameNotification
            ] {
                center.removeObserver(webView, name: name, object: nil)
            }
        }
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
            center.addObserver(self, selector: #selector(keyboardWillMove(_:)), name: name, object: nil)
        }
        center.addObserver(self, selector: #selector(keyboardDidHide), name: UIResponder.keyboardDidHideNotification, object: nil)
        offsetObservation = webView?.scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scrollView, _ in
            self?.holdOffset(scrollView)
        }
    }

    /// WebKit still scrolls the page to reveal a field that takes the focus,
    /// out of the page's sight until the scroll ends, and the page, which
    /// never scrolls, then put itself back at once: the field rose past its
    /// place and dropped into it. While the keyboard is up, the page's scroll
    /// moves only under a finger; any other change is undone as it is made,
    /// before it is drawn.
    private func holdOffset(_ scrollView: UIScrollView) {
        guard let held = keyboardOffset else { return }
        if scrollView.isTracking || scrollView.isDragging || scrollView.isDecelerating || scrollView.isZooming {
            keyboardOffset = scrollView.contentOffset
        } else if scrollView.contentOffset != held {
            scrollView.contentOffset = held
        }
    }

    @objc private func keyboardDidHide() {
        keyboardOffset = nil
    }

    @objc private func keyboardWillMove(_ notification: Notification) {
        guard let info = notification.userInfo, let webView else { return }
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        var height: CGFloat = 0
        if notification.name != UIResponder.keyboardWillHideNotification,
           let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue {
            // The part of the WebView the keyboard will cover. A floating or
            // undocked keyboard (iPad) covers no strip of the bottom: none.
            let frame = webView.convert(end, from: nil)
            let covered = webView.bounds.intersection(frame)
            if !covered.isNull, covered.maxY >= webView.bounds.maxY - 1 {
                height = covered.height
            }
        }
        if height > 0, keyboardOffset == nil {
            keyboardOffset = webView.scrollView.contentOffset
        }
        shellPlugin?.keyboardWillMove(height: height, duration: duration)
    }

    /// Removes the bar iOS puts above the keyboard for web forms (previous,
    /// next, done), so a field sits directly on the keyboard as in a native
    /// app. WebKit offers no setting for it: the view that hosts web content
    /// answers `inputAccessoryView`, and this makes that answer empty, the way
    /// Capacitor's own keyboard plugin does. That plugin is not used: the
    /// shell reports the keyboard to the page itself (`observeKeyboard`).
    private static let hideFormAccessoryBar: Void = {
        guard let contentView = NSClassFromString(["WK", "Content", "View"].joined()) else { return }
        let selector = #selector(getter: UIResponder.inputAccessoryView)
        guard let method = class_getInstanceMethod(contentView, selector) else { return }
        let empty: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        // Replaces the method on that class alone, never on `UIResponder`.
        class_replaceMethod(contentView, selector, imp_implementationWithBlock(empty), method_getTypeEncoding(method))
    }()

    override func viewDidLoad() {
        // Capacitor loads the server's root, which is the public site on
        // minddy Cloud. The app opens on the product instead: this request
        // replaces that one before it answers.
        super.viewDidLoad()
        if let entry = entryURL {
            webView?.load(URLRequest(url: entry))
        }
        view.addSubview(navigationBar)
        coverUntilFirstLoad()
    }

    /// Where the app opens on its server. The server sends a signed-out
    /// visitor from there to the sign-in screen.
    private var entryURL: URL? {
        URL(string: origin)?.appendingPathComponent(ServerStore.entryPath)
    }

    /// The radius of the screen's own corners, in points, or 0 when the system
    /// does not say. UIKit has no public reading of it; the screen answers a
    /// private key, asked for only when it responds to it. The page uses it to
    /// round what it slides or raises to the shape of the device.
    static var screenCornerRadius: CGFloat {
        let key = ["_display", "Corner", "Radius"].joined()
        guard UIScreen.main.responds(to: NSSelectorFromString(key)) else { return 0 }
        return UIScreen.main.value(forKey: key) as? CGFloat ?? 0
    }

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    // MARK: - Pages

    /// A page bundled in the app, served by Capacitor from its local origin.
    func localPage(_ name: String) -> URL? {
        bridge?.config.localURL.appendingPathComponent(name)
    }

    /// True when the document on screen is one of the app's own pages. Only
    /// those may change the server.
    var showsLocalPage: Bool {
        guard let current = webView?.url, let local = bridge?.config.localURL else { return false }
        return current.scheme == local.scheme && current.host == local.host
    }

    func showServerChoice() {
        guard let page = localPage("index.html") else { return }
        webView?.load(URLRequest(url: page))
    }

    func showOffline() {
        guard let page = localPage("offline.html") else { return }
        webView?.load(URLRequest(url: page))
    }

    /// Loads the server again: the page that failed when there is one, the
    /// entry path otherwise.
    func reloadServer() {
        guard let target = navigationGuard?.takeFailedURL() ?? entryURL else { return }
        webView?.load(URLRequest(url: target))
    }

    /// Rebuilds the screen for the server now in `ServerStore`.
    func restart() {
        guard let window = view.window else { return }
        window.rootViewController = MinddyViewController()
    }

    // MARK: - Chrome

    /// Places the native bottom bar where the page's own bar is, in the
    /// WebView's coordinates, or hides it.
    func updateNavigationBar(visible: Bool, frame: CGRect?, items: [NavigationBar.Item]?) {
        if let items { navigationBar.update(items: items) }
        guard visible, let frame, frame.width > 0, frame.height > 0, navigationBar.hasItems else {
            navigationBar.setVisible(false)
            return
        }
        // The page moves its bar with itself, off the screen's edge when it
        // slides aside for the sidebar: the frame is taken as given.
        navigationBar.frame = frame
        // Under the launch cover while the first page loads.
        if let cover = launchCover {
            view.insertSubview(navigationBar, belowSubview: cover)
        } else {
            view.bringSubviewToFront(navigationBar)
        }
        navigationBar.setVisible(true)
    }

    /// The product has its own theme, which may differ from the system's. The
    /// status bar and the glass follow the product.
    func setAppearance(dark: Bool) {
        let style: UIUserInterfaceStyle = dark ? .dark : .light
        overrideUserInterfaceStyle = style
        view.window?.overrideUserInterfaceStyle = style
    }

    // MARK: - Launch

    /// Keeps the launch screen up until the first page has loaded or failed,
    /// so the app opens on the brand and not on an empty WebView.
    private func coverUntilFirstLoad() {
        guard let webView,
              let cover = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view
        else { return }
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(cover)
        launchCover = cover

        var started = false
        loadingObservation = webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] webView, _ in
            if webView.isLoading {
                started = true
            } else if started {
                self?.uncover()
            }
        }
    }

    private func uncover() {
        loadingObservation = nil
        guard let cover = launchCover else { return }
        UIView.animate(withDuration: 0.2, animations: { cover.alpha = 0 }, completion: { _ in cover.removeFromSuperview() })
    }
}

/// Sits in front of Capacitor's navigation delegate and forwards everything
/// it does not decide itself.
///
/// Two decisions are taken here. A main-frame navigation to another site
/// leaves the app for the browser, compared by exact origin: every page in
/// this WebView can reach the native bridge, so only the selected server may
/// load in it. And a page that fails to load shows the bundled offline screen,
/// except when the navigation was merely cancelled.
final class NavigationGuard: NSObject, WKNavigationDelegate {
    private let capacitorDelegate: NSObject
    private weak var controller: MinddyViewController?
    private var failedURL: URL?

    init(forwardingTo capacitorDelegate: NSObject, controller: MinddyViewController) {
        self.capacitorDelegate = capacitorDelegate
        self.controller = controller
    }

    func takeFailedURL() -> URL? {
        defer { failedURL = nil }
        return failedURL
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || capacitorDelegate.responds(to: selector)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        capacitorDelegate
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if isMainFrame,
           let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
           let origin = controller?.origin,
           !ServerStore.url(url, isWithin: origin) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        (capacitorDelegate as? WKNavigationDelegate)?.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
            ?? decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        (capacitorDelegate as? WKNavigationDelegate)?.webView?(webView, didCommit: navigation)
        // A new document has replaced the page: it says again whether it has
        // a bar. Not when a navigation merely starts: one that is cancelled or
        // fails leaves the page in place, and that page, which already
        // reported its bar, would never report it again.
        controller?.updateNavigationBar(visible: false, frame: nil, items: [])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        (capacitorDelegate as? WKNavigationDelegate)?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)

        let failure = error as NSError
        // A navigation replaced by another one, or stopped by the policy
        // above, is not a server that cannot be reached.
        let cancelled = failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled
        let interrupted = failure.domain == "WebKitErrorDomain" && failure.code == 102
        guard !cancelled, !interrupted, let controller else { return }

        if let url = failure.userInfo[NSURLErrorFailingURLErrorKey] as? URL,
           ServerStore.url(url, isWithin: controller.origin) {
            failedURL = url
        }
        controller.showOffline()
    }
}
