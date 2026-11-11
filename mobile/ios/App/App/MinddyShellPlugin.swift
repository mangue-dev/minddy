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
        CAPPluginMethod(name: "setNavigationBar", returnType: CAPPluginReturnPromise)
    ]

    weak var controller: MinddyViewController?

    @objc func state(_ call: CAPPluginCall) {
        call.resolve([
            "origin": ServerStore.origin,
            "cloudOrigin": ServerStore.cloudOrigin,
            "isCustomServer": ServerStore.customOrigin != nil,
            "version": MinddyViewController.version,
            "cornerRadius": MinddyViewController.screenCornerRadius
        ])
    }

    @objc func connect(_ call: CAPPluginCall) {
        onLocalPage(call) { controller in
            guard let origin = call.getString("origin").flatMap(ServerStore.normalize) else {
                call.resolve(["error": "serverInvalid"])
                return
            }
            // Choosing Cloud's own address is choosing Cloud.
            ServerStore.customOrigin = origin == ServerStore.cloudOrigin ? nil : origin
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

    /// A tap on the native bar, sent to the page that owns the action.
    func navigationBarDidSelect(_ id: String) {
        notifyListeners("navigationAction", data: ["id": id])
    }

    /// The keyboard starts to move: the height it will cover at the bottom of
    /// the WebView once it stops, 0 when it leaves, in points, and how long
    /// it takes, in milliseconds.
    func keyboardWillMove(height: CGFloat, duration: TimeInterval) {
        notifyListeners("keyboard", data: ["height": Double(height), "duration": duration * 1000])
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
