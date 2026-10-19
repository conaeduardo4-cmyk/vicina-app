// Integrazioni di Vicina con l'iPhone: icona alternativa (modalità anonima), torcia vera, batteria,
// voce che legge un testo, impostazioni dell'app e azioni rapide sull'icona.
// Aggiunto al progetto da scripts/ios-native.rb (chiamato da scripts/patch-native.mjs).
import UIKit
import AVFoundation
import LocalAuthentication
import Capacitor

class VicinaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VicinaNativePlugin())
    }
}

@objc(VicinaNativePlugin)
public class VicinaNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VicinaNativePlugin"
    public let jsName = "VicinaNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "torch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "battery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setShortcuts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "glassInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setGlassBar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "glassAlert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "glassToast", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bioInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bioAuth", returnType: CAPPluginReturnPromise)
    ]
    private let synth = AVSpeechSynthesizer()

    // ---------- icona ----------
    @objc func getIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["name": UIApplication.shared.alternateIconName == nil ? "default" : "blue",
                          "supported": UIApplication.shared.supportsAlternateIcons])
        }
    }

    @objc func setIcon(_ call: CAPPluginCall) {
        let target: String? = call.getString("name") == "blue" ? "AppIconBlue" : nil
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else { call.reject("Icone alternative non supportate"); return }
            self.applyIcon(target, attempt: 0, call: call)
        }
    }

    // iOS a volte rifiuta il cambio («Resource temporarily unavailable»), soprattutto tornando all'icona normale:
    // riproviamo qualche volta e verifichiamo che l'icona sia davvero quella giusta.
    private func applyIcon(_ target: String?, attempt: Int, call: CAPPluginCall) {
        if UIApplication.shared.alternateIconName == target { call.resolve(["name": target == nil ? "default" : "blue"]); return }
        guard UIApplication.shared.applicationState == .active else {
            if attempt < 8 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.applyIcon(target, attempt: attempt + 1, call: call) } }
            else { call.reject("App non attiva") }
            return
        }
        UIApplication.shared.setAlternateIconName(target) { error in
            DispatchQueue.main.async {
                if error == nil && UIApplication.shared.alternateIconName == target { call.resolve(["name": target == nil ? "default" : "blue"]); return }
                if attempt < 4 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.applyIcon(target, attempt: attempt + 1, call: call) }
                } else {
                    call.reject(error?.localizedDescription ?? "Icona non cambiata")
                }
            }
        }
    }

    // ---------- torcia ----------
    @objc func torch(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        guard let d = AVCaptureDevice.default(for: .video), d.hasTorch else { call.reject("Questo telefono non ha la torcia"); return }
        do {
            try d.lockForConfiguration()
            if on { try d.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel) } else { d.torchMode = .off }
            d.unlockForConfiguration()
            call.resolve()
        } catch {
            call.reject("Torcia non disponibile")
        }
    }

    // ---------- batteria ----------
    @objc func battery(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true
            let l = UIDevice.current.batteryLevel
            let s = UIDevice.current.batteryState
            call.resolve(["level": l < 0 ? -1 : Int((l * 100).rounded()), "charging": s == .charging || s == .full])
        }
    }

    // ---------- voce ----------
    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let lang = call.getString("lang") ?? "it-IT"
        if text.isEmpty { call.resolve(); return }
        DispatchQueue.main.async {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            let u = AVSpeechUtterance(string: text)
            u.voice = AVSpeechSynthesisVoice(language: lang)
            u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
            self.synth.speak(u)
            call.resolve()
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate); call.resolve() }
    }

    // ---------- Liquid Glass (iOS 26) ----------
    // Tutto con i componenti di sistema, niente imitazioni:
    //  - barra delle schede = una vera UITabBarController di iOS (vetro, bolla che si sposta tra le schede, badge)
    //  - avvisi e conferme = UIAlertController di iOS
    //  - messaggi brevi = capsula UIGlassEffect
    // Disponibile solo se l'app è compilata con l'SDK di iOS 26 (Xcode 26) e il telefono ha iOS 26 o successivo.
    private var tabCtl: UITabBarController?
    private var tabBox: GlassPassView?
    private var tabVisible = false
    private var glassTint = UIColor(red: 0.91, green: 0.10, blue: 0.17, alpha: 1)
    private let glassTabs: [(String, String, String)] = [
        ("home", "Home", "house.fill"), ("map", "Mappa", "map.fill"), ("tools", "Strumenti", "square.grid.2x2.fill"),
        ("chat", "Avvisi", "bell.fill"), ("circle", "Cerchia", "person.2.fill"), ("me", "Tu", "person.crop.circle.fill")
    ]

    private func glassAvailable() -> Bool {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }

    // versione di iOS letta all'avvio: se è 26 o successiva l'app mostra l'opzione (anche su iOS 27, 28…)
    @objc func glassInfo(_ call: CAPPluginCall) {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        var compiled = false
        #if compiler(>=6.2)
        compiled = true
        #endif
        call.resolve(["supported": glassAvailable(), "compiled": compiled, "major": v.majorVersion, "ios": "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"])
    }

    private func color(_ hex: String?) -> UIColor? {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), !h.isEmpty else { return nil }
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    // La UITabBarController occupa tutto lo schermo ma è trasparente: i tocchi passano alla pagina,
    // tranne quelli sulla barra. Così la barra è quella vera di iOS, che sfoca e riflette la pagina sotto.
    private func makeTabs(_ hostVC: UIViewController) -> UITabBarController {
        let tc = UITabBarController()
        tc.delegate = self
        tc.overrideUserInterfaceStyle = .dark
        tc.view.backgroundColor = .clear
        tc.viewControllers = glassTabs.enumerated().map { (i, t) in
            let vc = UIViewController()
            vc.view.backgroundColor = .clear
            vc.view.isUserInteractionEnabled = false
            vc.tabBarItem = UITabBarItem(title: t.1, image: UIImage(systemName: t.2), tag: i)
            vc.tabBarItem.accessibilityIdentifier = t.0
            return vc
        }
        tc.tabBar.tintColor = glassTint
        let box = GlassPassView(frame: hostVC.view.bounds)
        box.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        box.backgroundColor = .clear
        box.alpha = 0
        box.isHidden = true
        box.bar = tc.tabBar
        hostVC.addChild(tc)
        tc.view.frame = box.bounds
        tc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        box.addSubview(tc.view)
        hostVC.view.addSubview(box)
        tc.didMove(toParent: hostVC)
        tabBox = box
        return tc
    }

    // { on, visible, tab, badges: { chat: 3, map: 1 }, tint: "#E8192C" }
    @objc func setGlassBar(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        let visible = call.getBool("visible") ?? false
        let tab = call.getString("tab") ?? "home"
        let badges = call.getObject("badges") ?? [:]
        let tint = color(call.getString("tint"))
        DispatchQueue.main.async {
            guard self.glassAvailable(), let hostVC = self.bridge?.viewController else { call.resolve(["active": false]); return }
            if !on {
                self.tabCtl?.willMove(toParent: nil); self.tabCtl?.view.removeFromSuperview(); self.tabCtl?.removeFromParent()
                self.tabBox?.removeFromSuperview(); self.tabCtl = nil; self.tabBox = nil; self.tabVisible = false
                call.resolve(["active": false]); return
            }
            if let t = tint { self.glassTint = t }
            let tc = self.tabCtl ?? self.makeTabs(hostVC)
            self.tabCtl = tc
            guard let box = self.tabBox else { call.resolve(["active": false]); return }
            hostVC.view.bringSubviewToFront(box)
            tc.tabBar.tintColor = self.glassTint
            if let i = self.glassTabs.firstIndex(where: { $0.0 == tab }), tc.selectedIndex != i { tc.selectedIndex = i }
            for (i, t) in self.glassTabs.enumerated() {
                let n = (badges[t.0] as? NSNumber)?.intValue ?? (badges[t.0] as? Int) ?? 0
                let item = tc.viewControllers?[i].tabBarItem
                item?.badgeValue = n > 0 ? (n > 9 ? "9+" : "\(n)") : nil
                item?.badgeColor = self.glassTint
            }
            if visible != self.tabVisible {
                self.tabVisible = visible
                if visible { box.isHidden = false }
                UIView.animate(withDuration: visible ? 0.28 : 0.15, animations: { box.alpha = visible ? 1 : 0 }) { _ in
                    if !self.tabVisible { box.isHidden = true }
                }
            }
            call.resolve(["active": true])
        }
    }

    // conferme e avvisi con l'UIAlertController di iOS (in iOS 26 è Liquid Glass)
    // { title, text, ok, cancel, danger } → { ok: true/false }
    @objc func glassAlert(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.topVC() else { call.resolve(["ok": false]); return }
            let a = UIAlertController(title: call.getString("title"), message: call.getString("text"), preferredStyle: .alert)
            let cancel = call.getString("cancel") ?? ""
            if !cancel.isEmpty { a.addAction(UIAlertAction(title: cancel, style: .cancel) { _ in call.resolve(["ok": false]) }) }
            let danger = call.getBool("danger") ?? false
            let ok = UIAlertAction(title: call.getString("ok") ?? "OK", style: danger ? .destructive : .default) { _ in call.resolve(["ok": true]) }
            a.addAction(ok)
            a.preferredAction = ok
            a.view.tintColor = danger ? nil : self.glassTint
            vc.present(a, animated: true)
        }
    }

    // messaggio breve in una capsula di vetro in alto
    private var toastView: UIView?
    private var toastGen = 0
    @objc func glassToast(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async {
            guard self.glassAvailable(), let host = self.bridge?.viewController?.view else { call.resolve(["shown": false]); return }
            #if compiler(>=6.2)
            if #available(iOS 26.0, *) {
                self.toastView?.removeFromSuperview()
                self.toastGen += 1
                let gen = self.toastGen
                let v = UIVisualEffectView(effect: UIGlassEffect())
                v.overrideUserInterfaceStyle = .dark
                v.cornerConfiguration = .capsule()
                v.translatesAutoresizingMaskIntoConstraints = false
                let l = UILabel()
                l.text = text
                l.numberOfLines = 3
                l.textAlignment = .center
                l.textColor = .label
                l.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
                l.translatesAutoresizingMaskIntoConstraints = false
                v.contentView.addSubview(l)
                host.addSubview(v)
                NSLayoutConstraint.activate([
                    l.leadingAnchor.constraint(equalTo: v.contentView.leadingAnchor, constant: 20),
                    l.trailingAnchor.constraint(equalTo: v.contentView.trailingAnchor, constant: -20),
                    l.topAnchor.constraint(equalTo: v.contentView.topAnchor, constant: 13),
                    l.bottomAnchor.constraint(equalTo: v.contentView.bottomAnchor, constant: -13),
                    v.centerXAnchor.constraint(equalTo: host.centerXAnchor),
                    v.widthAnchor.constraint(lessThanOrEqualTo: host.widthAnchor, constant: -40),
                    v.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 8)
                ])
                v.alpha = 0
                v.transform = CGAffineTransform(translationX: 0, y: -24).scaledBy(x: 0.9, y: 0.9)
                self.toastView = v
                UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.75, initialSpringVelocity: 0.4) { v.alpha = 1; v.transform = .identity }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
                    guard gen == self.toastGen else { return }
                    UIView.animate(withDuration: 0.25, animations: { v.alpha = 0; v.transform = CGAffineTransform(translationX: 0, y: -16) }) { _ in v.removeFromSuperview() }
                }
                call.resolve(["shown": true]); return
            }
            #endif
            call.resolve(["shown": false])
        }
    }

    private func topVC() -> UIViewController? {
        var vc = bridge?.viewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }

    // ---------- blocco dell'app: Face ID / Touch ID ----------
    @objc func bioInfo(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        var type = ok ? "biometric" : "none"
        switch ctx.biometryType {
        case .faceID: type = "faceid"
        case .touchID: type = "touchid"
        default: break
        }
        call.resolve(["available": ok, "type": type])
    }
    @objc func bioAuth(_ call: CAPPluginCall) {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Usa il codice"
        ctx.localizedCancelTitle = "Annulla"
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: call.getString("reason") ?? "Sblocca Vicina") { ok, err in
            let code = (err as? LAError)?.code
            DispatchQueue.main.async { call.resolve(["ok": ok, "reason": code == .userFallback ? "code" : (err?.localizedDescription ?? "")]) }
        }
    }

    // ---------- microfono e fotocamera: richiesta di sistema ----------
    private func avState(_ t: AVMediaType) -> String {
        switch AVCaptureDevice.authorizationStatus(for: t) {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "prompt"
        }
    }
    @objc func mediaState(_ call: CAPPluginCall) {
        call.resolve(["mic": avState(.audio), "cam": avState(.video)])
    }
    @objc func requestMedia(_ call: CAPPluginCall) {
        let t: AVMediaType = call.getString("type") == "cam" ? .video : .audio
        if AVCaptureDevice.authorizationStatus(for: t) == .notDetermined {
            AVCaptureDevice.requestAccess(for: t) { _ in call.resolve(["state": self.avState(t)]) }
        } else {
            call.resolve(["state": avState(t)])
        }
    }

    // ---------- impostazioni ----------
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    // ---------- azioni rapide (tieni premuta l'icona) ----------
    @objc func setShortcuts(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        DispatchQueue.main.async {
            UIApplication.shared.shortcutItems = items.prefix(4).compactMap { o in
                guard let url = o["url"] as? String, let title = o["title"] as? String else { return nil }
                let icon = (o["icon"] as? String).map { UIApplicationShortcutIcon(systemImageName: $0) }
                return UIApplicationShortcutItem(type: url, localizedTitle: title, localizedSubtitle: o["sub"] as? String, icon: icon, userInfo: nil)
            }
            call.resolve()
        }
    }

    // su iPhone il widget non c'è (serve un'estensione separata)
    @objc func updateWidget(_ call: CAPPluginCall) { call.resolve() }

    // link vicina:// arrivato da un'azione rapida prima che l'app fosse pronta
    @objc func pendingUrl(_ call: CAPPluginCall) {
        let u = UserDefaults.standard.string(forKey: "vicina_pending_url")
        UserDefaults.standard.removeObject(forKey: "vicina_pending_url")
        if let u = u { call.resolve(["url": u]) } else { call.resolve([:]) }
    }
}

// tocco sulla barra delle schede di iOS → la pagina cambia scheda (la bolla di vetro si sposta da sola)
extension VicinaNativePlugin: UITabBarControllerDelegate {
    public func tabBarController(_ tabBarController: UITabBarController, shouldSelect viewController: UIViewController) -> Bool {
        let i = tabBarController.viewControllers?.firstIndex(of: viewController) ?? 0
        if i < glassTabs.count { notifyListeners("glassTab", data: ["tab": glassTabs[i].0]) }
        return true
    }
}

// vista trasparente che lascia passare i tocchi alla pagina, tranne quelli sulla barra delle schede
final class GlassPassView: UIView {
    weak var bar: UIView?
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let v = super.hitTest(point, with: event), let b = bar, !b.isHidden, v.isDescendant(of: b) else { return nil }
        return v
    }
}
