// Android: 평문 HTTP 를 개발 주소(에뮬레이터의 PC 10.0.2.2, 127.0.0.1, localhost, 빌드 때 준 EXPO_PUBLIC_DEV_HOST)에만 허용.
// 전역 usesCleartextTraffic 대신 network_security_config 를 씀(API 24+ 에서 이것이 우선).
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// 실기기 개발: prebuild 때 EXPO_PUBLIC_DEV_HOST(PC 의 망 IP 또는 이름)를 주면 그 주소도 평문 허용.
const HOST_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)*)$/i;
function devHosts(env = process.env.EXPO_PUBLIC_DEV_HOST) {
  const hosts = ['10.0.2.2', '127.0.0.1', 'localhost'];
  const extra = (env || '').trim();
  if (extra) {
    if (!HOST_RE.test(extra)) throw new Error(`EXPO_PUBLIC_DEV_HOST 형식이 아님: ${extra}`);
    if (!hosts.includes(extra)) hosts.push(extra);
  }
  return hosts;
}
function networkSecurityXml(hosts) {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
${hosts.map((h) => `    <domain includeSubdomains="false">${h}</domain>`).join('\n')}
  </domain-config>
</network-security-config>
`;
}

function withDevCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), networkSecurityXml(devHosts()));
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    delete app.$['android:usesCleartextTraffic'];
    return c;
  });
}
module.exports = withDevCleartext;
module.exports.devHosts = devHosts;
module.exports.networkSecurityXml = networkSecurityXml;
