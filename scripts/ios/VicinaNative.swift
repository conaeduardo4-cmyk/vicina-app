// Integrazioni di Vicina con l'iPhone: icona alternativa (modalità anonima), torcia vera, batteria,
// voce che legge un testo, impostazioni dell'app e azioni rapide sull'icona.
// Aggiunto al progetto da scripts/ios-native.rb (chiamato da scripts/patch-native.mjs).
import UIKit
import AVFoundation
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
        CAPPluginMethod(name: "setGlassBar", returnType: CAPPluginReturnPromise)
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

    // ---------- Liquid Glass (iOS 26): barra delle schede nativa ----------
    // Non è una copia fatta in CSS: è una vera UIVisualEffectView con UIGlassEffect di iOS 26, sopra il WebView.
    // Disponibile solo se l'app è compilata con l'SDK di iOS 26 (Xcode 26) e il telefono ha iOS 26 o successivo.
    private var glassBar: UIView?
    private var glassButtons: [String: UIButton] = [:]
    private var glassBadges: [String: UILabel] = [:]
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

    private func makeGlassBar(in host: UIView) -> UIView? {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect()
            glass.isInteractive = true
            let bar = UIVisualEffectView(effect: glass)
            bar.translatesAutoresizingMaskIntoConstraints = false
            bar.layer.cornerRadius = 31
            bar.layer.cornerCurve = .continuous
            bar.clipsToBounds = true
            bar.overrideUserInterfaceStyle = .dark
            let stack = UIStackView()
            stack.axis = .horizontal
            stack.distribution = .fillEqually
            stack.translatesAutoresizingMaskIntoConstraints = false
            bar.contentView.addSubview(stack)
            NSLayoutConstraint.activate([
                stack.leadingAnchor.constraint(equalTo: bar.contentView.leadingAnchor, constant: 6),
                stack.trailingAnchor.constraint(equalTo: bar.contentView.trailingAnchor, constant: -6),
                stack.topAnchor.constraint(equalTo: bar.contentView.topAnchor),
                stack.bottomAnchor.constraint(equalTo: bar.contentView.bottomAnchor)
            ])
            for (id, title, symbol) in glassTabs {
                var cfg = UIButton.Configuration.plain()
                cfg.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold))
                cfg.imagePlacement = .top
                cfg.imagePadding = 3
                var t = AttributedString(title)
                t.font = UIFont.systemFont(ofSize: 10, weight: .semibold)
                cfg.attributedTitle = t
                cfg.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0)
                let b = UIButton(configuration: cfg)
                b.tintColor = UIColor.secondaryLabel
                b.accessibilityLabel = title
                b.addAction(UIAction { [weak self] _ in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    self?.notifyListeners("glassTab", data: ["tab": id])
                }, for: .touchUpInside)
                let badge = UILabel()
                badge.translatesAutoresizingMaskIntoConstraints = false
                badge.backgroundColor = glassTint
                badge.textColor = .white
                badge.font = UIFont.systemFont(ofSize: 10, weight: .bold)
                badge.textAlignment = .center
                badge.layer.cornerRadius = 8
                badge.clipsToBounds = true
                badge.isHidden = true
                b.addSubview(badge)
                NSLayoutConstraint.activate([
                    badge.centerXAnchor.constraint(equalTo: b.centerXAnchor, constant: 13),
                    badge.topAnchor.constraint(equalTo: b.topAnchor, constant: 3),
                    badge.heightAnchor.constraint(equalToConstant: 16),
                    badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 16)
                ])
                stack.addArrangedSubview(b)
                glassButtons[id] = b
                glassBadges[id] = badge
            }
            host.addSubview(bar)
            NSLayoutConstraint.activate([
                bar.leadingAnchor.constraint(equalTo: host.leadingAnchor, constant: 14),
                bar.trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -14),
                bar.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -4),
                bar.heightAnchor.constraint(equalToConstant: 62)
            ])
            return bar
        }
        #endif
        return nil
    }

    // { on, visible, tab, badges: { chat: 3, map: 1 }, tint: "#E8192C" }
    @objc func setGlassBar(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        let visible = call.getBool("visible") ?? true
        let tab = call.getString("tab") ?? "home"
        let badges = call.getObject("badges") ?? [:]
        let tint = color(call.getString("tint"))
        DispatchQueue.main.async {
            guard self.glassAvailable(), let host = self.bridge?.viewController?.view else { call.resolve(["active": false]); return }
            if !on {
                self.glassBar?.removeFromSuperview(); self.glassBar = nil; self.glassButtons = [:]; self.glassBadges = [:]
                call.resolve(["active": false]); return
            }
            if let t = tint { self.glassTint = t }
            if self.glassBar == nil { self.glassBar = self.makeGlassBar(in: host) }
            guard let bar = self.glassBar else { call.resolve(["active": false]); return }
            host.bringSubviewToFront(bar)
            UIView.animate(withDuration: 0.18) { bar.alpha = visible ? 1 : 0 }
            bar.isUserInteractionEnabled = visible
            for (id, b) in self.glassButtons { b.tintColor = id == tab ? self.glassTint : UIColor.secondaryLabel }
            for (id, l) in self.glassBadges {
                let n = (badges[id] as? NSNumber)?.intValue ?? (badges[id] as? Int) ?? 0
                l.isHidden = n <= 0
                l.text = n > 9 ? " 9+ " : " \(n) "
                l.backgroundColor = self.glassTint
            }
            call.resolve(["active": true])
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
