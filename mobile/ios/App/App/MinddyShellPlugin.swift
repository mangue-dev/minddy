import AuthenticationServices
import Capacitor
import Foundation

/// The shell's own plugin, `MinddyShell` in JavaScript. Its contract is
/// `MobileShellPlugin` in `lib/mobile/bridge.ts`.
///
/// `connect` and `useCloud` change where the app loads minddy from, so they
/// answer only the pages bundled in the app. A page served by any server,
/// minddy Cloud included, is refused: it could otherwise send the app to a
/// server of its choosing.
@objc(MinddyShellPlugin)
final class MinddyShellPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "MinddyShellPlugin"
    let jsName = "MinddyShell"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "useCloud", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openServerPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNavigationBar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerForPushNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregisterForPushNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise)
    ]

    weak var controller: MinddyViewController?

    /// The sign-in sheet in progress: the system drops a session nobody holds.
    private var authSession: ASWebAuthenticationSession?
    /// The Sign in with Apple sheet in progress, held for the same reason.
    private var appleSignIn: AppleSignIn?

    @objc func state(_ call: CAPPluginCall) {
        // The corner radius reads the window, which belongs to the main thread.
        DispatchQueue.main.async { [weak self] in
            var state: [String: Any] = [
                "origin": ServerStore.origin,
                "cloudOrigin": ServerStore.cloudOrigin,
                "isCustomServer": ServerStore.customOrigin != nil,
                "version": MinddyViewController.version,
                "cornerRadius": self?.controller?.screenCornerRadius ?? 0
            ]
            if let radii = self?.controller?.screenCornerRadii { state["cornerRadii"] = radii }
            if let fold = self?.controller?.screenFold { state["fold"] = fold }
            call.resolve(state)
        }
    }

    @objc func connect(_ call: CAPPluginCall) {
        onLocalPage(call) { controller in
            guard let origin = call.getString("origin").flatMap(ServerStore.normalize) else {
                call.resolve(["error": "serverInvalid"])
                return
            }
            // Choosing Cloud's own address is choosing Cloud.
            ServerStore.customOrigin = ServerStore.storedOrigin(forChosen: origin, cloud: ServerStore.configuredCloudOrigin)
            call.resolve()
            controller.restart()
        }
    }

    @objc func useCloud(_ call: CAPPluginCall) {
        onLocalPage(call) { controller in
            ServerStore.customOrigin = nil
            call.resolve()
            controller.restart()
        }
    }

    @objc func openServerPicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.controller?.showServerChoice()
            call.resolve()
        }
    }

    @objc func reload(_ call: CAPPluginCall) {
        onLocalPage(call) { controller in
            call.resolve()
            controller.reloadServer()
        }
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        DispatchQueue.main.async { [weak self] in
            self?.controller?.setAppearance(dark: dark)
            call.resolve()
        }
    }

    /// The page reports its bottom bar: where it is, what it holds, and
    /// whether it is in view. See `NavigationBar`.
    @objc func setNavigationBar(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        var frame: CGRect?
        if let rect = call.getObject("frame"),
           let x = rect["x"] as? Double, let y = rect["y"] as? Double,
           let width = rect["width"] as? Double, let height = rect["height"] as? Double {
            frame = CGRect(x: x, y: y, width: width, height: height)
        }
        // Absent when the buttons have not changed: the bar keeps its own.
        let items = call.getArray("items")?.compactMap { value -> NavigationBar.Item? in
            guard let item = value as? [String: Any], let id = item["id"] as? String else { return nil }
            return NavigationBar.Item(
                id: id,
                label: item["label"] as? String ?? "",
                badge: item["badge"] as? Bool ?? false,
                icon: (item["icon"] as? String).flatMap { Data(base64Encoded: $0) },
                iconScale: CGFloat(item["iconScale"] as? Double ?? 1),
                iconTinted: item["iconTinted"] as? Bool ?? true
            )
        }
        DispatchQueue.main.async { [weak self] in
            self?.controller?.updateNavigationBar(visible: visible, frame: frame, items: items)
            call.resolve()
        }
    }

    /// Runs a provider's sign-in pages in the system's sign-in sheet, where
    /// Google accepts them (it refuses an embedded WebView), and resolves with
    /// the URL that ends the round: `minddy://auth?code=…`, which the page
    /// exchanges itself (`lib/mobile/auth-session.ts`). Closing the sheet
    /// resolves without a URL.
    ///
    /// Only https pages can be opened, and only a custom scheme ends the
    /// round, so a page cannot use this to open something else.
    @objc func authenticate(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https",
              let scheme = call.getString("callbackScheme"), !scheme.isEmpty,
              !["http", "https"].contains(scheme.lowercased()) else {
            call.reject("A sign-in needs an https page and a custom callback scheme.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.authSession?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.authSession = nil
                if let callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.resolve([:])
                } else {
                    call.reject(error?.localizedDescription ?? "The sign-in did not finish.")
                }
            }
            session.presentationContextProvider = self
            // Shares Safari's cookies, so someone already signed in to the
            // provider there only confirms.
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            if !session.start() {
                self.authSession = nil
                call.reject("The sign-in sheet could not open.")
            }
        }
    }

    /// Signs in with Apple in the system sheet and resolves with the identity
    /// token, the raw nonce it was issued for, the one-time authorization code
    /// and, on the first authorization only, the person's name. Closing the
    /// sheet resolves with nothing. See `AppleSignIn`.
    @objc func signInWithApple(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let signIn = AppleSignIn { [weak self] in
                self?.controller?.view.window ?? ASPresentationAnchor()
            }
            self.appleSignIn = signIn
            signIn.start { [weak self] result in
                self?.appleSignIn = nil
                switch result {
                case .success(let outcome):
                    var data: [String: Any] = [
                        "identityToken": outcome.identityToken,
                        "nonce": outcome.nonce
                    ]
                    if let code = outcome.authorizationCode { data["authorizationCode"] = code }
                    if let name = outcome.fullName { data["fullName"] = name }
                    call.resolve(data)
                case .failure(.canceled):
                    call.resolve([:])
                case .failure(.failed(let message)):
                    call.reject(message)
                }
            }
        }
    }

    // MARK: - Push notifications

    /// `granted`, `denied` or `default`, without asking anything.
    @objc func pushPermission(_ call: CAPPluginCall) {
        PushNotifications.shared.permission { call.resolve(["permission": $0]) }
    }

    /// Registers this installation with APNs and resolves with what the server
    /// stores: the token, the platform and the gateway it belongs to. With
    /// `activate`, from the person's gesture, it first asks for the permission
    /// when they have not answered yet; without it, it only renews a token
    /// already allowed. Resolves with `permission` alone when there is no token
    /// to give.
    @objc func registerForPushNotifications(_ call: CAPPluginCall) {
        let activate = call.getBool("activate") ?? false
        let push = PushNotifications.shared
        push.permission { permission in
            let register = {
                push.token { result in
                    switch result {
                    case .success(let token):
                        call.resolve([
                            "permission": "granted",
                            "transport": "apns",
                            "endpoint": "apns:" + token.map { String(format: "%02x", $0) }.joined(),
                            "installationId": PushNotifications.installationId,
                            "platform": "ios",
                            "environment": PushNotifications.environment
                        ])
                    case .failure(let error):
                        call.reject(error.localizedDescription)
                    }
                }
            }
            if permission == "granted" {
                register()
            } else if permission == "default" && activate {
                push.requestPermission { granted in
                    if granted { register() } else { call.resolve(["permission": "denied"]) }
                }
            } else {
                call.resolve(["permission": permission])
            }
        }
    }

    @objc func unregisterForPushNotifications(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.unregisterForRemoteNotifications()
            call.resolve()
        }
    }

    /// Opens minddy's notification settings in the Settings app.
    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let target: String
            if #available(iOS 16.0, *) {
                target = UIApplication.openNotificationSettingsURLString
            } else {
                target = UIApplication.openSettingsURLString
            }
            if let url = URL(string: target) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    /// A tap on the native bar, sent to the page that owns the action.
    func navigationBarDidSelect(_ id: String) {
        notifyListeners("navigationAction", data: ["id": id])
    }

    /// Asks the page to open a path of its server in place: a tapped
    /// notification or a universal link while the product is on screen.
    func openPath(_ path: String) {
        notifyListeners("openPath", data: ["path": path])
    }

    /// The keyboard starts to move: the height it will cover at the bottom of
    /// the WebView once it stops, 0 when it leaves, in points, and how long
    /// it takes, in milliseconds.
    func keyboardWillMove(height: CGFloat, duration: TimeInterval) {
        notifyListeners("keyboard", data: ["height": Double(height), "duration": duration * 1000])
    }

    /// The app now shows on another display, or in another size or
    /// orientation of it, or the hinge moved: the radius of that display's
    /// corners, in points, of each corner when the system says, and where
    /// the fold runs while the hinge is partially open.
    func displayDidChange(cornerRadius: CGFloat, cornerRadii: [String: Double]?, fold: [String: Double]?) {
        var data: [String: Any] = ["cornerRadius": Double(cornerRadius)]
        if let cornerRadii { data["cornerRadii"] = cornerRadii }
        // Always present, null without a fold, so the page drops a stale one.
        data["fold"] = fold ?? NSNull()
        notifyListeners("display", data: data)
    }

    /// Runs `action` on the main thread when the calling document is one of
    /// the app's own pages, and rejects the call otherwise.
    private func onLocalPage(_ call: CAPPluginCall, _ action: @escaping (MinddyViewController) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.controller, controller.showsLocalPage else {
                call.reject("Only the app's own pages may do this.")
                return
            }
            action(controller)
        }
    }
}

extension MinddyShellPlugin: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        controller?.view.window ?? ASPresentationAnchor()
    }
}
