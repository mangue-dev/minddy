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
    private var coverLifting = false
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

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        Self.drawAtDisplayRate(configuration.preferences)
        return configuration
    }

    /// Lets the page draw at the display's rate, 120 Hz on a ProMotion
    /// iPhone. WebKit holds a page's rendering updates (CSS animations and
    /// transitions, `requestAnimationFrame`) near 60 fps behind a feature flag
    /// that is on by default, while the native scroll around them runs at
    /// 120 Hz: every animation of the product looked uneven next to it.
    /// WebKit offers no public setting for it; this turns the flag off
    /// through `WKPreferences`'s private feature list, the one behind Safari's
    /// "Prefer Page Rendering Updates near 60fps". `CADisableMinimumFrameDurationOnPhone`
    /// in Info.plist lets the app ask for more than 60 Hz at all.
    ///
    /// It is the only private call the shell makes for looks alone (App Store
    /// guideline 2.5.1; mobile/README.md, "App Store review"), so it is kept
    /// as narrow as it can be:
    /// - `MinddyPreferDisplayRate` in Info.plist turns it on. Set to false, or
    ///   removed, the build never makes the call, without a code change.
    /// - It runs only on a display faster than 60 Hz, where it changes
    ///   something.
    /// - It calls the setter only when the setter still takes a BOOL and an
    ///   object and returns nothing, so a WebKit that changed it is left as it
    ///   is rather than crashing. A WebKit without the flag is left alone too.
    private static func drawAtDisplayRate(_ preferences: WKPreferences) {
        guard Bundle.main.object(forInfoDictionaryKey: "MinddyPreferDisplayRate") as? Bool == true,
              maximumDisplayRate > 60 else { return }
        let featuresSelector = NSSelectorFromString(["_", "features"].joined())
        let setSelector = NSSelectorFromString(["_setEnabled", ":forFeature:"].joined())
        guard WKPreferences.responds(to: featuresSelector),
              preferences.responds(to: setSelector),
              let method = class_getInstanceMethod(WKPreferences.self, setSelector),
              takesBoolAndObject(method),
              let features = WKPreferences.perform(featuresSelector)?.takeUnretainedValue() as? [NSObject],
              let feature = features.first(where: {
                  ($0.value(forKey: "key") as? String) == "PreferPageRenderingUpdatesNear60FPSEnabled"
              }) else { return }
        typealias SetEnabled = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        let setEnabled = unsafeBitCast(method_getImplementation(method), to: SetEnabled.self)
        setEnabled(preferences, setSelector, false, feature)
    }

    /// The highest refresh rate of the screens the app is on, 0 before a
    /// scene is connected.
    private static var maximumDisplayRate: Int {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.screen.maximumFramesPerSecond }
            .max() ?? 0
    }

    /// Whether `method` is `- (void)name:(BOOL)value name:(id)object`, the
    /// shape the call in `drawAtDisplayRate` is cast to.
    private static func takesBoolAndObject(_ method: Method) -> Bool {
        guard method_getNumberOfArguments(method) == 4 else { return false }
        func type(_ copy: UnsafeMutablePointer<CChar>?) -> String? {
            guard let copy else { return nil }
            defer { free(copy) }
            return String(cString: copy)
        }
        // BOOL is `B` on arm64 and `c` where it is a signed char.
        return type(method_copyReturnType(method)) == "v"
            && ["B", "c"].contains(type(method_copyArgumentType(method, 2)))
            && type(method_copyArgumentType(method, 3)) == "@"
    }

    override func capacitorDidLoad() {
        let plugin = MinddyShellPlugin()
        plugin.controller = self
        bridge?.registerPluginInstance(plugin)
        shellPlugin = plugin
        // Capacitor's notification router is the delegate; it hands pushes on.
        bridge?.notificationRouter.pushNotificationHandler = PushNotifications.shared
        navigationBar.onSelect = { [weak plugin] id in plugin?.navigationBarDidSelect(id) }

        guard let webView, let capacitorDelegate = webView.navigationDelegate as? NSObject else { return }
        let guardDelegate = NavigationGuard(forwardingTo: capacitorDelegate, controller: self)
        navigationGuard = guardDelegate
        webView.navigationDelegate = guardDelegate
        // No edge swipe for history: a single-page app has no history the
        // reader would recognize, and the product's sheets own the gestures.
        webView.allowsBackForwardNavigationGestures = false
        Self.hideFormAccessoryBar
        letFocusRaiseKeyboard()
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

    /// Lets a field the page focuses raise the keyboard, as a native app's
    /// does. WebKit raises it only for a focus that a tap gave in the same
    /// moment, so a reply field opened by "Reply", or Numo's composer when
    /// its sheet opens, took the focus without a keyboard. For any other focus
    /// WebKit asks its UI delegate (`_webView:focusShouldStartInputSession:`,
    /// a private member of `WKUIDelegatePrivate`); Capacitor's delegate does
    /// not answer, which means no. This adds the answer, yes, to that
    /// delegate's class. The page itself still decides when to focus: on a
    /// phone it focuses only where a tap asked for it
    /// (`lib/mobile-sheet-focus.ts`).
    private func letFocusRaiseKeyboard() {
        guard let delegate = webView?.uiDelegate else { return }
        let selector = NSSelectorFromString(["_webView", ":focusShouldStartInputSession:"].joined())
        let delegateClass: AnyClass = type(of: delegate as AnyObject)
        guard !class_respondsToSelector(delegateClass, selector) else { return }
        let answer: @convention(block) (AnyObject, AnyObject, AnyObject) -> Bool = { _, _, _ in true }
        class_addMethod(delegateClass, selector, imp_implementationWithBlock(answer), "B@:@@")
    }

    override func viewDidLoad() {
        // Capacitor loads the server's root, which is the public site on
        // minddy Cloud. The app opens on the product instead: this request
        // replaces that one before it answers.
        super.viewDidLoad()
        AppNavigator.shared.controller = self
        observeHinge()
        // A notification tapped or a link followed while the app was closed
        // opens its own page.
        let asked = AppNavigator.shared.takePendingPath().flatMap(url(forPath:))
        if let entry = asked ?? entryURL {
            webView?.load(URLRequest(url: entry))
        }
        view.addSubview(navigationBar)
        coverUntilFirstLoad()
    }

    /// Opens a path of the selected server, such as a tapped notification's
    /// or a universal link's.
    func open(path: String) {
        guard let url = url(forPath: path) else { return }
        // The product is on screen: it opens the path itself, without
        // reloading. The inbox, for one, is a sheet over the current page.
        if !showsLocalPage, let plugin = shellPlugin, plugin.hasListeners("openPath") {
            plugin.openPath(path)
            return
        }
        webView?.load(URLRequest(url: url))
    }

    /// `path` on the selected server, or nil when it is not a path of it.
    private func url(forPath path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: origin + path),
              ServerStore.url(url, isWithin: origin) else { return nil }
        return url
    }

    /// Where the app opens on its server. The server sends a signed-out
    /// visitor from there to the sign-in screen.
    private var entryURL: URL? {
        URL(string: origin)?.appendingPathComponent(ServerStore.entryPath)
    }

    /// The radius of the corners of the screen showing the app, in points, or
    /// 0 when the system does not say. The page uses it to round what it
    /// slides or raises to the shape of the device.
    ///
    /// It is the largest of the corners `screenCornerRadii` reads, through
    /// public UIKit from iOS 26 on. Before iOS 26 UIKit has no public reading
    /// of it, and the page keeps its own defaults (App Store guideline 2.5.1:
    /// no private API). The largest, because iPhone Duo's outer display is a
    /// D whose square corners say 0.
    var screenCornerRadius: CGFloat {
        CGFloat(screenCornerRadii?.values.max() ?? 0)
    }

    /// A view over the whole window whose corners follow its container's,
    /// read for the radius of each corner of the screen.
    private lazy var cornerProbe: UIView = {
        let probe = UIView()
        probe.isUserInteractionEnabled = false
        probe.isHidden = true
        probe.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        if #available(iOS 26.0, *) {
            probe.cornerConfiguration = .corners(radius: .containerConcentric())
        }
        return probe
    }()

    /// The radius of each corner of the screen showing the app, in points, or
    /// nil when the system does not say. The corners are not all alike:
    /// iPhone Duo's outer display is a D, square on the hinge side and round
    /// on the other.
    var screenCornerRadii: [String: Double]? {
        guard #available(iOS 26.0, *), view.window != nil else { return nil }
        if cornerProbe.superview !== view {
            view.insertSubview(cornerProbe, at: 0)
        }
        cornerProbe.frame = view.bounds
        let radius = { (corner: UIRectCorner) in Double(self.cornerProbe.effectiveRadius(corner: corner)) }
        let radii = [
            "topLeft": radius(.topLeft),
            "topRight": radius(.topRight),
            "bottomLeft": radius(.bottomLeft),
            "bottomRight": radius(.bottomRight)
        ]
        return radii.values.contains { $0 > 0 } ? radii : nil
    }

    /// Whether the hinge last reported itself partially open; false on a
    /// device without one.
    private var hingePartiallyOpen = false

    /// iPhone Duo half open, like a laptop or a book: the inner display
    /// bends at the fold, and Safari keeps its sheets on one side of it. The
    /// page hears where the fold runs while the hinge is partially open, and
    /// that there is none otherwise (`fold` of the `display` event).
    private func observeHinge() {
        guard #available(iOS 27.1, *) else { return }
        let interaction = UIHingeInteraction { [weak self] _, update in
            guard let self else { return }
            self.hingePartiallyOpen = update.hinge?.status == .partiallyOpen
            self.reportDisplay()
        }
        view.addInteraction(interaction)
    }

    /// The fold of the display, in the view's points, while the hinge is
    /// partially open: the system's division region.
    var screenFold: [String: Double]? {
        guard #available(iOS 27.1, *), hingePartiallyOpen else { return nil }
        guard let fold = view.reservedRegions(kind: .division).first(where: { $0.isActive }) ?? view.reservedRegions(kind: .division).first
        else { return nil }
        return [
            "x": Double(fold.frame.minX),
            "y": Double(fold.frame.minY),
            "width": Double(fold.frame.width),
            "height": Double(fold.frame.height)
        ]
    }

    private func reportDisplay() {
        reportedWindowControls = [windowControlsInset, windowControlsHeight]
        shellPlugin?.displayDidChange(cornerRadius: screenCornerRadius, cornerRadii: screenCornerRadii, fold: screenFold, windowControlsInset: windowControlsInset, windowControlsHeight: windowControlsHeight)
    }

    /// The room the window's own controls take at the top leading corner, in
    /// points (MIN-907): in a window of iPadOS 26, the close, minimize and
    /// full-screen buttons sit over the app, where the page's header starts.
    /// The safe area adapted to the corners steps around them; the plain one
    /// does not. 0 in full screen, on iPhone, and before iOS 26.
    var windowControlsInset: Double {
        guard #available(iOS 26.0, *) else { return 0 }
        let adapted = view.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal))
        return Double(max(0, adapted.left - view.safeAreaInsets.left))
    }

    /// How far down those controls reach from the window's top edge, in
    /// points (the page measures from there): the safe area adapted
    /// vertically steps below them. A sheet keeps under it. 0 when there are
    /// no controls, where the adapted top is the plain one.
    var windowControlsHeight: Double {
        guard #available(iOS 26.0, *) else { return 0 }
        let adapted = view.edgeInsets(for: .safeArea(cornerAdaptation: .vertical))
        return adapted.top > view.safeAreaInsets.top ? Double(adapted.top) : 0
    }

    /// What the page last heard, so a layout tells it only of a change.
    private var reportedWindowControls: [Double]?

    /// iPhone Duo moves the app between its displays as it folds and unfolds,
    /// and each has its own corners: the page hears the new radii once the
    /// app has moved or turned.
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            guard let self else { return }
            self.reportDisplay()
        }
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
        // The page places its bar, and the shell moves it off what the page
        // cannot see: the camera of iPhone Duo's outer display.
        requestedBarFrame = frame
        navigationBar.frame = placeBar(frame)
        // Under the launch cover while the first page loads.
        if let cover = launchCover {
            view.insertSubview(navigationBar, belowSubview: cover)
        } else {
            view.bringSubviewToFront(navigationBar)
        }
        navigationBar.setVisible(true)
    }

    /// The frame the page last asked for the bar, before `placeBar`.
    private var requestedBarFrame: CGRect?

    /// Where the bar goes, from the frame the page asks for. A vertical bar
    /// stands in iPhone Duo's side column, where Apple keeps the side
    /// controls "aligned with the hardware" ("Designing for iPhone Duo").
    /// The page only knows the column's width, so the shell centres the bar
    /// across on the camera's axis, read from its reserved region, as
    /// Safari's side controls are. The page keeps its foot above the home
    /// indicator, where Safari's stands too. Then off the camera, wherever it
    /// is.
    /// How far from the side column's middle, toward the screen's middle,
    /// its status items stand.
    private static let sideColumnAxisShift: CGFloat = 6

    private func placeBar(_ frame: CGRect) -> CGRect {
        var placed = frame
        if #available(iOS 27.1, *), frame.height > frame.width {
            let bounds = view.bounds
            let onRight = frame.midX > bounds.midX
            let camera = view.reservedRegions(kind: .occlusion, options: .includeInactive)
                // The camera itself, not the blocks that span the column.
                .filter { abs($0.frame.midX - frame.midX) < frame.width * 1.5 && $0.frame.width < frame.width }
                .min { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
            if let camera {
                placed.origin.x = camera.frame.midX - placed.width / 2
            } else {
                // No camera in the column (the inner display): the status
                // bar's clock and icons stand on the same axis as the outer
                // camera, 6 points from the column's middle toward the
                // screen's, as measured on both displays.
                let column = onRight ? view.safeAreaInsets.right : view.safeAreaInsets.left
                if column > 0 {
                    let axis = column / 2 + Self.sideColumnAxisShift
                    placed.origin.x = (onRight ? bounds.maxX - axis : bounds.minX + axis) - placed.width / 2
                }
            }
        }
        return clearOfReservedRegions(placed)
    }

    /// `frame` moved off the regions the system reserves for hardware. On
    /// iPhone Duo's outer display the camera stands in the column the side bar
    /// shares with the status bar; turned with the camera at the foot of that
    /// column, the bar sat on it. Web content has no reading of these regions
    /// (the safe areas only say the column is there), so the shell moves the
    /// bar itself: above the region, or below it when there is no room above.
    private func clearOfReservedRegions(_ frame: CGRect) -> CGRect {
        guard #available(iOS 27.1, *) else { return frame }
        var placed = frame
        let bounds = view.bounds.inset(by: view.safeAreaInsets.with(left: 0, right: 0))
        for region in view.reservedRegions(kind: .occlusion) where region.isActive {
            let obstacle = region.frame
            guard obstacle.intersects(placed) else { continue }
            let above = obstacle.minY - placed.height
            let below = obstacle.maxY
            if above >= bounds.minY {
                placed.origin.y = above
            } else if below + placed.height <= bounds.maxY {
                placed.origin.y = below
            }
        }
        return placed
    }

    /// Reserved regions move with the device: the bar follows them even when
    /// the page's own frame for it has not changed.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let requestedBarFrame {
            navigationBar.frame = placeBar(requestedBarFrame)
        }
        updateSideChromeScript()
        // A window resized, moved to full screen or back: its controls come
        // and go without a size transition of the view controller.
        // The first layout only records it: the page reads it with `state()`.
        let controls = [windowControlsInset, windowControlsHeight]
        if let reported = reportedWindowControls {
            if reported != controls { reportDisplay() }
        } else {
            reportedWindowControls = controls
        }
    }

    /// The side the system's controls stand on (iPhone Duo folded, or open
    /// in landscape), the rule of `lib/mobile/side-chrome.ts`.
    private var sideChrome: String? {
        let insets = webView?.safeAreaInsets ?? view.safeAreaInsets
        guard insets.top == 0 else { return nil }
        if insets.right >= 24 && insets.left == 0 { return "right" }
        if insets.left >= 24 && insets.right == 0 { return "left" }
        return nil
    }

    /// What the last side-chrome script set, so a layout adds one only when
    /// the side changes.
    private var scriptedSideChrome: String??

    /// Tells every page where the side column is before its first line runs.
    /// The WebView reports its safe areas to the page only after the first
    /// paint, so the page drew its bottom bar there and moved it to the side
    /// a moment later. A script runs at the start of each document instead,
    /// with what the shell knows. User scripts cannot be replaced one by
    /// one, and Capacitor's own must stay: each change adds one, and the last
    /// added runs last, so it is the one that holds.
    private func updateSideChromeScript() {
        guard let contentController = webView?.configuration.userContentController else { return }
        let side = sideChrome
        if let scripted = scriptedSideChrome, scripted == side { return }
        scriptedSideChrome = .some(side)
        let source = side.map { "document.documentElement.setAttribute('data-side-chrome', '\($0)');" }
            ?? "document.documentElement.removeAttribute('data-side-chrome');"
        contentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    /// Whether the account allows vibrations, which the page reports at load
    /// (`setHaptics`). On until it says otherwise.
    var hapticsEnabled: Bool {
        get { navigationBar.hapticsEnabled }
        set { navigationBar.hapticsEnabled = newValue }
    }

    /// The product has its own theme, which may differ from the system's. The
    /// status bar and the glass follow the product.
    func setAppearance(dark: Bool) {
        let style: UIUserInterfaceStyle = dark ? .dark : .light
        overrideUserInterfaceStyle = style
        view.window?.overrideUserInterfaceStyle = style
    }

    // MARK: - Launch

    /// The longest the cover waits, once the first load has ended, for a page
    /// that asked to hold it: a slow read never keeps the app on its launch
    /// screen.
    static let launchCoverHoldLimit: TimeInterval = 4

    /// Keeps the launch screen up until the first page has loaded or failed,
    /// so the app opens on the brand and not on an empty WebView.
    ///
    /// A page of the signed-in app declares
    /// `<meta name="minddy-launch-cover" content="hold">`: its content still
    /// arrives after the load (the session, the reads, Home's greeting and
    /// Numo's word), and lifting the cover at the load showed it building
    /// itself piece by piece. For such a page the cover stays until it calls
    /// `contentShown`, or `launchCoverHoldLimit` after the load, and the page
    /// appears in one step. Any other page (sign-in, the bundled pages, a
    /// server older than the handshake) lifts it at the load, as before.
    private func coverUntilFirstLoad() {
        guard let webView,
              let cover = UIStoryboard(name: "LaunchScreen", bundle: nil).instantiateInitialViewController()?.view
        else { return }
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(cover)
        launchCover = cover
        cover.layoutIfNeeded()
        if let logo = Self.firstImageView(in: cover) { Self.shimmer(logo) }

        var started = false
        loadingObservation = webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] webView, _ in
            if webView.isLoading {
                started = true
            } else if started, webView.url != nil {
                // Without a URL, the load that ended is Capacitor's own, which
                // `viewDidLoad` replaced before it answered: the entry page is
                // still to come.
                self?.loadingObservation = nil
                self?.uncoverWhenContentShows()
            }
        }
    }

    /// The launch screen's logo, the only image on it.
    private static func firstImageView(in view: UIView) -> UIImageView? {
        if let image = view as? UIImageView { return image }
        for subview in view.subviews {
            if let image = firstImageView(in: subview) { return image }
        }
        return nil
    }

    /// While the launch screen waits for the page, a soft band of light
    /// crosses the logo, again and again: the app is working, not frozen.
    /// None when the system asks to reduce motion.
    private static func shimmer(_ logo: UIImageView) {
        // A mask without a size would hide the logo entirely.
        guard !UIAccessibility.isReduceMotionEnabled, !logo.bounds.isEmpty else { return }
        let band = CAGradientLayer()
        band.frame = logo.bounds.insetBy(dx: -logo.bounds.width, dy: -logo.bounds.height)
        band.startPoint = CGPoint(x: 0, y: 0.35)
        band.endPoint = CGPoint(x: 1, y: 0.65)
        // A mask: opaque keeps the logo as drawn, the dimmer band lightens it.
        band.colors = [UIColor.black, UIColor.black.withAlphaComponent(0.3), UIColor.black].map(\.cgColor)
        band.locations = [0.35, 0.42, 0.49]
        logo.layer.mask = band

        let sweep = CABasicAnimation(keyPath: "locations")
        sweep.fromValue = [0.28, 0.35, 0.42]
        sweep.toValue = [0.58, 0.65, 0.72]
        sweep.duration = 1.1
        sweep.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        let cycle = CAAnimationGroup()
        cycle.animations = [sweep]
        // A pause between two passes keeps it calm.
        cycle.duration = 1.6
        cycle.repeatCount = .infinity
        band.add(cycle, forKey: "shimmer")
    }

    /// The first load has ended: lifts the cover now, unless the page holds it.
    private func uncoverWhenContentShows() {
        guard launchCover != nil, let webView, !showsLocalPage else {
            uncover()
            return
        }
        let query = "document.querySelector('meta[name=\"minddy-launch-cover\"][content=\"hold\"]') !== null"
        webView.evaluateJavaScript(query) { [weak self] result, _ in
            guard let self else { return }
            guard (result as? Bool) == true else {
                self.uncover()
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.launchCoverHoldLimit) { [weak self] in
                self?.uncover()
            }
        }
    }

    /// The page reports that its first content is on screen
    /// (`MinddyShell.contentShown`).
    func contentShown() {
        uncover()
    }

    /// Crossfades from the launch screen to the page, once. The page's own
    /// entrance (Home's greeting rises as it fades in) plays under it.
    private func uncover() {
        loadingObservation = nil
        // The cover stays referenced while it fades, so a bar placed meanwhile
        // still goes under it.
        guard let cover = launchCover, !coverLifting else { return }
        coverLifting = true
        UIView.animate(
            withDuration: 0.24,
            delay: 0,
            options: [.curveEaseOut, .beginFromCurrentState, .allowUserInteraction],
            animations: { cover.alpha = 0 },
            completion: { _ in cover.removeFromSuperview() }
        )
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
        // An `otpauth:` link of two-factor enrollment hands its secret to the
        // system, which offers to add the code to Passwords or to an
        // authenticator app. The WebView cannot load it, and the phone cannot
        // scan the QR code it is showing.
        if isMainFrame, let url = navigationAction.request.url, url.scheme?.lowercased() == "otpauth" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
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

private extension UIEdgeInsets {
    func with(left: CGFloat, right: CGFloat) -> UIEdgeInsets {
        UIEdgeInsets(top: top, left: left, bottom: bottom, right: right)
    }
}
