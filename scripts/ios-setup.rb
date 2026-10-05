# Aggiunge al progetto Xcode: GoogleService-Info.plist (se presente) e le entitlements per le notifiche push.
# Uso: ruby scripts/ios-setup.rb   (richiede la gem "xcodeproj", inclusa con CocoaPods)
require 'xcodeproj'

proj_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(proj_path)
target = project.targets.find { |t| t.name == 'App' } or abort('Target App non trovato')
group = project.main_group.find_subpath('App', false) or abort('Gruppo App non trovato')

# 1) GoogleService-Info.plist nelle risorse dell'app
plist = 'ios/App/App/GoogleService-Info.plist'
if File.exist?(plist)
  unless group.files.any? { |f| f.path == 'GoogleService-Info.plist' }
    ref = group.new_reference('GoogleService-Info.plist')
    target.resources_build_phase.add_file_reference(ref, true)
  end
  puts '  ✓ GoogleService-Info.plist aggiunto al target'
end

# 2) Entitlements: push (produzione) + notifiche "Time Sensitive" per gli SOS
ent = 'ios/App/App/App.entitlements'
File.write(ent, <<~XML)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
  	<key>aps-environment</key>
  	<string>production</string>
  	<key>com.apple.developer.usernotifications.time-sensitive</key>
  	<true/>
  </dict>
  </plist>
XML
group.new_reference('App.entitlements') unless group.files.any? { |f| f.path == 'App.entitlements' }
target.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
end
project.save
puts '  ✓ Entitlements push configurate'
