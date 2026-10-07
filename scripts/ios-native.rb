# Aggiunge al progetto Xcode le integrazioni native di Vicina (VicinaNative.swift),
# abilita l'icona alternativa celeste e fa usare a Capacitor il nostro ViewController.
# Lanciato da scripts/patch-native.mjs su macOS (serve la gemma "xcodeproj", già usata da ios-setup.rb).
require 'xcodeproj'

proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = proj.targets.find { |t| t.name == 'App' } or abort('target App non trovato')
group = proj.main_group.find_subpath('App', false) or abort('gruppo App non trovato')

unless group.files.any? { |f| f.path == 'VicinaNative.swift' }
  ref = group.new_reference('VicinaNative.swift')
  target.add_file_references([ref])
end
target.build_configurations.each do |c|
  c.build_settings['ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'] = 'AppIconBlue'
  c.build_settings['ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS'] = 'YES'
end
proj.save

sb = 'ios/App/App/Base.lproj/Main.storyboard'
s = File.read(sb)
unless s.include?('VicinaViewController')
  s2 = s.sub(/customClass="CAPBridgeViewController"\s+customModule="Capacitor"/, 'customClass="VicinaViewController" customModule="App" customModuleProvider="target"')
  abort('storyboard: CAPBridgeViewController non trovato') if s2 == s
  File.write(sb, s2)
end
puts 'VicinaNative aggiunto al progetto Xcode'
