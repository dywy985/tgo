import SwiftUI
import TGOWidget

struct ContentView: View {
    @State private var apiKey = ""
    @State private var baseURL = "https://api.tgo.ai"
    @State private var selectedTheme: ThemeOption = .light
    @State private var showChat = false
    @State private var showEmbedded = false

    enum ThemeOption: String, CaseIterable {
        case light = "Light"
        case dark = "Dark"
    }

    var body: some View {
        NavigationView {
            Form {
                // MARK: - Configuration
                Section("Configuration") {
                    TextField("API Key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    TextField("Base URL", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    Picker("Theme", selection: $selectedTheme) {
                        ForEach(ThemeOption.allCases, id: \.self) { theme in
                            Text(theme.rawValue).tag(theme)
                        }
                    }
                }

                // MARK: - Modal Presentation
                Section("Modal (UIKit Bridge)") {
                    Button("Open Chat (Modal)") {
                        openChatModal()
                    }
                    .disabled(apiKey.isEmpty)
                }

                // MARK: - SwiftUI Embedded
                Section("SwiftUI Embedded") {
                    NavigationLink("Open Chat (Embedded)") {
                        if !apiKey.isEmpty {
                            TGOChatView(
                                apiKey: apiKey,
                                baseURL: baseURL,
                                theme: resolvedTheme
                            )
                            .navigationBarTitleDisplayMode(.inline)
                        }
                    }
                    .disabled(apiKey.isEmpty)
                }

                // MARK: - Pre-configured
                Section("Pre-configured + Show") {
                    Button("Configure & Show") {
                        TGOWidget.configure(
                            apiKey: apiKey,
                            baseURL: baseURL,
                            theme: resolvedTheme,
                            visitorInfo: VisitorInfo(
                                name: "Demo User",
                                email: "demo@example.com",
                                source: "ios_example"
                            )
                        )
                        openChatModal()
                    }
                    .disabled(apiKey.isEmpty)
                }

                // MARK: - Info
                Section("About") {
                    HStack {
                        Text("SDK")
                        Spacer()
                        Text("TGOWidget iOS").foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Min iOS")
                        Spacer()
                        Text("15.0").foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("TGO Widget Demo")
        }
    }

    private var resolvedTheme: TGOTheme {
        switch selectedTheme {
        case .light: return .light
        case .dark: return .dark
        }
    }

    private func openChatModal() {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first?.rootViewController else { return }

        // Find the topmost presented VC
        var topVC = root
        while let presented = topVC.presentedViewController {
            topVC = presented
        }

        TGOWidget.show(
            apiKey: apiKey,
            baseURL: baseURL,
            theme: resolvedTheme,
            from: topVC
        )
    }
}

#Preview {
    ContentView()
}
