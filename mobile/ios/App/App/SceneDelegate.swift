import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // A universal link that launched the app waits for the screen, which
        // then opens on it rather than on its entry page.
        connectionOptions.userActivities.forEach(openUniversalLink)

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MinddyViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        openUniversalLink(userActivity)
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    /// A link of an associated domain (`App.entitlements`) that iOS opened in
    /// the app rather than in Safari.
    private func openUniversalLink(_ activity: NSUserActivity) {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb, let url = activity.webpageURL else { return }
        AppNavigator.shared.open(universalLink: url)
    }
}
