#!/usr/bin/env bash
# Builds the Wonder CRM Android app (APK) into public/downloads/wonder-crm.apk,
# which the website serves on its "Download app" page.
#
# Needs Ubuntu packages: android-sdk android-sdk-platform-23 dalvik-exchange, and a JDK.
# Before rebuilding for a new domain: edit src/.../Config.java (BASE_URL) and raise
# versionCode/versionName in AndroidManifest.xml, so phones accept it as an update.
#
# The signing key (release.keystore) must stay the same for every version, or phones
# refuse to update and the old app must be uninstalled first. Keep a backup of it.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
BT=$SDK/build-tools/debian
JAR=$SDK/platforms/android-23/android.jar
PASS=${KEYSTORE_PASS:-wondercrm-release}
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

if [ ! -f release.keystore ]; then
  keytool -genkeypair -keystore release.keystore -alias wondercrm -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Wonder Learning India, O=Wonder Learning India Pvt. Ltd., C=IN"
fi

"$BT/aapt" package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$JAR" -F "$OUT/app.unaligned.apk"
javac --release 8 -nowarn -Xlint:-options -classpath "$JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j app.unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/app.unaligned.apk" "$OUT/app.aligned.apk"
"$BT/apksigner" sign --ks release.keystore --ks-key-alias wondercrm --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out "$OUT/wonder-crm.apk" "$OUT/app.aligned.apk"
"$BT/apksigner" verify "$OUT/wonder-crm.apk"
mkdir -p ../public/downloads
cp "$OUT/wonder-crm.apk" ../public/downloads/wonder-crm.apk
echo "Built public/downloads/wonder-crm.apk ($(du -h ../public/downloads/wonder-crm.apk | cut -f1))"
