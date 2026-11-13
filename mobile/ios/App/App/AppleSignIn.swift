import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Sign in with Apple through the system sheet (App Review guideline 4.8).
///
/// The page receives Apple's identity token and opens its own session with
/// `signInWithIdToken` (`lib/apple-sign-in.ts`). The nonce is made
/// here: Apple signs its SHA-256 hash into the identity token, and the page
/// hands the raw value to Supabase, which hashes it again to compare. A token
/// taken from another round therefore cannot be replayed.
final class AppleSignIn: NSObject {
    struct Outcome {
        let identityToken: String
        let authorizationCode: String?
        let nonce: String
        /// Present on the first authorization only, formatted for the locale.
        let fullName: String?
    }

    enum Failure: Error {
        case canceled
        case failed(String)
    }

    private let anchor: () -> ASPresentationAnchor
    private var nonce = ""
    private var completion: ((Result<Outcome, Failure>) -> Void)?
    private var controller: ASAuthorizationController?

    init(anchor: @escaping () -> ASPresentationAnchor) {
        self.anchor = anchor
    }

    /// Opens the sheet. Runs on the main thread; `completion` is called once.
    func start(completion: @escaping (Result<Outcome, Failure>) -> Void) {
        guard let nonce = Self.randomNonce() else {
            completion(.failure(.failed("No random source for the sign-in nonce.")))
            return
        }
        self.nonce = nonce
        self.completion = completion

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    private func finish(_ result: Result<Outcome, Failure>) {
        let completion = self.completion
        self.completion = nil
        controller = nil
        completion?(result)
    }

    /// 32 random bytes, base64url without padding.
    private static func randomNonce() -> String? {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { return nil }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Lowercase hexadecimal SHA-256, the form Supabase compares against.
    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension AppleSignIn: ASAuthorizationControllerDelegate {
    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            finish(.failure(.failed("Apple returned no identity token.")))
            return
        }
        // Apple gives the name on the first authorization only.
        let fullName = credential.fullName
            .map { PersonNameComponentsFormatter.localizedString(from: $0, style: .default) }?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        finish(.success(Outcome(
            identityToken: identityToken,
            authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
            nonce: nonce,
            fullName: fullName?.isEmpty == false ? fullName : nil
        )))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let error = error as? ASAuthorizationError, error.code == .canceled {
            finish(.failure(.canceled))
        } else {
            finish(.failure(.failed(error.localizedDescription)))
        }
    }
}

extension AppleSignIn: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor()
    }
}
