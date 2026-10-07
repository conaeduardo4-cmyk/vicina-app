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
        CAPPluginMethod(name: "pendingUrl", returnType: CAPPluginReturnPromise)
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
