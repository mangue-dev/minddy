import Capacitor
import Foundation
import UIKit
import UserNotifications

/// Remote notifications (APNs): the device token, the permission, and what a
/// tap on a notification opens.
///
/// The page asks for the permission from a gesture of its own, the switch in
/// the notification settings, never at launch (`registerForPushNotifications`
/// in `MinddyShellPlugin`). The token goes to the server with the gateway it
/// belongs to (`environment`), so the server never has to guess it.
///
/// A notification carries the path of what it is about, built by the server
/// (`lib/notification-target.ts`). A tap opens it on the selected server,
/// whether the app was running or not (`AppNavigator`).
///
/// Capacitor makes its own router the notification center's delegate when a
/// bridge starts, and that router shows nothing in the foreground and ignores
/// taps unless a handler is set. This object is that handler, registered on
/// every bridge (`MinddyViewController.capacitorDidLoad`).
final class PushNotifications: NSObject {
    static let shared = PushNotifications()

    private var waiting: [(Result<Data, Error>) -> Void] = []

    // MARK: - Permission and token

    /// `granted`, `denied` or `default`, the web's names.
    func permission(_ completion: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let value: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: value = "granted"
            case .denied: value = "denied"
            default: value = "default"
            }
            DispatchQueue.main.async { completion(value) }
        }
    }

    /// Shows the system's prompt when the person has not answered yet.
    func requestPermission(_ completion: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async { completion(granted) }
        }
    }

    /// Registers with APNs and returns the device token. Runs on the main thread.
    func token(_ completion: @escaping (Result<Data, Error>) -> Void) {
        waiting.append(completion)
        guard waiting.count == 1 else { return }
        UIApplication.shared.registerForRemoteNotifications()
        // APNs may never answer, on a device without network for instance.
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            self?.finish(.failure(NSError(domain: "minddy.push", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "APNs did not return a device token."
            ])))
        }
    }

    func didRegister(token: Data) { finish(.success(token)) }
    func didFailToRegister(_ error: Error) { finish(.failure(error)) }

    private func finish(_ result: Result<Data, Error>) {
        let callbacks = waiting
        waiting = []
        callbacks.forEach { $0(result) }
    }

    /// The APNs gateway this build's tokens belong to. A development profile
    /// says `development` (the sandbox); App Store and TestFlight builds carry
    /// no profile in the bundle, and use production.
    static let environment: String = {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let raw = String(data: data, encoding: .isoLatin1),
              let start = raw.range(of: "<?xml"),
              let end = raw.range(of: "</plist>"),
              let plist = try? PropertyListSerialization.propertyList(
                  from: Data(raw[start.lowerBound..<end.upperBound].utf8), format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any],
              let aps = entitlements["aps-environment"] as? String
        else { return "production" }
        return aps == "development" ? "sandbox" : "production"
    }()

    /// A stable identity for this installation, which links a token to the
    /// one it replaces on the server.
    static var installationId: String {
        let key = "minddy.pushInstallationId"
        if let id = UserDefaults.standard.string(forKey: key) { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: key)
        return id
    }
}

extension PushNotifications: NotificationHandlerProtocol {
    /// While the app is in front, the notification still shows: the person
    /// may be on another screen than the one it is about.
    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func didReceive(response: UNNotificationResponse) {
        guard let path = response.notification.request.content.userInfo["url"] as? String else { return }
        DispatchQueue.main.async { AppNavigator.shared.open(path: path) }
    }
}
