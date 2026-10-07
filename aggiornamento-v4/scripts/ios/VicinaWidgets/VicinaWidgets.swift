// Widget di Vicina per iPhone e iPad (schermata Home e schermata di blocco).
// Ogni widget è un tasto: un tocco apre Vicina e fa subito l'azione (vicina://…).
// SOS parte con 3 secondi per annullare; «Chiama 112» apre la chiamata (iOS chiede solo la conferma).
import WidgetKit
import SwiftUI

struct VicinaEntry: TimelineEntry { let date: Date }

struct VicinaProvider: TimelineProvider {
    func placeholder(in context: Context) -> VicinaEntry { VicinaEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (VicinaEntry) -> Void) { completion(VicinaEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VicinaEntry>) -> Void) {
        completion(Timeline(entries: [VicinaEntry(date: Date())], policy: .never))
    }
}

// ---------- azioni ----------
struct VAction {
    let kind: String
    let title: String
    let sub: String
    let short: String
    let url: String
    let symbol: String
    let c1: Color
    let c2: Color
    let dark: Bool   // testo scuro su sfondo chiaro
}

private func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color { Color(red: r / 255, green: g / 255, blue: b / 255) }

enum VA {
    static let sos = VAction(kind: "VicinaSOS", title: "SOS", sub: "Tocca per avvisare", short: "SOS", url: "vicina://sos-widget", symbol: "exclamationmark.triangle.fill", c1: rgb(232, 25, 44), c2: rgb(255, 77, 94), dark: false)
    static let call = VAction(kind: "Vicina112", title: "Chiama 112", sub: "Emergenza", short: "112", url: "vicina://call112", symbol: "phone.fill", c1: rgb(255, 255, 255), c2: rgb(240, 240, 244), dark: true)
    static let panic = VAction(kind: "VicinaPanico", title: "Panico", sub: "Sirena, flash, avviso", short: "Panico", url: "vicina://panic", symbol: "exclamationmark.octagon.fill", c1: rgb(120, 6, 18), c2: rgb(232, 25, 44), dark: false)
    static let siren = VAction(kind: "VicinaSirena", title: "Sirena", sub: "Suono fortissimo", short: "Sirena", url: "vicina://siren", symbol: "speaker.wave.3.fill", c1: rgb(255, 160, 40), c2: rgb(255, 196, 90), dark: true)
    static let fake = VAction(kind: "VicinaChiamata", title: "Finta chiamata", sub: "Ti chiamano tra poco", short: "Chiamata", url: "vicina://fake", symbol: "phone.arrow.down.left.fill", c1: rgb(30, 160, 90), c2: rgb(61, 220, 132), dark: false)
    static let walk = VAction(kind: "VicinaAccompagnami", title: "Accompagnami", sub: "Timer di sicurezza", short: "Timer", url: "vicina://walk", symbol: "figure.walk", c1: rgb(98, 82, 214), c2: rgb(156, 140, 255), dark: false)
    static let home = VAction(kind: "VicinaCasa", title: "Portami a casa", sub: "Strada + Accompagnami", short: "Casa", url: "vicina://home", symbol: "house.fill", c1: rgb(30, 110, 220), c2: rgb(77, 163, 255), dark: false)
    static let ok = VAction(kind: "VicinaStoBene", title: "Sto bene", sub: "Lo dice alla cerchia", short: "Ok", url: "vicina://ok", symbol: "checkmark.circle.fill", c1: rgb(20, 120, 70), c2: rgb(61, 220, 132), dark: false)
    static let torch = VAction(kind: "VicinaTorcia", title: "Torcia", sub: "Accendi il flash", short: "Torcia", url: "vicina://torch", symbol: "flashlight.on.fill", c1: rgb(40, 40, 46), c2: rgb(70, 70, 80), dark: false)
}

extension View {
    // iOS 17 vuole lo sfondo dichiarato con containerBackground
    @ViewBuilder func vicinaBackground<B: View>(_ bg: B) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(for: .widget) { bg }
        } else {
            self.background(bg)
        }
    }
}

// ---------- vista di un widget a tasto singolo ----------
struct ActionView: View {
    let a: VAction
    @Environment(\.widgetFamily) var family

    var body: some View {
        content.widgetURL(URL(string: a.url))
    }

    var isAccessory: Bool {
        if #available(iOSApplicationExtension 16.0, *) {
            return family == .accessoryCircular
        }
        return false
    }

    // prima di iOS 17 i widget non hanno margini automatici
    var oldMargins: Bool {
        if #available(iOSApplicationExtension 17.0, *) { return false }
        return true
    }

    @ViewBuilder var content: some View {
        if isAccessory {
            ZStack {
                Circle().fill(Color.white.opacity(0.18))
                VStack(spacing: 1) {
                    Image(systemName: a.symbol).font(.system(size: 14, weight: .bold))
                    Text(a.short).font(.system(size: 10, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            .vicinaBackground(Color.clear)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Circle().fill(a.dark ? Color.black.opacity(0.08) : Color.white.opacity(0.22))
                    Image(systemName: a.symbol).font(.system(size: 24, weight: .bold))
                }
                .frame(width: 50, height: 50)
                Spacer(minLength: 6)
                Text(a.title).font(.system(size: 18, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                Text(a.sub).font(.system(size: 12, weight: .semibold)).opacity(0.85).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundColor(a.dark ? Color.black : Color.white)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .padding(oldMargins ? 14 : 0)
            .vicinaBackground(LinearGradient(gradient: Gradient(colors: [a.c1, a.c2]), startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }
}

private func smallFamilies() -> [WidgetFamily] {
    if #available(iOSApplicationExtension 16.0, *) {
        return [.systemSmall, .accessoryCircular]
    }
    return [.systemSmall]
}

private func actionConfig(_ a: VAction, _ desc: String) -> some WidgetConfiguration {
    StaticConfiguration(kind: a.kind, provider: VicinaProvider()) { _ in ActionView(a: a) }
        .configurationDisplayName(a.title)
        .description(desc)
        .supportedFamilies(smallFamilies())
}

struct SosWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.sos, "Un tocco: 3 secondi per annullare, poi parte l'SOS alla tua cerchia.") } }
struct CallWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.call, "Un tocco per chiamare il numero unico di emergenza.") } }
struct PanicWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.panic, "Sirena, flash e avviso alla cerchia, tutto insieme.") } }
struct SirenWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.siren, "Fa partire la sirena a tutto volume.") } }
struct FakeWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.fake, "Una chiamata finta per allontanarti.") } }
struct WalkWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.walk, "Avvia Accompagnami: se non arrivi, parte l'SOS.") } }
struct HomeWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.home, "Strada verso casa e Accompagnami in un tocco.") } }
struct OkWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.ok, "Manda «Sto bene» a tutta la cerchia.") } }
struct TorchWidget: Widget { var body: some WidgetConfiguration { actionConfig(VA.torch, "Accende o spegne la torcia.") } }

// ---------- pannello rapido: 4 tasti in un widget medio ----------
struct PanelView: View {
    let items: [VAction] = [VA.sos, VA.call, VA.siren, VA.torch]
    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<items.count, id: \.self) { i in
                let a = items[i]
                Link(destination: URL(string: a.url)!) {
                    VStack(spacing: 6) {
                        Image(systemName: a.symbol).font(.system(size: 22, weight: .bold))
                        Text(a.short).font(.system(size: 12, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundColor(a.dark ? Color.black : Color.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(LinearGradient(gradient: Gradient(colors: [a.c1, a.c2]), startPoint: .topLeading, endPoint: .bottomTrailing))
                    .cornerRadius(18)
                }
            }
        }
        .padding(PanelView.pad)
        .vicinaBackground(Color(red: 0.07, green: 0.07, blue: 0.09))
    }
    static var pad: CGFloat {
        if #available(iOSApplicationExtension 17.0, *) { return 0 }
        return 12
    }
}

struct PanelWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VicinaPannello", provider: VicinaProvider()) { _ in PanelView() }
            .configurationDisplayName("Pannello rapido")
            .description("SOS, 112, sirena e torcia in un solo widget.")
            .supportedFamilies([.systemMedium])
    }
}

@main
struct VicinaWidgets: WidgetBundle {
    var body: some Widget {
        SosWidget()
        CallWidget()
        PanicWidget()
        SirenWidget()
        FakeWidget()
        WalkWidget()
        HomeWidget()
        OkWidget()
        TorchWidget()
        PanelWidget()
    }
}
