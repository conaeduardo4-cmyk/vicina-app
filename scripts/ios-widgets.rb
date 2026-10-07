# Aggiunge al progetto Xcode l'estensione dei widget (SOS e 112) e la incorpora nell'app.
# Lanciato da scripts/patch-native.mjs su macOS. Per non compilare i widget: crea il file scripts/ios/NO_WIDGETS.
require 'xcodeproj'

NAME = 'VicinaWidgets'
proj = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = proj.targets.find { |t| t.name == 'App' } or abort('target App non trovato')
if proj.targets.any? { |t| t.name == NAME }
  puts 'widget già presenti'
  exit 0
end
app_id = app.build_configurations.map { |c| c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] }.compact.first || 'it.vicina.app'
deploy = app.build_configurations.map { |c| c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] }.compact.first || '14.0'
deploy = '14.0' if Gem::Version.new(deploy) < Gem::Version.new('14.0')

ext = proj.new_target(:app_extension, NAME, :ios, deploy, nil, :swift)
grp = proj.main_group.new_group(NAME, NAME)
ext.add_file_references([grp.new_reference('VicinaWidgets.swift')])
grp.new_reference('Info.plist')
ext.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_id}.widgets"
  s['INFOPLIST_FILE'] = "#{NAME}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = deploy
  s['SKIP_INSTALL'] = 'YES'
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['CODE_SIGN_STYLE'] = 'Automatic'
end

# l'app dipende dall'estensione e la copia dentro di sé (cartella PlugIns), subito dopo le risorse
app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(ext.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
app.build_phases.delete(embed)
idx = app.build_phases.index(app.resources_build_phase) || (app.build_phases.length - 1)
app.build_phases.insert(idx + 1, embed)

proj.save
puts 'Widget SOS e 112 aggiunti al progetto Xcode'
