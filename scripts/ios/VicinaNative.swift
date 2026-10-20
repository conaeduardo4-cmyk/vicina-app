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
            // piccolo ritardo: subito dopo un tocco o un avviso iOS rifiuta spesso il cambio
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.applyIcon(target, attempt: 0, call: call) }
        }
    }

    // iOS rifiuta spesso il ritorno all'icona normale («Resource temporarily unavailable»), soprattutto se l'icona
    // è stata cambiata da poco: c'è un tempo di attesa. Riproviamo più a lungo, con pause crescenti, e solo ad app attiva
    // e senza avvisi aperti. La prima volta la chiamata parte SEMPRE (anche se iOS dice che l'icona è già quella giusta),
    // così compare il popup di sistema «Hai cambiato l'icona».
    private func applyIcon(_ target: String?, attempt: Int, call: CAPPluginCall) {
        let name = target == nil ? "default" : "blue"
        if attempt > 0 && UIApplication.shared.alternateIconName == target { call.resolve(["name": name]); return }
        let busy = UIApplication.shared.applicationState != .active || (bridge?.viewController?.presentedViewController is UIAlertController)
        if busy {
            if attempt < 20 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.applyIcon(target, attempt: attempt + 1, call: call) } }
            else { call.reject("App non attiva") }
            return
        }
        UIApplication.shared.setAlternateIconName(target) { error in
            DispatchQueue.main.async {
                if error == nil && UIApplication.shared.alternateIconName == target { call.resolve(["name": name]); return }
                if attempt < 9 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6 + 0.4 * Double(attempt)) { self.applyIcon(target, attempt: attempt + 1, call: call) }
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
    //  - barra delle schede = una vera UITabBar di iOS con tutte e 6 le schede (vetro, bolla che si sposta tra le schede, badge)
    //  - avvisi e conferme = UIAlertController di iOS
    //  - messaggi brevi = capsula UIGlassEffect
    // Disponibile solo se l'app è compilata con l'SDK di iOS 26 (Xcode 26) e il telefono ha iOS 26 o successivo.
    private var tabCtl: UITabBar?
    private var tabBox: GlassPassView?
    private var tabVisible = false
    private var glassTint = UIColor(red: 0.91, green: 0.10, blue: 0.17, alpha: 1)
    private let glassTabs: [(String, String, String)] = [
        ("home", "Home", "checkmark.shield"), ("map", "Mappa", "mappin.and.ellipse"), ("tools", "Strumenti", "square.grid.2x2"),
        ("chat", "Avvisi", "bubble.left"), ("circle", "Cerchia", "person.2"), ("me", "Tu", "person")
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

    // Barra delle schede vera di iOS (UITabBar), da sola: una UITabBarController ne mostra al massimo 5
    // (la sesta finisce in «More» con un pulsante Indietro), noi ne vogliamo 6 come nell'app.
    // Sta in una vista trasparente a tutto schermo: i tocchi passano alla pagina, tranne quelli sulla barra.
    private func makeTabs(_ hostVC: UIViewController) -> UITabBar {
        let bar = UITabBar()
        bar.delegate = self
        bar.overrideUserInterfaceStyle = .dark
        bar.itemPositioning = .fill
        bar.items = glassTabs.enumerated().map { (i, t) in
            let it = UITabBarItem(title: t.1, image: UIImage(systemName: t.2), tag: i)
            it.accessibilityIdentifier = t.0
            return it
        }
        bar.selectedItem = bar.items?.first
        bar.tintColor = glassTint
        let box = GlassPassView(frame: hostVC.view.bounds)
        box.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        box.backgroundColor = .clear
        box.alpha = 0
        box.isHidden = true
        box.bar = bar
        box.addSubview(bar)
        hostVC.view.addSubview(box)
        box.setNeedsLayout()
        tabBox = box
        return bar
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
                self.tabBox?.removeFromSuperview(); self.tabCtl = nil; self.tabBox = nil; self.tabVisible = false
                call.resolve(["active": false]); return
            }
            if let t = tint { self.glassTint = t }
            let tc = self.tabCtl ?? self.makeTabs(hostVC)
            self.tabCtl = tc
            guard let box = self.tabBox else { call.resolve(["active": false]); return }
            hostVC.view.bringSubviewToFront(box)
            tc.tintColor = self.glassTint
            // nomi delle schede nella lingua dell'app
            if let titles = call.getObject("titles") {
                for (i, t) in self.glassTabs.enumerated() { if let s = titles[t.0] as? String, !s.isEmpty { tc.items?[i].title = s } }
            }
            // le stesse icone della barra dell'app (PNG 84×84 = 28pt @3x), colorate da iOS
            if let icons = call.getObject("icons") {
                for (i, t) in self.glassTabs.enumerated() {
                    guard let b64 = icons[t.0] as? String, let d = Data(base64Encoded: b64), let img = UIImage(data: d, scale: 3) else { continue }
                    tc.items?[i].image = img.withRenderingMode(.alwaysTemplate)
                }
            }
            if let i = self.glassTabs.firstIndex(where: { $0.0 == tab }), let it = tc.items?[i], tc.selectedItem !== it { tc.selectedItem = it }
            for (i, t) in self.glassTabs.enumerated() {
                let n = (badges[t.0] as? NSNumber)?.intValue ?? (badges[t.0] as? Int) ?? 0
                let item = tc.items?[i]
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
        ctx.localizedFallbackTitle = call.getString("fallback") ?? "Usa il codice"
        ctx.localizedCancelTitle = call.getString("cancel") ?? "Annulla"
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

    // lingua scelta in Vicina: iOS la usa dal prossimo avvio per i testi di sistema dell'app (permessi, Impostazioni)
    @objc func updateWidget(_ call: CAPPluginCall) {
        if let l = call.getString("lang"), !l.isEmpty, (UserDefaults.standard.stringArray(forKey: "AppleLanguages")?.first ?? "") != l {
            UserDefaults.standard.set([l], forKey: "AppleLanguages")
        }
        call.resolve()
    }

    // link vicina:// arrivato da un'azione rapida prima che l'app fosse pronta
    @objc func pendingUrl(_ call: CAPPluginCall) {
        let u = UserDefaults.standard.string(forKey: "vicina_pending_url")
        UserDefaults.standard.removeObject(forKey: "vicina_pending_url")
        if let u = u { call.resolve(["url": u]) } else { call.resolve([:]) }
    }
}

// tocco sulla barra delle schede di iOS → la pagina cambia scheda (la selezione di vetro si sposta da sola)
extension VicinaNativePlugin: UITabBarDelegate {
    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let i = item.tag
        if i >= 0 && i < glassTabs.count {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            notifyListeners("glassTab", data: ["tab": glassTabs[i].0])
        }
    }
}

// vista trasparente che lascia passare i tocchi alla pagina, tranne quelli sulla barra delle schede
final class GlassPassView: UIView {
    weak var bar: UIView?
    // la barra in basso, alta quanto dice iOS (compreso lo spazio sopra la linea della Home)
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let b = bar else { return }
        var h = b.sizeThatFits(CGSize(width: bounds.width, height: 0)).height
        if h < 40 { h = 49 + safeAreaInsets.bottom }
        b.frame = CGRect(x: 0, y: bounds.height - h, width: bounds.width, height: h)
    }
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let v = super.hitTest(point, with: event), let b = bar, !b.isHidden, v.isDescendant(of: b) else { return nil }
        return v
    }
}
