import UIKit

/// Opens a page of the selected server from outside the page: a tapped
/// notification (`PushNotifications`) or a universal link (`SceneDelegate`).
///
/// When the app was not running, the request arrives before the screen
/// exists. It waits here, and the screen opens on it instead of its entry
/// page (`MinddyViewController.viewDidLoad`).
final class AppNavigator {
    static let shared = AppNavigator()

    /// The screen that opens the pages, once it exists.
    weak var controller: MinddyViewController?

    /// A path asked for before the screen could open it.
    private var pendingPath: String?

    /// The path asked for before the screen existed, given once.
    func takePendingPath() -> String? {
        defer { pendingPath = nil }
        return pendingPath
    }

    func open(path: String) {
        if let controller, controller.isViewLoaded {
            controller.open(path: path)
        } else {
            pendingPath = path
        }
    }

    /// A link iOS handed to the app: opened in the app when it belongs to the
    /// selected server, in the browser otherwise (`UniversalLink`).
    func open(universalLink url: URL) {
        switch UniversalLink.destination(of: url, server: ServerStore.origin) {
        case .app(let path):
            open(path: path)
        case .browser(let url):
            // iOS gives an app's own universal link to the browser when that
            // app opens it, so this never comes back here.
            DispatchQueue.main.async { UIApplication.shared.open(url) }
        }
    }
}
