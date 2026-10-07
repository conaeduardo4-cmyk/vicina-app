// Widget di Vicina per iPhone (schermata Home e schermata di blocco).
// «SOS»: un tocco apre Vicina con il conto alla rovescia di 3 secondi, poi parte l'SOS.
// «112»: un tocco apre Vicina che fa partire subito la chiamata al 112 (iPhone chiede solo la conferma).
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

private let red1 = Color(red: 0.91, green: 0.10, blue: 0.17)
private let red2 = Color(red: 1.0, green: 0.30, blue: 0.37)

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

struct SosView: View {
    @Environment(\.widgetFamily) var family
    var body: some View {
        content.widgetURL(URL(string: "vicina://sos-widget"))
    }
    @ViewBuilder var content: some View {
        if isAccessory {
            ZStack {
                Circle().stroke(lineWidth: 3)
                Text("SOS").font(.system(size: 15, weight: .black))
            }
            .padding(2)
            .vicinaBackground(Color.clear)
        } else {
            VStack(spacing: 8) {
                ZStack {
                    Circle().fill(Color.black.opacity(0.16))
                    Circle().stroke(Color.white.opacity(0.9), lineWidth: 3)
                    Text("SOS").font(.system(size: 24, weight: .black)).foregroundColor(.white)
                }
                .frame(width: 72, height: 72)
                Text("Tocca per avvisare").font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.92))
            }
            .vicinaBackground(LinearGradient(gradient: Gradient(colors: [red1, red2]), startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }
    var isAccessory: Bool {
        if #available(iOSApplicationExtension 16.0, *) {
            return family == .accessoryCircular
        }
        return false
    }
}

struct CallView: View {
    @Environment(\.widgetFamily) var family
    var body: some View {
        content.widgetURL(URL(string: "vicina://call112"))
    }
    @ViewBuilder var content: some View {
        if isAccessory {
            ZStack {
                Circle().stroke(lineWidth: 3)
                VStack(spacing: 0) {
                    Image(systemName: "phone.fill").font(.system(size: 11, weight: .bold))
                    Text("112").font(.system(size: 13, weight: .black))
                }
            }
            .padding(2)
            .vicinaBackground(Color.clear)
        } else {
            VStack(spacing: 8) {
                ZStack {
                    Circle().fill(red1)
                    Image(systemName: "phone.fill").font(.system(size: 28, weight: .bold)).foregroundColor(.white)
                }
                .frame(width: 66, height: 66)
                Text("Chiama 112").font(.system(size: 15, weight: .heavy)).foregroundColor(.black)
            }
            .vicinaBackground(Color.white)
        }
    }
    var isAccessory: Bool {
        if #available(iOSApplicationExtension 16.0, *) {
            return family == .accessoryCircular
        }
        return false
    }
}

private func families() -> [WidgetFamily] {
    if #available(iOSApplicationExtension 16.0, *) {
        return [.systemSmall, .accessoryCircular]
    }
    return [.systemSmall]
}

struct SosWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VicinaSOS", provider: VicinaProvider()) { _ in SosView() }
            .configurationDisplayName("SOS")
            .description("Un tocco: Vicina parte con 3 secondi per annullare e avvisa la tua cerchia.")
            .supportedFamilies(families())
    }
}

struct CallWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "Vicina112", provider: VicinaProvider()) { _ in CallView() }
            .configurationDisplayName("Chiama 112")
            .description("Un tocco per chiamare il numero unico di emergenza.")
            .supportedFamilies(families())
    }
}

@main
struct VicinaWidgets: WidgetBundle {
    var body: some Widget {
        SosWidget()
        CallWidget()
    }
}
