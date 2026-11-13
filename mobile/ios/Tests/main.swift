import Foundation

// The decisions of the shell that need no UIKit, compiled with their sources
// outside Xcode by `npm --prefix mobile run test:ios`.

var failures = 0

func expect(_ actual: UniversalLink.Destination, _ expected: UniversalLink.Destination, _ name: String) {
    if actual == expected {
        print("ok - \(name)")
    } else {
        failures += 1
        print("not ok - \(name): got \(actual), expected \(expected)")
    }
}

func link(_ raw: String) -> URL { URL(string: raw)! }

let cloud = "https://www.minddy.app"
let selfHosted = "https://minddy.example.com"

expect(
    UniversalLink.destination(of: link("https://www.minddy.app/projects/min-3f2a9c81?issue=MIN-42"), server: cloud),
    .app(path: "/projects/min-3f2a9c81?issue=MIN-42"),
    "a link of the selected server opens in the app with its query"
)
expect(
    UniversalLink.destination(of: link("https://WWW.minddy.app/inbox#latest"), server: cloud),
    .app(path: "/inbox#latest"),
    "the host compares without case and the fragment is kept"
)
expect(
    UniversalLink.destination(of: link("https://www.minddy.app/auth/callback?token_hash=a%2Bb&type=signup&next=/auth/confirmed"), server: cloud),
    .app(path: "/auth/callback?token_hash=a%2Bb&type=signup&next=/auth/confirmed"),
    "an e-mail link keeps its encoded token"
)
expect(
    UniversalLink.destination(of: link("https://www.minddy.app"), server: cloud),
    .app(path: "/"),
    "a bare origin opens the server's root"
)
expect(
    UniversalLink.destination(of: link("https://www.minddy.app/projects/min-3f2a9c81"), server: selfHosted),
    .browser(link("https://www.minddy.app/projects/min-3f2a9c81")),
    "a minddy Cloud link opens in the browser while the app is on a self-hosted server"
)
expect(
    UniversalLink.destination(of: link("https://preview.minddy.app/home"), server: cloud),
    .browser(link("https://preview.minddy.app/home")),
    "another minddy domain is another server"
)
expect(
    UniversalLink.destination(of: link("https://minddy.app/home"), server: cloud),
    .browser(link("https://minddy.app/home")),
    "the apex is not the selected origin"
)
expect(
    UniversalLink.destination(of: link("https://www.minddy.app:8443/home"), server: cloud),
    .browser(link("https://www.minddy.app:8443/home")),
    "another port is another server"
)
expect(
    UniversalLink.destination(of: link("http://www.minddy.app/home"), server: cloud),
    .browser(link("http://www.minddy.app/home")),
    "another scheme is another server"
)
expect(
    UniversalLink.destination(of: link("https://www.minddy.app//evil.example/home"), server: cloud),
    .browser(link("https://www.minddy.app//evil.example/home")),
    "a path that would read as another host never loads in the app"
)

func expectStored(_ actual: String?, _ expected: String?, _ name: String) {
    if actual == expected {
        print("ok - \(name)")
    } else {
        failures += 1
        print("not ok - \(name): got \(actual ?? "nil"), expected \(expected ?? "nil")")
    }
}

expectStored(
    ServerStore.storedOrigin(forChosen: cloud, cloud: cloud),
    nil,
    "choosing minddy Cloud stores no server"
)
expectStored(
    ServerStore.storedOrigin(forChosen: "https://minddy-min907.vercel.app", cloud: cloud),
    "https://minddy-min907.vercel.app",
    "a server equal to the debug override is stored, so it outlives that launch"
)

if failures > 0 {
    print("\(failures) failed")
    exit(1)
}
